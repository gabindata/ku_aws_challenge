import Phaser from 'phaser';
import { SceneKey } from '../types';

/** NPC 초상화·배경·효과음 로드. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    // TODO: this.load.image('npc_merchant_kim', 'assets/images/npc-portraits/merchant_kim.png') 등
  }

  create(): void {
    this.scene.start(SceneKey.MainMenu);
  }
}
