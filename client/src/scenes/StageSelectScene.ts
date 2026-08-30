import Phaser from 'phaser';
import { SceneKey } from '../types';

export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.StageSelect);
  }

  create(): void {
    const { width } = this.scale;

    // 제목
    this.add
      .text(width / 2, 120, '스테이지 선택', {
        fontSize: '48px',
        color: '#ffffff',
        fontFamily: 'YPairing',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // 스테이지 1
    this.createStageButton(width / 2, 300, 'STAGE 1', () => {
      console.log('스테이지 1 선택');
    });

    // 스테이지 2
    this.createStageButton(width / 2, 430, 'STAGE 2', () => {
      console.log('스테이지 2 선택');
    });

    // 스테이지 3
    this.createStageButton(width / 2, 560, 'STAGE 3', () => {
      console.log('스테이지 3 선택');
    });

    // 뒤로가기
    this.createStageButton(width / 2, 750, '뒤로가기', () => {
      this.scene.start(SceneKey.MainMenu);
    });
  }

  private createStageButton(
    x: number,
    y: number,
    text: string,
    onClick: () => void
  ): void {
    const button = this.add
      .image(x, y, 'button-default')
      .setDisplaySize(500, 90)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, text, {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'YPairing',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    button.on('pointerover', () => {
      button.setTexture('button-highlight');
    });

    button.on('pointerout', () => {
      button.setTexture('button-default');
    });

    button.on('pointerdown', () => {
      this.sound.play('button-click', {
        volume: 0.4,
      });

      onClick();
    });
  }
}