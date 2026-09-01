/** 플레이어 측 상태(발화 중 여부 등). 화면에 그려질 요소가 적어 얇게 유지한다. */
import Phaser from 'phaser';


//  player 이동

export class Player extends Phaser.Physics.Arcade.Sprite {

  private speed = 300;

  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };


  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    scale: number

  ) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(scale);
    this.setCollideWorldBounds(true);

    this.keys = scene.input.keyboard!.addKeys(
      'W,A,S,D'
    ) as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };
  }

  update(): void {
    this.setVelocity(0);

    if (this.keys.A.isDown) {
      this.setVelocityX(-this.speed);
    }

    if (this.keys.D.isDown) {
      this.setVelocityX(this.speed);
    }

    if (this.keys.W.isDown) {
      this.setVelocityY(-this.speed);
    }

    if (this.keys.S.isDown) {
      this.setVelocityY(this.speed);
    }
  }
}