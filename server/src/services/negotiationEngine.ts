import type {
  AgreementState,
  EndReason,
  LlmTurnOutput,
  Outcome,
} from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';

// 비교기는 validators.ts에 있다. 판정 진입점은 isSatisfied() 하나.
export { isSatisfied, isKnownValidator, validators } from './validators';
export type { Validator } from './validators';

/**
 * 판정은 전부 여기서 한다. 서버는 한국어를 파싱하지 않고
 * LLM이 정규화한 value와 스테이지 요구값을 구조체로 비교만 한다 (공통규칙 §5).
 */

// ── 합의 병합 (공통규칙 §2) ──

/** 근거 ID 검증 실패. 조용히 버리지 않고 NPC가 한 번 재확인한다. */
export const EVIDENCE_MISMATCH = 'EVIDENCE_MISMATCH';

/**
 * LLM의 evaluation을 현재 합의 상태에 병합한다.
 *
 * confirm — 근거 ID 확인 → 비교기 통과 시 met: true
 * revoke  — 기존 met: true를 false로 내림
 * keep    — 이전 상태 유지
 * clarify — 상태 변경 없음
 *
 * selfProposalRequired 키는 contextAnchorTurnId만으로 충족시키지 않는다.
 */
export function applyEvaluation(
  _session: Session,
  _stage: StageDefinition,
  _llm: LlmTurnOutput,
): { agreements: AgreementState[]; evidenceMismatchKeys: string[] } {
  // TODO(2주차)
  throw new Error('not implemented');
}

// ── 종료 판정 (공통규칙 §2 종료 순서) ──

/**
 * 만료 전 접수 확인
 *  → LLM 출력·근거 ID·정규화 값 검증
 *  → 치명적 행동이면 failure / fatal
 *  → confirm·revoke 병합
 *  → 모든 필수 키 충족 시 success
 *  → 600초 만료 시 failure / time
 *  → LLM 호출 40회 도달 시 failure / limit
 *  → 그 외 in_progress
 *
 * receivedAt <= deadlineAt인 발화는 끝까지 판정하며,
 * 그 발화의 성공이 시간 초과보다 우선한다.
 */
export function resolveOutcome(
  _session: Session,
  _stage: StageDefinition,
  _receivedAtMs: number,
): { outcome: Outcome; endReason: EndReason } {
  // TODO(2주차)
  throw new Error('not implemented');
}

/** 시간 초과 힌트: 미충족 키 중 requiredAgreementKeys에서 가장 앞선 항목 하나 */
export function timeoutHint(_session: Session, _stage: StageDefinition): string | null {
  // TODO(2주차)
  throw new Error('not implemented');
}

/** NPC TTS 정지 시간 = clamp(2, ceil(글자 수 / 5), 15)초 (공통규칙 §4) */
export function ttsPauseSeconds(_npcReply: string): number {
  // TODO(2주차)
  throw new Error('not implemented');
}
