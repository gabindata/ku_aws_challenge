import type {
  AgreementMemoItem,
  EndReason,
  LlmTurnOutput,
  Outcome,
} from '../../../shared/types/negotiationTypes';
import { findPlayerTurn, lastNpcTurn, setAgreement, type Session } from '../models/session';
import {
  MAX_LLM_PAUSE_SECONDS,
  TTS_CHARS_PER_SECOND,
  TTS_PAUSE_MAX_SECONDS,
  TTS_PAUSE_MIN_SECONDS,
  type StageDefinition,
} from '../data/stageSchema';

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
  session: Session,
  stage: StageDefinition,
  llm: LlmTurnOutput,
): MergeResult {
  const result: MergeResult = {
    newlyMetKeys: [],
    revokedKeys: [],
    pendingKeys: [],
    evidenceMismatchKeys: [],
    selfProposalMissingKeys: [],
    unknownKeys: [],
  };

  const anchorTurn = lastNpcTurn(session.sessionId);

  for (const [key, judgement] of Object.entries(llm.judgements)) {
    // 허용 키 검증 — 스테이지에 정의되지 않은 키는 받지 않는다 (공통규칙 §8)
    const definition = stage.agreementDefinitions[key];
    if (!definition || !stage.requiredAgreementKeys.includes(key)) {
      result.unknownKeys.push(key);
      continue;
    }

    const current = session.agreements[key];
    let action = judgement.action;

    if (action === 'keep') continue;

    // 근거 ID 검증 — confirm/revoke/clarify 모두에 적용한다.
    // 잘못된 ID는 상태에 반영하지 않고 NPC 재확인과 로그만 남긴다 (공통규칙 §8).
    if (!hasValidEvidence(session, judgement.evidenceTurnIds)) {
      result.evidenceMismatchKeys.push(key);
      continue;
    }

    // 짧은 맥락 동의의 anchor가 실제 직전 NPC 메시지인지 확인한다.
    // contextConsentAllowed 자체는 서버가 재판정하지 않는다 — 판정 기준표에 담겨
    // LLM에 전달되며, 스테이지 1에서 이 값이 false인 키는 playerMustPropose도
    // true라 아래 selfProposed 검사가 같은 경우를 막는다.
    if (judgement.contextAnchorTurnId != null) {
      if (anchorTurn === undefined || anchorTurn.id !== judgement.contextAnchorTurnId) {
        result.evidenceMismatchKeys.push(key);
        continue;
      }
    }

    // playerMustPropose 키의 confirm은 selfProposed가 true여야 한다.
    // 값이 없거나 false면 clarify로 강등한다. 의미를 판단하는 것이 아니라
    // LLM이 준 불린 값만 보므로 서버의 의미 판단 금지 원칙과 충돌하지 않는다.
    if (action === 'confirm' && definition.playerMustPropose && judgement.selfProposed !== true) {
      action = 'clarify';
      result.selfProposalMissingKeys.push(key);
    }

    const now = Date.now();

    if (action === 'clarify') {
      // unmet이면 그대로 둔다. met이면 pending_reconfirm으로 내려 성공 판정에서 뺀다.
      if (current?.status !== 'met') continue;
      setAgreement(session.sessionId, key, {
        status: 'pending_reconfirm',
        summary: current.summary,
        evidenceTurnIds: current.evidenceTurnIds,
        lastAction: 'clarify',
        updatedAtMs: now,
      });
      result.pendingKeys.push(key);
      continue;
    }

    if (action === 'revoke') {
      // 이미 unmet이면 아무 일도 일어나지 않는다.
      if (current?.status === 'unmet') continue;
      setAgreement(session.sessionId, key, {
        status: 'unmet',
        summary: null,
        evidenceTurnIds: [],
        lastAction: 'revoke',
        updatedAtMs: now,
      });
      result.revokedKeys.push(key);
      continue;
    }

    // confirm
    const wasMet = current?.status === 'met';
    setAgreement(session.sessionId, key, {
      status: 'met',
      summary: judgement.agreementSummary ?? null,
      evidenceTurnIds: judgement.evidenceTurnIds,
      lastAction: 'confirm',
      updatedAtMs: now,
    });
    // 이미 met이던 걸 다시 확인한 경우에는 복창하지 않는다.
    if (!wasMet) result.newlyMetKeys.push(key);
  }

  logRejections(result);
  return result;
}

/** evidenceTurnIds가 비어 있지 않고 전부 이 세션의 플레이어 발화인가 */
function hasValidEvidence(session: Session, ids: string[] | undefined): boolean {
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => findPlayerTurn(session.sessionId, id) !== undefined);
}

function logRejections(result: MergeResult): void {
  if (result.evidenceMismatchKeys.length > 0) {
    console.warn(`[engine] EVIDENCE_MISMATCH: ${result.evidenceMismatchKeys.join(', ')}`);
  }
  if (result.selfProposalMissingKeys.length > 0) {
    // 자주 찍히면 NPC 대사 규칙이 지켜지지 않는다는 신호다 (공통규칙 §6)
    console.warn(`[engine] SELF_PROPOSAL_MISSING: ${result.selfProposalMissingKeys.join(', ')}`);
  }
  if (result.unknownKeys.length > 0) {
    console.warn(`[engine] 스테이지에 없는 합의 키: ${result.unknownKeys.join(', ')}`);
  }
}

/** 필수 키가 모두 met인가. pending_reconfirm은 미충족으로 센다. */
export function allRequiredMet(session: Session, stage: StageDefinition): boolean {
  return stage.requiredAgreementKeys.every(
    (key) => session.agreements[key]?.status === 'met',
  );
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
export interface OutcomeInput {
  /** 발화를 접수한 시각 */
  receivedAtMs: number;
  /** 접수 순간 고정한 마감. null이면 시간 제한 없음 */
  deadlineSnapshotMs: number | null;
  /** stageVerdict가 fatal이고 근거·유형 검증을 통과했는가 */
  fatal: boolean;
}

export function resolveOutcome(
  session: Session,
  stage: StageDefinition,
  input: OutcomeInput,
): { outcome: Outcome; endReason: EndReason } {
  // 3. 치명적 행동
  if (input.fatal) return { outcome: 'failure', endReason: 'fatal' };

  // 5. 필수 키가 모두 met이면 성공. stageVerdict와 무관하며 시간·호출 상한보다 앞선다.
  if (allRequiredMet(session, stage)) return { outcome: 'success', endReason: null };

  // 6. 시간 만료. 접수 시점에 고정한 마감으로만 판단한다.
  if (isExpired(Date.now(), input.deadlineSnapshotMs)) {
    return { outcome: 'failure', endReason: 'time' };
  }

  // 7. 판정 호출 상한. 40번째 호출도 정상 판정한 뒤 여기서 종료된다.
  if (session.llmCallCount >= stage.maxLlmCallsPerSession) {
    return { outcome: 'failure', endReason: 'limit' };
  }

  return { outcome: 'in_progress', endReason: null };
}

/**
 * 마감 판정. 시간 제한이 없으면 만료되지 않는다.
 *
 * 마감 이후 접수된 새 입력은 LLM에 보내지 않고 failure / time을 반환해야 하므로
 * 라우트가 LLM 호출 전에 이 함수로 먼저 거른다.
 */
export function isExpired(atMs: number, deadlineSnapshotMs: number | null): boolean {
  if (deadlineSnapshotMs === null) return false;
  return atMs > deadlineSnapshotMs;
}

/**
 * LLM의 stageVerdict: fatal을 받아들일지 판정한다.
 *
 * 근거 ID나 행동 유형이 없으면 출력 불일치이므로 받아들이지 않는다.
 * 그 경우 호출부가 수정 재요청을 한 번 한다 (공통규칙 §6).
 */
export function isFatalConfirmed(session: Session, llm: LlmTurnOutput): boolean {
  if (llm.stageVerdict !== 'fatal') return false;
  const { detected, type, evidenceTurnIds } = llm.fatalBehavior;
  if (!detected || type === null) return false;
  return hasValidEvidence(session, evidenceTurnIds);
}

/** stageVerdict와 실제 판정이 갈렸는가. 프롬프트 품질 지표로 로그에 남긴다. */
export function isVerdictMismatch(
  llm: LlmTurnOutput,
  outcome: Outcome,
): boolean {
  if (llm.stageVerdict === 'success' && outcome !== 'success') return true;
  if (llm.stageVerdict === 'continue' && outcome === 'success') return true;
  return false;
}

/**
 * 시간 초과 힌트. requiredAgreementKeys에서 가장 앞선 미충족 키의 고정 문장.
 * pending_reconfirm도 미충족으로 센다.
 * 종료 시점에는 LLM을 호출하지 않으므로 스테이지 정의에서만 고른다.
 */
export function timeoutHint(session: Session, stage: StageDefinition): string | null {
  const firstUnmet = stage.requiredAgreementKeys.find(
    (key) => session.agreements[key]?.status !== 'met',
  );
  if (firstUnmet === undefined) return null;
  return stage.failureHints[firstUnmet] ?? null;
}

// ── 타이머 계산 (공통규칙 §4) ──

/**
 * NPC TTS 정지 시간 = clamp(2, ceil(공백 제외 글자 수 / 5), 15)초.
 *
 * 공통규칙 §4의 원안은 "한글 글자 수"지만 공백을 제외한 전체 글자 수로 센다.
 * 이 식의 목적이 낭독에 걸리는 시간을 추정하는 것인데, NPC 대사에는
 * "밤 11시부터 아침 7시" 같은 숫자가 실제로 나오고 그것도 소리 내어 읽힌다.
 * 한글만 세면 정지 시간이 실제보다 짧아지고, NPC가 말하는 동안 타이머가
 * 돌아 플레이어가 손해를 본다.
 */
export function ttsPauseSeconds(npcReply: string): number {
  const count = npcReply.replace(/\s/g, '').length;
  const raw = Math.ceil(count / TTS_CHARS_PER_SECOND);
  return Math.min(TTS_PAUSE_MAX_SECONDS, Math.max(TTS_PAUSE_MIN_SECONDS, raw));
}

/** 서버 처리 정지 시간. 요청당 최대 20초까지만 인정한다. */
export function processingPauseSeconds(elapsedMs: number): number {
  return Math.min(MAX_LLM_PAUSE_SECONDS, Math.max(0, elapsedMs / 1000));
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
