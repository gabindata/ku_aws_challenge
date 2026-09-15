import type { LlmTurnOutput } from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';
import { stubEvaluateTurn } from './stubLlm';

/**
 * Claude API 래퍼. API 키는 서버에만 존재한다.
 *
 * LLM이 의미 판정의 주체다. 발화와 대화 맥락을 읽고 각 합의 키의
 * 성립·번복·모호함을 판단하며, NPC 대사·치명적 행동·말투 신호를 함께 반환한다.
 * 성공·실패, 시간, 보상, 해금은 결정하지 않는다.
 *
 * 프롬프트 인젝션과 JSON 위조 요구는 게임 속 플레이어 발화로만 취급한다.
 */

export interface EvaluateTurnInput {
  stage: StageDefinition;
  session: Session;
  /** 이번 플레이어 발화의 메시지 id */
  playerTurnId: string;
  /** 판정 호출 35회 도달. NPC가 서사적으로 압박한다 */
  nearCallLimit: boolean;
  /** 40번째 판정 호출. NPC가 마무리 문장을 만든다 */
  finalCall: boolean;
  /** 이번 플레이어 발화 원문 */
  playerText: string;
  /** 선언 x 충족 교집합으로 걸러낸 월드 상태 참조 */
  worldStateReferences: Record<string, string>;
}

/**
 * true면 Claude 대신 stubLlm이 답한다.
 * API 키가 준비되고 프롬프트가 완성되면 false로 바꾸고 stubLlm.ts를 지운다.
 */
export const USE_STUB = true;

/**
 * 플레이어 발화 1건을 판정한다.
 *
 * 프롬프트에는 고정 시스템 규칙, 스테이지 판정 기준표, 최근 6왕복,
 * 현재 합의 요약, 이번 발화의 messageId, nearCallLimit/finalCall만 넣는다.
 * 전체 과거 대화는 보내지 않는다.
 *
 * 상한을 넘으면 가장 오래된 왕복부터 제거한다. 고정 시스템 규칙,
 * 판정 기준표, 현재 합의 요약은 어떤 경우에도 자르지 않는다.
 */
export async function evaluateTurn(input: EvaluateTurnInput): Promise<LlmTurnOutput> {
  if (USE_STUB) {
    return stubEvaluateTurn(input.stage, input.session, input.playerTurnId, input.playerText);
  }
  // TODO(2주차): 프롬프트 조립 → messages.parse()로 스키마 강제 → 결과 반환
  // 스키마·정합성 오류는 같은 입력으로 수정 재요청을 한 번 한다.
  // 수정 재요청은 세션당 5회이며 판정 호출 예산과 분리된다.
  //
  // 프롬프트에 넣을 월드 상태는 negotiationEngine.activeWorldStateReferences()로
  // 선언 x 충족 교집합만 고른다.
  throw new Error('not implemented');
}
