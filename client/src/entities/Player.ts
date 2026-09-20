
import Phaser from 'phaser';

type Direction = 'down' | 'up' | 'left' | 'right';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private speed = 300;

  // 각 씬에서 전달받은 캐릭터 배율
  private readonly playerScale: number;

  // 모든 사람 캐릭터 이미지를 256×256px 기준으로 표시
  private readonly baseImageSize = 256;

  // 256×256px 이미지 기준 캐릭터 몸체 전체 충돌 영역
  private readonly collisionWidth = 150;
  private readonly collisionHeight = 210;
  private readonly collisionBottomOffset = 10;

  // 마지막으로 바라본 방향
  private lastDirection: Direction = 'down';

  // 사람 캐릭터인지 확인
  private readonly isHumanPlayer: boolean;

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
    scale: number,
    speed: number = 300
  ) {
    super(scene, x, y, texture);

    this.speed = speed;
    this.playerScale = scale;

    // 새 사람 캐릭터인지 확인
    this.isHumanPlayer = texture === 'down-idle';

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 캐릭터 크기 및 충돌 영역 설정
    this.updatePlayerSize();

    this.setCollideWorldBounds(true);
    this.setDepth(0);

    // WASD 키 등록
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
    // 기존 이동속도 초기화
    this.setVelocity(0);

    // 이번 프레임에 이동하는 방향
    let movingDirection: Direction | null = null;

    // =========================
    // 좌우 이동
    // =========================

    if (this.keys.A.isDown) {
      this.setVelocityX(-this.speed);
      movingDirection = 'left';
    }

    if (this.keys.D.isDown) {
      this.setVelocityX(this.speed);
      movingDirection = 'right';
    }

    // =========================
    // 상하 이동
    // =========================

    if (this.keys.W.isDown) {
      this.setVelocityY(-this.speed);
      movingDirection = 'up';
    }

    if (this.keys.S.isDown) {
      this.setVelocityY(this.speed);
      movingDirection = 'down';
    }

    // 대각선 이동속도 보정
    const velocity = this.body?.velocity;

    if (velocity && velocity.lengthSq() > 0) {
      velocity.normalize().scale(this.speed);
    }

    // =========================
    // 사람 캐릭터 걷기 모션
    // =========================

    if (this.isHumanPlayer) {
      if (movingDirection) {
        // 이동 중: 해당 방향 걷기 모션 반복
        this.lastDirection = movingDirection;

        this.anims.play(
          `walk-${movingDirection}`,
          true
        );
      } else {
        // 정지: 마지막으로 바라본 방향의 정지 이미지
        this.anims.stop();

        const idleTexture = `${this.lastDirection}-idle`;

        if (this.texture.key !== idleTexture) {
          this.setTexture(idleTexture);
        }
      }

      // 이미지가 바뀌어도 표시 크기와 충돌 영역 유지
      this.updatePlayerSize();
    }
  }

  // =========================
  // 캐릭터 크기 및 충돌 영역 설정
  // =========================

  private updatePlayerSize(): void {
    if (!this.isHumanPlayer) {
      // 기존 너구리는 전달받은 배율 그대로 적용
      this.setScale(this.playerScale);
      return;
    }

    const imageWidth = this.width;
    const imageHeight = this.height;

    // =========================
    // 캐릭터 표시 크기
    // =========================

    // PNG 원본 크기가 달라도 동일한 표시 크기로 맞춤
    const targetSize =
      this.baseImageSize * this.playerScale;

    this.setDisplaySize(
      targetSize,
      targetSize
    );

    // =========================
    // 실제 충돌 영역
    // =========================

    const body = this.body as Phaser.Physics.Arcade.Body;

    // 원본 PNG 크기에 비례하여 충돌 영역 설정
    const bodyWidth =
      imageWidth *
      (this.collisionWidth / this.baseImageSize);

    const bodyHeight =
      imageHeight *
      (this.collisionHeight / this.baseImageSize);

    // 캐릭터 몸체 전체를 감싸는 충돌 영역
    body.setSize(
      bodyWidth,
      bodyHeight
    );

    // 충돌 영역을 이미지 중앙에 배치하고
    // 이미지 맨 아래의 투명 여백은 일부 제외
    body.setOffset(
      (imageWidth - bodyWidth) / 2,
      imageHeight -
        bodyHeight -
        imageHeight *
          (this.collisionBottomOffset / this.baseImageSize)
    );
  }
}