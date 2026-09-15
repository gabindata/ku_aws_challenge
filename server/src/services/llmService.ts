import type { LlmTurnOutput } from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';

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
}

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
export async function evaluateTurn(_input: EvaluateTurnInput): Promise<LlmTurnOutput> {
  // TODO: 프롬프트 조립 → messages.parse()로 스키마 강제 → 결과 반환
  // 스키마·정합성 오류는 같은 입력으로 수정 재요청을 한 번 한다.
  // 수정 재요청은 세션당 5회이며 판정 호출 예산과 분리된다.
  throw new Error('not implemented');
}
