import type { Turn } from '../../../shared/types/negotiationTypes';
import type { StyleAnalysisResponse, StyleMetrics } from '../../../shared/types/styleReportTypes';

/**
 * 설계 문서 6장. 형태소 분석기 없이 정규식으로 타협하고,
 * 부족한 정밀도는 llmService.labelSpeechStyle()의 정성 요약으로 보완한다.
 * 규칙 기반 지표(1주차) → LLM 라벨링(여유 시) 순으로 붙인다.
 */

/** 플레이어 발화만 뽑아서 규칙 기반 지표를 계산한다. */
export function computeMetrics(_playerTurns: Turn[]): StyleMetrics {
  // TODO: formality/directness/hedging/avgTurnLength/questionRatio
  throw new Error('not implemented');
}

export async function analyzeStyle(_turns: Turn[]): Promise<StyleAnalysisResponse> {
  // TODO: computeMetrics() + labelSpeechStyle() 합치기
  throw new Error('not implemented');
}
