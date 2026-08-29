import Phaser from 'phaser';
import { SceneKey } from '../types';
/** 브라우저가 마이크 기능을 지원하는지 확인
 * 설정값 초기화(BGM 볼륨, 효과음 볼륨, 음소거 여부)
 * 웹폰트 준비 확인
 * 브라우저 호환성 체크
 */

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  async create(): Promise<void> {
    // TODO: 웹폰트 로드, navigator.mediaDevices 권한 사전 확인 (거부 시 안내)
    this.scene.start(SceneKey.Preload);
  }
}
