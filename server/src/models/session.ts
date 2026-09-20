import { randomBytes } from 'node:crypto';
import type {
  AgreementState,
  DisclosedFact,
  EndReason,
  NegotiationView,
  Outcome,
  SessionStatus,
  TimerStatus,
  Turn,
} from '../../../shared/types/negotiationTypes';
import type { StyleReport, StyleSignals } from '../../../shared/types/styleReportTypes';

/**
 * 진행 중인 협상 세션. 서버 메모리에만 두고 단일 인스턴스로 배포한다.
 * 재시작하면 진행 중 세션은 소멸하고 플레이어는 스테이지를 처음부터 다시 시작한다.
 */
export interface Session {
  sessionId: string;
  stageId: number;
  npcId: string;
  status: SessionStatus;

  /** 대화 기록. 플레이어 발화의 id는 클라이언트가 보낸 messageId다. */
  turns: Turn[];
  agreements: Record<string, AgreementState>;
  /** 안내 기록. 최근 6왕복 밖으로 밀려도 지우지 않는다. */
  disclosedFacts: Record<string, DisclosedFact>;

  outcome: Outcome;
  endReason: EndReason;
  /** 종료가 확정된 뒤 저장한 응답. 이후 모든 요청은 이것을 그대로 받는다. */
  endView: NegotiationView | null;

  // ── 타이머 (공통규칙 §4) ──
  timerStatus: TimerStatus;
  startedAtMs: number | null;
  /** startedAt + 제한 시간 + 누적 인정 정지 시간. 정지가 쌓일 때마다 뒤로 밀린다. */
  deadlineAtMs: number | null;
  pausedTotalMs: number;
  /** 서버 시계로 만료를 확인하는 예약. 마감이 밀리면 갈아 끼운다. */
  expiryTimer: NodeJS.Timeout | null;

  // ── 비용 상한 (공통규칙 §4) — 세 예산은 서로 분리된다 ──
  /** 판정 호출. 상한 40. fatalRecovery로 되돌려도 차감된 채 유지한다. */
  llmCallCount: number;
  /** 수정 재요청. 상한 5 */
  repairRequestCount: number;
  /** 종료 리포트 생성. 상한 2 */
  reportCallCount: number;

  /** 리포트 집계용. 판정 상태와 분리해 쌓는다. */
  styleSignals: StyleSignals[];
  /**
   * 치명적 행동의 근거가 된 플레이어 발화 id.
   * 종료로 이어진 발화는 리포트에서 극단적인 발화로 인용되므로,
   * 입력을 줄일 때 가장 먼저 지켜야 한다.
   */
  fatalTurnIds: string[];
  styleReport: StyleReport | null;

  // ── 멱등성 (공통규칙 §3) ──
  /**
   * requestId -> 그 처리 시도의 결과.
   * 처리 중이면 Promise가 들어 있어, 같은 requestId가 다시 와도 LLM을 중복 호출하지 않고
   * 같은 결과를 기다린다.
   */
  requests: Map<string, Promise<unknown>>;
  /**
   * messageId -> 발화 내용과 정상 반영된 결과.
   * applied가 있으면 새 requestId로 와도 다시 처리하지 않는다.
   * retry / system으로 끝난 시도는 applied를 남기지 않아 새 시도를 받는다.
   */
  messages: Map<string, { text: string; applied: NegotiationView | null }>;

  worldStateKeys: string[];
  createdAtMs: number;
  /** NPC 메시지 id 번호. npc_01, npc_02 ... */
  nextNpcSeq: number;
}

const sessions = new Map<string, Session>();

/** /start는 세션이 생기기 전이라 requestId를 세션 밖에 기억한다. */
const startRequests = new Map<string, Promise<unknown>>();

export function startRequest<T>(requestId: string, create: () => Promise<T>): Promise<T> {
  const existing = startRequests.get(requestId) as Promise<T> | undefined;
  if (existing) return existing;
  const created = create();
  startRequests.set(requestId, created);
  return created;
}

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
  timeLimitSeconds: number | null;
  worldStateKeys?: string[];
}

export function createSession(input: CreateSessionInput): Session {
  const agreements: Record<string, AgreementState> = {};
  for (const key of input.requiredAgreementKeys) {
    agreements[key] = { status: 'unmet', summary: null, evidenceTurnIds: [], lastAction: null, updatedAtMs: null };
  }

  const session: Session = {
    sessionId: newSessionId(),
    stageId: input.stageId,
    npcId: input.npcId,
    status: 'ready',
    turns: [],
    agreements,
    disclosedFacts: {},
    outcome: 'in_progress',
    endReason: null,
    endView: null,
    timerStatus: input.timeLimitSeconds === null ? 'disabled' : 'paused',
    startedAtMs: null,
    deadlineAtMs: null,
    pausedTotalMs: 0,
    expiryTimer: null,
    llmCallCount: 0,
    repairRequestCount: 0,
    reportCallCount: 0,
    styleSignals: [],
    fatalTurnIds: [],
    styleReport: null,
    requests: new Map(),
    messages: new Map(),
    worldStateKeys: input.worldStateKeys ?? [],
    createdAtMs: Date.now(),
    nextNpcSeq: 1,
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

// ── 세션별 직렬화 (공통규칙 §4) ──
//
// 발화 처리와 만료 확인이 같은 세션의 상태를 동시에 바꾸면 종료가 두 번 확정되거나
// 리포트가 두 번 생성된다. 세션마다 작업을 한 줄로 세운다.

const locks = new Map<string, Promise<unknown>>();

export function withSessionLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(sessionId) ?? Promise.resolve();
  const next = previous.then(work, work);
  locks.set(sessionId, next.catch(() => undefined));
  return next;
}

// ── 대화 기록 ──

export function appendPlayerTurn(sessionId: string, messageId: string, text: string): Turn {
  const turn: Turn = { id: messageId, speaker: 'player', text, timestampMs: Date.now() };
  requireSession(sessionId).turns.push(turn);
  return turn;
}

export function appendNpcTurn(sessionId: string, text: string): Turn {
  const session = requireSession(sessionId);
  const turn: Turn = {
    id: `npc_${String(session.nextNpcSeq).padStart(2, '0')}`,
    speaker: 'npc',
    text,
    timestampMs: Date.now(),
  };
  session.nextNpcSeq += 1;
  session.turns.push(turn);
  return turn;
}

/**
 * 대화 기록에서 발화 하나를 뺀다. fatalRecovery와 retry / system에 쓴다.
 *
 * 판정 호출 수는 되돌리지 않는다 (공통규칙 §4). 되돌림을 반복해 세션 총 호출
 * 47회 상한을 우회할 수 없게 하기 위해서다. 말투 신호는 호출부가 애초에 기록하지 않는다.
 */
export function removeTurn(sessionId: string, turnId: string): void {
  const session = requireSession(sessionId);
  session.turns = session.turns.filter((t) => t.id !== turnId);
}

export function findPlayerTurn(sessionId: string, turnId: string): Turn | undefined {
  return requireSession(sessionId).turns.find((t) => t.id === turnId && t.speaker === 'player');
}

/** 플레이어 발화 직전의 NPC 메시지. contextAnchorScope: immediate 검증용 */
export function npcTurnBefore(sessionId: string, playerTurnId: string): Turn | undefined {
  const turns = requireSession(sessionId).turns;
  const index = turns.findIndex((t) => t.id === playerTurnId);
  for (let i = (index === -1 ? turns.length : index) - 1; i >= 0; i -= 1) {
    if (turns[i].speaker === 'npc') return turns[i];
  }
  return undefined;
}

/** 플레이어 발화보다 앞선 NPC 메시지인가. contextAnchorScope: session 검증용 */
export function isNpcTurnBefore(sessionId: string, npcTurnId: string, playerTurnId: string): boolean {
  const turns = requireSession(sessionId).turns;
  const npcIndex = turns.findIndex((t) => t.id === npcTurnId && t.speaker === 'npc');
  const playerIndex = turns.findIndex((t) => t.id === playerTurnId);
  return npcIndex !== -1 && playerIndex !== -1 && npcIndex < playerIndex;
}

/** 리포트 대상 유효 발화. 빈 STT·되돌린 발화·실패한 시도는 이미 빠져 있다. */
export function playerTurns(session: Session): Turn[] {
  return session.turns.filter((t) => t.speaker === 'player');
}

export function setAgreement(sessionId: string, key: string, state: AgreementState): void {
  requireSession(sessionId).agreements[key] = state;
}

export function setDisclosedFact(sessionId: string, key: string, fact: DisclosedFact): void {
  requireSession(sessionId).disclosedFacts[key] = fact;
}

export function recordFatalTurn(sessionId: string, turnId: string): void {
  const session = requireSession(sessionId);
  if (!session.fatalTurnIds.includes(turnId)) session.fatalTurnIds.push(turnId);
}

export function recordStyleSignals(sessionId: string, signals: StyleSignals): void {
  requireSession(sessionId).styleSignals.push(signals);
}

export function incrementLlmCallCount(sessionId: string): number {
  const session = requireSession(sessionId);
  session.llmCallCount += 1;
  return session.llmCallCount;
}

// ── 타이머 ──

/** 첫 대사의 추정 TTS가 끝나는 시각부터 제한 시간을 센다. */
export function startTimer(sessionId: string, startedAtMs: number, timeLimitSeconds: number): void {
  const session = requireSession(sessionId);
  session.status = 'in_progress';
  if (session.timerStatus === 'disabled') return;
  session.startedAtMs = startedAtMs;
  session.deadlineAtMs = startedAtMs + timeLimitSeconds * 1000;
  session.timerStatus = 'running';
}

/**
 * 인정된 정지 시간만큼 마감을 뒤로 민다.
 * 이미 접수된 발화의 "접수 당시 유효성"에는 소급하지 않는다. 그건 접수 순간의
 * 스냅샷으로만 본다. 처리 후 세션 만료는 이 최신 마감으로 판단한다.
 */
export function extendDeadline(sessionId: string, pausedMs: number): void {
  const session = requireSession(sessionId);
  if (session.deadlineAtMs === null || pausedMs <= 0) return;
  session.deadlineAtMs += pausedMs;
  session.pausedTotalMs += pausedMs;
}

export function remainingSeconds(session: Session): number | null {
  if (session.deadlineAtMs === null) return null;
  return Math.max(0, Math.ceil((session.deadlineAtMs - Date.now()) / 1000));
}

export function markEnded(sessionId: string, outcome: Outcome, endReason: EndReason): void {
  const session = requireSession(sessionId);
  session.outcome = outcome;
  session.endReason = endReason;
  session.status = 'ended';
  session.timerStatus = 'paused';
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  session.expiryTimer = null;
}

function requireSession(sessionId: string): Session {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  return session;
}
