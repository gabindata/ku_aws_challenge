import Phaser from 'phaser';
import { SettingsPanel } from './SettingsPanel';
import { playUiClick } from './UiFeedback';

/** 모든 씬에서 카메라와 무관하게 게임 화면 오른쪽 위에 표시한다. */
export function installGlobalSettingsButton(game: Phaser.Game): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', '설정');
  button.title = '설정';
  Object.assign(button.style, {
    position: 'fixed', zIndex: '99990', padding: '0', border: '0',
    background: "transparent url('/assets/images/ui/settings-button.png') center / contain no-repeat",
    imageRendering: 'pixelated', cursor: 'pointer', display: 'none',
  });
  document.body.append(button);
  let panel: SettingsPanel | undefined;
  const update = () => {
    const scene = game.scene.getScenes(true).at(-1);
    const rect = game.canvas?.getBoundingClientRect();
    if (!rect || (!scene && !panel)) { button.style.display = 'none'; return; }
    const scale = rect.width / Number(game.config.width);
    const size = Math.max(32, 72 * scale);
    const margin = Math.max(10, 24 * scale);
    button.style.display = 'block';
    button.style.width = button.style.height = `${size}px`;
    button.style.left = `${rect.right - margin - size}px`;
    button.style.top = `${rect.top + margin}px`;
    button.disabled = !!panel || !!document.querySelector('.game-settings-overlay');
  };
  button.onclick = () => {
    const scene = game.scene.getScenes(true).at(-1);
    if (!scene || panel || document.querySelector('.game-settings-overlay')) return;
    if (scene.events.listenerCount('open-settings')) {
      scene.events.emit('open-settings');
      return;
    }
    playUiClick(scene);
    // 탐색 중에는 이동·연출도 함께 멈춰서 설정 뒤에서 진행되지 않게 한다.
    scene.scene.pause();
    panel = new SettingsPanel(scene, () => {
      panel = undefined;
      if (scene.scene.isPaused()) scene.scene.resume();
      update();
    });
    update();
  };
  game.events.on(Phaser.Core.Events.POST_STEP, update);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    game.events.off(Phaser.Core.Events.POST_STEP, update);
    button.remove();
  });
}
