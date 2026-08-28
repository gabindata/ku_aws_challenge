// 설계 문서 5장 `POST /api/analysis/style` + 6장 지표 정의.

/** avgTurnLength(턴당 어절 수)를 제외한 값은 모두 0~100 스케일. */
export interface StyleMetrics {
  /** 격식도 — 존댓말/반말 어미 비율 */
  formality: number;
  /** 직접성 — 요청문 vs 완곡 표현 비율 */
  directness: number;
  /** 헤징/필러 — "음", "그", "저기" 등 빈도 */
  hedging: number;
  /** 평균 발화 길이 — 턴당 어절 수 (0~100 스케일 아님) */
  avgTurnLength: number;
  /** 질문 비율 — 의문문 비율 */
  questionRatio: number;
}

export interface StyleHighlight {
  quote: string;
  note: string;
}

// POST /api/analysis/style
export interface StyleAnalysisRequest {
  sessionId: string;
}
export interface StyleAnalysisResponse {
  metrics: StyleMetrics;
  /** 설득 전략 태그 (LLM 라벨링, 시간 남으면 추가) */
  tactics: string[];
  summary: string;
  highlights: StyleHighlight[];
}
