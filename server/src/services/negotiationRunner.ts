import type {
  EndReason,
  NegotiationView,
  Outcome,
  StartResponse,
} from '../../../shared/types/negotiationTypes';
import {
  appendNpcTurn,
  appendPlayerTurn,
  createSession,
  extendDeadline,
  getSession,
  incrementLlmCallCount,
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
import { NEAR_CALL_LIMIT_THRESHOLD, type StageDefinition } from '../data/stageSchema';
import { getStage } from './npcPersonaService';
import { evaluateTurn, generateNarrative } from './llmService';
import { buildReport, silentSummary } from './styleAnalyzer';
import {
  activeWorldStateReferences,
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

    return ok<StartResponse>({
      sessionId: session.sessionId,
      ...progressView(session, stage, 'in_progress', null, openingText, stage.defaultExpressionKey),
    });
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
    return ok(await finish(session, stage, 'failure', 'limit', ''));
  }

  session.messages.set(input.messageId, { text, applied: null });
  const playerTurn = appendPlayerTurn(session.sessionId, input.messageId, text);
  const callCount = incrementLlmCallCount(session.sessionId);

  let llm;
  try {
    llm = await evaluateTurn({
      stage,
      session,
      playerTurnId: playerTurn.id,
      playerText: text,
      nearCallLimit: callCount >= NEAR_CALL_LIMIT_THRESHOLD,
      finalCall: callCount >= stage.maxLlmCallsPerSession,
      worldStateReferences: activeWorldStateReferences(stage, session.worldStateKeys),
    });
  } catch (err) {
    // 수정 재요청까지 실패. 합의 상태를 보존하고 발화를 정상 반영으로 기록하지 않는다.
    // 클라이언트는 같은 messageId에 새 requestId로 다시 시도한다. 사용한 호출은 되돌리지 않는다.
    console.error('[turn] LLM 실패', err);
    removeTurn(session.sessionId, playerTurn.id);
    extendDeadline(session.sessionId, processingPauseSeconds(Date.now() - receivedAtMs) * 1000);
    const after = await recheckAfterProcessing(session, stage);
    return ok(after ?? progressView(session, stage, 'retry', 'system', '', stage.defaultExpressionKey));
  }

  const fatal = isFatalConfirmed(session, llm);
  const expression = resolveExpressionKey(stage, llm.expressionKey);
  // 되돌리지 않는 치명적 종료의 발화는 리포트에서 극단적인 발화로 인용된다.
  if (fatal && stage.fatalRecovery !== true) recordFatalTurn(session.sessionId, playerTurn.id);

  // 3. fatalRecovery — 합의 상태를 건드리기 전이므로 되돌릴 것은 발화 기록뿐이다.
  //    해당 발화는 대화 기록·리포트 집계에서 빠지지만 사용한 호출 수는 유지한다.
  if (fatal && stage.fatalRecovery === true) {
    removeTurn(session.sessionId, playerTurn.id);
    extendDeadline(session.sessionId, processingPauseSeconds(Date.now() - receivedAtMs) * 1000);
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
  const pauseMs = (processingPauseSeconds(Date.now() - receivedAtMs) + ttsPauseSeconds(npcTurn.text)) * 1000;
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

  const turns = playerTurns(session);
  // 유효 발화가 0개면 종료 LLM을 부르지 않고 서버가 종료 사실만 한 줄로 적는다.
  const narrative = turns.length === 0
    ? { title: '', titleNote: '', highlights: [], summary: silentSummary(endReason) }
    : await generateNarrative({ stage, session, outcome, endReason, playerTurns: turns, signals: session.styleSignals });

  session.styleReport = buildReport(turns, session.styleSignals, narrative);

  const success = outcome === 'success';
  const view: NegotiationView = {
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: endExpressionKey(stage, outcome),
    hintText: endReason === 'time' ? timeoutHint(session, stage) : null,
    successText: success ? stage.successText : null,
    failureText: outcome === 'failure' ? stage.failureText ?? null : null,
    limitText: endReason === 'limit' ? stage.limitText : null,
    rewards: success ? buildRewards(stage) : null,
    onClose: stage.onFailureClose ?? 'world_map',
    styleReport: session.styleReport,
  };
  session.endView = view;
  return view;
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
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: resolveExpressionKey(stage, expressionKey),
    hintText: null,
  };
}
