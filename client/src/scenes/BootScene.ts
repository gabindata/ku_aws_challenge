import Phaser from 'phaser';
import { SceneKey } from '../types';

/** 폰트/설정 로드, 마이크 권한 사전 체크. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  async create(): Promise<void> {
    // TODO: 웹폰트 로드, navigator.mediaDevices 권한 사전 확인 (거부 시 안내)
    this.scene.start(SceneKey.Preload);
  }
}
