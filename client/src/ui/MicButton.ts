import Phaser from 'phaser';

/** 마이크 버튼 — 누르는 동안 녹음(push-to-talk), 상태별 시각 피드백. */
export class MicButton extends Phaser.GameObjects.Container {
  private buttonText: Phaser.GameObjects.Text;
  private isDisabled = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    onClick: () => void
  ) {
    super(scene, x, y);

    scene.add.existing(this);

    this.buttonText = scene.add.text(
      0,
      0,
      '🎤 말하기',
      {
        fontSize: '30px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: {
          x: 20,
          y: 10,
        },
      }
    );

    this.buttonText.setOrigin(0.5);

    this.buttonText.setInteractive({
      useHandCursor: true,
    });

    this.buttonText.on('pointerdown', () => {
      if (this.isDisabled) {
        return;
      }

      onClick();
    });

    this.add(this.buttonText);
  }

  /** 녹음 상태 표시 */
  setRecording(on: boolean): void {
    if (on) {
      this.buttonText.setText('🎤 듣는 중...');
      return;
    }

    this.buttonText.setText('🎤 말하기');
  }

  /** 음성 인식 실패 후 재시도 상태 */
  setRetry(): void {
    this.buttonText.setText('🎤 다시 말하기');
  }

  /** 서버 응답 대기 중에는 입력을 막는다 */
  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;

    if (disabled) {
      this.buttonText.disableInteractive();
      this.buttonText.setAlpha(0.5);
      return;
    }

    this.buttonText.setInteractive({
      useHandCursor: true,
    });

    this.buttonText.setAlpha(1);
  }
}