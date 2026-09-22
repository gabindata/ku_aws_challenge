
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
    height: 93,
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
  // 4. 왼쪽 가구 // 충돌영역 설정안해도 벽때문에 물리적으로 못 감. 
  // 그래서 height:0 으로 설정
  // =========================

  {
    name: 'left-sofa',
    left: 135,
    top: 390,
    width: 225,
    height: 0,
  },

  {
    name: 'left-plant',
    left: 390,
    top: 390,
    width: 65,
    height: 0,
  },

  // =========================
  // 5. 오른쪽 가구
  // 왼쪽 가구와 마찬가지 height:0으로 설정
  // =========================

  {
    name: 'right-sofa',
    left: 1355,
    top: 395,
    width: 205,
    height: 0,
  },

  {
    name: 'right-plant-left',
    left: 1280,
    top: 395,
    width: 65,
    height: 0,
  },

  {
    name: 'right-plant-right',
    left: 1575,
    top: 395,
    width: 65,
    height: 0,
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

  private spawnAt: 'entrance' | 'office' = 'entrance';

  init(data: { spawnAt?: 'entrance' | 'office' } = {}): void {
  this.spawnAt = data.spawnAt ?? 'entrance';
  }

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  // =========================
  // F키 및 문 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;

  // 왼쪽 문: 학과 사무실
  private officeEntrance!: Phaser.GameObjects.Zone;
  private officeEnterText!: Phaser.GameObjects.Text;

  // 위쪽 중앙 유리문: 스테이지 선택 화면
  private hallwayExit!: Phaser.GameObjects.Zone;
  private exitEnterText!: Phaser.GameObjects.Text;

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


    // 이전 화면에 따라 플레이어 시작 위치 결정
    const spawnX =
    this.spawnAt === 'office' ? 155 : 870;

    const spawnY =
    this.spawnAt === 'office' ? 560 : 200;

    this.player = new Player(
    this,
    width * (spawnX / SOURCE_WIDTH),
    height * (spawnY / SOURCE_HEIGHT),
    'down-idle',
    0.64,
    450
    );

    // =========================
    // 충돌 영역 생성
    // =========================

    this.createCollisionAreas(width, height);

    // =========================
    // F키 등록
    // =========================

    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.F
    );

    // =========================
    // 1. 왼쪽 문 → 학과 사무실
    // =========================


    // 왼쪽 학과 사무실 문 바로 앞 감지 영역
    this.officeEntrance = this.add.zone(
        width * (105 / SOURCE_WIDTH),
        height * (545 / SOURCE_HEIGHT),
        width * (75 / SOURCE_WIDTH),
        height * (65 / SOURCE_HEIGHT)
    );
    
    this.physics.add.existing(this.officeEntrance, true);

    // 왼쪽 문 근처에서 표시되는 F
    this.officeEnterText = this.add
      .text(
        width * (45 / SOURCE_WIDTH),
        height * (470 / SOURCE_HEIGHT),
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

    // =========================
    // 2. 위쪽 유리문 → StageSelect
    // =========================

    // 유리문 바로 아래 바닥에 상호작용 영역 배치
    this.hallwayExit = this.add.zone(
      width * (870 / SOURCE_WIDTH),
      height * (165 / SOURCE_HEIGHT),
      width * (110 / SOURCE_WIDTH),
      height * (45 / SOURCE_HEIGHT)
    );

    this.physics.add.existing(
      this.hallwayExit,
      true
    );

    // 위쪽 유리문 근처에서 표시되는 F
    this.exitEnterText = this.add
      .text(
        width * (800 / SOURCE_WIDTH),
        height * (90 / SOURCE_HEIGHT),
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

    // =========================
    // 왼쪽 학과 사무실 문 확인
    // =========================

    const nearOffice = this.physics.overlap(
      this.player,
      this.officeEntrance
    );

    // =========================
    // 위쪽 유리문 확인
    // =========================

    const nearExit = this.physics.overlap(
      this.player,
      this.hallwayExit
    );

    // 각 문 근처에 있을 때만 F 표시
    this.officeEnterText.setVisible(nearOffice);
    this.exitEnterText.setVisible(nearExit);

    // F키를 누르면 해당 문으로 이동
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      // 왼쪽 문 → 학과 사무실
      if (nearOffice) {
        this.scene.start(SceneKey.DepartmentOffice, {
          npcId: 'assistant_han',
        });

        return;
      }

      // 위쪽 유리문 → 스테이지 선택 화면
      if (nearExit) {
        this.scene.start(SceneKey.StageSelect, {
          spawnAt: 'school',
        });
      
        return;
      }
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

          // 충돌 영역 빨간색 표시
          0xff0000,

          // 충돌 영역 투명도
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