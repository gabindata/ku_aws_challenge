import Phaser from 'phaser';

/** 협상 화면의 남은 시간 표시 UI */
export class TimerDisplay extends Phaser.GameObjects.Container {
  private labelText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number
  ) {
    super(scene, x, y);

    scene.add.existing(this);

    // 배경
    const background = scene.add.rectangle(
      0,
      0,
      220,
      90,
      0x000000,
      0.75
    );

    background.setStrokeStyle(2, 0xffffff);

    // "남은 시간"
    this.labelText = scene.add.text(
      0,
      -22,
      '남은 시간',
      {
        fontSize: '20px',
        color: '#cccccc',
      }
    );

    this.labelText.setOrigin(0.5);

    // 실제 시간
    this.timeText = scene.add.text(
      0,
      16,
      '10:00',
      {
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
      }
    );

    this.timeText.setOrigin(0.5);

    this.add([
      background,
      this.labelText,
      this.timeText,
    ]);

    this.setDepth(30);
  }

  /** 서버가 준 남은 시간을 화면에 표시 */
  setRemainingSeconds(seconds: number): void {
    const safeSeconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(safeSeconds / 60);
    const remaining = safeSeconds % 60;

    const formatted = `${minutes}:${remaining
      .toString()
      .padStart(2, '0')}`;

    this.timeText.setText(formatted);

    // 30초 이하
    if (safeSeconds <= 30) {
      this.timeText.setColor('#ff5555');
      return;
    }

    // 2분 이하
    if (safeSeconds <= 120) {
      this.timeText.setColor('#ffcc55');
      return;
    }

    this.timeText.setColor('#ffffff');
  }
}