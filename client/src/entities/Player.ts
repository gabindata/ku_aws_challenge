
import Phaser from 'phaser';

type Direction = 'down' | 'up' | 'left' | 'right';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private speed = 300;

  // 각 씬에서 전달받은 캐릭터 배율
  private readonly playerScale: number;

  // 모든 사람 캐릭터 이미지 크기
  private readonly baseImageSize = 256;

  // 256×256 이미지 기준 캐릭터 몸체 충돌 영역
  private readonly collisionWidth = 150;
  private readonly collisionHeight = 210;
  // 플레이어 충돌 영역 빨간색 표시
private collisionDebug!: Phaser.GameObjects.Graphics;
  private readonly collisionBottomOffset = 10;

  // 마지막으로 바라본 방향
  private lastDirection: Direction = 'down';

  // 사람 캐릭터인지 확인
  private readonly isHumanPlayer: boolean;

  // WASD 키
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

    // 사람 캐릭터인지 확인
    this.isHumanPlayer = texture === 'down-idle';

    // 씬에 캐릭터 추가
    scene.add.existing(this);

    // Arcade Physics 적용
    scene.physics.add.existing(this);

    // 캐릭터 크기 및 충돌 영역 설정
    // 생성 시 한 번만 실행
    this.updatePlayerSize();

    // 플레이어 충돌 영역 표시용 그래픽 생성
this.collisionDebug = scene.add.graphics();

this.collisionDebug.setDepth(9999);

    // 월드 경계 충돌
    this.setCollideWorldBounds(true);

    // 캐릭터 깊이
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

  // =========================
  // 플레이어 이동 및 애니메이션
  // =========================

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

    // =========================
    // 대각선 이동속도 보정
    // =========================

    const velocity = this.body?.velocity;

    if (velocity && velocity.lengthSq() > 0) {
      velocity.normalize().scale(this.speed);
    }

    // =========================
    // 사람 캐릭터 애니메이션
    // =========================

    if (this.isHumanPlayer) {

      // 이동 중
      if (movingDirection) {

        this.lastDirection = movingDirection;

        const animationKey = `walk-${movingDirection}`;

        // 현재 애니메이션과 이동 방향이 다르거나
        // 애니메이션이 정지했을 때만 새로 재생
        if (
          this.anims.currentAnim?.key !== animationKey ||
          !this.anims.isPlaying
        ) {
          this.anims.play(animationKey);
        }

      } else {

        // =========================
        // 정지 상태
        // =========================

        // 걷기 애니메이션 정지
        if (this.anims.isPlaying) {
          this.anims.stop();
        }

        // 마지막으로 바라본 방향의 정지 이미지
        const idleTexture =
          `${this.lastDirection}-idle`;

        if (this.texture.key !== idleTexture) {
          this.setTexture(idleTexture);
        }
      }
    }

        // =========================
    // 플레이어 충돌 영역 빨간색 표시
    // =========================

    const body =
      this.body as Phaser.Physics.Arcade.Body;

    // 이전 프레임의 테두리 제거
    this.collisionDebug.clear();

    // 빨간색 테두리 설정
    this.collisionDebug.lineStyle(
      2,
      0xff0000,
      1
    );

    // 실제 충돌 영역 표시
    this.collisionDebug.strokeRect(
      body.x,
      body.y,
      body.width,
      body.height
    );
  }

  // =========================
  // 캐릭터 크기 및 충돌 영역 설정
  // =========================

  private updatePlayerSize(): void {

    // =========================
    // 기존 너구리 캐릭터
    // =========================

    if (!this.isHumanPlayer) {

      // 기존 너구리는 전달받은 배율 그대로 적용
      this.setScale(this.playerScale);

      return;
    }

    // =========================
    // 사람 캐릭터 표시 크기
    // =========================

    // 모든 사람 캐릭터 이미지는 256×256 기준
    const targetSize =
      this.baseImageSize * this.playerScale;

    this.setDisplaySize(
      targetSize,
      targetSize
    );

    // =========================
    // 실제 충돌 영역
    // =========================

    const body =
      this.body as Phaser.Physics.Arcade.Body;

    // 원본 이미지 크기에 비례하여 충돌 영역 설정
    const bodyWidth =
      this.width *
      (this.collisionWidth / this.baseImageSize);

    const bodyHeight =
      this.height *
      (this.collisionHeight / this.baseImageSize);

    // 캐릭터 몸체 전체를 감싸는 충돌 영역
    body.setSize(
      bodyWidth,
      bodyHeight
    );

    // 충돌 영역을 이미지 중앙에 배치하고
    // 이미지 맨 아래의 투명 여백은 일부 제외
    body.setOffset(
      (this.width - bodyWidth) / 2,

      this.height -
        bodyHeight -
        this.height *
          (
            this.collisionBottomOffset /
            this.baseImageSize
          )
    );
  }
}