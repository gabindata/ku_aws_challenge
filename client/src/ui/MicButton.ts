import Phaser from 'phaser';

/** 이미지 마이크 버튼. 입력 잠금 및 녹음 상태는 기존 협상 흐름을 따른다. */
export class MicButton extends Phaser.GameObjects.Container {
  private icon: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private isDisabled = false;
  constructor(scene: Phaser.Scene, x: number, y: number, onClick: () => void) {
    super(scene, x, y);
    scene.add.existing(this);
    this.icon = scene.add.image(0, -8, 'mic-button').setDisplaySize(100, 100)
      .setInteractive({ useHandCursor: true });
    this.label = scene.add.text(0, 50, '말하기', {
      fontFamily: 'YPairing', fontSize: '23px', color: '#ffffff', stroke: '#172332', strokeThickness: 4,
    }).setOrigin(0.5, 0);
    this.icon.on('pointerdown', () => { if (!this.isDisabled) onClick(); });
    this.add([this.icon, this.label]);
    this.setDepth(40);
  }
  setRecording(on: boolean): void {
    this.label.setText(on ? '듣는 중...' : '말하기');
    if (on) this.icon.setTint(0x90e6ff); else this.icon.clearTint();
  }
  setRetry(): void { this.label.setText('다시 말하기'); }
  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    if (disabled) this.icon.disableInteractive();
    else this.icon.setInteractive({ useHandCursor: true });
    this.setAlpha(disabled ? 0.55 : 1);
  }
}
