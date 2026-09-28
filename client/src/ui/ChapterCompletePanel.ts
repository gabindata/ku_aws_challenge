import Phaser from 'phaser';
import { SceneKey } from '../types';
import { playUiClick } from './UiFeedback';
import './chapterComplete.css';

export function showChapterComplete(scene: Phaser.Scene): void {
  const root = document.createElement('div');
  root.className = 'chapter-complete-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '챕터 1 클리어');
  const panel = document.createElement('div');
  panel.className = 'chapter-complete-panel';
  const image = document.createElement('img');
  image.src = `${import.meta.env.BASE_URL}assets/images/stage-selection/final.png`;
  image.alt = '챕터 1 클리어! 준비된 모든 스테이지를 완료했어요. 챕터 2는 개발 중입니다.';
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.textContent = '나가기';
  exit.onclick = () => { playUiClick(scene); scene.scene.start(SceneKey.MainMenu); };
  root.onkeydown = event => {
    event.stopPropagation();
    if (event.key === 'Tab') { event.preventDefault(); exit.focus(); }
  };
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    root.addEventListener(type, event => event.stopPropagation());
  }
  panel.append(image, exit); root.append(panel); document.body.append(root);
  const inputEnabled = scene.input.enabled;
  const keyboardEnabled = scene.input.keyboard?.enabled;
  scene.input.keyboard?.resetKeys();
  scene.input.enabled = false;
  if (scene.input.keyboard) scene.input.keyboard.enabled = false;
  exit.focus();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    root.remove(); scene.input.enabled = inputEnabled; scene.input.keyboard?.resetKeys();
    if (scene.input.keyboard && keyboardEnabled !== undefined) scene.input.keyboard.enabled = keyboardEnabled;
  });
}
