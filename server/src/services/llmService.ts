import type { LlmTurnOutput } from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';

/**
 * Claude API 래퍼. API 키는 서버에만 존재한다.
 *
 * LLM의 역할은 한국어를 정규화된 합의 이벤트로 "번역"하는 것뿐이다.
 * 성공·실패, 시간, 보상, 해금은 결정하지 않는다 (공통규칙 §5).
 * 프롬프트 인젝션과 JSON 위조 요구는 게임 발화로만 취급한다.
 */

/** 프롬프트에 포함할 왕복 수 상한 (공통규칙 §4) */
export const MAX_HISTORY_EXCHANGES = 6;
export const MAX_PROMPT_TOKENS = 3000;
export const MAX_OUTPUT_TOKENS = 500;

/**
 * 플레이어 발화 1턴을 LLM에 넘기고 구조화된 출력을 받는다.
 *
 * 프롬프트에는 최근 6왕복과 currentAgreement 요약만 넣는다.
 * 6왕복보다 오래된 발화가 근거로 필요할 수 있으므로, 요약에 해당 키의
 * evidenceTurnIds와 원문을 함께 실어야 한다. (기획 확인 필요 항목)
 */
export async function evaluateTurn(
  _stage: StageDefinition,
  _session: Session,
  _playerTurnId: string,
): Promise<LlmTurnOutput> {
  // TODO(2주차): 프롬프트 조립 → messages.parse()로 스키마 강제 → 결과 반환
  // 스키마 오류는 수정 요청으로 한 번만 재시도하고, 실패하면 retry/system (공통규칙 §6)
  throw new Error('not implemented');
}
