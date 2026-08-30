import { randomBytes } from 'node:crypto';
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

// 세션 보관함. "번호표 → 세션" 사전.
// 서버를 끄면 사라진다. 4주 범위에서는 DB를 붙이지 않는다.
// (장기 운영하면 세션이 계속 쌓이므로 오래된 것을 지우는 청소가 필요하지만,
//  플레이테스트 범위에서는 문제가 되지 않아 넣지 않았다.)
const sessions = new Map<string, Session>();

/** "sess_a1b2c3" 형태의 번호표. 이미 쓰는 번호면 다시 뽑는다. */
function newSessionId(): string {
  let id: string;
  do {
    id = `sess_${randomBytes(3).toString('hex')}`;
  } while (sessions.has(id));
  return id;
}

/**
 * 새 협상 세션을 만들어 보관함에 넣는다.
 *
 * 초기 상태(state)를 직접 계산하지 않고 넘겨받는 이유:
 * 이 파일은 "보관함"이고, 협상 규칙을 아는 곳은 negotiationEngine.ts다.
 * 여기서 trust=50 같은 값을 정해버리면 게임 규칙이 두 군데로 흩어진다.
 */
export function createSession(npcId: string, state: NegotiationState): Session {
  const session: Session = {
    sessionId: newSessionId(),
    npcId,
    turns: [],
    state,
    createdAtMs: Date.now(),
  };
  sessions.set(session.sessionId, session);
  return session;
}

/** 번호표로 세션 꺼내기. 없으면 undefined — 라우트가 404로 응답하면 된다. */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/** 대화 로그에 한 줄 추가. 플레이어 발화와 NPC 대사 둘 다 이걸로 쌓는다. */
export function appendTurn(sessionId: string, turn: Turn): void {
  const session = requireSession(sessionId);
  session.turns.push(turn);
}

/** 협상 상태 갱신. 매 턴 negotiationEngine이 계산한 결과를 여기에 저장한다. */
export function updateState(sessionId: string, state: NegotiationState): void {
  const session = requireSession(sessionId);
  session.state = state;
}

/**
 * 세션을 꺼내되, 없으면 에러를 던진다.
 * 라우트가 getSession()으로 이미 존재를 확인한 뒤에 쓰는 내부용.
 * 여기까지 와서 없다면 그건 사용자 실수가 아니라 코드 버그다.
 */
function requireSession(sessionId: string): Session {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  return session;
}
