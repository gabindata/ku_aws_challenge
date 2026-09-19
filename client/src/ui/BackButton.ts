
import Phaser from 'phaser';

export class BackButton {
  public readonly button: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    onClick: () => void,
    x: number = 30,
    y: number = 25
  ) {
    this.button = scene.add
      .text(
        x,
        y,
        '← 뒤로가기',
        {
          fontFamily: 'YPairing',
          fontStyle: 'bold',
          fontSize: '24px',
          color: '#ffffff',
          backgroundColor: '#00000099',
          padding: {
            x: 14,
            y: 10,
          },
        }
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10001)
      .setInteractive({
        useHandCursor: true,
      });

    this.button.on('pointerdown', onClick);

    this.button.on('pointerover', () => {
      this.button.setAlpha(0.8);
    });

    this.button.on('pointerout', () => {
      this.button.setAlpha(1);
    });
  }
}