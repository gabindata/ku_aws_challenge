// 말투 리포트 — 기획 「결과 리포트 기획」 기준.
//
// 이 게임에서 플레이어가 가져가는 것은 리포트다. 목적은 "너 이렇게 말하더라"를
// 보여주는 것이고, 성공 화면과 실패 화면에서 같은 형식·같은 비중으로 나온다.
// 말투는 성공 판정에 절대 반영하지 않는다.

// ─────────────────────────────────────────────
// 대화 중 수집 (판정 호출에 얹어서 받는다)
// ─────────────────────────────────────────────

/** 일상체 / 공손한 해요체 / 격식체. 판단 불가면 null */
export type FormalityLevel = 'casual' | 'polite' | 'formal';
/** 원하는 행동을 명시하면 direct, 사정만 말해 암시하면 indirect. 요청·제안이 없으면 null */
export type DirectnessLevel = 'direct' | 'indirect';

/**
 * LLM이 플레이어 발화 1건마다 함께 돌려주는 말투 분석값.
 *
 * 점수가 아니라 분류다. 서버가 세션 종료 시 이 값들을 집계해 축 위치를 만든다.
 * 말투 이름 생성이 실패해도 축은 저장된 이 값으로 표시한다.
 */
export interface StyleSignals {
  /**
   * 말끝이 없거나 잘렸다는 이유만으로 casual로 분류하지 않는다.
   * 없는 존댓말을 추측해 복원하거나 앞선 발화의 격식을 자동 적용하지 않는다.
   * 혼용은 본인이 말한 완결된 문장에서 우세한 쪽을 따르고, 불분명하면 null.
   */
  formality: FormalityLevel | null;
  /** 공손함이나 쿠션 표현의 양을 직접성 판정에 섞지 않는다. */
  directness: DirectnessLevel | null;
  /** 한 발화에 여러 개가 있어도 사용한 발화 1개로 센다. */
  cushionUsed: boolean;
  /** 사용했다면 근거가 된 실제 표현. 단어의 존재만으로 판정하지 않는다. */
  cushionPhrases: string[];
  /** 화면에 표시하지 않는다. 근거 발화 선정과 총평 작성의 보조자료로만 쓴다. */
  stageTags: string[];
  evidenceTurnId: string;
}

// ─────────────────────────────────────────────
// 네 축
// ─────────────────────────────────────────────

/** 표시 순서는 격식 → 직접성 → 쿠션 → 길이로 고정한다. */
export type StyleAxisCode = 'formality' | 'directness' | 'cushion' | 'length';

/** 축별 최소 표본. 대상이 이 수 미만이면 위치를 표시하지 않는다. */
export const MIN_AXIS_SAMPLE = 3;

/** 발화 길이 축의 양 끝. 평균 5자 이하가 왼쪽, 60자 이상이 오른쪽. */
export const LENGTH_AXIS_MIN_CHARS = 5;
export const LENGTH_AXIS_MAX_CHARS = 60;

export interface StyleAxis {
  code: StyleAxisCode;
  label: string;
  leftLabel: string;
  rightLabel: string;
  /**
   * 0~100 위치. 화면에 숫자를 쓰지 않고 위치만 표시한다.
   * 표본이 부족하면 null이며 가운데나 왼쪽 끝을 기본값으로 찍지 않는다.
   */
  position: number | null;
  /** 대상 발화가 최소 표본 미만. 축을 흐리게 그리고 안내를 붙인다. */
  insufficient: boolean;
  /** 집계에 쓴 발화 수. 화면에 표시하지 않는다. */
  sampleCount: number;
}

/** 네 축의 이름과 양극. 스테이지와 무관하게 고정이며 특정 축을 강조하지 않는다. */
export const STYLE_AXIS_LABELS: Record<
  StyleAxisCode,
  { label: string; leftLabel: string; rightLabel: string }
> = {
  formality: { label: '발화 격식', leftLabel: '일상적', rightLabel: '격식적' },
  directness: { label: '직접성', leftLabel: '암시적', rightLabel: '직접적' },
  cushion: { label: '쿠션 표현', leftLabel: '적게 사용', rightLabel: '많이 사용' },
  length: { label: '발화 길이', leftLabel: '짧게', rightLabel: '길게' },
};

/** 표본이 부족한 축에 붙이는 안내 */
export const INSUFFICIENT_AXIS_NOTE = '판단할 발화가 부족해요.';

// ─────────────────────────────────────────────
// 종료 시 생성
// ─────────────────────────────────────────────

/**
 * 근거 발화. 대화 흐름대로(시간순) 놓는다.
 *
 * 내부적으로는 반복된 습관 0~2 · 극단적인 발화 0~2 · 결정적인 순간 0~1로
 * 골라 최대 5개를 뽑지만, 종류 이름은 화면에 드러내지 않는다.
 */
export interface StyleHighlight {
  turnId: string;
  /** 실제 플레이어 발화를 그대로 인용한다. 다듬지 않는다. */
  quote: string;
  /** 무슨 일이 있었는지만 적는다. 횟수는 반복된 습관에만 쓴다. */
  note: string;
}

/**
 * 종료 LLM이 한 번에 생성하는 부분.
 * 말투 이름·짧은 설명·근거 발화·협상 총평을 함께 만든다.
 */
export interface StyleNarrative {
  /** 이번 대화의 말투 이름. LLM이 매번 새로 짓는다. 예: "돌려 말하는 설명가" */
  title: string;
  /** 짧은 설명. 관찰만 쓰고 사람을 단정하지 않는다. */
  titleNote: string;
  /** 0~5개 */
  highlights: StyleHighlight[];
  /**
   * 협상 총평. 공백 포함 180~220자.
   * 핵심 행동 -> 실제 대화에 미친 영향 -> 결과 평가 순서로 쓰고 조언은 넣지 않는다.
   */
  summary: string;
}

export interface StyleReport {
  /** 생성 실패면 null. 이때 화면은 이름·설명·근거·총평을 숨기고 안내를 띄운다. */
  narrative: StyleNarrative | null;
  /** 종료 LLM이 재시도까지 실패했는가. 축은 저장된 분석값으로 그대로 표시한다. */
  analysisFailed: boolean;
  /** 네 축. 생성 성공 여부와 무관하게 항상 채운다. */
  axes: StyleAxis[];
  /**
   * 맨 위에 붙는 한 줄 안내. 유효 발화가 2개 이하이거나 0개일 때만 값이 있다.
   * 화면 구성은 평소와 똑같이 두고 이 문장만 바꿔 넣는다.
   */
  sampleNote: string | null;
  /** 집계에 쓴 유효 발화 수. 화면에 표시하지 않는다. */
  validUtteranceCount: number;
}

export const ANALYSIS_FAILED_NOTE = '대화 분석을 불러오지 못했습니다';
export const LOW_SAMPLE_NOTE = '말이 적어 이번엔 읽을 게 많지 않습니다.';
export const NO_SPEECH_NOTE = '이번엔 말을 하지 않았습니다.';
