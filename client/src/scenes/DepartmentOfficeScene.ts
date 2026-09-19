
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

// 충돌 영역은 유지하고 빨간색 표시만 숨김
const SHOW_COLLISION_DEBUG = false;

const BLOCKED_AREAS: BlockedArea[] = [
  // =========================
  // 벽
  // =========================

  // 위쪽 벽
  {
    name: 'top-wall',
    left: 0,
    top: 0,
    width: 1920,
    height: 175,
  },

  // 왼쪽 벽
  {
    name: 'left-wall',
    left: 0,
    top: 0,
    width: 85,
    height: 1080,
  },

  // 오른쪽 벽
  {
    name: 'right-wall',
    left: 1840,
    top: 0,
    width: 80,
    height: 1080,
  },

  // 아래쪽 벽
  {
    name: 'bottom-wall',
    left: 0,
    top: 970,
    width: 1920,
    height: 120,
  },

  // =========================
  // 위쪽 가구
  // =========================

  // 왼쪽 사물함
  {
    name: 'filing-cabinets',
    left: 155,
    top: 100,
    width: 265,
    height: 134,
  },

  // 서류 보관장
  {
    name: 'document-cabinet',
    left: 450,
    top: 100,
    width: 240,
    height: 134,
  },

  // 중앙 수납장
  {
    name: 'upper-storage',
    left: 1060,
    top: 180,
    width: 225,
    height: 55,
  },

  // 오른쪽 위 화분
  {
    name: 'upper-right-plant',
    left: 1730,
    top: 125,
    width: 100,
    height: 180,
  },

  // =========================
  // 왼쪽 장비
  // =========================

  // 정수기
  {
    name: 'water-dispenser',
    left: 75,
    top: 310,
    width: 95,
    height: 200,
  },

  // 복사기
  {
    name: 'printer',
    left: 70,
    top: 520,
    width: 110,
    height: 165,
  },

  // =========================
  // 중앙 책상
  // =========================

  // 책상 본체 및 아래쪽 의자
  {
    name: 'office-desks',
    left: 385,
    top: 430,
    width: 1030,
    height: 420,
  },

  // =========================
  // 위쪽 의자 3개
  // =========================

  // 왼쪽 의자
  {
    name: 'top-chair-left',
    left: 510,
    top: 345,
    width: 125,
    height: 90,
  },

  // 가운데 의자
  {
    name: 'top-chair-center',
    left: 845,
    top: 345,
    width: 125,
    height: 90,
  },

  // 오른쪽 의자
  {
    name: 'top-chair-right',
    left: 1180,
    top: 345,
    width: 125,
    height: 90,
  },

  // =========================
  // 칸막이
  // =========================

  {
    name: 'left-partition',
    left: 720,
    top: 400,
    width: 20,
    height: 45,
  },

  {
    name: 'right-partition',
    left: 1070,
    top: 400,
    width: 20,
    height: 45,
  },

  // =========================
  // 오른쪽 아래 가구
  // =========================

  // 오른쪽 아래 화분
  {
    name: 'lower-right-plant',
    left: 1740,
    top: 775,
    width: 100,
    height: 195,
  },
];

export class DepartmentOfficeScene extends Phaser.Scene {
  private player!: Player;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  // =========================
  // 오른쪽 출입문 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;
  private officeExit!: Phaser.GameObjects.Zone;
  private exitText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.DepartmentOffice);
  }

  create(): void {
    const { width, height } = this.scale;

    // =========================
    // 학과 사무실 내부 배경
    // =========================

    const background = this.add.image(
      width / 2,
      height / 2,
      'department-office-interior'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 플레이어 생성
    // =========================

    // 오른쪽 통로에서 시작
    this.player = new Player(
      this,
      width * (1740 / SOURCE_WIDTH),
      height * (430 / SOURCE_HEIGHT),
      'player',
      0.08,
      450
    );

    // =========================
    // 충돌 영역 생성
    // =========================

    this.createCollisionAreas(width, height);

    // =========================
    // 오른쪽 출입문 → 학교 복도
    // =========================

    // F키 등록
    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.F
    );

    // 오른쪽 문 바로 앞의 바닥에 감지 영역 배치
    this.officeExit = this.add.zone(
      width * (1800 / SOURCE_WIDTH),
      height * (495 / SOURCE_HEIGHT),
      width * (105 / SOURCE_WIDTH),
      height * (110 / SOURCE_HEIGHT)
    );

    this.physics.add.existing(this.officeExit, true);

    // 오른쪽 문 위에 F 표시
    this.exitText = this.add
      .text(
        width * (1870 / SOURCE_WIDTH),
        height * (450 / SOURCE_HEIGHT),
        '[F]',
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

    // 오른쪽 문 근처인지 확인
    const nearExit = this.physics.overlap(
      this.player,
      this.officeExit
    );

    // 문 근처에 있을 때만 F 표시
    this.exitText.setVisible(nearExit);

    // 문 앞에서 F키를 누르면 학교 복도로 이동
    if (
      nearExit &&
      Phaser.Input.Keyboard.JustDown(this.interactKey)
    ) {
        this.scene.start(SceneKey.SchoolHallway, {
            spawnAt: 'office',
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

          // 충돌 영역 색상
          0xff1744,

          // 빨간색 표시 숨김
          SHOW_COLLISION_DEBUG ? 0.45 : 0
        )
        .setDepth(5000)
        .setName(`blocked-${area.name}`);

      // 고정 충돌체 등록
      this.physics.add.existing(
        blocker,
        true
      );

      // 플레이어와 충돌
      this.physics.add.collider(
        this.player,
        blocker
      );

      return blocker;
    });
  }
}