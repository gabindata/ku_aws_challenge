/** 플레이어 측 상태(발화 중 여부 등). 화면에 그려질 요소가 적어 얇게 유지한다. */
import Phaser from 'phaser';


//  player 이동

export class Player extends Phaser.Physics.Arcade.Sprite {

  private speed = 300;
  private readonly groundShadow: Phaser.GameObjects.Ellipse;

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

    // 긴 투영 그림자 대신 시간대와 관계없이 읽히는 짧은 접지 그림자를 사용한다.
    this.groundShadow = scene.add
      .ellipse(
        x,
        y + this.displayHeight * 0.38,
        Math.max(14, this.displayWidth * 0.56),
        Math.max(6, this.displayHeight * 0.14),
        0x111424,
        0.3
      )
      .setDepth(-1);

    this.setDepth(0);
    this.once('destroy', () => this.groundShadow.destroy());

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

    const velocity = this.body?.velocity;
    if (velocity && velocity.lengthSq() > 0) {
      velocity.normalize().scale(this.speed);
    }

    this.groundShadow.setPosition(
      this.x,
      this.y + this.displayHeight * 0.38
    );
  }
}
