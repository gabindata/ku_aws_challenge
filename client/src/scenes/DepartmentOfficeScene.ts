import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';
import { StageInfoPanel } from '../ui/StageInfoPanel';

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
    height: 140,
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
    width: 100,
    height: 165,
  },

  // =========================
  // 중앙 책상
  // =========================

  // 책상 본체 및 아래쪽 의자
  {
    name: 'office-desks',
    left: 410,
    top: 445,
    width: 990,
    height: 260,
  },

  // =========================
  // 위쪽 의자 3개
  // =========================

  // 왼쪽 의자
  {
    name: 'top-chair-left',
    left: 530,
    top: 370,
    width: 70,
    height: 70,
  },

  // 가운데 의자
  {
    name: 'top-chair-center',
    left: 860,
    top: 370,
    width: 70,
    height: 70,
  },

  // 오른쪽 의자
  {
    name: 'top-chair-right',
    left: 1200,
    top: 370,
    width: 70,
    height: 70,
  },

  // =========================
  // 칸막이
  // =========================

  {
    name: 'left-partition',
    left: 720,
    top: 410,
    width: 20,
    height: 45,
  },

  {
    name: 'right-partition',
    left: 1070,
    top: 410,
    width: 20,
    height: 45,
  },

  // =========================
  // 오른쪽 아래 가구
  // =========================

  // 오른쪽 아래 화분
  {
    name: 'lower-right-plant',
    left: 1750,
    top: 785,
    width: 100,
    height: 195,
  },
];

export class DepartmentOfficeScene extends Phaser.Scene {
  private player!: Player;

  // 한조교 2D 캐릭터
  private assistantHan!: Phaser.GameObjects.Image;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  // =========================
  // 한조교 상호작용
  // =========================

  private npcInteractZone!: Phaser.GameObjects.Zone;
  private npcInteractText!: Phaser.GameObjects.Text;
  private stageInfoPanel!: StageInfoPanel;

  // =========================
  // 오른쪽 출입문 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;
  private officeExit!: Phaser.GameObjects.Zone;
  private exitText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.DepartmentOffice);
  }

  private returnPosition?: { x: number; y: number };

  init(data: { returnPosition?: { x: number; y: number } } = {}): void {
    this.returnPosition = data.returnPosition;
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
      'down-idle',
      0.9,
      450
    );

    if (this.returnPosition) {
      this.player.setPosition(width * this.returnPosition.x, height * this.returnPosition.y);
    }

    // =========================
    // 한조교 2D 캐릭터 생성
    // =========================

    this.assistantHan = this.add.image(
      width * (220 / SOURCE_WIDTH),
      height * (400 / SOURCE_HEIGHT),
      'assistant-han-2d'
    );

    // 플레이어와 동일한 표시 크기
    this.assistantHan.setDisplaySize(
      256 * 0.9,
      256 * 0.9
    );

    // 한조교의 Y좌표를 기준으로 표시 순서 설정
    this.assistantHan.setDepth(
      this.assistantHan.y
    );

    // =========================
    // 한조교 물리 충돌 영역 생성
    // =========================

    // 한조교를 움직이지 않는 고정 충돌체로 등록
    this.physics.add.existing(
      this.assistantHan,
      true
    );

    const hanBody =
      this.assistantHan.body as Phaser.Physics.Arcade.StaticBody;

    // 기존 충돌 영역 크기 유지
    hanBody.setSize(
      35,
      1
    );

    // 기존 충돌 영역 위치 유지
    hanBody.setOffset(
      (this.assistantHan.width - 70) / 2,
      this.assistantHan.height - 110
    );

    // 플레이어와 한조교 충돌
    this.physics.add.collider(
      this.player,
      this.assistantHan
    );

    // =========================
    // 한조교 상호작용 영역
    // 양점장과 동일한 180 × 110 크기
    // =========================

    // 한조교 앞·뒤·양옆에서 상호작용할 수 있도록 감지 영역 확대
    this.npcInteractZone = this.add.zone(
      this.assistantHan.x,
      this.assistantHan.y,
      width * (280 / SOURCE_WIDTH),
      height * (280 / SOURCE_HEIGHT)
    );
    // 가까이 왔는지 확인하는 감지 영역
    this.physics.add.existing(
      this.npcInteractZone,
      true
    );

    // =========================
    // 한조교 근처 [F] 안내
    // =========================

    this.npcInteractText = this.add
      .text(
        // 양점장과 동일하게 오른쪽 볼 옆에 표시
        this.assistantHan.x + width * (80 / SOURCE_WIDTH),
        this.assistantHan.y - height * (15 / SOURCE_HEIGHT),
        '[F]',
        {
          fontFamily: 'YPairing',
          fontStyle: 'bold',
          fontSize: '28px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: {
            x: 10,
            y: 5,
          },
        }
      )
      .setOrigin(0.5)
      .setDepth(10000)
      .setVisible(false);

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

    this.physics.add.existing(
      this.officeExit,
      true
    );

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

    // =========================
    // 스테이지 2 정보창 생성
    // =========================

    this.stageInfoPanel = new StageInfoPanel(this, {
      stageTitle: '스테이지 2 · 학과 사무실',
      npcName: '한조교',
      description: `난이도: Normal

배경
복학 신청 기한이 3일 지났고 포털 신청 메뉴도 닫혔다. 일반휴학 4년이 이번 학기로 만료되어 더 미룰 수 없다.

이번 목표
한조교에게 기한이 지난 복학 신청을 검토받을 방법을 알아보자.

공개 조건
• 복학 신청 기한이 3일 지났다.
• 포털 휴·복학 신청 메뉴는 닫혔다.
• 원칙적으로 이번 학기 복학은 불가능하다.`,

      onStart: () => {
        this.scene.start(SceneKey.Negotiation2, {
          npcId: 'ta_han',
          stageId: 2,
          returnTo: { scene: SceneKey.DepartmentOffice, position: {
            x: this.player.x / width, y: this.player.y / height,
          } },
        });
      },
    });
  }

  update(): void {
    // =========================
    // 정보창이 열려 있으면
    // 플레이어 이동 및 상호작용 중지
    // =========================

    if (this.stageInfoPanel.isOpen) {
      this.player.setVelocity(0, 0);

      this.npcInteractText.setVisible(false);
      this.exitText.setVisible(false);

      return;
    }

    this.player.update();

    // =========================
    // 플레이어와 한조교 앞뒤 관계 설정
    // =========================

    this.player.setDepth(this.player.y);

    // =========================
    // 한조교 상호작용 영역 확인
    // =========================

    const nearNpc = this.physics.overlap(
      this.player,
      this.npcInteractZone
    );

    // 한조교 근처에서만 [F] 표시
    this.npcInteractText.setVisible(nearNpc);

    // =========================
    // 오른쪽 출입문 상호작용 영역 확인
    // =========================

    const nearExit = this.physics.overlap(
      this.player,
      this.officeExit
    );

    // 문 근처에 있을 때만 [F] 표시
    this.exitText.setVisible(nearExit && !nearNpc);

    // F키가 눌린 순간 한 번만 확인
    const pressedF =
      Phaser.Input.Keyboard.JustDown(this.interactKey);

    // =========================
    // 한조교와 상호작용
    // =========================

    if (nearNpc && pressedF) {
      this.player.setVelocity(0, 0);

      this.stageInfoPanel.open();

      this.npcInteractText.setVisible(false);
      this.exitText.setVisible(false);

      return;
    }

    // =========================
    // 출입문과 상호작용
    // =========================

    if (nearExit && pressedF) {
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