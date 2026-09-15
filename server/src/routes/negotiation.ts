import { Router } from 'express';
import type {
  NegotiationView,
  StartResponse,
  TurnResponse,
} from '../../../shared/types/negotiationTypes';
import { getStage, listStages } from '../services/npcPersonaService';
import { evaluateTurn } from '../services/llmService';
import {
  activeWorldStateReferences,
  allRequiredMet,
  applyJudgements,
  buildAgreementMemo,
  buildResult,
  endExpressionKey,
  isExpired,
  isFatalConfirmed,
  isVerdictMismatch,
  processingPauseSeconds,
  resolveExpressionKey,
  resolveOutcome,
  timeoutHint,
  ttsPauseSeconds,
} from '../services/negotiationEngine';
import {
  appendTurn,
  createSession,
  endSession,
  extendDeadline,
  getProcessedResponse,
  getSession,
  getStartResponse,
  incrementLlmCallCount,
  recordStyleSignals,
  rememberResponse,
  rememberStartResponse,
  remainingSeconds,
  revertTurn,
  startTimer,
  type Session,
} from '../models/session';
import { NEAR_CALL_LIMIT_THRESHOLD, type StageDefinition } from '../data/stageSchema';

export const negotiationRouter = Router();

// ─────────────────────────────────────────────
// GET /api/stages
// ─────────────────────────────────────────────

negotiationRouter.get('/stages', (req, res) => {
  try {
    // 해금 여부는 플레이어가 보유한 월드 상태 키로 계산한다.
    // 공통규칙 §3에 따라 이 기록은 클라이언트 로컬 저장소에 있으므로
    // 프론트가 쿼리로 넘겨준다. 없으면 전부 잠긴 것으로 본다.
    // TODO: 프론트 담당과 파라미터 이름 확정 (?worldState=tutorial_completed,...)
    const worldState = String(req.query.worldState ?? '').split(',').filter(Boolean);
    res.json(listStages(worldState));
  } catch (err) {
    console.error('[GET /stages]', err);
    res.status(500).json({ error: 'failed to load stages' });
  }
});

// ─────────────────────────────────────────────
// POST /api/negotiation/start
// ─────────────────────────────────────────────

negotiationRouter.post('/negotiation/start', (req, res) => {
  const { stageId, requestId, worldState } = req.body ?? {};
  if (typeof stageId !== 'number' || typeof requestId !== 'string' || requestId === '') {
    return res.status(400).json({ error: 'stageId(number)와 requestId(string)가 필요합니다' });
  }

  // 재전송이면 세션을 새로 만들지 않고 최초 응답을 그대로 돌려준다.
  const cached = getStartResponse<StartResponse>(requestId);
  if (cached) return res.json(cached);

  const stage = getStage(stageId);
  if (!stage) return res.status(404).json({ error: `stage ${stageId} not found` });

  const session = createSession({
    stageId: stage.stageId,
    npcId: stage.npcId,
    requiredAgreementKeys: stage.requiredAgreementKeys,
    timeLimitSeconds: stage.timeLimitSeconds,
    worldStateKeys: Array.isArray(worldState) ? worldState.filter((k) => typeof k === 'string') : [],
  });

  // 고정 첫 대사를 대화 기록에 남긴다. 남기지 않으면 맥락 동의의 anchor가 없다.
  for (const line of stage.openingLines) {
    appendTurn(session.sessionId, { speaker: 'npc', text: line });
  }

  // startedAt = 응답 전송 시각 + 첫 대사의 추정 TTS 시간 (공통규칙 §3).
  // 클라이언트의 재생 완료 보고는 받지 않는다.
  const openingText = stage.openingLines.join(' ');
  const startedAtMs = Date.now() + ttsPauseSeconds(openingText) * 1000;
  if (stage.timeLimitSeconds !== null) {
    startTimer(session.sessionId, startedAtMs, stage.timeLimitSeconds);
  }

  const response: StartResponse = {
    sessionId: session.sessionId,
    ...viewOf(session, stage, 'in_progress', null, openingText),
  };
  rememberStartResponse(requestId, response);
  res.json(response);
});

// ─────────────────────────────────────────────
// POST /api/negotiation/turn
// ─────────────────────────────────────────────

negotiationRouter.post('/negotiation/turn', async (req, res) => {
  const { sessionId, requestId, playerText } = req.body ?? {};
  if (
    typeof sessionId !== 'string' ||
    typeof requestId !== 'string' || requestId === '' ||
    typeof playerText !== 'string'
  ) {
    return res.status(400).json({ error: 'sessionId·requestId·playerText가 필요합니다' });
  }

  const session = getSession(sessionId);
  if (!session) {
    // 서버를 재시작하면 진행 중 세션이 사라진다. 정상적으로 자주 발생한다.
    return res.status(404).json({ error: 'session not found' });
  }

  // 같은 requestId 재전송이면 상태를 다시 바꾸지 않는다.
  const cached = getProcessedResponse(sessionId, requestId);
  if (cached) return res.json(cached);

  const stage = getStage(session.stageId);
  if (!stage) return res.status(500).json({ error: 'stage definition missing' });

  // 종료된 세션에 새 요청이 오면 저장된 종료 결과를 반환한다.
  if (session.status === 'ended') {
    return res.json(endViewOf(session, stage));
  }

  // 빈 STT는 합의 상태를 바꾸지 않고 판정 호출도 쓰지 않는다.
  if (playerText.trim() === '') {
    return res.json(viewOf(session, stage, 'in_progress', null, ''));
  }

  const receivedAtMs = Date.now();
  const deadlineSnapshotMs = session.deadlineAtMs;

  // 마감 이후 접수된 입력은 LLM에 보내지 않는다 (공통규칙 §4).
  if (isExpired(receivedAtMs, deadlineSnapshotMs)) {
    return res.json(finishAndRespond(session, stage, 'failure', 'time'));
  }

  const playerTurn = appendTurn(sessionId, { speaker: 'player', text: playerText.trim() });
  const callCount = incrementLlmCallCount(sessionId);

  let llm;
  try {
    llm = await evaluateTurn({
      stage,
      session,
      playerTurnId: playerTurn.id,
      playerText: playerText.trim(),
      nearCallLimit: callCount >= NEAR_CALL_LIMIT_THRESHOLD,
      finalCall: callCount >= stage.maxLlmCallsPerSession,
      worldStateReferences: activeWorldStateReferences(stage, session.worldStateKeys),
    });
  } catch (err) {
    // 수정 재요청까지 실패한 경우. 합의 상태를 보존하고 세션은 이어진다.
    console.error('[turn] LLM 실패', err);
    revertTurn(sessionId, playerTurn.id);
    return res.json(viewOf(session, stage, 'retry', 'system', ''));
  }

  const fatal = isFatalConfirmed(session, llm);

  // 치명적 행동을 먼저 본다. fatalRecovery면 종료 대신 되돌린다.
  const { outcome, endReason } = resolveOutcomeWithMerge(session, stage, {
    receivedAtMs, deadlineSnapshotMs, fatal, llm,
  });

  if (outcome === 'reverted') {
    // 그 발화는 대화 기록·판정 호출 수·말투 집계에서 모두 빠진다.
    revertTurn(sessionId, playerTurn.id);
    return res.json(viewOf(session, stage, 'reverted', null, llm.npcReply));
  }

  recordStyleSignals(sessionId, llm.styleSignals);
  const npcTurn = appendTurn(sessionId, { speaker: 'npc', text: llm.npcReply });

  if (isVerdictMismatch(llm, outcome)) {
    console.warn(`[turn] VERDICT_MISMATCH: stageVerdict=${llm.stageVerdict} outcome=${outcome}`);
  }

  // 이번 요청에서 인정된 정지 시간은 다음 요청부터 적용한다 (마감 스냅샷).
  const pauseMs =
    (processingPauseSeconds(Date.now() - receivedAtMs) + ttsPauseSeconds(npcTurn.text)) * 1000;
  extendDeadline(sessionId, pauseMs);

  if (outcome === 'in_progress') {
    return res.json(viewOf(session, stage, 'in_progress', null, llm.npcReply));
  }
  res.json(finishAndRespond(session, stage, outcome, endReason, llm.npcReply));
});

// ─────────────────────────────────────────────
// 조립
// ─────────────────────────────────────────────

function resolveOutcomeWithMerge(
  session: Session,
  stage: StageDefinition,
  input: {
    receivedAtMs: number;
    deadlineSnapshotMs: number | null;
    fatal: boolean;
    llm: Awaited<ReturnType<typeof evaluateTurn>>;
  },
) {
  // fatal이면 합의를 반영하지 않고 끝낸다 (공통규칙 §6 종료 우선순위 3·4).
  if (!input.fatal) applyJudgements(session, stage, input.llm);
  return resolveOutcome(session, stage, {
    receivedAtMs: input.receivedAtMs,
    deadlineSnapshotMs: input.deadlineSnapshotMs,
    fatal: input.fatal,
  });
}

/** 진행 중 응답. hintText는 종료 응답에서만 값을 가진다. */
function viewOf(
  session: Session,
  stage: StageDefinition,
  outcome: NegotiationView['outcome'],
  endReason: NegotiationView['endReason'],
  npcReply: string,
): NegotiationView {
  return {
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: resolveExpressionKey(stage, stage.defaultExpressionKey),
    hintText: null,
  };
}

/** 종료 응답. 문구와 표정이 전부 스테이지 정의에서 온다. */
function endViewOf(session: Session, stage: StageDefinition, npcReply = ''): NegotiationView {
  const { outcome, endReason } = session;
  return {
    outcome,
    endReason,
    npcReply,
    remainingSeconds: remainingSeconds(session),
    timerStatus: session.timerStatus,
    agreementMemo: buildAgreementMemo(session, stage),
    expressionKey: endExpressionKey(stage, outcome),
    hintText: endReason === 'time' ? timeoutHint(session, stage) : null,
    result: buildResult(stage, outcome, endReason),
    // TODO(3주차): styleAnalyzer가 완성되면 styleReport를 함께 싣는다.
    //             "말의 호흡" 축의 글자 수 환산 범위를 기획에 확인 중이라 보류.
  };
}

function finishAndRespond(
  session: Session,
  stage: StageDefinition,
  outcome: NegotiationView['outcome'],
  endReason: NegotiationView['endReason'],
  npcReply = '',
): NegotiationView {
  endSession(session.sessionId, outcome, endReason);
  return endViewOf(session, stage, npcReply);
}

// allRequiredMet은 resolveOutcome이 쓰지만 라우트에서도 참조할 수 있게 재수출한다.
export { allRequiredMet };
