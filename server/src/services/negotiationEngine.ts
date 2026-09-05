import type {
  AgreementMemoItem,
  EndReason,
  LlmTurnOutput,
  Outcome,
} from '../../../shared/types/negotiationTypes';
import { findPlayerTurn, lastNpcTurn, setAgreement, type Session } from '../models/session';
import type { AgreementDefinition, StageDefinition } from '../data/stageSchema';
import { isSatisfied } from './validators';

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

export interface MergeResult {
  /** 이번 턴에 새로 성립한 키. NPC가 값을 복창해야 한다. */
  newlyMetKeys: string[];
  /** 이번 턴에 취소된 키. NPC가 취소 사실을 복창해야 한다. */
  revokedKeys: string[];
  /** 값이 모호해 NPC가 되물어야 하는 키. */
  clarifyKeys: string[];
  /** 근거 ID가 없거나 잘못된 키. 미충족으로 두고 NPC가 한 번 재확인한다. */
  evidenceMismatchKeys: string[];
  /** 스테이지에 없는 키를 LLM이 뱉은 경우. 무시하고 로그만 남긴다. */
  unknownKeys: string[];
}

/**
 * LLM의 evaluation을 세션의 합의 상태에 병합한다.
 *
 * confirm — 근거 ID 확인 → 문맥 동의 규칙 확인 → 비교기 통과 시 met: true
 * revoke  — 기존 met: true를 false로 내림
 * keep    — 이전 상태 유지
 * clarify — 상태 변경 없음. NPC가 되묻는다
 *
 * 한 발화로 여러 키를 confirm 또는 revoke할 수 있다.
 * LLM이 언급하지 않은 키는 keep과 같게 취급한다.
 */
export function applyEvaluation(
  session: Session,
  stage: StageDefinition,
  llm: LlmTurnOutput,
): MergeResult {
  const result: MergeResult = {
    newlyMetKeys: [],
    revokedKeys: [],
    clarifyKeys: [],
    evidenceMismatchKeys: [],
    unknownKeys: [],
  };

  const anchorTurn = lastNpcTurn(session.sessionId);

  for (const [key, event] of Object.entries(llm.evaluation)) {
    // 화이트리스트 검증 — 스테이지에 정의되지 않은 키는 받지 않는다 (공통규칙 §5)
    const definition = stage.agreementDefinitions[key];
    if (!definition || !stage.requiredAgreementKeys.includes(key)) {
      result.unknownKeys.push(key);
      continue;
    }

    const current = session.agreements[key];

    if (event.action === 'keep') continue;

    if (event.action === 'clarify') {
      result.clarifyKeys.push(key);
      continue;
    }

    if (event.action === 'revoke') {
      // 이미 미충족이면 아무 일도 일어나지 않는다.
      if (!current?.met) continue;
      setAgreement(session.sessionId, {
        key, met: false, value: null, evidenceTurnIds: [], metAtMs: null,
      });
      result.revokedKeys.push(key);
      continue;
    }

    // ── 여기서부터 confirm ──

    // 1) 근거 ID가 실제 이 세션의 플레이어 발화인가
    const ids = event.evidenceTurnIds ?? [];
    const evidenceOk =
      ids.length > 0 && ids.every((id) => findPlayerTurn(session.sessionId, id) !== undefined);
    if (!evidenceOk) {
      result.evidenceMismatchKeys.push(key);
      continue;
    }

    // 2) 짧은 동의("네")인 경우의 규칙
    if (event.contextAnchorTurnId != null) {
      // 직전 NPC 메시지를 가리켜야 한다
      if (anchorTurn === undefined || anchorTurn.id !== event.contextAnchorTurnId) {
        result.evidenceMismatchKeys.push(key);
        continue;
      }
      // 스테이지가 허용한 키만 문맥 동의를 인정한다
      if (!definition.allowContextConfirmation) continue;
      // 직접 제안해야 하는 키는 "네"로 충족되지 않는다
      if (definition.selfProposalRequired) continue;
    }

    // 3) 정규화된 값을 비교기로 대조
    const value = event.value;
    if (!value || !isSatisfied(definition, value)) continue;

    const wasMet = current?.met === true;
    setAgreement(session.sessionId, {
      key,
      met: true,
      value,
      evidenceTurnIds: ids,
      metAtMs: Date.now(),
    });
    // 이미 성립해 있던 걸 다시 확인한 경우에는 복창하지 않는다
    if (!wasMet) result.newlyMetKeys.push(key);
  }

  if (result.unknownKeys.length > 0) {
    console.warn(`[engine] 스테이지에 없는 합의 키: ${result.unknownKeys.join(', ')}`);
  }
  return result;
}

/** 필수 키가 모두 충족됐는가 */
export function allRequiredMet(session: Session, stage: StageDefinition): boolean {
  return stage.requiredAgreementKeys.every((key) => session.agreements[key]?.met === true);
}

// ── 표시용 값 ──

/** 알 수 없는 표정 키는 기본 표정으로 대체한다 (공통규칙 §5) */
export function resolveExpressionKey(stage: StageDefinition, key: string): string {
  return stage.expressionKeys.includes(key) ? key : stage.defaultExpressionKey;
}

/**
 * 이미 성립한 합의만 메모로 만든다. 남은 정답은 절대 담지 않는다 (공통규칙 §3).
 *
 * memoText가 비어 있으면 memoTemplates로 실제 합의한 값에서 문구를 만든다.
 */
export function buildAgreementMemo(
  session: Session,
  stage: StageDefinition,
): AgreementMemoItem[] {
  const memo: AgreementMemoItem[] = [];
  for (const key of stage.requiredAgreementKeys) {
    const state = session.agreements[key];
    if (!state?.met) continue;

    const definition = stage.agreementDefinitions[key];
    const text = definition.memoText || renderMemo(definition, state.value ?? {});
    memo.push({ key, text });
  }
  return memo;
}

function renderMemo(
  definition: AgreementDefinition,
  value: Record<string, unknown>,
): string {
  const templates = definition.memoTemplates ?? {};
  const parts: string[] = [];
  for (const [field, template] of Object.entries(templates)) {
    if (!(field in value)) continue;
    parts.push(template.replace('{value}', String(value[field])));
  }
  return parts.length > 0 ? parts.join(' · ') : definition.label;
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
