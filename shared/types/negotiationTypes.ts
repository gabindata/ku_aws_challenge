// 협상 계약 — 기획 공통규칙 §2·§5·§6, 스테이지 1(양점장) 기준.
//
// 핵심 설계: LLM은 한국어를 정규화된 합의 이벤트로 "번역"만 하고,
// 서버는 구조체 비교·시간·종료만 담당한다. 서버는 한국어를 파싱하지 않는다.
// 신뢰도·점수·게이지·턴 제한은 사용하지 않는다.

import type { StyleReport, StyleSignals } from './styleReportTypes';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Speaker = 'player' | 'npc';

/**
 * 대화 로그 1줄. 판정과 말투 분석이 공유하는 단일 소스.
 * id는 evidenceTurnIds가 가리키는 대상이므로 서버가 발급하고 절대 재사용하지 않는다.
 */
export interface Turn {
  /** 예: "msg_07" */
  id: string;
  speaker: Speaker;
  text: string;
  timestampMs: number;
}

// ─────────────────────────────────────────────
// 합의 이벤트 (공통규칙 §2)
// ─────────────────────────────────────────────

/**
 * confirm  — 정규화된 value를 비교기로 검증한 뒤 met: true
 * revoke   — 기존 합의를 met: false로 내리고 NPC가 번복 사실을 복창
 * keep     — 이번 발화가 해당 키와 무관하므로 이전 상태 유지
 * clarify  — 상태를 바꾸지 않고 NPC가 모호한 값을 재확인
 */
export type AgreementAction = 'confirm' | 'revoke' | 'keep' | 'clarify';

export interface AgreementEvent {
  action: AgreementAction;
  /**
   * LLM이 정규화한 값. action이 'confirm'일 때만 의미가 있다.
   * 서버 비교기(validator)가 이 값과 스테이지 요구값을 대조한다.
   * 모양은 합의 키마다 다르므로 여기서는 열어둔다.
   */
  value?: Record<string, unknown>;
  /**
   * 근거가 된 플레이어 메시지 id. 인용 문자열이 아니라 실제 id를 받는다.
   * 서버가 현재 세션의 플레이어 발화인지 확인하고 원문을 직접 조회한다.
   * 비어 있거나 잘못되면 조용히 버리지 않고 미충족으로 두고 NPC가 재확인한다.
   */
  evidenceTurnIds: string[];
  /**
   * 짧은 동의("네")의 근거가 된 직전 NPC 메시지 id.
   * allowContextConfirmation이 true인 키에서만 인정한다.
   */
  contextAnchorTurnId?: string | null;
}

/**
 * 치명적 행동 신호.
 *
 * 주의: 공통규칙 §5의 원안은 이 값을 evaluation 객체 안에 두었으나,
 * evaluation은 "합의 키 → 이벤트" 맵이라 성격이 다른 값이 섞이면
 * 합의 키와 이름이 충돌할 수 있어 밖으로 분리했다. 판정 로직은 동일하다.
 *
 * 또한 이 신호만은 서버가 재검증할 수단이 없어 사실상 LLM 판단이 결과가 된다.
 * "LLM은 성공·실패를 결정하지 않는다"는 원칙의 유일한 예외다.
 */
export interface FatalBehaviorSignal {
  detected: boolean;
  /** 명시적 협박 / NPC를 향한 심한 욕설·직접 모욕 / 확인된 사기 */
  type: 'threat' | 'abuse' | 'fraud' | null;
  evidenceTurnIds: string[];
}

// ─────────────────────────────────────────────
// LLM 출력 (공통규칙 §5)
// ─────────────────────────────────────────────

/** LLM이 매 턴 반드시 이 모양으로 돌려줘야 한다. 스키마 오류는 한 번만 재시도한다. */
export interface LlmTurnOutput {
  /** 새 합의를 복창하거나 다음 단서를 제공하는 대사 */
  npcReply: string;
  /** 합의 키 → 이번 턴의 이벤트. 언급되지 않은 키는 'keep'으로 채운다. */
  evaluation: Record<string, AgreementEvent>;
  fatalBehavior: FatalBehaviorSignal;
  /** 아직 미충족인 키. 서버 내부용이며 절대 클라이언트로 보내지 않는다. */
  missingItems: string[];
  npcNextGoal: string;
  /** 스테이지의 expressionKeys에 없으면 defaultExpressionKey로 대체한다. */
  expressionKey: string;
  styleSignals: StyleSignals;
}

// ─────────────────────────────────────────────
// 서버가 들고 있는 합의 상태
// ─────────────────────────────────────────────

export interface AgreementState {
  key: string;
  met: boolean;
  /** met일 때 실제로 합의된 정규화 값 */
  value: Record<string, unknown> | null;
  evidenceTurnIds: string[];
  metAtMs: number | null;
}

// ─────────────────────────────────────────────
// 클라이언트 응답 (공통규칙 §6)
// ─────────────────────────────────────────────

export type Outcome = 'in_progress' | 'success' | 'failure' | 'retry';

/**
 * outcome이 failure/retry일 때만 채워진다.
 * time  — 600초 만료
 * limit — LLM 호출 40회 도달
 * fatal — 치명적 행동
 * system— LLM 스키마 오류 재시도 실패
 */
export type EndReason = 'time' | 'limit' | 'fatal' | 'system' | null;

/** disabled는 시간 제한이 없는 튜토리얼용 */
export type TimerStatus = 'running' | 'paused' | 'disabled';

/** 이미 성립한 합의만 누적 표시한다. 남은 정답 체크리스트는 보내지 않는다. */
export interface AgreementMemoItem {
  key: string;
  /** 예: "평일 5일 · 23:00–07:00" */
  text: string;
}

/**
 * 매 턴 브라우저로 나가는 것.
 *
 * missingItems, 비공개 조건의 이름·정답·검증값은 여기에 담지 않는다.
 * 힌트가 필요하면 hintText로만 내보낸다.
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
  /** 시간 초과 힌트 등. 정답을 직접 노출하지 않는다. */
  hintText: string | null;
  /** 종료 응답에만 실린다. */
  styleReport?: StyleReport;
}

// ─────────────────────────────────────────────
// API 계약
// ─────────────────────────────────────────────

/** GET /api/stages — 월드맵에 표시할 목록 */
export interface StageSummary {
  stageId: number;
  npcId: string;
  npcName: string;
  location: string;
  difficulty: Difficulty;
  /** 잠금 여부는 서버가 계산해 내려준다 */
  unlocked: boolean;
  /** 스테이지 1의 "권장 시작" 표시 */
  recommended: boolean;
}
export type StagesResponse = StageSummary[];

/**
 * 동일 requestId에는 같은 결과를 반환하고, 종료 후 요청은 저장된 종료 결과를 반환한다.
 * 클라이언트가 요청마다 새로 발급한다 (재전송 시에는 같은 값 유지).
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

/** POST /api/negotiation/turn */
export interface TurnRequest extends IdempotentRequest {
  sessionId: string;
  /** STT 결과 텍스트. 빈 문자열은 턴을 소비하지 않는다. */
  playerText: string;
}
export type TurnResponse = NegotiationView;

export type { StyleReport, StyleSignals };
