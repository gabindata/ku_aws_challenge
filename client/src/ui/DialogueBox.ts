import Phaser from 'phaser';

/** 자막 박스 — NPC 대사와 플레이어 STT 결과를 표시. */
export class DialogueBox extends Phaser.GameObjects.Container {
  setSpeaker(_speaker: 'player' | 'npc'): void {
    // TODO
  }

  /** 한 글자씩 출력하는 타이핑 연출 */
  showText(_text: string): void {
    // TODO
  }
}
