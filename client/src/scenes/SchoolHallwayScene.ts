import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';
import { BackButton } from '../ui/BackButton';

interface BlockedArea {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SOURCE_WIDTH = 1728;
const SOURCE_HEIGHT = 869;

// 충돌 영역은 유지하고 빨간색 표시만 숨김
const SHOW_COLLISION_DEBUG = false;

const BLOCKED_AREAS: BlockedArea[] = [
  // =========================
  // 1. 위쪽 벽
  // =========================

  {
    name: 'upper-left-wall',
    left: 0,
    top: 0,
    width: 625,
    height: 420,
  },

  {
    name: 'upper-right-wall',
    left: 1105,
    top: 0,
    width: 623,
    height: 420,
  },

  // 위쪽 출입문
  {
    name: 'top-entrance',
    left: 680,
    top: 0,
    width: 370,
    height: 135,
  },

  // =========================
  // 2. 중앙 통로 양옆 벽
  // =========================

  {
    name: 'center-left-wall',
    left: 550,
    top: 0,
    width: 75,
    height: 420,
  },

  {
    name: 'center-right-wall',
    left: 1105,
    top: 0,
    width: 75,
    height: 420,
  },

  // =========================
  // 3. 복도 양쪽 끝 벽
  // =========================

  {
    name: 'left-wall',
    left: 0,
    top: 290,
    width: 65,
    height: 510,
  },

  {
    name: 'right-wall',
    left: 1665,
    top: 290,
    width: 63,
    height: 510,
  },

  // =========================
  // 4. 왼쪽 가구
  // =========================

  {
    name: 'left-sofa',
    left: 135,
    top: 430,
    width: 225,
    height: 50,
  },

  {
    name: 'left-plant',
    left: 390,
    top: 390,
    width: 65,
    height: 80,
  },

  // =========================
  // 5. 오른쪽 가구
  // =========================

  {
    name: 'right-sofa',
    left: 1355,
    top: 430,
    width: 205,
    height: 50,
  },

  {
    name: 'right-plant-left',
    left: 1280,
    top: 390,
    width: 65,
    height: 80,
  },

  {
    name: 'right-plant-right',
    left: 1575,
    top: 395,
    width: 65,
    height: 80,
  },

  // =========================
  // 6. 계단 양옆 손잡이
  // =========================

  // 계단 왼쪽 난간
  {
    name: 'stairs-left-railing',
    left: 638,
    top: 600,
    width: 35,
    height: 269,
  },

  // 계단 오른쪽 난간
  {
    name: 'stairs-right-railing',
    left: 1055,
    top: 600,
    width: 35,
    height: 269,
  },

  // =========================
  // 7. 아래쪽 벽
  // =========================

  // 계단 왼쪽 아래 벽
  {
    name: 'bottom-left-wall',
    left: 0,
    top: 760,
    width: 638,
    height: 90,
  },

  // 계단 오른쪽 아래 벽
  {
    name: 'bottom-right-wall',
    left: 1090,
    top: 760,
    width: 638,
    height: 90,
  },

  // 계단 아래 검은색 영역 진입 방지
  {
    name: 'stairs-bottom-boundary',
    left: 638,
    top: 835,
    width: 452,
    height: 34,
  },
];

export class SchoolHallwayScene extends Phaser.Scene {
  private player!: Player;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super(SceneKey.SchoolHallway);
  }

  create(): void {
    const { width, height } = this.scale;

    // =========================
    // 학교 복도 배경
    // =========================

    const background = this.add.image(
      width / 2,
      height / 2,
      'school-hallway-interior'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 플레이어 생성
    // =========================

    // 사진 기준 위쪽 출입문 바로 앞에서 시작
    this.player = new Player(
      this,
      width * (870 / SOURCE_WIDTH),
      height * (200 / SOURCE_HEIGHT),
      'player',
      0.08,
      450
    );

    // =========================
    // 충돌 영역 생성
    // =========================

    this.createCollisionAreas(width, height);

    // =========================
    // 뒤로가기 버튼
    // =========================

    new BackButton(
      this,
      () => {
        this.scene.start(SceneKey.StageSelect);
      }
    );
  }

  update(): void {
    this.player.update();
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