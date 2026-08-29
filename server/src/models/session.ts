import type { NegotiationState, Turn } from '../../../shared/types/negotiationTypes';

/** 서버 메모리에 들고 있는 협상 세션. MVP 범위에서는 DB 없이 Map으로 보관한다. */
export interface Session {
  sessionId: string;
  npcId: string;
  /** {speaker, text, timestampMs} 누적 로그 — 판정/분석 공용 단일 소스 */
  turns: Turn[];
  state: NegotiationState;
  createdAtMs: number;
}

const sessions = new Map<string, Session>();

export function createSession(_npcId: string): Session {
  // TODO: sessionId 발급, initialState()로 state 세팅 후 sessions에 저장
  throw new Error('not implemented');
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function appendTurn(_sessionId: string, _turn: Turn): void {
  // TODO: 세션 로그에 턴 추가
  throw new Error('not implemented');
}
