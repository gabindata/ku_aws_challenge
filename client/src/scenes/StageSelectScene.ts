import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';

export class StageSelectScene extends Phaser.Scene {
    private player!: Player;
    
  constructor() {
    super(SceneKey.StageSelect);
  }

  create(): void {
    const { width, height } = this.scale;
  
    const background = this.add.image(
      width / 2,
      height / 2,
      'stage-select-bg'
    );
  
    background.setDisplaySize(width, height);


    this.player = new Player(
        this,
        width / 2,
        height / 2,
        'player',
        0.05
      );

    };

    update(): void {
        this.player.update();
      }

}