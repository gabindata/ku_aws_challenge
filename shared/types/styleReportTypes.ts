// 말투 리포트 — 기획 공통규칙 §10 기준.
//
// 리포트는 진단이다. "당신은 이렇게 말했다"를 보여주고 "이렇게 하라"고 지시하지 않는다.
// 말투는 성공 판정에 절대 반영하지 않는다. 점수를 노리고 말하기 시작하면
// 측정값이 오염되고 진단이 거짓이 되기 때문이다.

/**
 * LLM이 플레이어 발화 1턴마다 돌려주는 말투 신호 (공통규칙 §8).
 * 서버는 세 점수의 0~100 범위와 evidenceTurnId, stageTags 화이트리스트만 검증하고
 * 판정 상태와 분리해 누적한다. 이 형식은 바뀌지 않았다 — 바뀐 것은 화면 표현뿐이다.
 */
export interface StyleSignals {
  formality: number;
  directness: number;
  hedging: number;
  isQuestion: boolean;
  /** 스테이지 styleReportConfig.allowedStageTags에 있는 값만 받는다 */
  stageTags: string[];
  evidenceTurnId: string;
}

/**
 * 서버가 내부적으로 쌓는 원점수. 로그와 회귀 테스트에만 쓴다.
 * 화면에는 숫자를 노출하지 않으므로 클라이언트 응답에 담지 않는다.
 */
export interface StyleRawMetrics {
  formality: number;
  directness: number;
  hedging: number;
  /** isQuestion: true 비율 (0~100) */
  questionRatio: number;
  /** 유효 발화 글자 수 평균. 앞뒤 공백 제거·연속 공백 하나로 정리 후 계산 */
  avgUtteranceLength: number;
  /** 집계에 쓴 유효 발화 수 */
  validUtteranceCount: number;
}

// ─────────────────────────────────────────────
// 다섯 축 (공통규칙 §10)
// ─────────────────────────────────────────────

/**
 * 지표는 점수가 아니라 두 극 사이의 위치다.
 *
 * listening은 isQuestion 비율을 반전한 값이다. 질문을 많이 하면 왼쪽(물어봄),
 * 적게 하면 오른쪽(설명함)에 놓인다.
 * pace는 글자 수라 단위가 다르지만, 단위가 다르다는 이유로 따로 빼지 않고
 * 나머지 넷과 같은 형태로 한 줄에 나란히 보여준다.
 */
export type StyleAxisCode = 'formality' | 'directness' | 'hedging' | 'listening' | 'pace';

export interface StyleAxis {
  code: StyleAxisCode;
  /** 화면 이름. 예: "상대와의 거리" */
  label: string;
  leftLabel: string;
  rightLabel: string;
  /**
   * 0~100. 0이 왼쪽 끝, 100이 오른쪽 끝.
   * 화면에는 이 숫자를 쓰지 않는다. 위치만 표시한다.
   */
  position: number;
  /** 스테이지 styleReportConfig.highlight에 포함된 축. 먼저 설명한다. */
  highlighted: boolean;
}

/** 축 이름과 양극 라벨. 공통규칙 §10의 표를 그대로 옮긴 것이라 스테이지와 무관하다. */
export const STYLE_AXIS_LABELS: Record<
  StyleAxisCode,
  { label: string; leftLabel: string; rightLabel: string }
> = {
  formality: { label: '상대와의 거리', leftLabel: '편하게', rightLabel: '깍듯하게' },
  directness: { label: '요구하는 방식', leftLabel: '돌려서', rightLabel: '바로' },
  hedging: { label: '말의 확신', leftLabel: '단정적', rightLabel: '여지를 둠' },
  listening: { label: '듣기와 말하기', leftLabel: '물어봄', rightLabel: '설명함' },
  pace: { label: '말의 호흡', leftLabel: '짧게 끊음', rightLabel: '길게 이어감' },
};

// ─────────────────────────────────────────────
// 리포트
// ─────────────────────────────────────────────

export interface StyleHighlight {
  /** 인용한 플레이어 발화의 메시지 id */
  turnId: string;
  /** 실제 발화를 그대로 인용한다. 다듬지 않는다. */
  quote: string;
  /** 이 발화가 보여주는 것. 관찰만 쓰고 지시·평가를 쓰지 않는다. */
  note: string;
  /** 근거가 되는 축 코드 또는 스테이지 태그 코드 */
  relatesTo: string;
}

export interface StyleTagCount {
  /** 화면에 노출하지 않는다 */
  code: string;
  /** 화면 표기. 예: "구체적 조건 없는 다짐" */
  label: string;
  count: number;
}

/**
 * 성공·실패 화면에서 같은 형식·같은 비중으로 표시한다.
 * 필드 순서가 곧 화면 순서다 — 근거가 먼저고 축은 요약이다.
 */
export interface StyleReport {
  /** 1. 이번 대화에서 가장 두드러졌던 특징 한 줄. 관찰형. */
  observation: string;
  /** 2. 근거 발화 3~5개 */
  highlights: StyleHighlight[];
  /** 3. 다섯 축 */
  axes: StyleAxis[];
  /** 4. 스테이지 태그 집계 */
  tags: StyleTagCount[];
  /** 유효 발화가 2개 이하면 'low'. 축을 흐리게 처리하고 진단이 성립하지 않음을 알린다. */
  confidence: 'low' | 'normal';
}
