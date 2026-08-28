import Phaser from 'phaser';
import type { StyleMetrics } from '../types';

/** 발화 스타일 레이더 차트. metrics는 0~100이라 그대로 꽂으면 된다. */
export class StyleRadarChart extends Phaser.GameObjects.Container {
  render(_metrics: StyleMetrics): void {
    // TODO: Graphics로 5축 폴리곤 그리기 (avgTurnLength는 별도 스케일 처리 필요)
  }
}
