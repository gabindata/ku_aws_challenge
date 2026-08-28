import Phaser from 'phaser';
import { SceneKey } from '../types';

/** 스테이지 선택. GET /api/stages 결과를 난이도 순으로 나열한다. */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.MainMenu);
  }

  async create(): Promise<void> {
    // TODO: ApiClient.getStages() → 버튼 생성 → 클릭 시
    //       this.scene.start(SceneKey.Negotiation, { npcId })
  }
}
