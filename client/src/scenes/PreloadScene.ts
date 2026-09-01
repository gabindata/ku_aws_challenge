import Phaser from 'phaser';
import { SceneKey } from '../types';

/** NPC 초상화·배경·효과음 로드. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    // TODO: this.load.image('npc_merchant_kim', 'assets/images/npc-portraits/merchant_kim.png') 등
    

    //플레이어 리소스
    this.load.image(
      'player',
      'assets/images/player/player.png'
    );

    //메인 화면 리소스
    this.load.image(
      'main-menu-bg',
      '/assets/images/main-menu-bg.png'
    );
    
    // ui 리소스
    this.load.image(
      'button-default',
      '/assets/images/ui/button-default.png'
    );
    
    this.load.image(
      'button-highlight',
      '/assets/images/ui/button-highlight.png'
    );

    this.load.audio(
      'main-bgm',
      '/assets/audio/main_bgm.mp3'
    );

    this.load.audio(
      'button-click',
      '/assets/audio/button_click.mp3'
    );
    
    this.load.audio(
      'button-hover',
      '/assets/audio/button_hover.mp3'
    );

    // 시간대 연출용 맵 레이어
    this.load.image(
      'stage-select-base',
      '/assets/images/stage-selection/tutorial-map-bg.png'
    );

    this.load.image(
      'stage-select-evening',
      '/assets/images/stage-selection/tutorial-map-evening.png'
    );

  }
  
  create(): void {
    this.scene.start(SceneKey.MainMenu);
  }
}
