// 스테이지 정의 스키마 — 기획 공통규칙 §5 "스테이지 필수 데이터", 스테이지 1 기준.
//
// 이 타입은 shared/가 아니라 서버에 둔다. agreementDefinitions에는 정답과
// 비공개 조건이 들어 있어 클라이언트가 알아서는 안 되기 때문이다.
// 클라이언트에 나가는 요약은 shared의 StageSummary만 쓴다.

import type { Difficulty } from '../../../shared/types/negotiationTypes';

export interface AgreementDefinition {
  /** 결과 화면·합의 메모에 쓰는 라벨 */
  label: string;
  /**
   * 서버 비교기 id. LLM이 정규화한 value와 expected를 대조하는 함수를 가리킨다.
   * 자연어 파서가 아니다 (공통규칙 §5).
   */
  validatorId: string;
  /** 비교기에 넘길 요구값. 모양은 validatorId마다 다르다. */
  expected: Record<string, unknown>;
  /** 직전 NPC 제안에 대한 "네"를 인정할지 (공통규칙 §2) */
  allowContextConfirmation: boolean;
  /** 플레이어가 내용을 직접 말해야 함. "네"만으로는 충족 불가 */
  selfProposalRequired: boolean;
  visibility: 'public' | 'secret_until_dialogue';
  /** 비공개일 때 공개 트리거. LLM 프롬프트에 들어가는 자연어 설명 */
  revealTriggers: string[];
  /**
   * 성립 시 합의 메모에 표시할 고정 문구. 예: "평일 5일 · 23:00–07:00"
   * 무엇을 합의했든 문구가 같은 키에 쓴다.
   */
  memoText: string;
  /**
   * memoText가 빈 문자열일 때 쓰는 문구 틀. value의 필드 이름 → 문구.
   * 플레이어가 무엇을 약속했느냐에 따라 메모가 달라지는 키에 쓴다
   * (스테이지 1의 reliabilityAgreed: "3개월 근무" 또는 "전날 연락").
   * {value}는 그 필드의 값으로 치환된다. 여러 개가 맞으면 " · "로 잇는다.
   */
  memoTemplates?: Record<string, string>;
}

export interface StageDefinition {
  stageId: number;
  npcId: string;
  npcName: string;
  location: string;
  difficulty: Difficulty;
  quest: string;

  /** 진입 조건. 빈 배열이면 처음부터 열려 있다. 예: ["tutorial_cleared"] */
  unlockRequirements: string[];

  /** 배열 순서가 NPC 재질문과 시간 초과 힌트의 우선순위다 (공통규칙 §2) */
  requiredAgreementKeys: string[];
  agreementDefinitions: Record<string, AgreementDefinition>;

  /** 정식 스테이지는 600. 튜토리얼은 null(시간 제한 없음) */
  timeLimitSeconds: number | null;

  /** NPC 첫 대사. 여러 줄이면 순서대로 재생한다 */
  openingLines: string[];

  expressionKeys: string[];
  defaultExpressionKey: string;

  styleReportConfig: {
    /** 리포트에서 먼저 설명할 지표 */
    highlight: string[];
    /** LLM이 붙일 수 있는 stageTag 화이트리스트. 예: ["empty_pledge"] */
    allowedStageTags: string[];
  };

  /** 성공 시 저장할 상태 id. 예: "part_time_job_secured" */
  successState: string;
}

/**
 * maxLlmCallsPerSession(40)은 공통규칙 §4의 전역 상한이므로
 * 스테이지 JSON에 두지 않는다. 스테이지가 값을 덮어쓰면 안 된다.
 */
export const MAX_LLM_CALLS_PER_SESSION = 40;

/** LLM 처리로 타이머를 멈출 수 있는 최대 시간 (공통규칙 §4) */
export const MAX_LLM_PAUSE_SECONDS = 20;

/** NPC TTS 정지 시간 = clamp(2, ceil(글자 수 / 5), 15) */
export const TTS_PAUSE_MIN_SECONDS = 2;
export const TTS_PAUSE_MAX_SECONDS = 15;
