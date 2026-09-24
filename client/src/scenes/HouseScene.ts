import Phaser from 'phaser';
import { SceneKey } from '../types';
import type { ReturnLocation } from '../types';
import { Player } from '../entities/Player';
import { BackButton } from '../ui/BackButton';

// 배경 비율 기준 기본 충돌 영역 [left, top, width, height]. C키로 확인한다.
const BLOCKED_AREAS = [
  [0, 0, 1, 0.07], [0, 0, 0.055, 1], [0.94, 0, 0.06, 1],
  [0, 0.86, 1, 0.14],
  [0.055, 0.07, 0.21, 0.46], // 침대
  [0.385, 0.07, 0.24, 0.25], // 책상과 의자
  [0.76, 0.07, 0.09, 0.28], // 책장
  [0.855, 0.15, 0.085, 0.50], // 주방
  [0.83, 0.65, 0.11, 0.21], // 냉장고
  [0.055, 0.53, 0.295, 0.33], // 화장실 벽
] as const;

export class HouseScene extends Phaser.Scene {
  private player!: Player;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private exitZone!: Phaser.GameObjects.Zone;
  private exitText!: Phaser.GameObjects.Text;
  private returnTo?: ReturnLocation;

  constructor() { super(SceneKey.House); }

  init(data: { returnTo?: ReturnLocation } = {}): void { this.returnTo = data.returnTo; }

  create(): void {
    const { width, height } = this.scale;
    this.add.image(width / 2, height / 2, 'house-interior').setDisplaySize(width, height).setDepth(-10);
    this.player = new Player(this, width * 0.50, height * 0.73, 'down-idle', 0.9, 450);
    const blockers = BLOCKED_AREAS.map(([x, y, w, h]) => {
      const rect = this.add.rectangle((x + w / 2) * width, (y + h / 2) * height,
        w * width, h * height, 0xff0000, 0);
      this.physics.add.existing(rect, true);
      this.physics.add.collider(this.player, rect);
      return rect;
    });
    let debug = false;
    const toggleDebug = () => { debug = !debug; blockers.forEach(b => b.setAlpha(debug ? 0.35 : 0)); };
    this.input.keyboard!.on('keydown-C', toggleDebug);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown-C', toggleDebug));
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.exitZone = this.add.zone(width * 0.50, height * 0.80, width * 0.17, height * 0.10);
    this.physics.add.existing(this.exitZone, true);
    this.exitText = this.add.text(width * 0.50, height * 0.87, '[F]', {
      fontFamily: 'YPairing', fontStyle: 'bold', fontSize: '26px', color: '#ffffff', backgroundColor: '#000000aa',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setDepth(10000).setVisible(false);
    new BackButton(this, () => this.leaveHouse());
  }

  update(): void {
    this.player.update();
    const nearExit = this.physics.overlap(this.player, this.exitZone);
    this.exitText.setVisible(nearExit);
    const pressed = Phaser.Input.Keyboard.JustDown(this.interactKey);
    if (nearExit && pressed) this.leaveHouse();
  }

  private leaveHouse(): void {
    this.scene.start(this.returnTo?.scene ?? SceneKey.StageSelect, {
      returnPosition: this.returnTo?.position ?? { x: 1373 / 1672, y: 370 / 941 },
    });
  }
}
