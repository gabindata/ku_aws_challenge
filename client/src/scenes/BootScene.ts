import Phaser from 'phaser';
import { SceneKey } from '../types';
import { TTSManager } from '../systems/TTSManager';

/**
 * 브라우저 기본 확인 및 전역 시스템 초기화
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    // =========================
    // TTS 관리자 생성
    // =========================

    const ttsManager = new TTSManager();

    // 모든 Scene에서 같은 TTSManager를 사용할 수 있도록 저장
    this.registry.set('ttsManager', ttsManager);

    this.game.events.once(Phaser.Core.Events.DESTROY, () => ttsManager.destroy());

    // =========================
    // 다음 Scene
    // =========================

    this.scene.start(SceneKey.Preload);
  }
}