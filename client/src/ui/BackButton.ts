import Phaser from 'phaser';

export class BackButton {
  constructor(
    scene: Phaser.Scene,
    onClick: () => void
  ) {
    const button = scene.add
      .text(
        30,
        25,
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
      .setDepth(10000)
      .setInteractive({
        useHandCursor: true,
      });

    button.on('pointerdown', () => {
      onClick();
    });

    button.on('pointerover', () => {
      button.setAlpha(0.8);
    });

    button.on('pointerout', () => {
      button.setAlpha(1);
    });
  }
}