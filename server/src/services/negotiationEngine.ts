import type {
  AgreementMemoItem,
  EndReason,
  LlmTurnOutput,
  NegotiationRewards,
  Outcome,
} from '../../../shared/types/negotiationTypes';
import type { StyleSignals } from '../../../shared/types/styleReportTypes';
import {
  findPlayerTurn,
  forgetProposal,
  rememberProposal,
  isNpcTurnBefore,
  npcTurnBefore,
  setAgreement,
  setDisclosedFact,
  type Session,
} from '../models/session';
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
 */

// ─────────────────────────────────────────────
// 합의 병합 (공통규칙 §6)
// ─────────────────────────────────────────────

export interface MergeResult {
  /** 새로 met이 된 키. NPC가 합의 내용을 복창해야 한다. */
  newlyMetKeys: string[];
  /** 이미 met이던 키의 합의 내용이 바뀐 것. 메모를 교체하고 NPC가 바뀐 값을 복창한다. */
  updatedKeys: string[];
  /** unmet으로 내려간 키. NPC가 취소 사실을 복창해야 한다. */
  revokedKeys: string[];
  /** met에서 pending_reconfirm으로 내려간 키. NPC가 그 부분만 되묻는다. */
  pendingKeys: string[];
  /** 근거 ID가 없거나 잘못된 키 (EVIDENCE_MISMATCH) */
  evidenceMismatchKeys: string[];
  /** playerMustPropose인데 selfProposed가 true가 아니어서 강등된 키 (SELF_PROPOSAL_MISSING) */
  selfProposalMissingKeys: string[];
  /** 스테이지에 없는 키를 LLM이 뱉은 경우. 무시하고 로그만 남긴다. */
  unknownKeys: string[];
}

/**
 * LLM의 judgements를 합의 상태에 반영한다.
 *
 * confirm — 근거 ID·앵커 확인 → playerMustPropose면 selfProposed 확인 → met
 * revoke  — unmet으로 내리고 메모에서 제거
 * clarify — unmet이면 유지, met이면 pending_reconfirm으로 내린다
 * keep    — 이전 상태 유지. judgements에서 생략된 키도 여기에 해당한다
 *
 * playerTurnId는 이번에 판정하는 플레이어 발화다. 맥락 동의 앵커가 그보다
 * 앞선 NPC 메시지인지 확인하는 기준이 된다.
 */
export function applyJudgements(
  session: Session,
  stage: StageDefinition,
  llm: LlmTurnOutput,
  playerTurnId: string,
): MergeResult {
  const result: MergeResult = {
    newlyMetKeys: [], updatedKeys: [], revokedKeys: [], pendingKeys: [],
    evidenceMismatchKeys: [], selfProposalMissingKeys: [], unknownKeys: [],
  };

  for (const [key, judgement] of Object.entries(llm.judgements)) {
    const definition = stage.agreementDefinitions[key];
    if (!definition || !stage.requiredAgreementKeys.includes(key)) {
      result.unknownKeys.push(key);
      continue;
    }

    const current = session.agreements[key];
    let action = judgement.action;
    if (action === 'keep') continue;

    // 잘못된 근거 ID는 행동을 가리지 않고 상태에 반영하지 않는다 (공통규칙 §8).
    if (!hasValidEvidence(session, judgement.evidenceTurnIds)) {
      result.evidenceMismatchKeys.push(key);
      continue;
    }

    // 맥락 동의 앵커가 키의 contextAnchorScope에 맞는 실제 NPC 메시지인지 확인한다.
    // 동의 대상이 분명한지, 안내가 변경·철회됐는지의 의미 판단은 LLM이 맡는다.
    if (judgement.contextAnchorTurnId != null) {
      // 맥락 동의를 허용하지 않는 키다. NPC 제안에 기댄 성립을 받지 않는다 (공통규칙 §5).
      // 불린 검사이므로 서버가 의미를 판단하는 것이 아니다.
      if (!definition.contextConsentAllowed) {
        result.evidenceMismatchKeys.push(key);
        continue;
      }
      const scope = definition.contextAnchorScope ?? 'immediate';
      const anchorOk = scope === 'session'
        ? isNpcTurnBefore(session.sessionId, judgement.contextAnchorTurnId, playerTurnId)
        : npcTurnBefore(session.sessionId, playerTurnId)?.id === judgement.contextAnchorTurnId;
      if (!anchorOk) {
        result.evidenceMismatchKeys.push(key);
        continue;
      }
    }

    // 자발 제안 근거를 모은다. 이번 발화에서 나왔을 수도, 앞선 발화에서 나왔을 수도 있다.
    // 실재하는 플레이어 발화인지만 본다. 제안이 충분한지는 판단하지 않는다.
    const claimed = (judgement.selfProposalTurnIds ?? []).filter(
      (id) => findPlayerTurn(session.sessionId, id) !== undefined,
    );
    const remembered = session.pendingProposals[key]?.turnIds ?? [];
    const proposalTurnIds = claimed.length > 0 ? claimed : remembered;

    // 이번 턴에 제안이 나왔으면 키별로 따로 보관한다.
    // 최근 6왕복 밖으로 밀려도 프롬프트에 남아, 몇 턴 뒤의 수락을 판정할 수 있다.
    if (claimed.length > 0) rememberProposal(session.sessionId, key, claimed);

    // playerMustPropose 키는 NPC 제안을 수락하는 것만으로 성립하지 않는다 (공통규칙 §5).
    //
    // 다만 앞선 턴에서 이미 스스로 제안했다면, 뒤이은 재확인을 수락하는 것은
    // 정당하다. 그래서 이번 발화의 selfProposed뿐 아니라 보관된 제안 근거도 본다.
    // 둘 다 없을 때만 강등한다.
    const proposedSelf = judgement.selfProposed === true || proposalTurnIds.length > 0;
    if (action === 'confirm' && definition.playerMustPropose && !proposedSelf) {
      action = 'clarify';
      result.selfProposalMissingKeys.push(key);
    }

    const now = Date.now();

    if (action === 'clarify') {
      if (current?.status !== 'met') continue;
      setAgreement(session.sessionId, key, { ...current, status: 'pending_reconfirm', lastAction: 'clarify', updatedAtMs: now });
      result.pendingKeys.push(key);
      continue;
    }

    if (action === 'revoke') {
      if (current?.status === 'unmet') continue;
      // 철회하면 그 키의 자발 제안 근거도 함께 버린다. 다시 제안해야 한다.
      forgetProposal(session.sessionId, key);
      setAgreement(session.sessionId, key, {
        status: 'unmet', summary: null, evidenceTurnIds: [],
        selfProposalTurnIds: [], lastAction: 'revoke', updatedAtMs: now,
      });
      result.revokedKeys.push(key);
      continue;
    }

    const wasMet = current?.status === 'met';
    const summary = judgement.agreementSummary ?? null;
    setAgreement(session.sessionId, key, {
      status: 'met', summary, evidenceTurnIds: judgement.evidenceTurnIds,
      selfProposalTurnIds: proposalTurnIds, lastAction: 'confirm', updatedAtMs: now,
    });
    if (!wasMet) result.newlyMetKeys.push(key);
    else if (current?.summary !== summary) result.updatedKeys.push(key);
  }

  logRejections(result);
  return result;
}

function hasValidEvidence(session: Session, ids: string[] | undefined): boolean {
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => findPlayerTurn(session.sessionId, id) !== undefined);
}

function logRejections(result: MergeResult): void {
  if (result.evidenceMismatchKeys.length > 0) {
    console.warn(`[engine] EVIDENCE_MISMATCH: ${result.evidenceMismatchKeys.join(', ')}`);
  }
  if (result.selfProposalMissingKeys.length > 0) {
    console.warn(`[engine] SELF_PROPOSAL_MISSING: ${result.selfProposalMissingKeys.join(', ')}`);
  }
  if (result.unknownKeys.length > 0) {
    console.warn(`[engine] 스테이지에 없는 합의 키: ${result.unknownKeys.join(', ')}`);
  }
}

export function allRequiredMet(session: Session, stage: StageDefinition): boolean {
  return stage.requiredAgreementKeys.every((key) => session.agreements[key]?.status === 'met');
}

// ─────────────────────────────────────────────
// 안내 기록 (공통규칙 §8)
// ─────────────────────────────────────────────

/**
 * 실제 대화에 반영된 NPC 응답에 한해 안내 기록을 저장한다.
 * 검증 실패·retry·reverted로 반영되지 않은 응답은 호출하지 않는다.
 * 선언되지 않은 키는 받지 않는다.
 */
export function applyDisclosureUpdates(
  session: Session,
  stage: StageDefinition,
  llm: LlmTurnOutput,
  npcTurn: { id: string; text: string },
): string[] {
  const allowed = stage.disclosureDefinitions ?? {};
  const rejected: string[] = [];
  for (const [key, update] of Object.entries(llm.disclosureUpdates ?? {})) {
    if (!(key in allowed) || (update.status !== 'active' && update.status !== 'withdrawn')) {
      rejected.push(key);
      continue;
    }
    setDisclosedFact(session.sessionId, key, {
      status: update.status, summary: update.summary, npcMessageId: npcTurn.id, npcMessageText: npcTurn.text,
    });
  }
  if (rejected.length > 0) console.warn(`[engine] 선언되지 않은 안내 키: ${rejected.join(', ')}`);
  return rejected;
}

// ─────────────────────────────────────────────
// 출력 검증
// ─────────────────────────────────────────────

const FATAL_TYPES = new Set(['threat', 'abuse', 'fraud', 'harm_pressure']);

/**
 * stageVerdict: fatal을 받아들일지.
 * 근거 ID나 허용된 행동 유형이 없으면 출력 불일치이므로 받지 않는다(수정 재요청 대상).
 */
export function isFatalConfirmed(session: Session, llm: LlmTurnOutput): boolean {
  if (llm.stageVerdict !== 'fatal') return false;
  const { detected, type, evidenceTurnIds } = llm.fatalBehavior;
  if (!detected || type === null || !FATAL_TYPES.has(type)) return false;
  return hasValidEvidence(session, evidenceTurnIds);
}

/**
 * 말투 분석값 형식 검증 (공통규칙 §8).
 * formality·directness가 허용 값이고, 쿠션을 썼다면 근거 표현이 있어야 한다.
 */
export function isValidStyleSignals(signals: StyleSignals | undefined): boolean {
  if (!signals) return false;
  const formalityOk = signals.formality === null || ['casual', 'polite', 'formal'].includes(signals.formality);
  const directnessOk = signals.directness === null || ['direct', 'indirect'].includes(signals.directness);
  const cushion = signals.cushion;
  const cushionOk = !!cushion && typeof cushion.used === 'boolean'
    && Array.isArray(cushion.expressions)
    && (!cushion.used || cushion.expressions.length > 0);
  return formalityOk && directnessOk && cushionOk;
}

/** 허용 태그 밖의 값은 제외한다. 태그는 화면에 표시하지 않고 내부 집계에만 쓴다. */
export function filterStageTags(stage: StageDefinition, signals: StyleSignals): StyleSignals {
  const allowed = new Set(stage.styleReportConfig.allowedStageTags);
  return { ...signals, stageTags: (signals.stageTags ?? []).filter((t) => allowed.has(t)) };
}

export function isVerdictMismatch(llm: LlmTurnOutput, outcome: Outcome): boolean {
  if (llm.stageVerdict === 'success' && outcome !== 'success') return true;
  if (llm.stageVerdict === 'continue' && outcome === 'success') return true;
  return false;
}

// ─────────────────────────────────────────────
// 종료 판정 (공통규칙 §6 종료 우선순위)
// ─────────────────────────────────────────────

/**
 * 1. 마감 스냅샷 확인은 호출부가 LLM 호출 전에 한다
 * 2. 출력 검증도 호출부가 한다
 * 3. fatal
 *    - fatalRecovery: false → failure / fatal
 *    - fatalRecovery: true  → 합의 반영(4)과 성공 확인(5)을 건너뛰고 6·7 확인,
 *                             둘 다 아니면 reverted
 * 4. 합의 반영은 호출부가 이 함수 전에 끝낸다
 * 5. 필수 키가 모두 met이면 success
 * 6. 응답 확정 시점의 서버 시각 > 이번 처리의 정지 시간을 반영한 최신 마감이면 failure / time
 * 7. 판정 호출 상한이면 failure / limit
 * 8. in_progress
 *
 * 그래서 이 함수를 부르기 전에 이번 처리의 인정 정지 시간을 마감에 먼저 더해야 한다.
 */
export function resolveOutcome(
  session: Session,
  stage: StageDefinition,
  input: { fatal: boolean; nowMs: number },
): { outcome: Outcome; endReason: EndReason } {
  const recovering = input.fatal && stage.fatalRecovery === true;

  if (input.fatal && !recovering) return { outcome: 'failure', endReason: 'fatal' };
  if (!input.fatal && allRequiredMet(session, stage)) return { outcome: 'success', endReason: null };
  if (isExpired(input.nowMs, session.deadlineAtMs)) return { outcome: 'failure', endReason: 'time' };
  if (session.llmCallCount >= stage.maxLlmCallsPerSession) return { outcome: 'failure', endReason: 'limit' };
  if (recovering) return { outcome: 'reverted', endReason: null };
  return { outcome: 'in_progress', endReason: null };
}

/** 시각이 마감을 지났는가. 정확히 마감 시각이면 아직 지나지 않은 것으로 본다. */
export function isExpired(atMs: number, deadlineMs: number | null): boolean {
  if (deadlineMs === null) return false;
  return atMs > deadlineMs;
}

/** requiredAgreementKeys에서 가장 앞선 미충족 키의 고정 문장. pending_reconfirm도 미충족 */
export function timeoutHint(session: Session, stage: StageDefinition): string | null {
  const firstUnmet = stage.requiredAgreementKeys.find((key) => session.agreements[key]?.status !== 'met');
  return firstUnmet === undefined ? null : stage.failureHints[firstUnmet] ?? null;
}

// ─────────────────────────────────────────────
// 타이머 계산 (공통규칙 §4)
// ─────────────────────────────────────────────

/**
 * NPC TTS 정지 시간 = clamp(2, ceil(공백 제외 글자 수 / 5), 15)초.
 *
 * 공통규칙 §4의 원안은 "한글 글자 수"지만 공백을 제외한 전체 글자 수로 센다.
 * NPC 대사에 나오는 숫자도 소리 내어 읽히는데, 빼고 세면 정지 시간이 실제보다
 * 짧아져 NPC가 말하는 동안 타이머가 돌고 플레이어가 손해를 본다.
 */
export function ttsPauseSeconds(npcReply: string): number {
  const raw = Math.ceil(npcReply.replace(/\s/g, '').length / TTS_CHARS_PER_SECOND);
  return Math.min(TTS_PAUSE_MAX_SECONDS, Math.max(TTS_PAUSE_MIN_SECONDS, raw));
}

/** 서버가 직접 측정한 처리 시간. 요청당 최대 20초까지만 인정한다. */
export function processingPauseSeconds(elapsedMs: number): number {
  return Math.min(MAX_LLM_PAUSE_SECONDS, Math.max(0, elapsedMs / 1000));
}

// ─────────────────────────────────────────────
// 표시용 값
// ─────────────────────────────────────────────

export function resolveExpressionKey(stage: StageDefinition, key: string): string {
  return stage.expressionKeys.includes(key) ? key : stage.defaultExpressionKey;
}

/** 종료 화면 표정. LLM이 정하지 않고 스테이지 정의의 고정값을 쓴다. */
export function endExpressionKey(stage: StageDefinition, outcome: Outcome): string {
  if (outcome === 'success') return stage.successExpressionKey;
  if (outcome === 'failure') return stage.failureExpressionKey;
  return stage.defaultExpressionKey;
}

/** met인 합의만. 진행 중 화면용이며 종료 화면에는 별도 표시하지 않는다. */
export function buildAgreementMemo(session: Session, stage: StageDefinition): AgreementMemoItem[] {
  const memo: AgreementMemoItem[] = [];
  for (const key of stage.requiredAgreementKeys) {
    const state = session.agreements[key];
    if (state?.status === 'met' && state.summary) memo.push({ key, text: state.summary });
  }
  return memo;
}

/**
 * 성공 시 클라이언트가 반영할 보상. 결과 화면에는 표시하지 않는다.
 * 단서 본문은 successEpilogue에서 찾는다.
 */
export function buildRewards(stage: StageDefinition): NegotiationRewards {
  const r = stage.successRewards ?? {};
  const clues = (r.clueIds ?? [])
    .filter((id) => stage.successEpilogue?.clueId === id)
    .map((id) => ({ clueId: id, text: stage.successEpilogue!.text }));
  return {
    successState: stage.successState,
    completeQuests: r.completeQuests ?? [],
    addQuests: r.addQuests ?? [],
    clues,
  };
}

/**
 * 프롬프트에 넣을 월드 상태 참조. 선언된 키 중 현재 충족된 것만.
 * NPC 대사에만 쓰고 판정에는 닿지 않는다.
 */
export function activeWorldStateReferences(stage: StageDefinition, worldStateKeys: string[]): Record<string, string> {
  const active: Record<string, string> = {};
  for (const [key, text] of Object.entries(stage.worldStateReferences ?? {})) {
    if (worldStateKeys.includes(key)) active[key] = text;
  }
  return active;
}
