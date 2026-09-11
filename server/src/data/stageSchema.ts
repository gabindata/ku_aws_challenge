// 스테이지 정의 스키마 — 기획 공통규칙 §5, 스테이지 1 §11 운영 JSON 기준.
//
// 이 타입은 shared/가 아니라 서버에 둔다. 판정 기준표와 비공개 요구가
// 들어 있어 클라이언트가 보관해서는 안 되기 때문이다.
// 클라이언트에 나가는 요약은 shared의 StageSummary만 쓴다.

import type { Difficulty } from '../../../shared/types/negotiationTypes';

/**
 * 합의 키 하나의 판정 기준표. 수치 비교값이 아니라 LLM이 읽는 자연어다.
 *
 * 특정 문장이나 키워드가 아니라 "플레이어가 전달해야 할 의미와 행동 약속"을 적는다.
 * 표현이 달라도 의미가 충분하면 LLM이 충족으로 판단할 수 있다.
 */
export interface AgreementDefinition {
  /** 이 합의가 필요한 이유 */
  intent: string;
  /** 충족으로 볼 의미 기준 */
  passWhen: string[];
  /** 애매해서 바로 통과시키면 안 되는 사례 */
  clarifyWhen: string[];
  /** 이전 약속과 충돌하거나 철회하는 의미 */
  revokeWhen: string[];
  /** 직전 NPC 제안에 대한 짧은 "네"를 인정할지 */
  contextConsentAllowed: boolean;
  /**
   * 플레이어가 스스로 약속을 제안해야 충족되는 키인지.
   * 공통규칙이 정한 유일한 이름이다 (selfProposalRequired 같은 다른 이름을 쓰지 않는다).
   */
  playerMustPropose: boolean;
  /** 합의 메모 작성 기준. 없으면 LLM의 agreementSummary를 그대로 쓴다. */
  memoGuide?: string;
}

export interface StageDefinition {
  stageId: number;
  npcId: string;
  /**
   * npcName·location은 공통규칙 §5의 예시 JSON에는 없지만,
   * §2의 "맵에 스테이지 번호와 난이도를 표시한다"를 구현하려면 필요하다.
   * (기획 확인 필요 항목)
   */
  npcName: string;
  location: string;
  difficulty: Difficulty;

  /** 월드 상태 키 목록. successState와 같은 네임스페이스를 쓴다. */
  unlockRequirements: string[];

  /** 정식 스테이지는 600. 튜토리얼은 null(시간 제한 없음) */
  timeLimitSeconds: number | null;
  /**
   * 판정 호출 상한. 공통규칙 §4가 전역 40으로 정하고 스테이지 JSON에도 같은 값이 있다.
   * 값이 어긋나면 공통규칙 §1 우선순위에 따라 공통규칙이 이긴다. (기획 확인 필요 항목)
   */
  maxLlmCallsPerSession: number;

  /** 배열 순서가 NPC 재질문과 시간 초과 힌트의 우선순위다 */
  requiredAgreementKeys: string[];
  agreementDefinitions: Record<string, AgreementDefinition>;

  /**
   * 고정 첫 NPC 대사. 공통규칙 §5의 예시 JSON에는 없지만,
   * §3의 시작 절차상 서버가 첫 대사를 반환하고 그 TTS 추정 시간으로
   * startedAt을 계산해야 하므로 데이터로 필요하다. (기획 확인 필요 항목)
   */
  openingLines: string[];

  expressionKeys: string[];
  defaultExpressionKey: string;
  /** 종료 화면 표정은 LLM이 정하지 않는다. 서버가 이 값으로 고정한다. */
  successExpressionKey: string;
  failureExpressionKey: string;

  /** 성공 결과 화면의 고정 문구 */
  successText: string;
  /** 협상 대상이 아닌 고정 안내. 합의 내용과 시각적으로 구분해 표시한다. */
  fixedTerms: string[];
  /** 판정 호출 상한 도달로 끝났을 때의 고정 문구 */
  limitText: string;
  /** 합의 키 → 시간 초과 시 보여줄 비정답형 힌트 */
  failureHints: Record<string, string>;

  styleReportConfig: {
    highlight: string[];
    allowedStageTags: string[];
  };

  successState: string;
}

// ── 공통규칙 §4 전역 상한 ──

/** 판정 호출 상한 */
export const MAX_LLM_CALLS_PER_SESSION = 40;
/** 판정 호출 예산과 분리된 수정 재요청 상한. 세션 총 호출은 45회를 넘지 않는다. */
export const MAX_REPAIR_REQUESTS_PER_SESSION = 5;
/** 이 횟수에 도달하면 프롬프트에 nearCallLimit를 넣어 NPC가 서사적으로 압박한다 */
export const NEAR_CALL_LIMIT_THRESHOLD = 35;

/** LLM·서버 처리로 타이머를 멈출 수 있는 요청당 최대 시간 */
export const MAX_LLM_PAUSE_SECONDS = 20;
/** NPC TTS 정지 시간 = clamp(2, ceil(한글 글자 수 / 5), 15)초 */
export const TTS_PAUSE_MIN_SECONDS = 2;
export const TTS_PAUSE_MAX_SECONDS = 15;
export const TTS_CHARS_PER_SECOND = 5;

/** 프롬프트에 포함할 최근 왕복 수 */
export const MAX_HISTORY_EXCHANGES = 6;
export const MAX_PROMPT_TOKENS = 4000;
/**
 * 출력 상한. 공통규칙 §4의 원안은 500이지만 1500으로 올렸다.
 *
 * 실제 응답 크기를 재보니 합의 키 하나만 판정해도 약 660토큰이고,
 * 스테이지 3에서 다섯 키가 한 턴에 판정되면 1700토큰을 넘는다.
 * 500을 유지하면 거의 매 턴 JSON이 잘려 파싱에 실패하고,
 * 수정 재요청 -> 재실패 -> retry/system으로 이어져 오히려 호출이 늘어난다.
 * 비용을 아끼려는 값이 비용을 키우는 상황이라 올렸다.
 *
 * 글자 수 기반 추정이므로 2주차에 count_tokens로 실측해 확정한다.
 */
export const MAX_OUTPUT_TOKENS = 1500;

/** 남은 시간 경고 시점(초) */
export const TIMER_WARNING_SECONDS = [120, 30] as const;
