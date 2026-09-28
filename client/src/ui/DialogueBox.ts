import Phaser from 'phaser';

/** 자막 박스 — NPC 대사와 플레이어 STT 결과를 표시. */
export class DialogueBox extends Phaser.GameObjects.Container {
  private box: Phaser.GameObjects.Image;
  private speakerText: Phaser.GameObjects.Text;
  private dialogueText: Phaser.GameObjects.Text;

  private npcName: string;
  private thinking = false;
  private dots: Phaser.GameObjects.Text[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    npcName: string,
    boxHeight = 170
  ) {
    super(scene, x, y);

    scene.add.existing(this);

    this.npcName = npcName;

    // 대화창 배경
    this.box = scene.add.image(0, 0, 'dialogue-box').setDisplaySize(width, boxHeight);
    const nameplate = scene.add.image(-width / 2 + 140, -boxHeight / 2 - 15, 'dialogue-nameplate').setDisplaySize(250, 80);

    // 화자 이름
    this.speakerText = scene.add.text(
      -width / 2 + 45,
      -boxHeight / 2 - 32,
      this.npcName,
      {
        fontFamily: 'Galmuri11',
        fontSize: '28px',
        color: '#ffff66',
        fontStyle: 'bold',
      }
    );

    // 대사 내용
    this.dialogueText = scene.add.text(
      -width / 2 + 40,
      -boxHeight / 2 + 65,
      '',
      {
        fontFamily: 'Galmuri11',
        fontSize: '26px',
        fontStyle: 'normal',
        color: '#ffffff',
        wordWrap: {
          width: width - 80,
        },
      }
    );

    this.add([
      this.box,
      nameplate,
      this.speakerText,
      this.dialogueText,
    ]);

    const baseY = -boxHeight / 2 + 65;
    this.dots = [0, 1, 2].map(index => {
      const dot = scene.add.text(-width / 2 + 40 + index * 18, baseY, '.', {
        fontFamily: 'Galmuri11', fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
      }).setVisible(false);
      this.add(dot);
      return dot;
    });
    const animate = (time: number) => {
      if (!this.thinking) return;
      this.dots.forEach((dot, index) => dot.setY(baseY + Math.sin(time / 160 - index * 0.85) * 7));
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, animate);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, animate));
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
      this.speakerText.setText(this.npcName);
      this.speakerText.setColor('#ffff66');
      return;
    }

    this.speakerText.setText('시스템');
    this.speakerText.setColor('#ff7777');
  }

  /** 대사 내용 표시 */
  showText(text: string): void {
    this.thinking = false;
    this.dots.forEach(dot => dot.setVisible(false));
    this.dialogueText.setText(text);
  }

  /** 대기 상태 표시 */
  showThinking(): void {
    this.dialogueText.setText('');
    this.thinking = true;
    this.dots.forEach(dot => dot.setVisible(true));
  }
}