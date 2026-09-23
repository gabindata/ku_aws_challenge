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
import { getSession, SESSION_RETENTION_MS } from '../models/session';
import { getStage, loadAllStages } from '../services/npcPersonaService';
import { buildRewards, activeWorldStateReferences } from '../services/negotiationEngine';
import {
  MAX_LLM_CALLS_PER_SESSION,
  MAX_REPAIR_REQUESTS_PER_SESSION,
  MAX_REPORT_CALLS_PER_SESSION,
  MAX_PROMPT_TOKENS,
  MAX_OUTPUT_TOKENS,
} from '../data/stageSchema';
import { buildJudgePrompt } from '../llm/judgePrompt';
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

  // 월드 상태 참조는 선언 ∩ 충족만
  ok('월드 상태 참조 교집합',
    Object.keys(activeWorldStateReferences(s3, ['part_time_job_secured'])).length === 1);
  ok('월드 상태 없으면 참조 없음',
    Object.keys(activeWorldStateReferences(s3, [])).length === 0);
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

async function idempotency(): Promise<void> {
  // 공통규칙 §3 — messageId는 발화, requestId는 처리 시도
  const s = await startNegotiation({ stageId: 1, requestId: id('r'), worldState: [] });
  if (!s.ok) return ok('멱등성 시나리오 시작', false);
  const sid = s.value.sessionId;
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
  await budgets();
  await callCeiling();
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
