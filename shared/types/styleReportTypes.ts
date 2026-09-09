// 말투 리포트 계약 — 기획 공통규칙 §6 "말투 리포트" 기준.
// 말투는 성공/실패 판정과 완전히 분리된 사후 리포트다. NPC 반응에도 영향을 주지 않는다.

/**
 * LLM이 플레이어 발화 1턴마다 돌려주는 말투 신호 (공통규칙 §5).
 * 서버는 세 점수의 0~100 범위와 evidenceTurnId만 검증하고,
 * 판정 상태와 분리해 누적한다.
 */
export interface StyleSignals {
  /** 0~100. 캐주얼 ↔ 격식 */
  formality: number;
  /** 0~100. 우회적 ↔ 요구·제안이 명확함 */
  directness: number;
  /** 0~100. 단정적 ↔ 완곡·유보 표현이 많음 */
  hedging: number;
  isQuestion: boolean;
  /** 스테이지별 허용 목록(styleReportConfig.allowedStageTags)에 있는 값만 받는다. */
  stageTags: string[];
  /** 이 신호의 근거가 된 플레이어 메시지 id */
  evidenceTurnId: string;
}

/**
 * 공통 다섯 지표. 스테이지가 지표를 추가할 수는 있어도 삭제할 수는 없다.
 *
 * 차트에는 0~100인 네 개(formality·directness·hedging·questionRatio)만 올린다.
 * avgUtteranceLength는 단위가 글자 수라 같은 축에 놓을 수 없으므로
 * "한 번에 평균 OO자" 숫자 카드로 따로 보여준다. 0~100으로 환산하지 않는다.
 */
export interface StyleMetrics {
  /** 유효 턴 formality의 산술평균(반올림) */
  formality: number;
  directness: number;
  hedging: number;
  /**
   * 서버 계산 — 유효 플레이어 발화의 글자 수 평균 (어절 수 아님).
   * 앞뒤 공백을 제거하고 연속 공백을 하나로 정리한 뒤 센다.
   */
  avgUtteranceLength: number;
  /** isQuestion:true 발화 수 ÷ 유효 플레이어 발화 수 (0~100) */
  questionRatio: number;
}

export interface StyleHighlight {
  /** 인용한 플레이어 발화의 메시지 id */
  turnId: string;
  quote: string;
  note: string;
}

/** 세션 종료 응답에 함께 실리는 집계 리포트 */
export interface StyleReport {
  metrics: StyleMetrics;
  /** 유효 발화가 2개 이하면 'low' */
  confidence: 'low' | 'normal';
  /** stageTags 집계. 예: { empty_pledge: 3 } */
  stageTagCounts: Record<string, number>;
  /** 대표 근거 발화 1~3개 */
  highlights: StyleHighlight[];
  /** 관찰 요약. 높고 낮음을 좋고 나쁨으로 환산하지 않는다. */
  observation: string;
  /** 다음 대화에서 시도할 행동 1개 */
  nextAction: string;
}
