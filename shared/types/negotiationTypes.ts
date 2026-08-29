// 설계 문서 5장 API 계약. 프론트/백엔드가 이 파일을 단일 소스로 공유한다.

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 협상 진행 단계. LLM이 매 턴 갱신해서 돌려준다. */
export type NegotiationStage = 'opening' | 'bargaining' | 'closing' | 'broken';

export type Speaker = 'player' | 'npc';

/** 세션에 누적되는 대화 로그 1줄. 판정과 스타일 분석 양쪽에서 재사용된다. */
export interface Turn {
  speaker: Speaker;
  text: string;
  timestampMs: number;
}

/** 매 턴 갱신되는 구조화된 협상 상태. 게임 로직은 이 값만 보고 판단한다. */
export interface NegotiationState {
  stage: NegotiationStage;
  /** 0~100. NPC가 플레이어를 얼마나 신뢰하는가. */
  trust: number;
  /**
   * 0~100. 합의까지 남은 거리. 0이면 완전 합의, 100이면 평행선.
   * 협상 축이 가격이든 계약 조건이든, 축이 몇 개든 이 숫자 하나로 표현한다.
   */
  agreementGap: number;
  /**
   * 지금 테이블 위에 올라와 있는 조건 요약. 사람이 읽는 자유 문장.
   * 예: "9만 5천원" / "납기 6주, 하자보수 12개월"
   * ResultScene의 "최종 조건 요약"이 이 값을 그대로 쓴다.
   */
  currentOffer: string;
  dealClosed: boolean;
}

// GET /api/stages
export interface StageSummary {
  stageId: number;
  npcId: string;
  name: string;
  difficulty: Difficulty;
}
export type StagesResponse = StageSummary[];

// POST /api/negotiation/start
export interface StartRequest {
  npcId: string;
}
export interface StartResponse extends NegotiationState {
  sessionId: string;
  npcReply: string;
}

// POST /api/negotiation/turn
export interface TurnRequest {
  sessionId: string;
  playerText: string;
}
export interface TurnResponse extends NegotiationState {
  npcReply: string;
}
