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

/**
 * 말투 리포트 생성 상태 (공통규칙 §9).
 *
 * 종료 결과와 리포트 생성은 분리한다. 종료가 확정되면 결과·문구·보상을
 * 먼저 돌려주고 리포트를 기다리지 않는다. 생성에 10초쯤 걸리기 때문에
 * 같이 기다리면 플레이어가 성공했는지도 모른 채 빈 화면을 본다.
 *
 *   pending  생성 중. styleReport는 아직 null이다
 *   ready    styleReport에 값이 있다
 *   failed   두 번 다 실패했다. 화면은 안내 문구만 띄운다
 */
export type ReportStatus = 'pending' | 'ready' | 'failed';

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
  /**
   * threat        NPC를 향한 명시적 협박
   * abuse         NPC를 향한 심한 욕설·직접 모욕
   * fraud         확인 뒤에도 유지되는 명백한 사기
   * harm_pressure 해를 예고해 요구를 관철하려는 압박 (자해·죽음 예고, 타인 위해,
   *               민폐·기물 훼손 예고). "안 들어주면 → 이런 일을 하겠다"는 조건
   *               구조일 때만이며, 힘들다거나 사정을 설명하는 것은 해당하지 않는다.
   *               (코드명은 기획 문서에 없어 임의로 정함)
   */
  type: 'threat' | 'abuse' | 'fraud' | 'harm_pressure' | null;
  evidenceTurnIds: string[];
}

/** LLM이 이번 npcReply에서 실제로 안내·변경·철회한 항목 */
export interface DisclosureUpdate {
  status: 'active' | 'withdrawn';
  /** 이번 대사에 근거한 최신 안내 내용 */
  summary: string;
}

/**
 * 세션에 보존하는 안내 기록 (공통규칙 §8 「안내 기록 보존」).
 *
 * 최근 6왕복 밖으로 밀려도 지우지 않는다. 오래전 안내에 대한 지연된 동의를
 * 판정하려면 그 안내의 원문과 근거 메시지가 남아 있어야 하기 때문이다.
 * 안내됐다는 이유로 합의를 성립시키지 않으며, 브라우저로 보내지 않는다.
 */
export interface DisclosedFact {
  status: 'active' | 'withdrawn';
  summary: string;
  npcMessageId: string;
  npcMessageText: string;
}

export interface LlmTurnOutput {
  npcReply: string;
  /** 변화가 없으면 빈 객체. 스테이지의 disclosureDefinitions에 선언된 키만 받는다. */
  disclosureUpdates: Record<string, DisclosureUpdate>;
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

/**
 * in_progress — 대화가 이어진다
 * retry       — 이번 요청 하나의 결과. 세션은 in_progress에 머문다
 * reverted    — fatalRecovery: true인 스테이지에서 치명적 발화를 종료 대신
 *               직전 상태로 되돌린 것. 세션은 in_progress에 머물고,
 *               그 발화는 대화 기록·판정 호출 수·말투 집계에서 모두 빠진다
 * success     — 필수 키가 모두 met
 * failure     — endReason 참조
 */
export type Outcome = 'in_progress' | 'retry' | 'reverted' | 'success' | 'failure';

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

/** 결과 화면을 닫았을 때의 이동 */
export type FailureCloseBehavior = 'world_map' | 'restart';

/** 성공 시 클라이언트가 로컬 저장소에 반영할 것. 최초 성공 한 번만 적용한다. */
export interface NegotiationRewards {
  successState: string;
  completeQuests: string[];
  addQuests: string[];
  /**
   * 단서. 결과 화면에 후일담 영역으로 표시하지 않고 저장만 한다.
   * 같은 성공 응답을 다시 받아도 clueId로 중복을 걸러야 한다.
   */
  clues: { clueId: string; text: string }[];
}

/**
 * 매 턴 브라우저로 나가는 것.
 *
 * LLM의 내부 reason, 전체 판정 기준표, 공개 전 비공개 조건,
 * 잔여 LLM 호출 횟수는 담지 않는다.
 */
export interface NegotiationView {
  /** 늦게 도착한 이전 세션의 응답을 구분하는 근거 (공통규칙 §9) */
  sessionId: string;
  stageId: number;
  outcome: Outcome;
  endReason: EndReason;
  npcReply: string;
  /** timerStatus가 'disabled'면 null */
  remainingSeconds: number | null;
  timerStatus: TimerStatus;
  agreementMemo: AgreementMemoItem[];
  expressionKey: string;
  /**
   * 시간 초과 종료에서만 값을 가진다. 그 외에는 null.
   * 서버가 스테이지의 failureHints에서 고른 비정답형 문장이며 LLM 판단을 쓰지 않는다.
   */
  hintText: string | null;

  // ── 종료 응답 전용 (공통규칙 §9). 적용되지 않는 문구는 null ──

  /** 성공 시. "성공!" 아래 한 문장 */
  successText?: string | null;
  /** 실패 시 모든 종료 이유에 공통으로 상단에 표시. 스테이지가 정의하지 않았으면 null */
  failureText?: string | null;
  /** 호출 상한 종료 시 */
  limitText?: string | null;
  /** 성공 시에만. 화면에 표시하지 않고 로컬 저장소에 반영한다. */
  rewards?: NegotiationRewards | null;
  /**
   * 결과 화면을 닫았을 때의 이동. 공통규칙 §9의 종료 응답 필드 목록에는 없지만
   * 튜토리얼의 "다시 하기만" 화면을 그리려면 클라이언트가 알아야 해서 싣는다.
   */
  onClose?: FailureCloseBehavior;
  /**
   * 리포트 생성 상태. 종료 응답에만 실린다.
   * pending이면 styleReport가 아직 없으므로 결과 조회로 다시 가져간다.
   */
  reportStatus?: ReportStatus;
  /** 성공·실패 공통. reportStatus가 ready일 때만 값이 있다 */
  styleReport?: StyleReport;
}

/**
 * GET /api/sessions/{sessionId}/result 응답 (공통규칙 §9).
 *
 * 진행 중이면 상태와 남은 시간만, 종료됐으면 종료 응답을 그대로 돌려준다.
 * 조회는 LLM 호출도 보상 지급도 세션 재시작도 일으키지 않는다.
 */
export interface ResultResponse {
  sessionId: string;
  stageId: number;
  sessionStatus: SessionStatus;
  remainingSeconds: number | null;
  /** sessionStatus가 ended일 때만 */
  view: NegotiationView | null;
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
 * 같은 requestId는 다시 처리하지 않고 최초 응답을 반환한다. 처리 중이면 그 결과를 기다린다.
 * 종료된 세션에 새 요청이 오면 저장된 종료 결과를 반환한다.
 */
export interface IdempotentRequest {
  requestId: string;
}

/** POST /api/negotiation/start */
export interface StartRequest extends IdempotentRequest {
  stageId: number;
  /**
   * 플레이어가 보유한 월드 상태 키. 클라이언트 로컬 저장소에서 온다.
   *
   * 세션 중에는 바뀌지 않으므로 시작할 때 한 번만 받아 세션에 보관한다.
   * 서버는 이 값을 스테이지가 worldStateReferences로 선언한 키와 교집합해
   * NPC 대사용으로만 프롬프트에 넣는다. 판정에는 닿지 않는다 (공통규칙 §5).
   */
  worldState?: string[];
}
export type StartResponse = NegotiationView;

/** POST /api/negotiation/turn */
export interface TurnRequest extends IdempotentRequest {
  sessionId: string;
  /**
   * 발화 식별자. requestId는 그 발화의 처리 시도 식별자다 (공통규칙 §3).
   *
   * - 새 발화는 두 ID를 새로 발급한다
   * - 응답을 못 받아 처리 여부를 모르면 같은 messageId·requestId로 재전송한다
   * - retry / system을 받은 뒤에는 같은 messageId에 새 requestId로 다시 시도한다
   * - 같은 messageId로 발화 내용을 바꾸면 거부된다
   *
   * 서버는 이 값을 대화 기록의 플레이어 메시지 id로 쓰고 evidenceTurnIds 검증에 사용한다.
   */
  messageId: string;
  /** STT 결과 텍스트. 빈 문자열은 합의 상태를 바꾸지 않는다. */
  playerText: string;
}
export type TurnResponse = NegotiationView;

export type { StyleReport, StyleSignals };
