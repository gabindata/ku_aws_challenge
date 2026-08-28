import Phaser from 'phaser';
import { SceneKey } from '../types';

/** 발화 스타일 리포트 — 레이더 차트, 인용구. 분석은 1~2초 걸린다. */
export class StyleReportScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.StyleReport);
  }

  async create(_data: { sessionId: string }): Promise<void> {
    // TODO: 로딩 표시 → ApiClient.getStyleReport(sessionId)
    //       → StyleRadarChart(metrics) + summary + highlights 렌더
  }
}
