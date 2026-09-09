import type {
  AgreementMemoItem,
  EndReason,
  LlmTurnOutput,
  Outcome,
} from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';

/**
 * 서버 판정.
 *
 * 서버는 의미를 판단하지 않는다. 특정 단어가 들어 있는지, 요일·시간·기간 표현이
 * JSON 값과 같은지, 표현이 기준을 충분히 충족하는지는 전부 LLM의 책임이다.
 * 서버는 형식·근거 ID·불린 값·시간·호출 상한을 검증하고, 필수 키 상태로
 * 최종 성공만 판정한다. 스테이지별 문자열 비교기를 만들지 않는다.
 *
 * (구버전 설계의 validatorId/expected 비교기는 폐기되었다.)
 */

// ── 합의 병합 (공통규칙 §6) ──

export interface MergeResult {
  /** 새로 met이 된 키. NPC가 합의 내용을 복창해야 한다. */
  newlyMetKeys: string[];
  /** unmet으로 내려간 키. NPC가 취소 사실을 복창해야 한다. */
  revokedKeys: string[];
  /** met에서 pending_reconfirm으로 내려간 키. NPC가 그 부분만 되묻는다. */
  pendingKeys: string[];
  /** 근거 ID가 없거나 잘못된 키 (EVIDENCE_MISMATCH) */
  evidenceMismatchKeys: string[];
  /** playerMustPropose인데 selfProposed가 false여서 강등된 키 (SELF_PROPOSAL_MISSING) */
  selfProposalMissingKeys: string[];
  /** 스테이지에 없는 키를 LLM이 뱉은 경우. 무시하고 로그만 남긴다. */
  unknownKeys: string[];
}

/**
 * LLM의 judgements를 세션의 합의 상태에 반영한다.
 *
 * confirm — 근거 ID 확인 → playerMustPropose면 selfProposed 확인 → status: met
 * revoke  — status: unmet으로 내리고 메모에서 제거
 * clarify — unmet이면 유지. met이면 pending_reconfirm으로 내린다
 * keep    — 이전 상태 유지. judgements에서 생략된 키도 여기에 해당한다
 *
 * playerMustPropose 키의 selfProposed:false인 confirm은 clarify로 강등한다.
 * 의미를 판단하는 것이 아니라 불린 값만 보므로 서버의 의미 판단 금지 원칙과
 * 충돌하지 않는다.
 */
export function applyJudgements(
  _session: Session,
  _stage: StageDefinition,
  _llm: LlmTurnOutput,
): MergeResult {
  // TODO(다음 단계)
  throw new Error('not implemented');
}

/** 필수 키가 모두 met인가. pending_reconfirm은 미충족으로 센다. */
export function allRequiredMet(_session: Session, _stage: StageDefinition): boolean {
  // TODO(다음 단계)
  throw new Error('not implemented');
}

// ── 종료 판정 (공통규칙 §6 종료 우선순위) ──

/**
 * 1. 마감 스냅샷 확인 — receivedAt <= 접수 시점의 deadlineAt
 * 2. LLM 출력 형식·허용 키·근거 ID·selfProposed 검증
 * 3. stageVerdict가 fatal이면 failure / fatal
 * 4. confirm·revoke·clarify를 반영 (selfProposed:false confirm은 clarify로 강등)
 * 5. 필수 키가 모두 met이면 success  ← stageVerdict와 무관
 * 6. 시간이 만료됐으면 failure / time
 * 7. 판정 호출 상한에 도달했으면 failure / limit
 * 8. 나머지는 in_progress
 *
 * 마감 스냅샷 안에 접수된 발화는 LLM 판정을 끝까지 수행하며,
 * 그 발화로 필수 키가 모두 충족되면 시간 초과보다 성공이 우선한다.
 */
export function resolveOutcome(
  _session: Session,
  _stage: StageDefinition,
  _receivedAtMs: number,
  _deadlineSnapshotMs: number | null,
): { outcome: Outcome; endReason: EndReason } {
  // TODO(다음 단계)
  throw new Error('not implemented');
}

/**
 * 시간 초과 힌트. requiredAgreementKeys에서 가장 앞선 미충족 키의 고정 문장.
 * pending_reconfirm도 미충족으로 센다.
 * 종료 시점에는 LLM을 호출하지 않으므로 스테이지 정의에서만 고른다.
 */
export function timeoutHint(_session: Session, _stage: StageDefinition): string | null {
  // TODO(다음 단계)
  throw new Error('not implemented');
}

// ── 타이머 계산 (공통규칙 §4) ──

/** NPC TTS 정지 시간 = clamp(2, ceil(한글 글자 수 / 5), 15)초 */
export function ttsPauseSeconds(_npcReply: string): number {
  // TODO(다음 단계)
  throw new Error('not implemented');
}

// ── 표시용 값 ──

/** 알 수 없는 표정 키는 기본 표정으로 대체한다 (공통규칙 §8) */
export function resolveExpressionKey(stage: StageDefinition, key: string): string {
  return stage.expressionKeys.includes(key) ? key : stage.defaultExpressionKey;
}

/**
 * 이미 met인 합의만 메모로 만든다. 미충족 항목과 정답 체크리스트는 담지 않는다.
 * 문구는 LLM이 작성한 agreementSummary를 그대로 쓴다 (memoGuide는 그 작성 지침이다).
 */
export function buildAgreementMemo(
  session: Session,
  stage: StageDefinition,
): AgreementMemoItem[] {
  const memo: AgreementMemoItem[] = [];
  for (const key of stage.requiredAgreementKeys) {
    const state = session.agreements[key];
    if (state?.status !== 'met' || !state.summary) continue;
    memo.push({ key, text: state.summary });
  }
  return memo;
}
