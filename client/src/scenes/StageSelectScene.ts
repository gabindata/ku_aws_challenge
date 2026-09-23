
import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';
import { TimeOfDaySystem } from '../systems/TimeOfDaySystem';
import { BackButton } from '../ui/BackButton';

interface BlockedArea {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface InteractionArea {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  npcId: string;
}

const SOURCE_MAP_WIDTH = 1672;
const SOURCE_MAP_HEIGHT = 941;

// =========================
// 충돌 영역
// =========================

const BLOCKED_AREAS: BlockedArea[] = [
  {
    name: 'north-west',
    left: 0,
    top: 0,
    width: 302,
    height: 358,
  },

  // 편의점 통로
  {
    name: 'store-back',
    left: 302,
    top: 0,
    width: 70,
    height: 245,
  },

  {
    name: 'north-center',
    left: 372,
    top: 0,
    width: 693,
    height: 358,
  },

  {
    name: 'north-east-center',
    left: 1190,
    top: 0,
    width: 150,
    height: 358,
  },

  {
    name: 'house-back',
    left: 1345,
    top: 0,
    width: 60,
    height: 270,
  },

  {
    name: 'north-east',
    left: 1407,
    top: 0,
    width: 267,
    height: 358,
  },

  // 학교 입구 주변
  {
    name: 'south-west-left',
    left: 0,
    top: 570,
    width: 670,
    height: 371,
  },

  {
    name: 'school-back',
    left: 640,
    top: 635,
    width: 90,
    height: 306,
  },

  {
    name: 'south-west-right',
    left: 735,
    top: 570,
    width: 355,
    height: 371,
  },

  {
    name: 'south-east',
    left: 1290,
    top: 570,
    width: 391,
    height: 371,
  },
];

// =========================
// 건물 상호작용 영역
// =========================

const INTERACTION_AREAS: InteractionArea[] = [
  { name: 'landlord', x: 1308, y: 387, width: 100, height: 90, npcId: 'landlord' },
  {
    name: 'convenience-store',
    x: 337,
    y: 305,
    width: 100,
    height: 100,
    npcId: 'store_owner_yang',
  },

  {
    name: 'department-office',
    x: 692,
    y: 680,
    width: 110,
    height: 240,
    npcId: 'ta_han',
  },

  {
    name: 'house',
    x: 1373,
    y: 340,
    width: 100,
    height: 100,
    npcId: 'house',
  },
];

export class StageSelectScene extends Phaser.Scene {
  private player!: Player;
  private returnPosition?: { x: number; y: number };

  private timeOfDay!: TimeOfDaySystem;

  private clockText!: Phaser.GameObjects.Text;
  private clockContainer!: Phaser.GameObjects.Container;

  private backButton!: BackButton;

  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];
  private collisionDebugVisible = false;

  // =========================
  // 건물 상호작용
  // =========================

  private interactKey!: Phaser.Input.Keyboard.Key;

  private nearbyNpcId: string | null = null;

  private enterText!: Phaser.GameObjects.Text;

  private interactionZones: {
    zone: Phaser.GameObjects.Zone;
    area: InteractionArea;
  }[] = [];

  // =========================
  // 플레이어 시작 위치
  // =========================

  private spawnAt: 'default' | 'school' | 'store' = 'default';


  constructor() {
    super(SceneKey.StageSelect);
  }

  // 다른 씬에서 전달받은 시작 위치
  init(
    data: {
      returnPosition?: { x: number; y: number };
      spawnAt?: 'default' | 'school' | 'store';
    } = {}
  ): void {
    this.spawnAt = data.spawnAt ?? 'default';
    this.returnPosition = data.returnPosition;
  }

  create(): void {
    const { width, height } = this.scale;

    this.interactionZones = [];

  

    // =========================
    // 기본 배경
    // =========================

    const background = this.add
      .image(
        width / 2,
        height / 2,
        'stage-select-base'
      )
      .setDepth(-100);

    background.setDisplaySize(width, height);

    // =========================
    // 저녁 배경
    // =========================

    const eveningBackground = this.add
      .image(
        width / 2,
        height / 2,
        'stage-select-evening'
      )
      .setDisplaySize(width, height)
      .setDepth(-99)
      .setAlpha(0);

    // =========================
    // 햇빛 효과
    // =========================

    const sunlight = this.add.graphics().setDepth(900);

    sunlight.fillGradientStyle(
      0xffd5a3,
      0xffd5a3,
      0xe7a56f,
      0xe7a56f,
      1,
      0.45,
      0,
      0
    );

    sunlight.fillRect(0, 0, width, height);

    sunlight.setBlendMode(Phaser.BlendModes.SCREEN);

    // =========================
    // 어두운 시간대 효과
    // =========================

    const darkness = this.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x17142f
      )
      .setDepth(901)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    // =========================
    // 시간 시스템
    // =========================

    this.timeOfDay = new TimeOfDaySystem(
      background,
      eveningBackground,
      sunlight,
      darkness
    );

    // 이전 게임 시간 복원
    const savedGameMinutes =
      this.registry.get('gameTimeMinutes');

    if (typeof savedGameMinutes === 'number') {
      this.timeOfDay.setGameMinutes(savedGameMinutes);
    }

    this.registerTimeOfDayTestKeys();

    // =========================
    // 플레이어 시작 위치 결정
    // =========================

    // 기본 입장: 기존 맵 중앙
    // 학교 복도에서 나옴: 학교 건물 입구 앞
    const spawnX =
      this.spawnAt === 'school'
        ? 685
        : this.spawnAt === 'store'
          ? 337  // 편의점 문 앞 X좌표
          : SOURCE_MAP_WIDTH / 2;
    
    const spawnY =
      this.spawnAt === 'school'
        ? 590
        : this.spawnAt === 'store'
          ? 300  // 편의점 문 앞 Y좌표
          : SOURCE_MAP_HEIGHT / 2;

      this.player = new Player(
        this,
        width * (spawnX / SOURCE_MAP_WIDTH),
        height * (spawnY / SOURCE_MAP_HEIGHT),
        'down-idle',
        0.32
      );

    if (this.returnPosition) {
      this.player.setPosition(width * this.returnPosition.x, height * this.returnPosition.y);
    }
    // 집 왼쪽 화단 바로 앞. 원본 맵 좌표 기준으로 배치한다.
    const sx = width / SOURCE_MAP_WIDTH;
    const sy = height / SOURCE_MAP_HEIGHT;
    this.add.image(1308 * sx, 344 * sy, 'landlord-2d')
      .setDisplaySize(82 * sx, 82 * sy).setDepth(2);
    const landlordFeet = this.add.rectangle(1308 * sx, 372 * sy, 24 * sx, 16 * sy, 0, 0);
    this.physics.add.existing(landlordFeet, true);
    this.physics.add.collider(this.player, landlordFeet);
    this.player.setDepth(3);

    // =========================
    // F키 등록
    // =========================

    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.F
    );

    // =========================
    // 상호작용 영역 생성
    // =========================

    this.createInteractionAreas(width, height);

    // =========================
    // 충돌 영역 생성
    // =========================

    this.createCollisionAreas(width, height);

    // =========================
    // 카메라 설정
    // =========================

    this.configureCamera(width, height);

    // =========================
    // 시계 생성
    // =========================

    this.createClock();

    // =========================
    // 시계 아래 뒤로가기 버튼
    // =========================

    this.backButton = new BackButton(
      this,
      () => {
        this.scene.start(SceneKey.MainMenu);
      }
    );

    // 시계와 같은 월드 좌표 기준으로 배치
    this.backButton.button.setScrollFactor(1);

    // 카메라 확대 배율 보정
    this.backButton.button.setScale(
      1 / this.cameras.main.zoom
    );

    // =========================
    // 다른 씬으로 이동할 때 게임 시간 저장
    // =========================

    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      () => {
        this.registry.set(
          'gameTimeMinutes',
          this.timeOfDay.getGameMinutes()
        );
      }
    );
  }

  update(_time: number, delta: number): void {
    this.player.update();

    this.timeOfDay.update(delta);

    this.updateClock();

    // =========================
    // 상호작용 상태 초기화
    // =========================

    this.nearbyNpcId = null;

    this.enterText.setVisible(false);

    // =========================
    // 플레이어가 건물 입구 근처인지 확인
    // =========================

    for (const { zone, area } of this.interactionZones) {
      if (this.physics.overlap(this.player, zone)) {
        this.nearbyNpcId = area.npcId;

        const scaleX =
          this.scale.width / SOURCE_MAP_WIDTH;

        const scaleY =
          this.scale.height / SOURCE_MAP_HEIGHT;

        this.enterText
          .setPosition(
            (area.x + (area.npcId === 'landlord' ? 32 : 0)) * scaleX,
            (area.y - (area.npcId === 'landlord' ? 60 : 65)) * scaleY
          )
          .setVisible(true);

        break;
      }
    }

    // =========================
    // F키로 건물 입장
    // =========================

    if (
      this.nearbyNpcId &&
      Phaser.Input.Keyboard.JustDown(this.interactKey)
    ) {
      switch (this.nearbyNpcId) {
        // 편의점
        case 'store_owner_yang':
          this.scene.start(
            SceneKey.ConvenienceStore,
            {
              npcId: this.nearbyNpcId,
            }
          );
          break;

        // 학교 건물 → 학교 복도
        case 'ta_han':
          this.scene.start(
            SceneKey.SchoolHallway,
            {
              npcId: this.nearbyNpcId,
              spawnAt: 'entrance',
            }
          );
          break;

        case 'house':
          this.scene.start(SceneKey.House, { returnTo: {
            scene: SceneKey.StageSelect,
            position: { x: this.player.x / this.scale.width, y: this.player.y / this.scale.height },
          } });
          break;
        // 집주인 옆 F → 고금자 협상
        case 'landlord':
          this.scene.start(SceneKey.Negotiation3, { npcId: 'landlord', returnTo: {
            scene: SceneKey.StageSelect,
            position: { x: this.player.x / this.scale.width, y: this.player.y / this.scale.height },
          } });
          break;
      }
    }
  }

  // =========================
  // 시간대 및 충돌 테스트 키
  // =========================

  private registerTimeOfDayTestKeys(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) return;

    keyboard.on('keydown-ONE', () => {
      this.timeOfDay.setPreset('day');
    });

    keyboard.on('keydown-TWO', () => {
      this.timeOfDay.setPreset('sunset');
    });

    keyboard.on('keydown-THREE', () => {
      this.timeOfDay.setPreset('night');
    });

    keyboard.on('keydown-T', () => {
      const isAutoPlaying =
        this.timeOfDay.toggleAutoPlay();

      console.info(
        `시간대 자동 진행: ${
          isAutoPlaying ? '켜짐' : '꺼짐'
        }`
      );
    });

    keyboard.on('keydown-C', () => {
      this.toggleCollisionDebug();
    });
  }

  // =========================
  // 건물 상호작용 영역
  // =========================

  private createInteractionAreas(
    worldWidth: number,
    worldHeight: number
  ): void {
    const scaleX =
      worldWidth / SOURCE_MAP_WIDTH;

    const scaleY =
      worldHeight / SOURCE_MAP_HEIGHT;

    // 건물 입구 F 안내
    this.enterText = this.add
    .text(
      0,
      0,
      '[F]',
      {
        fontFamily: 'YPairing',
        fontStyle: 'bold',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: {
          x: 10,
          y: 6,
        },
      }
    )
    .setOrigin(0.5)
    .setDepth(6000)
    .setVisible(false);

    // 건물별 상호작용 영역 생성
    INTERACTION_AREAS.forEach((area) => {
      const x = area.x * scaleX;
      const y = area.y * scaleY;

      const width = area.width * scaleX;
      const height = area.height * scaleY;

      const zone = this.add.zone(
        x,
        y,
        width,
        height
      );

      this.physics.add.existing(zone, true);

      this.interactionZones.push({
        zone,
        area,
      });
    });
  }

  // =========================
  // 충돌 영역 생성
  // =========================

  private createCollisionAreas(
    worldWidth: number,
    worldHeight: number
  ): void {
    const scaleX =
      worldWidth / SOURCE_MAP_WIDTH;

    const scaleY =
      worldHeight / SOURCE_MAP_HEIGHT;

    this.collisionAreas = BLOCKED_AREAS.map(
      (area) => {
        const width = area.width * scaleX;
        const height = area.height * scaleY;

        const blocker = this.add
          .rectangle(
            (area.left + area.width / 2) * scaleX,
            (area.top + area.height / 2) * scaleY,
            width,
            height,
            0xff0000,
            this.collisionDebugVisible ? 0.4 : 0
          )
          .setDepth(1000)
          .setName(`blocked-${area.name}`);

        this.physics.add.existing(
          blocker,
          true
        );

        this.physics.add.collider(
          this.player,
          blocker
        );

        return blocker;
      }
    );
  }

  // =========================
  // 카메라
  // =========================

  private configureCamera(
    worldWidth: number,
    worldHeight: number
  ): void {
    const camera = this.cameras.main;

    camera.setBounds(
      0,
      0,
      worldWidth,
      worldHeight
    );

    camera.setZoom(1.5);

    camera.setRoundPixels(true);

    camera.setDeadzone(280, 180);

    camera.startFollow(
      this.player,
      true,
      0.1,
      0.1
    );
  }

  // =========================
  // 시계 생성
  // =========================

  private createClock(): void {
    const clockBackground = this.add
      .image(0, 0, 'common-panel')
      .setDisplaySize(220, 90)
      .setAlpha(0.8);

    this.clockText = this.add
      .text(
        0,
        0,
        '00:00',
        {
          fontFamily: 'YPairing',
          fontStyle: 'bold',
          fontSize: '32px',
          color: '#ffffff',
          align: 'center',
        }
      )
      .setOrigin(0.5);

    this.clockContainer = this.add.container(
      0,
      0,
      [
        clockBackground,
        this.clockText,
      ]
    );

    this.clockContainer.setDepth(10000);

    // 카메라 확대 배율 보정
    this.clockContainer.setScale(
      1 / this.cameras.main.zoom
    );
  }

  // =========================
  // 시계 및 뒤로가기 버튼 위치 갱신
  // =========================

  private updateClock(): void {
    const totalMinutes =
      this.timeOfDay.getGameMinutes();

    // 30분 단위로 표시
    const displayMinutes =
      Math.floor(totalMinutes / 30) * 30;

    const hour =
      Math.floor(displayMinutes / 60);

    const minute =
      displayMinutes % 60;

    const hourText =
      hour.toString().padStart(2, '0');

    const minuteText =
      minute.toString().padStart(2, '0');

    this.clockText.setText(
      `${hourText}:${minuteText}`
    );

    const camera = this.cameras.main;

    const marginX = 135 / camera.zoom;
    const marginY = 60 / camera.zoom;

    // 시계 고정
    this.clockContainer.setPosition(
      camera.worldView.left + marginX,
      camera.worldView.top + marginY
    );

    // 시계 아래 뒤로가기 버튼 고정
    this.backButton.button.setPosition(
      camera.worldView.left + 45 / camera.zoom,
      camera.worldView.top + 125 / camera.zoom
    );
  }

  // =========================
  // 충돌 영역 표시 전환
  // =========================

  private toggleCollisionDebug(): void {
    this.collisionDebugVisible =
      !this.collisionDebugVisible;

    const collisionAlpha =
      this.collisionDebugVisible ? 0.48 : 0;

    this.collisionAreas.forEach((area) => {
      area.setAlpha(collisionAlpha);
    });
  }
}

