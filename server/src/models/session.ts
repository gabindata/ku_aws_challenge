import { randomBytes } from 'node:crypto';
import type {
  AgreementState,
  EndReason,
  NegotiationView,
  Outcome,
  TimerStatus,
  Turn,
} from '../../../shared/types/negotiationTypes';
import type { StyleSignals } from '../../../shared/types/styleReportTypes';

/**
 * 진행 중인 협상 세션. 서버 메모리에만 두고 단일 인스턴스로 배포한다.
 * 재시작하면 진행 중 세션은 소멸하고 플레이어는 스테이지를 다시 시작한다 (공통규칙 §4).
 */
export interface Session {
  sessionId: string;
  stageId: number;
  npcId: string;

  /** 대화 로그. turn.id가 evidenceTurnIds의 대상이다. */
  turns: Turn[];
  /** 합의 키 → 현재 상태 */
  agreements: Record<string, AgreementState>;

  outcome: Outcome;
  endReason: EndReason;

  // ── 타이머 (공통규칙 §4) ──
  timerStatus: TimerStatus;
  /** 마감 시각. timerStatus가 'disabled'면 null */
  deadlineAtMs: number | null;
  /** 정지된 동안 뒤로 민 누적 시간(ms). LLM 처리와 TTS 재생만 인정된다. */
  pausedTotalMs: number;

  // ── 비용 상한 (공통규칙 §4) ──
  llmCallCount: number;

  /** 말투 리포트용 누적. 판정과 분리해 쌓는다. */
  styleSignals: StyleSignals[];

  /**
   * requestId → 그때 돌려준 응답.
   * 같은 requestId가 다시 오면 재실행하지 않고 이 값을 그대로 반환한다 (공통규칙 §5).
   */
  processedRequests: Map<string, NegotiationView>;

  createdAtMs: number;
  /** 다음 turn id 번호. msg_01, msg_02 ... */
  nextTurnSeq: number;
}

const sessions = new Map<string, Session>();

function newSessionId(): string {
  let id: string;
  do {
    id = `sess_${randomBytes(3).toString('hex')}`;
  } while (sessions.has(id));
  return id;
}

export interface CreateSessionInput {
  stageId: number;
  npcId: string;
  requiredAgreementKeys: string[];
  /** null이면 시간 제한 없음(튜토리얼) */
  timeLimitSeconds: number | null;
}

/**
 * 세션 생성. 합의 상태는 모든 필수 키를 미충족으로 깔아둔다.
 *
 * 타이머는 여기서 시작하지 않는다. 공통규칙 §4에 따라
 * "첫 NPC 대사와 최초 TTS가 끝난 뒤" startTimer()로 시작한다.
 */
export function createSession(input: CreateSessionInput): Session {
  const agreements: Record<string, AgreementState> = {};
  for (const key of input.requiredAgreementKeys) {
    agreements[key] = { key, met: false, value: null, evidenceTurnIds: [], metAtMs: null };
  }

  const session: Session = {
    sessionId: newSessionId(),
    stageId: input.stageId,
    npcId: input.npcId,
    turns: [],
    agreements,
    outcome: 'in_progress',
    endReason: null,
    timerStatus: input.timeLimitSeconds === null ? 'disabled' : 'paused',
    deadlineAtMs: null,
    pausedTotalMs: 0,
    llmCallCount: 0,
    styleSignals: [],
    processedRequests: new Map(),
    createdAtMs: Date.now(),
    nextTurnSeq: 1,
  };
  sessions.set(session.sessionId, session);
  return session;
}

/** 없으면 undefined — 라우트가 404로 응답한다. 서버 재시작 후에는 정상적으로 자주 발생한다. */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * 대화 로그에 한 줄 추가하고 발급된 id를 돌려준다.
 * evidenceTurnIds가 이 id를 가리키므로 id는 세션 안에서 절대 재사용하지 않는다.
 */
export function appendTurn(
  sessionId: string,
  turn: Omit<Turn, 'id' | 'timestampMs'>,
): Turn {
  const session = requireSession(sessionId);
  const created: Turn = {
    id: `msg_${String(session.nextTurnSeq).padStart(2, '0')}`,
    timestampMs: Date.now(),
    ...turn,
  };
  session.nextTurnSeq += 1;
  session.turns.push(created);
  return created;
}

/** evidenceTurnIds 검증용. 해당 id가 이 세션의 플레이어 발화인지 확인한다. */
export function findPlayerTurn(sessionId: string, turnId: string): Turn | undefined {
  const session = requireSession(sessionId);
  return session.turns.find((t) => t.id === turnId && t.speaker === 'player');
}

/** 직전 NPC 발화. contextAnchorTurnId 검증에 쓴다. */
export function lastNpcTurn(sessionId: string): Turn | undefined {
  const session = requireSession(sessionId);
  for (let i = session.turns.length - 1; i >= 0; i -= 1) {
    if (session.turns[i].speaker === 'npc') return session.turns[i];
  }
  return undefined;
}

export function setAgreement(sessionId: string, state: AgreementState): void {
  requireSession(sessionId).agreements[state.key] = state;
}

export function recordStyleSignals(sessionId: string, signals: StyleSignals): void {
  requireSession(sessionId).styleSignals.push(signals);
}

export function incrementLlmCallCount(sessionId: string): number {
  const session = requireSession(sessionId);
  session.llmCallCount += 1;
  return session.llmCallCount;
}

export function endSession(sessionId: string, outcome: Outcome, endReason: EndReason): void {
  const session = requireSession(sessionId);
  session.outcome = outcome;
  session.endReason = endReason;
  session.timerStatus = 'paused';
}

// ── 멱등성 (공통규칙 §5) ──

export function getProcessedResponse(
  sessionId: string,
  requestId: string,
): NegotiationView | undefined {
  return getSession(sessionId)?.processedRequests.get(requestId);
}

export function rememberResponse(
  sessionId: string,
  requestId: string,
  view: NegotiationView,
): void {
  requireSession(sessionId).processedRequests.set(requestId, view);
}

function requireSession(sessionId: string): Session {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  return session;
}

// ── 타이머 조작 (공통규칙 §4) ──
// 규칙 계산은 없고 상태만 바꾼다. 무엇을 얼마나 정지할지는 negotiationEngine이 정한다.

/** 첫 NPC 대사와 최초 TTS가 끝난 뒤 호출한다. */
export function startTimer(sessionId: string, timeLimitSeconds: number): void {
  const session = requireSession(sessionId);
  if (session.timerStatus === 'disabled') return;
  session.deadlineAtMs = Date.now() + timeLimitSeconds * 1000;
  session.timerStatus = 'running';
}

/**
 * 정지한 만큼 마감 시각을 뒤로 민다.
 * 클라이언트의 임의 pause/resume 요청은 받지 않는다. 서버가 직접 측정한 값만 넣는다.
 */
export function extendDeadline(sessionId: string, pausedMs: number): void {
  const session = requireSession(sessionId);
  if (session.deadlineAtMs === null) return;
  session.deadlineAtMs += pausedMs;
  session.pausedTotalMs += pausedMs;
}

/** 남은 시간(초). 시간 제한이 없으면 null. */
export function remainingSeconds(session: Session): number | null {
  if (session.deadlineAtMs === null) return null;
  return Math.max(0, Math.ceil((session.deadlineAtMs - Date.now()) / 1000));
}
