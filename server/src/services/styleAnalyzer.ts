import type { Turn } from '../../../shared/types/negotiationTypes';
import type { StyleReport, StyleSignals } from '../../../shared/types/styleReportTypes';

/**
 * 말투 리포트 집계 (공통규칙 §6).
 *
 * 정규식으로 한국어를 분석하지 않는다. 격식도·직접성·헤징은 LLM이 턴마다
 * 0~100으로 주고, 서버는 유효 턴의 산술평균만 낸다.
 * 리포트는 성공 판정과 NPC 반응에 전혀 영향을 주지 않는다.
 */

/** 유효 발화가 이 수 이하면 confidence: 'low' */
export const LOW_CONFIDENCE_THRESHOLD = 2;

/**
 * 서버가 직접 계산하는 지표.
 * - avgUtteranceLength: 정규화된 글자 수 평균 (어절 수가 아니다)
 * - questionRatio: isQuestion인 발화 비율
 *
 * 빈 STT와 시스템 재시도는 집계에서 제외한다.
 */
export function aggregate(
  _playerTurns: Turn[],
  _signals: StyleSignals[],
): StyleReport {
  // TODO(3주차): 세 LLM 지표 평균(반올림) + 서버 계산 두 지표 + stageTags 집계
  //              + 대표 근거 발화 1~3개 + 관찰 요약 + 다음에 시도할 행동 1개
  throw new Error('not implemented');
}
