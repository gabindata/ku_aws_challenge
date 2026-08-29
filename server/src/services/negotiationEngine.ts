import type { NegotiationState } from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { LlmTurnResult } from './llmService';
import type { NpcPersona } from './npcPersonaService';

/**
 * 성공/실패 판정은 여기서만 한다. LLM 호출에 얹지 않는다 —
 * 같은 조건이면 항상 같은 결과가 나와야 하기 때문 (설계 문서 2·7장).
 */

export function initialState(_persona: NpcPersona): NegotiationState {
  // TODO: stage='opening', trust=50, agreementGap=100, currentOffer=NPC 초기 제시 조건
  throw new Error('not implemented');
}

/** LLM이 준 재료 값 + 세션 히스토리로 다음 상태를 결정적으로 계산한다. */
export function applyTurn(
  _session: Session,
  _persona: NpcPersona,
  _llm: LlmTurnResult,
): NegotiationState {
  // TODO: trust/agreementGap 클램프(0~100), currentOffer 갱신, isDealClosed/isBroken 판정
  throw new Error('not implemented');
}

/** 페르소나의 successCriteria를 코드로 판정 (trust와 agreementGap 임계값 비교) */
export function isDealClosed(
  _persona: NpcPersona,
  _state: NegotiationState,
): boolean {
  // TODO
  throw new Error('not implemented');
}

/** 결렬 조건 (trust 바닥, 최대 턴 초과 등) */
export function isBroken(_state: NegotiationState, _turnCount: number): boolean {
  // TODO
  throw new Error('not implemented');
}
