import { gameSettings } from '../systems/GameSettings';
import Phaser from 'phaser';

/** 모든 UI 버튼이 같은 클릭음을 한 번만 재생하도록 하는 공통 함수. */
export function playUiClick(scene: Phaser.Scene): void {
  if (scene.cache.audio.exists('button-click')) {
    scene.sound.play('button-click', { volume: gameSettings.ui });
  }
}

/** 문을 통해 들어가거나 나갈 때 재생한다. 씬 전환 후에도 끝까지 재생된다. */
export function playDoorEntry(scene: Phaser.Scene, place: 'store' | 'house' | 'school'): void {
  const key = `door-entry-${place}`;
  if (scene.cache.audio.exists(key)) {
    scene.sound.play(key, { volume: gameSettings.ui, loop: false });
  }
}
