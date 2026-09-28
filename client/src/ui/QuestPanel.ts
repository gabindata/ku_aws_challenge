import Phaser from 'phaser';
import { getQuests } from '../systems/NegotiationProgress';
import { playUiClick } from './UiFeedback';
import './questPanel.css';

/** 카메라 이동과 확대에 영향받지 않는 메인 맵의 퀘스트 목록. */
export class QuestPanel {
  private root = document.createElement('section');
  constructor(scene: Phaser.Scene, visible: () => boolean) {
    this.root.className = 'quest-panel';
    this.root.setAttribute('aria-label', '퀘스트 목록');
    const quests = getQuests();
    const completedCount = quests.filter(quest => quest.done).length;
    const header = document.createElement('button');
    header.type = 'button';
    header.textContent = `할 일 · ${completedCount}/${quests.length} 완료  ▾`;
    header.setAttribute('aria-expanded', 'true');
    const body = document.createElement('div');
    body.className = 'quest-panel-body';
    header.onclick = () => {
      playUiClick(scene);
      body.hidden = !body.hidden;
      header.setAttribute('aria-expanded', String(!body.hidden));
      header.textContent = `할 일 · ${completedCount}/${quests.length} 완료  ${body.hidden ? '▸' : '▾'}`;
    };
    const list = document.createElement('ul');
    for (const quest of quests) {
      const row = document.createElement('li');
      row.className = quest.done ? 'quest-item quest-done' : 'quest-item';
      row.setAttribute('aria-label', `${quest.done ? '완료' : '미완료'}: ${quest.text}`);
      const box = document.createElement('span');
      box.className = 'quest-checkbox';
      box.setAttribute('aria-hidden', 'true');
      box.textContent = quest.done ? '✓' : '';
      const label = document.createElement('span');
      label.textContent = quest.text;
      row.append(box, label);
      list.append(row);
    }
    body.append(list);
    this.root.append(header, body);
    // 목록 클릭이 뒤에 있는 게임의 포인터 입력으로 전달되지 않게 한다.
    const stop = (event: Event) => event.stopPropagation();
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel']) this.root.addEventListener(type, stop);
    // 포인터 클릭 후 버튼에 남은 포커스를 돌려주고, 이동 키는 Phaser까지 전달한다.
    header.addEventListener('pointerup', () => header.blur());
    this.root.addEventListener('keydown', event => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        header.blur();
      }
    });
    document.body.append(this.root);
    const position = () => {
      const rect = scene.game.canvas.getBoundingClientRect();
      const scale = rect.width / scene.scale.width;
      this.root.hidden = !visible();
      this.root.style.left = `${rect.right - 390 * scale}px`;
      this.root.style.top = `${rect.top + 115 * scale}px`;
      this.root.style.transform = `scale(${scale})`;
    };
    position();
    scene.game.events.on(Phaser.Core.Events.POST_STEP, position);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.POST_STEP, position);
      this.root.remove();
    });
  }
}
