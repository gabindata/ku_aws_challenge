import type { NegotiationState, Turn } from '../../../shared/types/negotiationTypes';
import type { StyleAnalysisResponse } from '../../../shared/types/styleReportTypes';
import type { NpcPersona } from './npcPersonaService';

/**
 * Claude API 래퍼. API 키는 서버에만 존재한다 (설계 문서 7장).
 * LLM은 npcReply와 trust/priceGap 같은 "재료 값"만 제공하고,
 * 최종 성공/실패 판정은 negotiationEngine.ts가 결정적으로 계산한다.
 */

/** LLM이 structured output으로 반드시 채워야 하는 필드 */
export interface LlmTurnResult {
  npcReply: string;
  trust: number;
  priceGap: number;
  /** NPC가 이번 턴에 제시/수용한 가격 */
  offeredPrice: number;
  stage: NegotiationState['stage'];
}

export async function generateNpcReply(
  _persona: NpcPersona,
  _history: Turn[],
  _playerText: string,
): Promise<LlmTurnResult> {
  // TODO: persona + history로 프롬프트 구성 → Claude API 호출 → JSON 스키마 강제
  throw new Error('not implemented');
}

export async function generateOpeningLine(_persona: NpcPersona): Promise<string> {
  // TODO: NPC 첫 대사 생성
  throw new Error('not implemented');
}

/** 스타일 리포트의 정성 파트(tactics/summary/highlights)만 LLM에 맡긴다. */
export async function labelSpeechStyle(
  _turns: Turn[],
): Promise<Pick<StyleAnalysisResponse, 'tactics' | 'summary' | 'highlights'>> {
  // TODO
  throw new Error('not implemented');
}
