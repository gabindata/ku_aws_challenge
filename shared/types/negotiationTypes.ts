// 협상 계약 — 기획 공통규칙(개발 기준 명세) + 스테이지 1(양점장) 기준.
//
// 핵심 설계: LLM이 대화 맥락과 스테이지 판정 기준을 읽고 합의 성립·번복·모호함을
// 직접 판단한다. 서버는 LLM의 의미 판단을 다시 계산하지 않고
// 시간·호출 상한·출력 형식·근거 ID·상태 저장과 최종 성공 판정만 통제한다.
//
// 서버에 한국어 요일·시간 파서나 스테이지별 문자열 비교기를 두지 않는다.
// 신뢰도·합의 점수·게이지·게임 턴 제한은 사용하지 않는다.

import type { StyleReport, StyleSignals } from './styleReportTypes';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Speaker = 'player' | 'npc';

/**
 * 대화 로그 1줄. id는 공통규칙의 messageId이며 evidenceTurnIds가 가리키는 대상이다.
 * 서버가 발급하고 세션 안에서 재사용하지 않는다.
 */
export interface Turn {
  id: string;
  speaker: Speaker;
  text: string;
  timestampMs: number;
}

// ─────────────────────────────────────────────
// 세션 상태 (공통규칙 §3)
// ─────────────────────────────────────────────

/**
 * ready       — 고정 첫 대사와 최초 TTS를 준비하는 중. 입력을 받지 않는다
 * in_progress — 입력을 받고 합의 상태를 갱신할 수 있다
 * ended       — 종료됨. 이후 모든 요청은 저장된 종료 결과를 반환한다
 *
 * outcome의 'retry'는 세션 상태가 아니라 이번 요청 하나의 결과다.
 * 세션은 in_progress에 머물고 같은 발화를 다시 보낼 수 있다.
 */
export type SessionStatus = 'ready' | 'in_progress' | 'ended';

// ─────────────────────────────────────────────
// 합의 상태 (공통규칙 §5·§6)
// ─────────────────────────────────────────────

/**
 * unmet             — 아직 성립하지 않음. 모든 키의 초기값
 * met               — 성립함
 * pending_reconfirm — 성립했으나 이후 발화로 흔들려 재확인이 필요함.
 *                     성공 판정에서는 미충족으로 센다
 */
export type AgreementStatus = 'unmet' | 'met' | 'pending_reconfirm';

/**
 * confirm — 판정 기준을 충분히 충족함
 * revoke  — 기존 합의를 철회하거나 새 발화가 이전 약속과 정면으로 충돌함
 * clarify — 통과·취소로 보기에 뜻이 모호함. met이면 pending_reconfirm으로 내린다
 * keep    — 이번 발화가 해당 키의 상태를 바꾸지 않음
 */
export type AgreementAction = 'confirm' | 'revoke' | 'clarify' | 'keep';

export interface AgreementState {
  status: AgreementStatus;
  /**
   * 플레이어와 NPC가 실제로 합의한 내용. LLM이 작성한다.
   * 서버는 이 문장의 의미를 별도 규칙으로 재판정하지 않는다.
   */
  summary: string | null;
  evidenceTurnIds: string[];
  lastAction: AgreementAction | null;
  updatedAtMs: number | null;
}

// ─────────────────────────────────────────────
// LLM 출력 (공통규칙 §8)
// ─────────────────────────────────────────────

export interface AgreementJudgement {
  action: AgreementAction;
  /** confirm일 때 실제로 합의한 내용. 근거 발화와 NPC 제안에 포함된 것만 적는다. */
  agreementSummary?: string;
  /** 판단 이유. 서버 로그·회귀 테스트용이며 플레이어에게 노출하지 않는다. */
  reason?: string;
  /**
   * 이번 판정을 만든 발화의 id.
   * confirm이면 합의를 성립시킨 발화, revoke·clarify면 흔들거나 철회한 발화.
   * 과거 합의 발화의 id를 다시 넣지 않는다.
   */
  evidenceTurnIds: string[];
  /** 짧은 맥락 동의("네")의 근거가 된 직전 NPC 메시지 id */
  contextAnchorTurnId?: string | null;
  /**
   * 플레이어가 스스로 약속을 꺼냈는가. confirm일 때만 의미가 있고,
   * playerMustPropose가 true인 키에서는 필수다.
   * false면 서버가 confirm을 clarify로 강등한다.
   */
  selfProposed?: boolean | null;
}

/**
 * LLM의 종합 판단. 참고 신호이며 단독으로 성공시키거나 성공을 막지 않는다.
 * 최종 성공은 서버가 필수 키 상태로만 판정한다.
 */
export type StageVerdict = 'continue' | 'success' | 'fatal';

export interface FatalBehaviorSignal {
  detected: boolean;
  /** 명시적 협박 / 심한 욕설·직접 모욕 / 확인 뒤에도 유지되는 명백한 사기 */
  type: 'threat' | 'abuse' | 'fraud' | null;
  evidenceTurnIds: string[];
}

export interface LlmTurnOutput {
  npcReply: string;
  /** 영향을 받은 키만 담는다. 생략된 키는 서버가 keep으로 처리한다. */
  judgements: Record<string, AgreementJudgement>;
  stageVerdict: StageVerdict;
  fatalBehavior: FatalBehaviorSignal;
  /** stageVerdict가 continue일 때만 사용한다. */
  nextGoalKey?: string | null;
  expressionKey: string;
  styleSignals: StyleSignals;
}

/** 판정이 상태에 반영되지 않은 이유. 서버 로그용이며 클라이언트로 보내지 않는다. */
export type RejectionCode =
  /** 근거 ID가 없거나 이 세션의 플레이어 발화가 아님 */
  | 'EVIDENCE_MISMATCH'
  /** playerMustPropose 키인데 selfProposed가 false여서 clarify로 강등됨 */
  | 'SELF_PROPOSAL_MISSING'
  /** stageVerdict와 실제 키 상태 판정이 갈림. 프롬프트 품질 지표 */
  | 'VERDICT_MISMATCH';

// ─────────────────────────────────────────────
// 클라이언트 응답 (공통규칙 §9)
// ─────────────────────────────────────────────

export type Outcome = 'in_progress' | 'retry' | 'success' | 'failure';

/**
 * time   — 마감 스냅샷 초과
 * limit  — 판정 호출 40회 도달
 * fatal  — 치명적 행동
 * system — LLM 출력 오류. 수정 재요청까지 실패 (세션은 계속된다)
 */
export type EndReason = 'time' | 'limit' | 'fatal' | 'system' | null;

/** disabled는 시간 제한이 없는 튜토리얼용 */
export type TimerStatus = 'running' | 'paused' | 'disabled';

/** 이미 met인 합의만 담는다. 미충족 항목과 정답 체크리스트는 보내지 않는다. */
export interface AgreementMemoItem {
  key: string;
  /** LLM의 agreementSummary */
  text: string;
}

/** 종료 응답에만 실린다. 종료 시점에는 LLM을 호출하지 않으므로 전부 스테이지 고정값이다. */
export interface NegotiationResult {
  /** 스테이지 고정 문구. successText 또는 limitText. */
  headline: string | null;
  /**
   * 협상으로 얻은 것이 아니라 원래 정해져 있던 조건.
   * 성공 화면에서 합의 내용과 시각적으로 구분해 표시한다.
   */
  fixedTerms: string[];
  /** 성공 시 클라이언트가 저장할 월드 상태 키 */
  successState: string | null;
}

/**
 * 매 턴 브라우저로 나가는 것.
 *
 * LLM의 내부 reason, 전체 판정 기준표, 공개 전 비공개 조건,
 * 잔여 LLM 호출 횟수는 담지 않는다.
 */
export interface NegotiationView {
  outcome: Outcome;
  endReason: EndReason;
  npcReply: string;
  /** timerStatus가 'disabled'면 null */
  remainingSeconds: number | null;
  timerStatus: TimerStatus;
  agreementMemo: AgreementMemoItem[];
  expressionKey: string;
  /**
   * 종료 응답에서만 값을 가진다. 진행 중에는 null.
   * 서버가 스테이지의 failureHints에서 고른 비정답형 문장이며 LLM 판단을 쓰지 않는다.
   */
  hintText: string | null;
  result?: NegotiationResult;
  styleReport?: StyleReport;
}

// ─────────────────────────────────────────────
// API 계약
// ─────────────────────────────────────────────

/** GET /api/stages — 월드맵 목록 */
export interface StageSummary {
  stageId: number;
  npcId: string;
  npcName: string;
  location: string;
  difficulty: Difficulty;
  /** unlockRequirements를 클라이언트가 보관한 월드 상태 키로 판정한 결과 */
  unlocked: boolean;
  /** 스테이지 1의 "권장 시작" 표시 */
  recommended: boolean;
}
export type StagesResponse = StageSummary[];

/**
 * 같은 requestId가 재전송되면 서버는 상태를 다시 바꾸지 않고 최초 응답을 반환한다.
 * 종료된 세션에 새 요청이 오면 저장된 종료 결과를 반환한다.
 * 네트워크 오류로 재시도할 때는 반드시 같은 값을 다시 보낸다.
 */
export interface IdempotentRequest {
  requestId: string;
}

/** POST /api/negotiation/start */
export interface StartRequest extends IdempotentRequest {
  stageId: number;
}
export interface StartResponse extends NegotiationView {
  sessionId: string;
}

/**
 * POST /api/negotiation/turn
 *
 * messageId는 서버가 발급한다. 근거 ID 검증이 클라이언트가 보낸 값에
 * 의존하면 검증의 의미가 없기 때문이다.
 */
export interface TurnRequest extends IdempotentRequest {
  sessionId: string;
  /** STT 결과 텍스트. 빈 문자열은 합의 상태를 바꾸지 않는다. */
  playerText: string;
}
export type TurnResponse = NegotiationView;

export type { StyleReport, StyleSignals };
