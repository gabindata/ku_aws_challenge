
import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';

interface BlockedArea {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SOURCE_WIDTH = 1920;
const SOURCE_HEIGHT = 1080;

const BLOCKED_AREAS: BlockedArea[] = [
  // 위쪽 냉장고 / 벽
  {
    name: 'top-fridge-wall',
    left: 80,
    top: 40,
    width: 1760,
    height: 220,
  },

  // 왼쪽 계산대
  {
    name: 'checkout-counter',
    left: 65,
    top: 675,
    width: 430,
    height: 220,
  },

  // 가운데 왼쪽 진열대
  {
    name: 'center-shelf-left',
    left: 635,
    top: 267,
    width: 160,
    height: 430,
  },

  // 가운데 오른쪽 진열대
  {
    name: 'center-shelf-right',
    left: 1120,
    top: 267,
    width: 160,
    height: 430,
  },

  // 오른쪽 벽 진열대
  {
    name: 'right-wall-shelf',
    left: 1740,
    top: 180,
    width: 130,
    height: 520,
  },

  // 오른쪽 냉동고
  {
    name: 'right-freezer',
    left: 1470,
    top: 730,
    width: 400,
    height: 170,
  },

  // 왼쪽 벽
  {
    name: 'left-wall',
    left: 0,
    top: 0,
    width: 70,
    height: 1080,
  },

  // 오른쪽 벽
  {
    name: 'right-wall',
    left: 1870,
    top: 0,
    width: 50,
    height: 1080,
  },

  // 아래쪽 벽 - 입구 왼쪽
  {
    name: 'bottom-wall-left',
    left: 0,
    top: 890,
    width: 780,
    height: 160,
  },

  // 아래쪽 벽 - 입구 오른쪽
  {
    name: 'bottom-wall-right',
    left: 1110,
    top: 890,
    width: 810,
    height: 160,
  },

  // 출입문 아래쪽 경계
  {
    name: 'entrance-bottom',
    left: 770,
    top: 850,
    width: 380,
    height: 200,
  },
];

export class ConvenienceStoreScene extends Phaser.Scene {
  private player!: Player;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  // =========================
  // 편의점 출입문 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;
  private storeExit!: Phaser.GameObjects.Zone;
  private exitText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.ConvenienceStore);
  }

  create(): void {
    const { width, height } = this.scale;

    // =========================
    // 편의점 내부 배경
    // =========================

    const background = this.add.image(
      width / 2,
      height / 2,
      'convenience-store-interior'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 플레이어 생성
    // =========================

    this.player = new Player(
      this,
      width * (960 / SOURCE_WIDTH),
      height * (720 / SOURCE_HEIGHT),
      'down-idle',
      0.64,
      450
    );

    // =========================
    // 충돌 영역 생성
    // =========================

    this.createCollisionAreas(width, height);

    // =========================
    // 출입문 → 스테이지 선택 화면
    // =========================

    // F키 등록
    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.F
    );

    // 출입문 바로 앞 바닥에 감지 영역 배치
    this.storeExit = this.add.zone(
      width * (960 / SOURCE_WIDTH),
      height * (790 / SOURCE_HEIGHT),
      width * (180 / SOURCE_WIDTH),
      height * (110 / SOURCE_HEIGHT)
    );

    this.physics.add.existing(this.storeExit, true);

    // 출입문 위에 F 표시
    this.exitText = this.add
      .text(
        width * (960 / SOURCE_WIDTH),
        height * (920 / SOURCE_HEIGHT),
        'F',
        {
          fontFamily: 'YPairing',
          fontStyle: 'bold',
          fontSize: '32px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: {
            x: 12,
            y: 6,
          },
        }
      )
      .setOrigin(0.5)
      .setDepth(10000)
      .setVisible(false);
  }

  update(): void {
    this.player.update();

    // 출입문 근처인지 확인
    const nearExit = this.physics.overlap(
      this.player,
      this.storeExit
    );

    // 출입문 근처에서만 F 표시
    this.exitText.setVisible(nearExit);

    // 출입문 앞에서 F키를 누르면 스테이지 선택 화면으로 이동
    if (
      nearExit &&
      Phaser.Input.Keyboard.JustDown(this.interactKey)
    ) {
      this.scene.start(SceneKey.StageSelect, {
        spawnAt: 'store',
      });
    }
  }

  private createCollisionAreas(
    worldWidth: number,
    worldHeight: number
  ): void {
    const scaleX = worldWidth / SOURCE_WIDTH;
    const scaleY = worldHeight / SOURCE_HEIGHT;

    this.collisionAreas = BLOCKED_AREAS.map((area) => {
      const width = area.width * scaleX;
      const height = area.height * scaleY;

      const blocker = this.add
        .rectangle(
          (area.left + area.width / 2) * scaleX,
          (area.top + area.height / 2) * scaleY,
          width,
          height,

          // 충돌 영역은 보이지 않게 유지
          0xff0000,
          0
        )
        .setDepth(5000)
        .setName(`blocked-${area.name}`);

      // 고정 충돌체 등록
      this.physics.add.existing(blocker, true);

      // 플레이어와 충돌
      this.physics.add.collider(
        this.player,
        blocker
      );

      return blocker;
    });
  }
}