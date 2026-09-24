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

const BLOCKED_AREAS: BlockedArea[] = [
  // 위쪽 냉장고 / 벽
  {
    name: 'top-fridge-wall',
    left: 80,
    top: 0,
    width: 1760,
    height: 210,
  },

  // 왼쪽 계산대
  {
    name: 'checkout-counter',
    left: 65,
    top: 690,
    width: 410,
    height: 220,
  },

  // 가운데 왼쪽 진열대
  {
    name: 'center-shelf-left',
    left: 655,
    top: 240,
    width: 110,
    height: 390,
  },

  // 가운데 오른쪽 진열대
  {
    name: 'center-shelf-right',
    left: 1150,
    top: 240,
    width: 110,
    height: 390,
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
    left: 1490,
    top: 750,
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
    top: 910,
    width: 780,
    height: 160,
  },

  // 아래쪽 벽 - 입구 오른쪽
  {
    name: 'bottom-wall-right',
    left: 1110,
    top: 910,
    width: 810,
    height: 160,
  },

  // 출입문 아래쪽 경계
  {
    name: 'entrance-bottom',
    left: 770,
    top: 870,
    width: 380,
    height: 200,
  },
];

export class ConvenienceStoreScene extends Phaser.Scene {
  private player!: Player;

  // 양점장 2D 캐릭터
  private managerYang!: Phaser.GameObjects.Image;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];

  // =========================
  // 양점장 상호작용
  // =========================

  private npcInteractZone!: Phaser.GameObjects.Zone;
  private npcInteractText!: Phaser.GameObjects.Text;
  private stageInfoPanel!: StageInfoPanel;

  // =========================
  // 편의점 출입문 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;
  private storeExit!: Phaser.GameObjects.Zone;
  private exitText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.ConvenienceStore);
  }

  private returnPosition?: { x: number; y: number };

  init(data: { returnPosition?: { x: number; y: number } } = {}): void {
    this.returnPosition = data.returnPosition;
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
      0.9,
      450
    );

    // 플레이어를 양점장보다 앞에 표시
    this.player.setDepth(6000);

    if (this.returnPosition) {
      this.player.setPosition(width * this.returnPosition.x, height * this.returnPosition.y);
    }

    // =========================
    // 양점장 2D 캐릭터 생성
    // =========================

    this.managerYang = this.add.image(
      width * (450 / SOURCE_WIDTH),
      height * (280 / SOURCE_HEIGHT),
      'manager-yang-2d'
    );

    // 플레이어와 동일한 배율
    this.managerYang.setScale(0.9);

    // 캐릭터 표시 순서
    this.managerYang.setDepth(1);

    // =========================
    // 양점장 상호작용 영역
    // 출입문과 동일한 180 × 110 크기
    // =========================

    this.npcInteractZone = this.add.zone(
      this.managerYang.x,
      this.managerYang.y + height * (100 / SOURCE_HEIGHT),
      width * (180 / SOURCE_WIDTH),
      height * (110 / SOURCE_HEIGHT)
    );

    // 플레이어가 가까이 왔는지 확인하는 감지 영역
    this.physics.add.existing(this.npcInteractZone, true);

    // =========================
    // 양점장 근처 [F] 안내
    // =========================

    this.npcInteractText = this.add
      .text(
        this.managerYang.x + width * (80 / SOURCE_WIDTH),
        this.managerYang.y - height * (15 / SOURCE_HEIGHT),
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
    // 스테이지 1 정보창 생성
    // =========================

    this.stageInfoPanel = new StageInfoPanel(this, {
      stageTitle: 'STAGE 1',
      npcName: '양점장',
      description:
        '편의점 아르바이트를 시작하기 위해\n' +
        '양점장과 대화하고 협상을 진행하세요.',

      onStart: () => {
        this.scene.start(SceneKey.Negotiation1, {
          npcId: 'store_owner_yang',
          stageId: 1,
          returnTo: { scene: SceneKey.ConvenienceStore, position: {
            x: this.player.x / width, y: this.player.y / height,
          } },
        });
      },
    });
  }

  update(): void {
    // =========================
    // 정보창이 열려 있으면 이동 중지
    // =========================

    if (this.stageInfoPanel.isOpen) {
      this.player.setVelocity(0, 0);

      this.npcInteractText.setVisible(false);
      this.exitText.setVisible(false);

      return;
    }

    this.player.update();

    // =========================
    // 양점장 상호작용 영역 확인
    // =========================

    const nearNpc = this.physics.overlap(
      this.player,
      this.npcInteractZone
    );

    // 양점장 근처에서만 [F] 표시
    this.npcInteractText.setVisible(nearNpc);

    // =========================
    // 기존 출입문 상호작용 영역 확인
    // =========================

    const nearExit = this.physics.overlap(
      this.player,
      this.storeExit
    );

    this.exitText.setVisible(nearExit && !nearNpc);

    // F키가 눌린 순간 한 번만 확인
    const pressedF =
      Phaser.Input.Keyboard.JustDown(this.interactKey);

    // =========================
    // 양점장과 상호작용
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