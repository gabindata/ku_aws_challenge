import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';
import { TimeOfDaySystem } from '../systems/TimeOfDaySystem';

interface BlockedArea {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SOURCE_MAP_WIDTH = 1672;
const SOURCE_MAP_HEIGHT = 941;

/**
 * 첨부된 충돌 가이드의 빨간 영역. 큰 사각형 사이의 빈 공간만 걸을 수 있다.
 * 좌표는 원본 맵 기준이라 게임 해상도가 바뀌어도 함께 비례 조정된다.
 */
const BLOCKED_AREAS: BlockedArea[] = [
  { name: 'north-west', left: 0, top: 0, width: 302, height: 358 },
  // 편의점 통로는 보도에서 현관까지만 열고 지붕과 뒤쪽은 막는다.
  { name: 'store-back', left: 302, top: 0, width: 70, height: 245 },
  { name: 'north-center', left: 372, top: 0, width: 693, height: 358 },
  { name: 'north-east-center', left: 1190, top: 0, width: 155, height: 358 },
  // 오른쪽 집도 현관 앞까지만 접근할 수 있게 통로 끝을 닫는다.
  { name: 'house-back', left: 1345, top: 0, width: 60, height: 270 },
  { name: 'north-east', left: 1405, top: 0, width: 267, height: 358 },
  // 학교 현관으로 이어지는 좁은 통로(x 640~730)를 제외하고 아래를 막는다.
  { name: 'south-west-left', left: 0, top: 570, width: 640, height: 371 },
  { name: 'school-back', left: 640, top: 635, width: 90, height: 306 },
  { name: 'south-west-right', left: 730, top: 570, width: 355, height: 371 },
  { name: 'south-east', left: 1281, top: 570, width: 391, height: 371 },
];

export class StageSelectScene extends Phaser.Scene {
  private player!: Player;
  private timeOfDay!: TimeOfDaySystem;
  private collisionAreas: Phaser.GameObjects.Rectangle[] = [];
  private collisionDebugVisible = false;
    
  constructor() {
    super(SceneKey.StageSelect);
  }

  create(): void {
    const { width, height } = this.scale;
    this.collisionDebugVisible = new URLSearchParams(window.location.search)
      .get('collisionDebug') === '1';
  
    const background = this.add.image(
      width / 2,
      height / 2,
      'stage-select-base'
    ).setDepth(-100);
  
    background.setDisplaySize(width, height);

    // 낮 맵과 동일한 구도의 완성된 저녁 맵을 위에 포개어 시간에 따라
    // 알파를 올린다. 별도 불빛 마스크보다 원본 디테일을 안정적으로 보존한다.
    const eveningBackground = this.add
      .image(width / 2, height / 2, 'stage-select-evening')
      .setDisplaySize(width, height)
      .setDepth(-99)
      .setAlpha(0);

    // 화면 왼쪽 위에서 들어오는 따뜻한 햇빛. 픽셀 맵을 흐리지 않도록
    // 블러 없이 낮은 투명도의 사각 그라데이션만 사용한다.
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

    const darkness = this.add
      .rectangle(width / 2, height / 2, width, height, 0x17142f)
      .setDepth(901)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.timeOfDay = new TimeOfDaySystem(
      background,
      eveningBackground,
      sunlight,
      darkness
    );

    this.registerTimeOfDayTestKeys();


    this.player = new Player(
      this,
      width / 2,
      height / 2,
      'player',
      0.045
    );

    this.createCollisionAreas(width, height);
    this.configureCamera(width, height);

  }

  update(_time: number, delta: number): void {
    this.player.update();
    this.timeOfDay.update(delta);
  }

  /** 개발 중 1=낮, 2=노을, 3=저녁, T=자동 흐름, C=충돌 영역을 확인한다. */
  private registerTimeOfDayTestKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.on('keydown-ONE', () => this.timeOfDay.setPreset('day'));
    keyboard.on('keydown-TWO', () => this.timeOfDay.setPreset('sunset'));
    keyboard.on('keydown-THREE', () => this.timeOfDay.setPreset('night'));
    keyboard.on('keydown-T', () => {
      const isAutoPlaying = this.timeOfDay.toggleAutoPlay();
      console.info(`시간대 자동 진행: ${isAutoPlaying ? '켜짐' : '꺼짐'}`);
    });
    keyboard.on('keydown-C', () => this.toggleCollisionDebug());
  }

  private createCollisionAreas(worldWidth: number, worldHeight: number): void {
    const scaleX = worldWidth / SOURCE_MAP_WIDTH;
    const scaleY = worldHeight / SOURCE_MAP_HEIGHT;

    this.collisionAreas = BLOCKED_AREAS.map((area) => {
      const width = area.width * scaleX;
      const height = area.height * scaleY;
      const blocker = this.add
        .rectangle(
          (area.left + area.width / 2) * scaleX,
          (area.top + area.height / 2) * scaleY,
          width,
          height,
          0xff1744,
          this.collisionDebugVisible ? 0.48 : 0
        )
        .setDepth(1_000)
        .setName(`blocked-${area.name}`);

      this.physics.add.existing(blocker, true);
      this.physics.add.collider(this.player, blocker);
      return blocker;
    });
  }

  private configureCamera(worldWidth: number, worldHeight: number): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.setZoom(1.5);
    camera.setRoundPixels(true);
    camera.setDeadzone(280, 180);
    camera.startFollow(this.player, true, 0.1, 0.1);
  }

  private toggleCollisionDebug(): void {
    this.collisionDebugVisible = !this.collisionDebugVisible;
    const alpha = this.collisionDebugVisible ? 0.48 : 0;
    this.collisionAreas.forEach((area) => area.setAlpha(alpha));
  }

}
