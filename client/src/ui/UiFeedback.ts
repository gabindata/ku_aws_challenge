import { gameSettings } from '../systems/GameSettings';
import Phaser from 'phaser';

/** 모든 UI 버튼이 같은 클릭음을 한 번만 재생하도록 하는 공통 함수. */
export function playUiClick(scene: Phaser.Scene): void {
  if (scene.cache.audio.exists('button-click')) {
    scene.sound.play('button-click', { volume: gameSettings.ui });
  }
}
