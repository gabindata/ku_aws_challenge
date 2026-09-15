import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';

export class ConvenienceStoreScene extends Phaser.Scene {
  private player!: Player;

  constructor() {
    super(SceneKey.ConvenienceStore);
  }

  create(): void {
    const { width, height } = this.scale;

    // 편의점 내부 배경
    const background = this.add.image(
      width / 2,
      height / 2,
      'convenience-store-interior'
    );

    background.setDisplaySize(width, height);

    // 플레이어 생성
    this.player = new Player(
      this,
      width / 2,
      height - 180,
      'player',
      0.045
    );
  }

  update(): void {
    this.player.update();
  }
}