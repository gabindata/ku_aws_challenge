import Phaser from 'phaser';
import type { StyleMetrics } from '../types';

/**
 * 말투 리포트 레이더 차트 (공통규칙 §6의 공통 다섯 지표).
 *
 * formality / directness / hedging / questionRatio는 0~100이라 그대로 꽂으면 되고,
 * avgUtteranceLength만 글자 수라서 별도 스케일이 필요하다.
 * 높고 낮음을 좋고 나쁨으로 표현하지 않는다.
 */
export class StyleRadarChart extends Phaser.GameObjects.Container {
  render(_metrics: StyleMetrics): void {
    // TODO: Graphics로 5축 폴리곤 그리기
  }
}
