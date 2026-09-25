/**
 * 공통규칙·스테이지 기획 대비 서버 동작 점검.
 *
 *   npm test
 *
 * LLM을 부르지 않는다 (stubLlm). 요금이 들지 않고 몇 초 안에 끝난다.
 * 기획이 바뀌면 여기부터 고치고, 고친 뒤 이 스크립트를 돌린다.
 */
process.env.LLM_MODE = 'stub';

import { startNegotiation, processTurn, getResult } from '../services/negotiationRunner';
import {
  appendNpcTurn,
  appendPlayerTurn,
  getSession,
  markWorldStateMentioned,
  playerTurns,
  recordStyleSignals,
  rememberProposal,
  remainingSeconds as remainingSecondsOf,
  setAgreement,
  sessionStatus,
  SESSION_RETENTION_MS,
} from '../models/session';
import { getStage, loadAllStages } from '../services/npcPersonaService';
import {
  applyJudgements,
  buildRewards,
  activeWorldStateReferences,
  findOutputProblems,
} from '../services/negotiationEngine';
import {
  MAX_LLM_CALLS_PER_SESSION,
  MAX_REPAIR_REQUESTS_PER_SESSION,
  MAX_REPORT_CALLS_PER_SESSION,
  MAX_PROMPT_TOKENS,
  MAX_OUTPUT_TOKENS,
  TIMER_WARNING_SECONDS,
} from '../data/stageSchema';
import { buildJudgePrompt, buildJudgeSystem } from '../llm/judgePrompt';
import { buildReportSystem, buildReportUser, describeTag } from '../llm/reportPrompt';
import { buildReportInput } from '../services/reportInput';
import { judgeConfig } from '../llm/config';
import { estimateTokens } from '../services/reportInput';

let pass = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass += 1; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

let seq = 0;
const id = (p: string) => `${p}${(seq += 1)}`;
const tick = () => new Promise((r) => setTimeout(r, 20));

/**
 * 첫 대사 TTS가 끝난 것으로 친다.
 * 실제 플레이에서는 몇 초 기다려야 입력이 열린다 (공통규칙 §3).
 */
function skipOpeningTts(sessionId: string): void {
  const session = getSession(sessionId)!;
  session.startedAtMs = Date.now();
}

/** 상한까지 호출을 소진시켜 다음 턴이 종료가 되게 한다 */
function exhaustCalls(sessionId: string): void {
  getSession(sessionId)!.llmCallCount = MAX_LLM_CALLS_PER_SESSION;
}

async function stageData(): Promise<void> {
  const stages = loadAllStages();
  ok('세 스테이지 로드', stages.length === 3, `${stages.length}개`);
  ok('stageId 순 정렬', stages.map((s) => s.stageId).join() === '1,2,3');

  for (const stage of stages) {
    const r = buildRewards(stage);
    // 기획 각 스테이지 §월드 상태와 퀘스트
    ok(`스테이지 ${stage.stageId} 월드 상태 키`, !!r.successState);
    ok(`스테이지 ${stage.stageId} 완료 퀘스트`, r.completeQuests.length > 0, JSON.stringify(r.completeQuests));
    ok(`스테이지 ${stage.stageId} 종료 문구 3종`, !!stage.successText && !!stage.failureText && !!stage.limitText);
    ok(`스테이지 ${stage.stageId} 힌트가 필수 키를 모두 덮음`,
      stage.requiredAgreementKeys.every((k) => !!stage.failureHints[k]));
    ok(`스테이지 ${stage.stageId} 종료 표정이 허용 목록 안`,
      [stage.defaultExpressionKey, stage.successExpressionKey, stage.failureExpressionKey]
        .every((k) => stage.expressionKeys.includes(k)));
  }

  // 단서는 successEpilogue와 ID가 맞아야 본문이 실린다
  const s3 = getStage(3)!;
  ok('스테이지 3 단서 본문 연결', buildRewards(s3).clues.length === 1);
  ok('스테이지 1·2 단서 없음',
    buildRewards(getStage(1)!).clues.length === 0 && buildRewards(getStage(2)!).clues.length === 0);

  // 20번 — 고정 안내문은 성공 응답에만 실린다 (튜토리얼 성공 화면용)
  for (const stage of stages) {
    ok(`스테이지 ${stage.stageId} fixedTerms 있음`, stage.fixedTerms.length > 0);
  }

  // 월드 상태 참조는 선언 ∩ 충족만
  ok('월드 상태 참조 교집합',
    Object.keys(activeWorldStateReferences(s3, ['part_time_job_secured'])).length === 1);
  ok('월드 상태 없으면 참조 없음',
    Object.keys(activeWorldStateReferences(s3, [])).length === 0);
}

async function persona(): Promise<void> {
  // 각 스테이지 기획 §2·§3·§5 — 페르소나가 프롬프트에 실려야 한다
  for (const stage of loadAllStages()) {
    const p = stage.persona;
    ok(`스테이지 ${stage.stageId} 페르소나 있음`, !!p);
    if (!p) continue;
    ok(`스테이지 ${stage.stageId} 말투`, p.voice.length > 0);
    ok(`스테이지 ${stage.stageId} 마무리 대사`, !!p.closing?.nearLimit);
    ok(`스테이지 ${stage.stageId} 마무리는 한 형태만`,
      (typeof p.closing?.finalCall === 'string') !== !!p.closing?.finalCallByOutcome);

    const system = buildJudgeSystem(stage);
    ok(`스테이지 ${stage.stageId} 말투가 프롬프트에`, p.voice.every((v) => system.includes(v)));
    ok(`스테이지 ${stage.stageId} 지정 대사가 프롬프트에`,
      (p.disclosures ?? []).every((d) => system.includes(d.say)));
    ok(`스테이지 ${stage.stageId} 공개 금지가 프롬프트에`,
      (p.neverReveal ?? []).every((n) => system.includes(n)));
    ok(`스테이지 ${stage.stageId} 마무리 대사가 프롬프트에`, system.includes(p.closing!.nearLimit));
  }

  // 페르소나는 대사용이다. 브라우저로 나가면 안 된다.
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('페르소나 시나리오 시작', false);
  const exposed = JSON.stringify(s.value);
  ok('페르소나가 클라이언트로 안 나감',
    !/persona|neverReveal|disclosures|answerDemand|closing/.test(exposed));
}

async function budgets(): Promise<void> {
  // 공통규칙 §4
  ok('판정 상한 40', MAX_LLM_CALLS_PER_SESSION === 40);
  ok('수정 재요청 상한 5', MAX_REPAIR_REQUESTS_PER_SESSION === 5);
  ok('리포트 상한 2', MAX_REPORT_CALLS_PER_SESSION === 2);
  ok('세션 총 호출 47 이하',
    MAX_LLM_CALLS_PER_SESSION + MAX_REPAIR_REQUESTS_PER_SESSION + MAX_REPORT_CALLS_PER_SESSION === 47);
  ok('설정이 §4 상수를 그대로 씀',
    judgeConfig().maxPromptTokens === MAX_PROMPT_TOKENS && judgeConfig().maxOutputTokens === MAX_OUTPUT_TOKENS);

  // 판정 프롬프트가 상한 안에 들어가고 기준표는 잘리지 않는다
  for (const stage of loadAllStages()) {
    const s = await startNegotiation({ stageId: stage.stageId, requestId: id('r'), worldState: [] });
    if (!s.ok) { ok(`스테이지 ${stage.stageId} 시작`, false); continue; }
    skipOpeningTts(s.value.sessionId);
    const sess = getSession(s.value.sessionId)!;
    for (let i = 0; i < 8; i += 1) {
      await processTurn({
        sessionId: sess.sessionId, requestId: id('r'), messageId: id('m'),
        playerText: '제가 대신 이렇게 해드릴 테니 한 번만 봐주시면 안 될까요? 시간은 제가 맞추겠습니다.',
      });
    }
    const last = sess.turns.filter((t) => t.speaker === 'player').at(-1)!;
    const built = buildJudgePrompt({
      session: sess, stage, playerTurn: last,
      worldStateReferences: stage.worldStateReferences ?? {},
      nearCallLimit: true, finalCall: false,
    }, MAX_PROMPT_TOKENS);
    ok(`스테이지 ${stage.stageId} 프롬프트가 상한 안`, built !== null);
    if (built) {
      ok(`스테이지 ${stage.stageId} 실측 ${estimateTokens(built.system) + estimateTokens(built.user)}토큰`,
        estimateTokens(built.system) + estimateTokens(built.user) <= MAX_PROMPT_TOKENS);
      ok(`스테이지 ${stage.stageId} 판정 기준표가 잘리지 않음`,
        stage.requiredAgreementKeys.every((k) => {
          const d = stage.agreementDefinitions[k];
          return [...d.passWhen, ...d.clarifyWhen, ...d.revokeWhen].every((l) => built.system.includes(l));
        }));
    }
  }
}

async function callCeiling(): Promise<void> {
  // 공통규칙 §8 — 41번째 판정은 호출하지 않는다
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('상한 시나리오 시작', false);
  skipOpeningTts(s.value.sessionId);
  const sess = getSession(s.value.sessionId)!;
  exhaustCalls(sess.sessionId);

  const r = await processTurn({ sessionId: sess.sessionId, requestId: id('r'), messageId: id('m'), playerText: '한 번만요' });
  ok('상한 소진 → failure/limit', r.ok && r.value.outcome === 'failure' && r.value.endReason === 'limit');
  ok('  41번째를 호출하지 않음', sess.llmCallCount === MAX_LLM_CALLS_PER_SESSION, `${sess.llmCallCount}`);
  ok('  limitText 전달', r.ok && !!r.value.limitText);
}

async function asyncReport(): Promise<void> {
  // 공통규칙 §9 — 종료 결과와 리포트 생성을 분리한다
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('리포트 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);

  ok('시작 응답에 sessionId·stageId', s.value.sessionId === sid && s.value.stageId === 1);

  const mid = getResult(sid);
  ok('진행 중 조회 → in_progress', mid.ok && mid.value.sessionStatus === 'in_progress');
  ok('  진행 중엔 view가 null', mid.ok && mid.value.view === null);

  await processTurn({
    sessionId: sid, requestId: id('r'), messageId: id('m'),
    playerText: '평일 야간 전부 가능하고 다음 주 월요일부터 나오겠습니다.',
  });
  exhaustCalls(sid);

  const started = Date.now();
  const end = await processTurn({ sessionId: sid, requestId: id('r'), messageId: id('m'), playerText: '한 번만요' });
  const elapsed = Date.now() - started;
  if (!end.ok) return ok('종료', false);

  // 리포트를 기다리면 여기서 실제 모델 기준 10초가 걸린다
  ok(`종료가 리포트를 기다리지 않음 (${elapsed}ms)`, elapsed < 1000, `${elapsed}ms`);
  ok('  종료 응답에 문구·식별자', !!end.value.limitText && end.value.sessionId === sid && end.value.stageId === 1);
  ok('  reportStatus가 실림', end.value.reportStatus !== undefined, String(end.value.reportStatus));

  await tick();
  const after = getResult(sid);
  ok('생성 후 조회 → ready', after.ok && after.value.view?.reportStatus === 'ready',
    after.ok ? String(after.value.view?.reportStatus) : 'fail');
  ok('  styleReport 채워짐', after.ok && !!after.value.view?.styleReport);
  ok('  네 축', after.ok && after.value.view?.styleReport?.axes.length === 4);

  const calls = getSession(sid)!.reportCallCount;
  getResult(sid); getResult(sid);
  await tick();
  ok('반복 조회가 재생성을 일으키지 않음', getSession(sid)!.reportCallCount === calls);

  ok('보관 타이머 예약', getSession(sid)!.disposeTimer !== null);
  ok('보관 기간 30분', SESSION_RETENTION_MS === 30 * 60 * 1000);

  const gone = getResult('존재하지-않는-세션');
  ok('없는 세션 → 404 SESSION_NOT_FOUND', !gone.ok && gone.status === 404 && gone.error === 'SESSION_NOT_FOUND');
}

async function selfProposal(): Promise<void> {
  // 스테이지 3 회귀 테스트 「청소 기한 재확인 수락」
  //   "쓰레기봉투 내놓을게요" → (대화 몇 턴) → NPC "토요일까지?" → "네"
  // 앞선 제안이 최근 6왕복 밖으로 밀려도 근거가 살아 있어야 한다.
  const stage = getStage(3)!;
  const key = stage.requiredAgreementKeys.find((k) => stage.agreementDefinitions[k].playerMustPropose)!;
  ok('스테이지 3에 자발 제안 키 있음', !!key);

  const s = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('자발 제안 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  const sess = getSession(sid)!;

  // 1. 플레이어가 스스로 제안한다 (아직 성립은 아니다)
  const proposal = appendPlayerTurn(sid, id('m'), '다음 주에 쓰레기봉투 내놓을게요');
  rememberProposal(sid, key, [proposal.id]);
  ok('제안이 보관됨', sess.pendingProposals[key]?.turnIds[0] === proposal.id);
  ok('  원문도 함께', sess.pendingProposals[key]?.texts[0] === '다음 주에 쓰레기봉투 내놓을게요');

  // 2. 대화가 6왕복 넘게 이어져 제안이 최근 기록 밖으로 밀린다
  for (let i = 0; i < 7; i += 1) {
    appendNpcTurn(sid, '그래서 언제 치울 건데.');
    appendPlayerTurn(sid, id('m'), '네 알겠습니다.');
  }
  const last = sess.turns.filter((t) => t.speaker === 'player').at(-1)!;
  const built = buildJudgePrompt({
    session: sess, stage, playerTurn: last,
    worldStateReferences: {}, nearCallLimit: false, finalCall: false,
  }, MAX_PROMPT_TOKENS);
  ok('6왕복 밖이어도 제안이 프롬프트에 남음',
    !!built && built.user.includes('다음 주에 쓰레기봉투 내놓을게요'));
  ok('  제안 발화 ID도 실림', !!built && built.user.includes(proposal.id));

  // 3. NPC 재확인을 수락한다. 이번 발화에는 제안이 없지만 강등되면 안 된다
  const accept = appendPlayerTurn(sid, id('m'), '네, 그렇게 할게요');
  const npc = appendNpcTurn(sid, '토요일까지 가능한가?');
  const merged = applyJudgements(sess, stage, {
    npcReply: '', disclosureUpdates: {}, stageVerdict: 'continue',
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: { formality: 'polite', directness: 'direct', cushion: { used: false, expressions: [] }, stageTags: [], evidenceTurnId: accept.id },
    judgements: {
      [key]: {
        action: 'confirm', agreementSummary: '쓰레기봉투 배출', reason: '앞선 제안을 유지하며 기한 수락',
        evidenceTurnIds: [accept.id], contextAnchorTurnId: null,
        // 이번 발화에는 제안이 없다. 앞선 제안을 근거로 든다
        selfProposed: true, selfProposalTurnIds: [proposal.id],
      },
    },
  }, accept.id);

  ok('앞선 제안을 근거로 성립', sess.agreements[key].status === 'met', sess.agreements[key].status);
  ok('  강등되지 않음', merged.selfProposalMissingKeys.length === 0, merged.selfProposalMissingKeys.join());
  ok('  제안 근거가 상태에 보존됨', sess.agreements[key].selfProposalTurnIds.includes(proposal.id));

  // 4. 제안이 전혀 없는 키는 여전히 막혀야 한다
  const other = stage.requiredAgreementKeys.find(
    (k) => k !== key && stage.agreementDefinitions[k].playerMustPropose,
  )!;
  const blocked = applyJudgements(sess, stage, {
    npcReply: '', disclosureUpdates: {}, stageVerdict: 'continue',
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: { formality: 'polite', directness: 'direct', cushion: { used: false, expressions: [] }, stageTags: [], evidenceTurnId: accept.id },
    judgements: {
      [other]: {
        action: 'confirm', agreementSummary: '시키는 대로', reason: 'NPC 제안 수락',
        evidenceTurnIds: [accept.id], contextAnchorTurnId: null,
        selfProposed: false, selfProposalTurnIds: [],
      },
    },
  }, accept.id);
  ok('제안 없이 수락만 하면 여전히 강등', blocked.selfProposalMissingKeys.includes(other));
  ok('  상태는 met이 아님', sess.agreements[other].status !== 'met', sess.agreements[other].status);

  // 5. 맥락 동의를 허용하지 않는 키는 NPC 제안에 기대 성립할 수 없다
  const noConsent = stage.requiredAgreementKeys.find(
    (k) => !stage.agreementDefinitions[k].contextConsentAllowed,
  )!;
  ok('스테이지 3에 맥락 동의 불가 키 있음', !!noConsent);
  const anchored = applyJudgements(sess, stage, {
    npcReply: '', disclosureUpdates: {}, stageVerdict: 'continue',
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: { formality: 'polite', directness: 'direct', cushion: { used: false, expressions: [] }, stageTags: [], evidenceTurnId: accept.id },
    judgements: {
      [noConsent]: {
        action: 'confirm', agreementSummary: 'NPC 제안 수락', reason: '맥락 동의',
        evidenceTurnIds: [accept.id], contextAnchorTurnId: npc.id,
        selfProposed: true, selfProposalTurnIds: [proposal.id],
      },
    },
  }, accept.id);
  ok('맥락 동의 불가 키는 앵커를 거부', anchored.evidenceMismatchKeys.includes(noConsent));
  ok('  상태는 met이 아님', sess.agreements[noConsent].status !== 'met');

  // 6. 철회하면 제안 근거도 버린다
  applyJudgements(sess, stage, {
    npcReply: '', disclosureUpdates: {}, stageVerdict: 'continue',
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: { formality: 'polite', directness: 'direct', cushion: { used: false, expressions: [] }, stageTags: [], evidenceTurnId: accept.id },
    judgements: {
      [key]: { action: 'revoke', reason: '앞말을 뒤집음', evidenceTurnIds: [accept.id], contextAnchorTurnId: null },
    },
  }, accept.id);
  ok('철회하면 제안 근거도 버림', sess.pendingProposals[key] === undefined);
  ok('  상태도 unmet', sess.agreements[key].status === 'unmet');
}

async function repairContract(): Promise<void> {
  // 공통규칙 §6·§8 — 형식은 맞지만 내용이 어긋난 출력은 조용히 버리지 않고
  // 무엇이 틀렸는지 알려 한 번 더 묻는다.
  const stage = getStage(3)!;
  const s = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('수정 재요청 시나리오 시작', false);
  skipOpeningTts(s.value.sessionId);
  const sess = getSession(s.value.sessionId)!;
  const npc = appendNpcTurn(sess.sessionId, '토요일까지 치울 건가?');
  const turn = appendPlayerTurn(sess.sessionId, id('m'), '네 알겠습니다');

  const base = {
    npcReply: '그래, 그렇게 하자.', disclosureUpdates: {}, stageVerdict: 'continue' as const,
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: { formality: 'polite' as const, directness: 'direct' as const, cushion: { used: false, expressions: [] }, stageTags: [], evidenceTurnId: turn.id },
  };
  const selfKey = stage.requiredAgreementKeys.find((k) => stage.agreementDefinitions[k].playerMustPropose)!;
  const consentKey = stage.requiredAgreementKeys.find((k) => stage.agreementDefinitions[k].contextConsentAllowed)!;
  const noConsentKey = stage.requiredAgreementKeys.find((k) => !stage.agreementDefinitions[k].contextConsentAllowed)!;

  // 정상 출력에는 문제가 없다
  ok('정상 출력 → 재요청 없음', findOutputProblems(sess, stage, {
    ...base, judgements: { [consentKey]: {
      action: 'confirm', agreementSummary: '요약', reason: '이유',
      evidenceTurnIds: [turn.id], contextAnchorTurnId: npc.id,
    } },
  }, turn.id).length === 0);

  // 8번 — 근거 ID 오류
  const badEvidence = findOutputProblems(sess, stage, {
    ...base, judgements: { [consentKey]: {
      action: 'confirm', agreementSummary: '요약', reason: '이유',
      evidenceTurnIds: ['없는발화'], contextAnchorTurnId: null,
    } },
  }, turn.id);
  ok('근거 ID 오류를 잡음', badEvidence.length === 1);
  ok('  무엇이 틀렸는지 알려줌', badEvidence[0].includes('evidenceTurnIds') && badEvidence[0].includes('없는발화'));

  // 7번 — 자발 제안 없는 confirm. 대사까지 고치라고 해야 한다
  const noProposal = findOutputProblems(sess, stage, {
    ...base, judgements: { [selfKey]: {
      action: 'confirm', agreementSummary: '요약', reason: '이유',
      evidenceTurnIds: [turn.id], contextAnchorTurnId: null,
      selfProposed: false, selfProposalTurnIds: [],
    } },
  }, turn.id);
  ok('자발 제안 없는 confirm을 잡음', noProposal.length === 1);
  ok('  npcReply도 고치라고 알림', noProposal[0].includes('npcReply'));

  // 맥락 동의 불가 키에 앵커를 건 경우
  ok('맥락 동의 불가 키의 앵커를 잡음', findOutputProblems(sess, stage, {
    ...base, judgements: { [noConsentKey]: {
      action: 'confirm', agreementSummary: '요약', reason: '이유',
      evidenceTurnIds: [turn.id], contextAnchorTurnId: npc.id,
      selfProposed: true, selfProposalTurnIds: [turn.id],
    } },
  }, turn.id).some((p) => p.includes('맥락 동의')));

  // 9번 — fatal인데 근거·유형이 없음
  ok('fatal에 유형이 없으면 잡음', findOutputProblems(sess, stage, {
    ...base, judgements: {}, stageVerdict: 'fatal',
    fatalBehavior: { detected: true, type: null, evidenceTurnIds: [turn.id] },
  }, turn.id).some((p) => p.includes('type')));
  ok('fatal에 근거가 없으면 잡음', findOutputProblems(sess, stage, {
    ...base, judgements: {}, stageVerdict: 'fatal',
    fatalBehavior: { detected: true, type: 'threat', evidenceTurnIds: [] },
  }, turn.id).some((p) => p.includes('evidenceTurnIds')));
  ok('fatal인데 detected가 false면 잡음', findOutputProblems(sess, stage, {
    ...base, judgements: {}, stageVerdict: 'fatal',
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
  }, turn.id).some((p) => p.includes('detected')));
  ok('정상 fatal은 문제 없음', findOutputProblems(sess, stage, {
    ...base, judgements: {}, stageVerdict: 'fatal',
    fatalBehavior: { detected: true, type: 'threat', evidenceTurnIds: [turn.id] },
  }, turn.id).length === 0);

  // 스테이지에 없는 키
  ok('스테이지에 없는 키를 잡음', findOutputProblems(sess, stage, {
    ...base, judgements: { 없는키: {
      action: 'confirm', agreementSummary: '요약', reason: '이유',
      evidenceTurnIds: [turn.id], contextAnchorTurnId: null,
    } },
  }, turn.id).some((p) => p.includes('합의 키가 아닙니다')));

  // 10번 — 재요청 프롬프트에 오류 내용이 실려야 한다
  const built = buildJudgePrompt({
    repairProblems: badEvidence, session: sess, stage, playerTurn: turn,
    worldStateReferences: {}, nearCallLimit: false, finalCall: false,
  }, MAX_PROMPT_TOKENS);
  ok('재요청 프롬프트에 오류 내용이 실림', !!built && built.user.includes(badEvidence[0]));
  ok('  고치라는 지시도 실림', !!built && built.user.includes('고쳐서 다시 답한다'));

  const plain = buildJudgePrompt({
    session: sess, stage, playerTurn: turn,
    worldStateReferences: {}, nearCallLimit: false, finalCall: false,
  }, MAX_PROMPT_TOKENS);
  ok('평소 프롬프트에는 안 실림', !!plain && !plain.user.includes('직전 출력의 문제'));

  // 예산은 판정 호출과 분리된다
  ok('수정 재요청 예산이 판정과 분리',
    MAX_REPAIR_REQUESTS_PER_SESSION === 5 && sess.repairRequestCount === 0);
}

async function successExtras(): Promise<void> {
  // 20번 — 성공 응답에 고정 안내문, 실패 응답에는 없음
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('고정 안내문 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  ok('진행 중에는 고정 안내문 없음', s.value.fixedTerms === undefined || s.value.fixedTerms === null);

  exhaustCalls(sid);
  const failed = await processTurn({ sessionId: sid, requestId: id('r'), messageId: id('m'), playerText: '한 번만요' });
  ok('실패 응답에는 고정 안내문 없음', failed.ok && !failed.value.fixedTerms);
  ok('  실패 응답에는 보상도 없음', failed.ok && !failed.value.rewards);

  // 성공 경로는 모든 필수 키를 채워야 한다
  const win = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!win.ok) return ok('성공 시나리오 시작', false);
  const wid = win.value.sessionId;
  skipOpeningTts(wid);
  const stage = getStage(1)!;
  const sess = getSession(wid)!;
  const turn = appendPlayerTurn(wid, id('m'), '평일 5일 전부 하고 다음 주 월요일부터 나오겠습니다');
  for (const key of stage.requiredAgreementKeys) {
    setAgreement(wid, key, {
      status: 'met', summary: '합의', evidenceTurnIds: [turn.id],
      selfProposalTurnIds: [turn.id], lastAction: 'confirm', updatedAtMs: Date.now(),
    });
  }
  exhaustCalls(wid);
  const won = await processTurn({ sessionId: wid, requestId: id('r'), messageId: id('m'), playerText: '잘 부탁드립니다' });
  ok('성공 응답에 고정 안내문', won.ok && (won.value.fixedTerms?.length ?? 0) > 0,
    won.ok ? String(won.value.outcome) : 'fail');
  ok('  성공 응답에 보상', won.ok && !!won.value.rewards);
  ok('  성공 응답에는 실패 문구 없음', won.ok && !won.value.failureText);
  void sess;
}

async function readyAndTimer(): Promise<void> {
  // 공통규칙 §3 — 첫 대사 TTS가 끝날 때까지는 ready이고 입력을 받지 않는다
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('ready 시나리오 시작', false);
  const sid = s.value.sessionId;
  const sess = getSession(sid)!;
  const stage = getStage(1)!;

  ok('시작 직후는 ready', sessionStatus(sess) === 'ready', sessionStatus(sess));
  ok('  마감이 첫 대사 뒤로 잡힘', (sess.startedAtMs ?? 0) > Date.now());
  ok('  남은 시간이 제한을 넘지 않음',
    (remainingSecondsOf(sess) ?? 0) <= (stage.timeLimitSeconds ?? Infinity),
    `${remainingSecondsOf(sess)} > ${stage.timeLimitSeconds}`);

  const before = sess.llmCallCount;
  const early = await processTurn({ sessionId: sid, requestId: id('r'), messageId: id('m'), playerText: '안녕하세요' });
  ok('TTS 중 발화는 판정 호출을 쓰지 않음', sess.llmCallCount === before, `${sess.llmCallCount}`);
  ok('  발화로 기록하지도 않음', sess.turns.filter((t) => t.speaker === 'player').length === 0);
  ok('  오류가 아니라 진행 중으로 답함', early.ok && early.value.outcome === 'in_progress');

  skipOpeningTts(sid);
  ok('첫 대사가 끝나면 in_progress', sessionStatus(sess) === 'in_progress');
  const after = await processTurn({ sessionId: sid, requestId: id('r'), messageId: id('m'), playerText: '평일 야간 가능합니다' });
  ok('  그때부터 발화가 들어감', after.ok && sess.llmCallCount === before + 1);

  // 21번 — 경고 시점을 서버가 보낸다. 클라이언트가 숫자를 박아 넣지 않는다
  ok('경고 시점이 응답에 실림',
    after.ok && after.value.timerWarningSeconds.join() === TIMER_WARNING_SECONDS.join(),
    after.ok ? after.value.timerWarningSeconds.join() : 'fail');
  ok('  시작 응답에도 실림', s.value.timerWarningSeconds.length === 2);
}

async function worldStateOnce(): Promise<void> {
  // 각 스테이지 §월드 상태 참조 — 세션당 최대 한 번
  const stage = getStage(3)!;
  const keys = Object.keys(stage.worldStateReferences ?? {});
  ok('스테이지 3에 월드 상태 참조 있음', keys.length === 2);

  const s = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: keys });
  if (!s.ok) return ok('월드 상태 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  const sess = getSession(sid)!;

  ok('처음엔 둘 다 프롬프트 대상',
    Object.keys(activeWorldStateReferences(stage, sess.worldStateKeys, sess.mentionedWorldStateKeys)).length === 2);

  markWorldStateMentioned(sid, [keys[0]]);
  const left = activeWorldStateReferences(stage, sess.worldStateKeys, sess.mentionedWorldStateKeys);
  ok('언급한 키는 빠짐', !(keys[0] in left));
  ok('  안 언급한 키는 남음', keys[1] in left);

  markWorldStateMentioned(sid, [keys[0]]);
  ok('같은 키를 또 기록해도 중복되지 않음', sess.mentionedWorldStateKeys.length === 1);

  markWorldStateMentioned(sid, ['선언되지_않은_키']);
  ok('선언 안 된 키도 목록엔 들어가지만 참조에 영향 없음',
    Object.keys(activeWorldStateReferences(stage, sess.worldStateKeys, sess.mentionedWorldStateKeys)).length === 1);

  // 월드 상태가 없으면 아예 대상이 아니다
  const none = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: [] });
  ok('월드 상태가 없으면 참조 없음',
    none.ok && Object.keys(activeWorldStateReferences(stage, getSession(none.value.sessionId)!.worldStateKeys, [])).length === 0);
}

async function reportPromptHygiene(): Promise<void> {
  // 리포트 프롬프트에 내부 식별자가 들어가면 총평에 그대로 새어 나온다.
  // "empty_pledge 태그가 2회 잡혔습니다" 같은 문장이 실제로 나왔다.
  const stage = getStage(3)!;
  const s = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('리포트 프롬프트 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  const sess = getSession(sid)!;

  appendNpcTurn(sid, '어떻게 치울 건가?');
  const turn = appendPlayerTurn(sid, id('m'), '열심히 하겠습니다');
  for (const tag of stage.styleReportConfig.allowedStageTags) {
    recordStyleSignals(sid, {
      formality: 'polite', directness: 'direct',
      cushion: { used: true, expressions: ['혹시'] },
      stageTags: [tag], evidenceTurnId: turn.id,
    });
  }

  const prompt = buildReportSystem(stage) + '\n' + buildReportUser(buildReportInput(sess, playerTurns(sess)), stage);

  // 모든 스테이지의 태그 코드가 어디에도 없어야 한다
  const allTags = loadAllStages().flatMap((st) => st.styleReportConfig.allowedStageTags);
  const leakedTags = allTags.filter((t) => prompt.includes(t));
  ok('태그 코드가 프롬프트에 없음', leakedTags.length === 0, leakedTags.join(', '));

  const leakedKeys = loadAllStages()
    .flatMap((st) => st.requiredAgreementKeys)
    .filter((k) => prompt.includes(k));
  ok('합의 키 이름이 프롬프트에 없음', leakedKeys.length === 0, leakedKeys.join(', '));

  // 태그는 빠지는 게 아니라 우리말 설명으로 들어가야 한다
  ok('태그가 우리말 설명으로 실림',
    stage.styleReportConfig.allowedStageTags.every((t) => {
      const text = describeTag(t);
      return text !== null && prompt.includes(text);
    }));

  // 설명이 없는 태그가 생기면 여기서 걸린다
  const undescribed = allTags.filter((t) => describeTag(t) === null);
  ok('모든 태그에 설명이 있음', undescribed.length === 0, undescribed.join(', '));

  // 합의 상태는 기획서의 의도 문장으로
  ok('합의 상태가 의도 문장으로 실림',
    stage.requiredAgreementKeys.every((k) => prompt.includes(stage.agreementDefinitions[k].intent)));

  // 말투 이름은 한 일의 서술이 아니라 어떤 사람이었는지의 설명이어야 한다
  ok('이름 규칙이 유형 이름을 요구', prompt.includes('유형 이름'));
  ok('  낱말 나열을 반례로 제시', prompt.includes('쓴 낱말을 나열한 것'));
  ok('  밋밋한 이름을 반례로 제시', prompt.includes('밋밋하고 사람이 안 보임'));
  ok('  인용은 짧은 설명에서', prompt.includes('그건 짧은 설명에서 다룹니다'));
}

async function idempotency(): Promise<void> {
  // 공통규칙 §3 — messageId는 발화, requestId는 처리 시도
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('멱등성 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  const sess = getSession(sid)!;

  const mid = id('m');
  await processTurn({ sessionId: sid, requestId: id('r'), messageId: mid, playerText: '평일 야간 전부 가능합니다' });
  const calls = sess.llmCallCount;

  await processTurn({ sessionId: sid, requestId: id('r'), messageId: mid, playerText: '평일 야간 전부 가능합니다' });
  ok('반영된 messageId는 새 requestId로도 재처리 안 함', sess.llmCallCount === calls, `${sess.llmCallCount}`);

  const conflict = await processTurn({ sessionId: sid, requestId: id('r'), messageId: mid, playerText: '내용이 다릅니다' });
  ok('같은 messageId로 내용을 바꾸면 409', !conflict.ok && conflict.status === 409);

  const rid = id('r');
  const [a, b] = await Promise.all([
    processTurn({ sessionId: sid, requestId: rid, messageId: id('m'), playerText: '다음 주 월요일부터 나옵니다' }),
    processTurn({ sessionId: sid, requestId: rid, messageId: id('m'), playerText: '다음 주 월요일부터 나옵니다' }),
  ]);
  ok('같은 requestId 동시 전송 → 한 번만 처리', a.ok && b.ok && sess.llmCallCount === calls + 1, `${sess.llmCallCount}`);
}

async function privacy(): Promise<void> {
  // 공통규칙 §10 — 판정 근거와 내부 수치는 클라이언트로 나가지 않는다
  const s = await startNegotiation({ stageId: 3, requestId: id('r'), worldState: ['part_time_job_secured'] });
  if (!s.ok) return ok('비공개 시나리오 시작', false);
  const sid = s.value.sessionId;
  skipOpeningTts(sid);
  const t = await processTurn({
    sessionId: sid, requestId: id('r'), messageId: id('m'),
    playerText: '제가 토요일까지 배달 용기랑 쓰레기 다 내놓겠습니다',
  });
  exhaustCalls(sid);
  const end = await processTurn({ sessionId: sid, requestId: id('r'), messageId: id('m'), playerText: '알겠습니다' });
  await tick();
  const result = getResult(sid);

  const exposed = JSON.stringify([s.value, t.ok && t.value, end.ok && end.value, result.ok && result.value]);
  ok('판정 기준·근거·내부 수치 미노출',
    !/passWhen|clarifyWhen|revokeWhen|disclosedFacts|disclosureDefinitions|llmCallCount|reportCallCount|stageTags|successEpilogue|worldStateReferences|memoGuide/.test(exposed));
}

async function main(): Promise<void> {
  await stageData();
  await persona();
  await budgets();
  await callCeiling();
  await selfProposal();
  await repairContract();
  await readyAndTimer();
  await worldStateOnce();
  await successExtras();
  await reportPromptHygiene();
  await asyncReport();
  await idempotency();
  await privacy();

  const total = pass + failures.length;
  if (failures.length > 0) {
    console.log(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log(`\n${pass}/${total} 통과`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main();
