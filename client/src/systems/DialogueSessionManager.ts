import type { NegotiationState, Turn } from '../types';

/**
 * 턴 기록과 세션 상태를 클라이언트 쪽에서 들고 있는 곳.
 * 판정의 원본은 서버지만, 자막 히스토리·게이지 표시는 이 값으로 그린다.
 */
export class DialogueSessionManager {
  sessionId = '';
  npcId = '';
  turns: Turn[] = [];
  state: NegotiationState | null = null;

  reset(_sessionId: string, _npcId: string): void {
    // TODO
    throw new Error('not implemented');
  }

  addTurn(_turn: Turn): void {
    // TODO
    throw new Error('not implemented');
  }

  updateState(_state: NegotiationState): void {
    // TODO
    throw new Error('not implemented');
  }
}
