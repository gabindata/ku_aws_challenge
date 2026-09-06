import Phaser from 'phaser';

/** 자막 박스 — NPC 대사와 플레이어 STT 결과를 표시. */
export class DialogueBox extends Phaser.GameObjects.Container {
  private box: Phaser.GameObjects.Rectangle;
  private speakerText: Phaser.GameObjects.Text;
  private dialogueText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number
  ) {
    super(scene, x, y);

    scene.add.existing(this);

    // 대화창 배경
    this.box = scene.add.rectangle(
      0,
      0,
      width,
      150,
      0x000000,
      0.75
    );

    this.box.setStrokeStyle(3, 0xffffff);

    // 화자 이름
    this.speakerText = scene.add.text(
      -width / 2 + 40,
      -65,
      '양점장',
      {
        fontSize: '28px',
        color: '#ffff66',
        fontStyle: 'bold',
      }
    );

    // 대사 내용
    this.dialogueText = scene.add.text(
      -width / 2 + 40,
      -20,
      '어서 와요. 무슨 일로 왔어요?',
      {
        fontSize: '26px',
        color: '#ffffff',
        wordWrap: {
          width: width - 80,
        },
      }
    );

    this.add([
      this.box,
      this.speakerText,
      this.dialogueText,
    ]);

    this.setDepth(20);
  }

  /** 현재 화자 변경 */
  setSpeaker(speaker: 'player' | 'npc' | 'system'): void {
    if (speaker === 'player') {
      this.speakerText.setText('나');
      this.speakerText.setColor('#66ccff');
      return;
    }

    if (speaker === 'npc') {
      this.speakerText.setText('양점장');
      this.speakerText.setColor('#ffff66');
      return;
    }

    this.speakerText.setText('시스템');
    this.speakerText.setColor('#ff7777');
  }

  /** 대사 내용 표시 */
  showText(text: string): void {
    this.dialogueText.setText(text);
  }

  /** 대기 상태 표시 */
  showThinking(): void {
    this.dialogueText.setText('...');
  }
}