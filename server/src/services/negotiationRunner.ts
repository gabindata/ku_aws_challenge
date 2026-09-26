import type {
  EndReason,
  NegotiationView,
  Outcome,
  ResultResponse,
  StartResponse,
} from '../../../shared/types/negotiationTypes';
import {
  appendNpcTurn,
  appendPlayerTurn,
  createSession,
  beginInput,
  extendDeadline,
  getSession,
  incrementLlmCallCount,
  isSettingsPaused,
  pauseForSettings,
  resumeFromSettings,
  isWarmingUp,
  markWorldStateMentioned,
  sessionStatus,
  finishReport,
  markEnded,
  playerTurns,
  recordFatalTurn,
  recordStyleSignals,
  remainingSeconds,
  removeTurn,
  startRequest,
  startTimer,
  withSessionLock,
  type Session,
} from '../models/session';
import {
  MAX_REPAIR_REQUESTS_PER_SESSION,
  NEAR_CALL_LIMIT_THRESHOLD,
  TIMER_WARNING_SECONDS,
  type StageDefinition,
} from '../data/stageSchema';
import { getStage } from './npcPersonaService';
import { evaluateTurn, generateNarrative } from './llmService';
import { buildReport, silentSummary } from './styleAnalyzer';
import {
  activeWorldStateReferences,
  findOutputProblems,
  applyDisclosureUpdates,
  applyJudgements,
  buildAgreementMemo,
  buildRewards,
  endExpressionKey,
  filterStageTags,
  isExpired,
  isFatalConfirmed,
  isValidStyleSignals,
  isVerdictMismatch,
  processingPauseSeconds,
  resolveExpressionKey,
  resolveOutcome,
  timeoutHint,
  ttsPauseSeconds,
} from './negotiationEngine';

/**
 * 협상 진행. 라우트는 HTTP만 다루고 실제 절차는 여기서 한다.
 *
 * 같은 세션의 발화 처리와 만료 확인은 withSessionLock으로 한 줄로 세운다.
 * 그래서 종료 확정과 리포트 생성이 세션당 한 번만 일어난다.
 */

export type RunResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const ok = <T>(value: T): RunResult<T> => ({ ok: true, value });
const fail = <T>(status: number, error: string): RunResult<T> => ({ ok: false, status, error });

// ─────────────────────────────────────────────
// 시작
// ─────────────────────────────────────────────

export function startNegotiation(input: {
  stageId: number;
  requestId: string;
  worldState: string[];
}): Promise<RunResult<StartResponse>> {
  // 재전송이면 세션을 새로 만들지 않는다. 처리 중이면 그 결과를 기다린다.
  return startRequest(input.requestId, async () => {
    const stage = getStage(input.stageId);
    if (!stage) return fail<StartResponse>(404, `stage ${input.stageId} not found`);

    const session = createSession({
      stageId: stage.stageId,
      npcId: stage.npcId,
      requiredAgreementKeys: stage.requiredAgreementKeys,
      timeLimitSeconds: stage.timeLimitSeconds,
      worldStateKeys: input.worldState,
    });

    // 첫 대사를 기록에 남겨야 맥락 동의의 앵커가 된다.
    for (const line of stage.openingLines) appendNpcTurn(session.sessionId, line);

    // startedAt = 응답 시각 + 첫 대사의 추정 TTS. 클라이언트의 재생 완료 보고는 받지 않는다.
    const openingText = stage.openingLines.join(' ');
    if (stage.timeLimitSeconds !== null) {
      startTimer(session.sessionId, Date.now() + ttsPauseSeconds(openingText) * 1000, stage.timeLimitSeconds);
      scheduleExpiry(session);
    }

    return ok<StartResponse>(
      progressView(session, stage, 'in_progress', null, openingText, stage.defaultExpressionKey),
    );
  });
}

// ─────────────────────────────────────────────
// 발화 처리
// ─────────────────────────────────────────────

export interface TurnInput {
  sessionId: string;
  requestId: string;
  messageId: string;
  playerText: string;
}

export async function processTurn(input: TurnInput): Promise<RunResult<NegotiationView>> {
  const session = getSession(input.sessionId);
  // 서버를 재시작하면 진행 중 세션이 사라진다. 정상적으로 자주 발생한다.
  if (!session) return fail(404, 'session not found');
  const stage = getStage(session.stageId);
  if (!stage) return fail(500, 'stage definition missing');

  // 같은 requestId는 다시 처리하지 않는다. 처리 중이면 그 결과를 기다린다.
  const existing = session.requests.get(input.requestId) as Promise<RunResult<NegotiationView>> | undefined;
  if (existing) return existing;

  const run = withSessionLock(session.sessionId, () => handleTurn(session, stage, input));
  session.requests.set(input.requestId, run);
  return run;
}

async function handleTurn(
  session: Session,
  stage: StageDefinition,
  input: TurnInput,
): Promise<RunResult<NegotiationView>> {
  if (session.status === 'ended' && session.endView) return ok(session.endView);

  const text = input.playerText.trim();
  const message = session.messages.get(input.messageId);

  // 같은 ID로 발화 내용을 바꾸는 요청은 거부한다. 수정했다면 새 발화로 보내야 한다.
  if (message && message.text !== text) return fail(409, 'messageId의 발화 내용이 다릅니다');
  // 이미 정상 반영된 발화는 새 requestId로 와도 다시 처리하지 않는다.
  if (message?.applied) return ok(message.applied);

  // 첫 대사 TTS가 아직 흐르는 중이면 입력을 받지 않는다 (공통규칙 §3).
  // 판정 호출도 쓰지 않고 발화로 기록하지도 않으므로, 끝난 뒤 다시 보내면 된다.
  if (isWarmingUp(session)) {
    return ok(progressView(session, stage, 'in_progress', null, '', stage.defaultExpressionKey));
  }
  beginInput(session.sessionId);

  // 설정창 정지 중에는 새 발화를 받지 않는다 (공통규칙 §4 예외).
  // 판정 호출도 쓰지 않고 기록도 남기지 않는다. 재개한 뒤 다시 보내면 된다.
  if (isSettingsPaused(session)) return fail(409, 'SESSION_PAUSED');

  // 빈 STT는 합의 상태도 판정 호출도 건드리지 않는다.
  if (text === '') return ok(progressView(session, stage, 'in_progress', null, '', stage.defaultExpressionKey));

  // 1. 마감 스냅샷 — 접수 순간의 마감으로만 유효성을 본다. 넘었으면 LLM에 보내지 않는다.
  const receivedAtMs = Date.now();
  if (isExpired(receivedAtMs, session.deadlineAtMs)) {
    return ok(await finish(session, stage, 'failure', 'time', ''));
  }

  // 2. 호출 상한 — 공통규칙 §8 「41번째 판정은 호출하지 않는다」.
  //
  // 상한 검사가 종료 판정에만 있으면 40번째 출력이 오류일 때 새어나간다.
  // retry를 받은 클라이언트가 새 requestId로 다시 보내면 41번째가 실제로 불린다.
  // 그래서 호출하기 전에 여기서 막는다.
  if (session.llmCallCount >= stage.maxLlmCallsPerSession) {
    // 종료 이유는 §6의 우선순위로 정한다. 필수 키가 이미 다 찼다면
    // 상한에 닿았어도 성공이다. 여기서 failure/limit으로 못 박으면 그걸 덮는다.
    const { outcome, endReason } = resolveOutcome(session, stage, { fatal: false, nowMs: receivedAtMs });
    return ok(await finish(session, stage, outcome, endReason, ''));
  }

  session.messages.set(input.messageId, { text, applied: null });
  const playerTurn = appendPlayerTurn(session.sessionId, input.messageId, text);
  const callCount = incrementLlmCallCount(session.sessionId);

  // 설정창 정지가 처리 중에 끼면 같은 실시간이 두 번 인정된다.
  // 정지분을 빼기 위해 처리 시작 시점의 누적값을 기억한다 (공통규칙 §4 예외).
  const pausedAtRequestStart = session.settingsPausedTotalMs;

  /**
   * 이번 처리에 걸린 시간에서 설정창 정지분을 뺀 값.
   * 정지 중에 재개 요청이 아직 안 온 경우까지 센다.
   */
  const processingMs = (): number => {
    const openPause = session.settingsPausedAtMs === null
      ? 0
      : Date.now() - session.settingsPausedAtMs;
    const settingsMs = session.settingsPausedTotalMs - pausedAtRequestStart + openPause;
    return Math.max(0, Date.now() - receivedAtMs - settingsMs);
  };

  const evaluateInput = {
    stage,
    session,
    playerTurnId: playerTurn.id,
    playerText: text,
    nearCallLimit: callCount >= NEAR_CALL_LIMIT_THRESHOLD,
    finalCall: callCount >= stage.maxLlmCallsPerSession,
    worldStateReferences: activeWorldStateReferences(
      stage, session.worldStateKeys, session.mentionedWorldStateKeys,
    ),
  };

  let llm;
  try {
    llm = await evaluateTurn(evaluateInput);

    // 형식은 맞지만 내용이 어긋난 출력을 고쳐 달라고 한 번 더 묻는다 (공통규칙 §8).
    //
    // 조용히 버리면 화면에는 NPC가 수락하는 대사가 뜨는데 키는 채워지지 않는다.
    // 판정만 바꾸고 수락 대사를 그대로 내보내지 않기 위해, 대사까지 함께 다시 받는다.
    // 이 예산은 판정 호출 40회와 분리돼 있고 세션당 5회다.
    const problems = findOutputProblems(session, stage, llm, playerTurn.id);
    if (problems.length > 0) {
      if (session.repairRequestCount < MAX_REPAIR_REQUESTS_PER_SESSION) {
        session.repairRequestCount += 1;
        console.warn(`[turn] 수정 재요청 (세션 누적 ${session.repairRequestCount}): ${problems.join(' | ')}`);
        const repaired = await evaluateTurn(evaluateInput, problems);
        const left = findOutputProblems(session, stage, repaired, playerTurn.id);
        // 고쳐졌으면 새 출력을 쓴다. 아니면 첫 출력을 쓰고 applyJudgements의 검증에 맡긴다.
        if (left.length === 0) llm = repaired;
        else console.warn(`[turn] 수정 재요청에도 남은 문제: ${left.join(' | ')}`);
      } else {
        console.warn(`[turn] 수정 재요청 예산 소진 — 문제를 남긴 채 진행: ${problems.join(' | ')}`);
      }
    }
  } catch (err) {
    // 수정 재요청까지 실패. 합의 상태를 보존하고 발화를 정상 반영으로 기록하지 않는다.
    // 클라이언트는 같은 messageId에 새 requestId로 다시 시도한다. 사용한 호출은 되돌리지 않는다.
    console.error('[turn] LLM 실패', err);
    removeTurn(session.sessionId, playerTurn.id);
    extendDeadline(session.sessionId, processingPauseSeconds(processingMs()) * 1000);
    const after = await recheckAfterProcessing(session, stage);
    return ok(after ?? progressView(session, stage, 'retry', 'system', '', stage.defaultExpressionKey));
  }

  // 언급한 월드 상태는 기록해 다음 턴부터 프롬프트에서 뺀다 (세션당 한 번).
  // 선언되지 않았거나 충족되지 않은 키는 무시한다.
  const mentionable = activeWorldStateReferences(stage, session.worldStateKeys);
  markWorldStateMentioned(
    session.sessionId,
    (llm.worldStateMentioned ?? []).filter((k) => k in mentionable),
  );

  const fatal = isFatalConfirmed(session, llm);
  const expression = resolveExpressionKey(stage, llm.expressionKey);
  // 되돌리지 않는 치명적 종료의 발화는 리포트에서 극단적인 발화로 인용된다.
  if (fatal && stage.fatalRecovery !== true) recordFatalTurn(session.sessionId, playerTurn.id);

  // 3. fatalRecovery — 합의 상태를 건드리기 전이므로 되돌릴 것은 발화 기록뿐이다.
  //    해당 발화는 대화 기록·리포트 집계에서 빠지지만 사용한 호출 수는 유지한다.
  if (fatal && stage.fatalRecovery === true) {
    removeTurn(session.sessionId, playerTurn.id);
    extendDeadline(session.sessionId, processingPauseSeconds(processingMs()) * 1000);
    scheduleExpiry(session);
    const { outcome, endReason } = resolveOutcome(session, stage, { fatal: true, nowMs: Date.now() });
    const view = outcome === 'reverted'
      ? progressView(session, stage, 'reverted', null, llm.npcReply, expression)
      : await finish(session, stage, outcome, endReason, llm.npcReply);
    // 같은 발화를 다시 보내 호출을 또 쓰지 않도록 처리 완료로 둔다.
    session.messages.set(input.messageId, { text, applied: view });
    return ok(view);
  }

  // 4. 합의 반영. 치명적 행동이면 반영하지 않는다.
  if (!fatal) applyJudgements(session, stage, llm, playerTurn.id);

  if (isValidStyleSignals(llm.styleSignals)) {
    recordStyleSignals(session.sessionId, filterStageTags(stage, llm.styleSignals));
  } else {
    console.warn('[turn] styleSignals 형식 오류 — 리포트 집계에서 제외');
  }

  const npcTurn = appendNpcTurn(session.sessionId, llm.npcReply);
  // 실제 대화에 반영된 NPC 응답에만 안내 기록을 남긴다.
  if (!fatal) applyDisclosureUpdates(session, stage, llm, npcTurn);

  // 6번을 판단하기 전에 이번 처리의 인정 정지 시간을 마감에 먼저 반영한다.
  const pauseMs = (processingPauseSeconds(processingMs()) + ttsPauseSeconds(npcTurn.text)) * 1000;
  extendDeadline(session.sessionId, pauseMs);
  scheduleExpiry(session);

  const { outcome, endReason } = resolveOutcome(session, stage, { fatal, nowMs: Date.now() });
  if (isVerdictMismatch(llm, outcome)) {
    console.warn(`[turn] VERDICT_MISMATCH: stageVerdict=${llm.stageVerdict} outcome=${outcome}`);
  }

  const view = outcome === 'in_progress'
    ? progressView(session, stage, 'in_progress', null, llm.npcReply, expression)
    : await finish(session, stage, outcome, endReason, llm.npcReply);

  session.messages.set(input.messageId, { text, applied: view });
  return ok(view);
}

/** retry 뒤에도 처리 완료 후 최신 마감으로 만료를 다시 확인한다 (공통규칙 §6). */
async function recheckAfterProcessing(session: Session, stage: StageDefinition): Promise<NegotiationView | null> {
  scheduleExpiry(session);
  if (isExpired(Date.now(), session.deadlineAtMs)) return finish(session, stage, 'failure', 'time', '');
  return null;
}

// ─────────────────────────────────────────────
// 서버 시계로 만료 확인 (공통규칙 §4)
// ─────────────────────────────────────────────

/**
 * 플레이어 입력이 없어도 서버가 마감에 맞춰 만료를 확인한다.
 * 마감이 밀리면 예약을 갈아 끼우고, 예약이 실행되더라도 최신 마감을 다시 본다.
 * 세션 잠금 안에서 실행되므로 처리 중인 발화가 있으면 그게 끝난 뒤에 확인한다.
 */
export function scheduleExpiry(session: Session): void {
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  session.expiryTimer = null;
  if (session.deadlineAtMs === null || session.status === 'ended') return;

  const delay = Math.max(0, session.deadlineAtMs - Date.now()) + 25;
  const timer = setTimeout(() => {
    void withSessionLock(session.sessionId, () => checkExpiry(session.sessionId));
  }, delay);
  timer.unref?.();
  session.expiryTimer = timer;
}

async function checkExpiry(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session || session.status === 'ended') return;
  const stage = getStage(session.stageId);
  if (!stage) return;

  // 정확히 마감 시각이면 아직 지나지 않은 것으로 보고 다시 예약한다.
  if (isExpired(Date.now(), session.deadlineAtMs)) {
    // 무입력 종료는 플레이어 발화를 만들거나 판정 LLM을 부르지 않는다.
    await finish(session, stage, 'failure', 'time', '');
  } else {
    scheduleExpiry(session);
  }
}

// ─────────────────────────────────────────────
// 종료
// ─────────────────────────────────────────────

/**
 * 종료를 확정하고 리포트를 만든다. 세션당 한 번만 실행된다.
 * 이미 끝났으면 저장된 결과를 그대로 돌려준다 — 리포트를 다시 만들지 않는다.
 */
async function finish(
  session: Session,
  stage: StageDefinition,
  outcome: Outcome,
  endReason: EndReason,
  npcReply: string,
): Promise<NegotiationView> {
  if (session.status === 'ended' && session.endView) return session.endView;

  markEnded(session.sessionId, outcome, endReason);

  const success = outcome === 'success';
  const view: NegotiationView = {
    sessionId: session.sessionId,
    stageId: session.stageId,
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    timerWarningSeconds: session.timerStatus === 'disabled' ? [] : [...TIMER_WARNING_SECONDS],
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: endExpressionKey(stage, outcome),
    hintText: endReason === 'time' ? timeoutHint(session, stage) : null,
    successText: success ? stage.successText : null,
    failureText: outcome === 'failure' ? stage.failureText ?? null : null,
    limitText: endReason === 'limit' ? stage.limitText : null,
    rewards: success ? buildRewards(stage) : null,
    fixedTerms: success ? stage.fixedTerms : null,
    onClose: stage.onFailureClose ?? 'world_map',
    reportStatus: 'pending',
    styleReport: undefined,
  };
  session.endView = view;

  // 리포트는 기다리지 않는다 (공통규칙 §9). 생성에 10초쯤 걸려서
  // 같이 기다리면 플레이어가 성공했는지도 모른 채 빈 화면을 본다.
  // 완료되면 endView를 갱신하고, 클라이언트는 결과 조회로 가져간다.
  void startReport(session, stage, outcome, endReason);

  return view;
}

/**
 * 리포트를 뒤에서 만든다.
 *
 * 세션당 한 번만 돈다. 결과 조회가 반복돼도 생성이 다시 시작되지 않는다.
 * 실패해도 종료 결과는 이미 나간 뒤라 게임 진행에 영향이 없다.
 */
async function startReport(
  session: Session,
  stage: StageDefinition,
  outcome: Outcome,
  endReason: EndReason,
): Promise<void> {
  if (session.reportStarted) return;
  session.reportStarted = true;

  try {
    const turns = playerTurns(session);
    // 유효 발화가 0개면 종료 LLM을 부르지 않고 서버가 종료 사실만 한 줄로 적는다.
    const narrative = turns.length === 0
      ? { title: '', titleNote: '', highlights: [], summary: silentSummary(endReason) }
      : await generateNarrative({ stage, session, outcome, endReason, playerTurns: turns, signals: session.styleSignals });

    session.styleReport = buildReport(turns, session.styleSignals, narrative);
    finishReport(session.sessionId, 'ready');
  } catch (err) {
    // generateNarrative는 보통 null을 돌려주지만, 예기치 못한 오류도 종료를 막지 않는다.
    console.error('[report] 생성 중 오류', err);
    finishReport(session.sessionId, 'failed');
  }
}

function progressView(
  session: Session,
  stage: StageDefinition,
  outcome: NegotiationView['outcome'],
  endReason: NegotiationView['endReason'],
  npcReply: string,
  expressionKey: string,
): NegotiationView {
  return {
    sessionId: session.sessionId,
    stageId: session.stageId,
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    timerWarningSeconds: session.timerStatus === 'disabled' ? [] : [...TIMER_WARNING_SECONDS],
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: resolveExpressionKey(stage, expressionKey),
    hintText: null,
  };
}

/**
 * 결과 조회 (공통규칙 §9).
 *
 * 진행 중이면 상태와 남은 시간만, 종료됐으면 종료 응답을 그대로 돌려준다.
 * 읽기 전용이다. LLM을 부르지도, 보상을 주지도, 세션을 되살리지도 않는다.
 *
 * 리포트가 아직 pending이면 클라이언트가 이 조회를 다시 해서 가져간다.
 * 반복 조회로 생성이 다시 시작되지는 않는다 (reportStarted 플래그).
 */
export function getResult(sessionId: string): RunResult<ResultResponse> {
  const session = getSession(sessionId);
  // 30분 보관이 지났거나 서버를 재시작한 경우다. 정상적으로 발생한다.
  if (!session) return fail(404, 'SESSION_NOT_FOUND');

  return ok<ResultResponse>({
    sessionId: session.sessionId,
    stageId: session.stageId,
    sessionStatus: sessionStatus(session),
    remainingSeconds: remainingSeconds(session),
    view: session.status === 'ended' ? session.endView : null,
  });
}

/**
 * 설정창 일시정지·재개 (공통규칙 §4 예외).
 *
 * 남은 시간과 정지 상태는 서버가 관리한다. 클라이언트는 열렸다·닫혔다만 알린다.
 * 같은 요청이 두 번 와도 상태가 어긋나지 않는다.
 */
export function setSettingsPause(
  sessionId: string,
  paused: boolean,
): RunResult<ResultResponse> {
  const session = getSession(sessionId);
  if (!session) return fail(404, 'SESSION_NOT_FOUND');
  // 이미 끝난 세션의 타이머는 멈출 것도 되돌릴 것도 없다.
  if (session.status === 'ended') return getResult(sessionId);

  if (paused) {
    pauseForSettings(sessionId);
  } else if (resumeFromSettings(sessionId)) {
    // 마감이 뒤로 밀렸으므로 만료 예약을 다시 걸어야 한다.
    scheduleExpiry(session);
  }
  return getResult(sessionId);
}
