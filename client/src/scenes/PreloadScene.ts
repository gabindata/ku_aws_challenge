import Phaser from 'phaser';
import { SceneKey } from '../types';

/** NPC 초상화·배경·효과음 로드. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    // TODO: this.load.image('npc_merchant_kim', 'assets/images/npc-portraits/merchant_kim.png') 등
    this.load.image(
      'main-menu-bg',
      '/assets/images/main-menu-bg.png'
    );

    this.load.image(
      'button-default',
      '/assets/images/ui/button-default.png'
    );
    
    this.load.image(
      'button-highlight',
      '/assets/images/ui/button-highlight.png'
    );

    this.load.audio(
      'button-click',
      '/assets/audio/button_click.mp3'
    );
    
    this.load.audio(
      'button-hover',
      '/assets/audio/button_hover.mp3'
    );

  }

  create(): void {
    this.scene.start(SceneKey.MainMenu);
  }
}
