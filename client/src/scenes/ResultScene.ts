import Phaser from 'phaser';
import { SceneKey } from '../types';

/** 협상 성공/실패, 최종 조건 요약. "말투 리포트 보기" 버튼으로 다음 씬. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Result);
  }

  create(_data: { sessionId: string; success: boolean }): void {
    // TODO: 결과 요약 표시 + 리포트 버튼
    //       버튼 클릭 시 this.scene.start(SceneKey.StyleReport, { sessionId })
  }
}
