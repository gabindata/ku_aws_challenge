import type { AgreementMemoItem, NegotiationView, Turn } from '../types';

/**
 * 클라이언트가 들고 있는 세션 상태.
 * 판정의 원본은 서버다. 여기 값은 자막 히스토리와 화면 표시용이다.
 */
export class DialogueSessionManager {
  sessionId = '';
  stageId = 0;
  turns: Turn[] = [];

  /** 이미 성립한 합의만 들어온다. 남은 정답은 서버가 보내주지 않는다. */
  agreementMemo: AgreementMemoItem[] = [];
  remainingSeconds: number | null = null;
  latest: NegotiationView | null = null;

  reset(_sessionId: string, _stageId: number): void {
    // TODO
    throw new Error('not implemented');
  }

  /** 서버 응답 1건을 반영한다. */
  apply(_view: NegotiationView): void {
    // TODO: agreementMemo/remainingSeconds 갱신, npcReply를 turns에 추가
    throw new Error('not implemented');
  }
}
