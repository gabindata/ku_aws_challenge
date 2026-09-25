import { BLOCKED_AREAS, SOURCE_MAP_WIDTH, SOURCE_MAP_HEIGHT } from '../config/townMap';
import Phaser from 'phaser';
import { SceneKey } from '../types';
import { BackButton } from '../ui/BackButton';
import { gameSettings } from '../systems/GameSettings';

type Phase = 'move' | 'trash' | 'door' | 'enter' | 'inside';
// 원본 지도(1672 × 941)의 좌표. 쓰레기통과 문 앞에서 상호작용한다.
const TRASH = { x: 1235, y: 340 };
const DOOR = { x: 1373, y: 340 };

/** 골목 탐색부터 집 입장까지만 진행한다. 튜토리얼 완료/해금은 처리하지 않는다. */
export class TutorialScene extends Phaser.Scene {
  private phase: Phase = 'move';
  private player!: Phaser.Physics.Arcade.Image;
  private background!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private guide!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private dialogue!: Phaser.GameObjects.Container;
  private line!: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private afterDialogue?: () => void;
  private moved = 0;
  private sx = 1;
  private sy = 1;
  private impact?: Phaser.Sound.BaseSound;

  constructor() { super(SceneKey.Tutorial); }

  preload(): void {
    this.load.image('tutorial-town', 'assets/images/tutorial/town-map.png');
    for (const direction of ['up', 'down', 'left', 'right']) {
      this.load.image(`raccoon-${direction}`, `assets/images/player/raccoon-${direction}.png`);
    }
    this.load.audio('tutorial-impact', 'assets/audio/universfield-heavy-object-falling.mp3');
  }

  create(): void {
    const { width, height } = this.scale;
    this.phase = 'move'; this.lines = []; this.afterDialogue = undefined; this.moved = 0;
    this.sx = width / SOURCE_MAP_WIDTH; this.sy = height / SOURCE_MAP_HEIGHT;
    this.background = this.add.image(width / 2, height / 2, 'tutorial-town').setDisplaySize(width, height);
    this.player = this.physics.add.image(1100 * this.sx, 385 * this.sy, 'raccoon-right').setDisplaySize(140, 140).setDepth(10).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(400, 280).setOffset(430, 700);
    for (const { left: x, top: y, width: w, height: h } of BLOCKED_AREAS) {
      const wall = this.add.rectangle((x + w / 2) * this.sx, (y + h / 2) * this.sy, w * this.sx, h * this.sy, 0, 0);
      this.physics.add.existing(wall, true); this.physics.add.collider(this.player, wall);
    }
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height).setZoom(1.5).setRoundPixels(true);
    this.cameras.main.setDeadzone(280, 180).startFollow(this.player, true, 0.1, 0.1);
    const worldObjects = [...this.children.list];
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,F') as typeof this.keys;
    const style = { fontFamily: 'YPairing', fontSize: '28px', color: '#ffffff', align: 'center' };
    const guideBox = this.add.image(width / 2, height - 58, 'dialogue-box').setDisplaySize(1150, 88).setDepth(50);
    this.guide = this.add.text(width / 2, height - 58, 'WASD로 움직여보자. (방향키도 사용할 수 있어요)', style).setOrigin(0.5).setDepth(51);
    this.prompt = this.add.text(0, 0, '[F]', { ...style, color: '#ffffff', fontStyle: 'bold', backgroundColor: '#000000aa', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(30).setVisible(false);
    const box = this.add.image(width / 2, height - 220, 'dialogue-box').setDisplaySize(width * 0.78, 190);
    const name = this.add.text(width * 0.14, height - 282, '너구리', { ...style, color: '#ffe08c', fontStyle: 'bold' });
    this.line = this.add.text(width * 0.14, height - 225, '', { ...style, color: '#ffffff', align: 'left', wordWrap: { width: width * 0.7 } });
    const next = this.add.text(width * 0.85, height - 151, '[F] 다음', { ...style, fontSize: '22px' }).setOrigin(1, 0.5);
    this.dialogue = this.add.container(0, 0, [box, name, this.line, next]).setDepth(60).setVisible(false);
    const back = new BackButton(this, () => this.scene.start(SceneKey.MainMenu));
    // 별도 UI 카메라로 안내/대화창과 버튼의 표시 및 클릭 좌표를 고정한다.
    const uiCamera = this.cameras.add(0, 0, width, height);
    uiCamera.ignore([...worldObjects, this.prompt]);
    this.cameras.main.ignore([guideBox, this.guide, this.dialogue, back.button]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.impact?.stop(); this.impact?.destroy(); this.impact = undefined; });
  }

  private say(lines: string[], done: () => void): void {
    this.lines = [...lines]; this.afterDialogue = done;
    this.player.setVelocity(0, 0); this.prompt.setVisible(false);
    this.dialogue.setVisible(true); this.line.setText(this.lines.shift()!);
  }

  update(_time: number, delta: number): void {
    const pressed = Phaser.Input.Keyboard.JustDown(this.keys.F);
    if (this.dialogue.visible) {
      this.player.setVelocity(0, 0);
      if (pressed) {
        const line = this.lines.shift();
        if (line) this.line.setText(line);
        else { this.dialogue.setVisible(false); const done = this.afterDialogue; this.afterDialogue = undefined; done?.(); }
      }
      return;
    }
    if (this.phase === 'inside') return;
    const dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const length = Math.hypot(dx, dy) || 1;
    this.player.setVelocity(dx / length * 260, dy / length * 260);
    if (dx || dy) {
      this.player.setTexture(`raccoon-${dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'}`);
      this.moved += Math.min(delta, 100);
    }
    if (this.phase === 'move' && this.moved >= 350) { this.phase = 'trash'; this.guide.setText('집 왼쪽의 쓰레기통을 조사해보자.'); }
    const near = (p: { x: number; y: number }, radius: number) => Math.hypot(this.player.x / this.sx - p.x, this.player.y / this.sy - p.y) < radius;
    this.prompt.setVisible(false);
    if (this.phase === 'trash' && near(TRASH, 90)) {
      this.prompt.setPosition(TRASH.x * this.sx, (TRASH.y - 70) * this.sy).setVisible(true);
      this.guide.setText('F버튼을 눌러 상호작용해보자.');
      if (pressed) this.say(['먹을 게 없네…', '인간들은 이렇게 많이 버리면서 먹을 건 하나도 안 버리나?'], () => {
        this.impact = this.sound.add('tutorial-impact', { volume: gameSettings.ui }); this.impact.play();
        this.phase = 'door'; this.guide.setText('쿠당탕!  집 쪽에서 소리가 들렸다. 열린 문으로 가보자.');
      });
    } else if (this.phase === 'trash') this.guide.setText('집 왼쪽의 쓰레기통을 조사해보자.');
    if (this.phase === 'door' && near(DOOR, 110)) {
      this.say(['뭐지? 저 집에서 소리가 난 것 같은데…', '문도 열려있네, 한 번 가보자.'], () => { this.phase = 'enter'; this.guide.setText('문 앞에서 F버튼을 눌러 집 안으로 들어가자.'); });
    }
    if (this.phase === 'enter' && near(DOOR, 80)) {
      this.prompt.setPosition(DOOR.x * this.sx, (DOOR.y - 50) * this.sy).setVisible(true);
      if (pressed) {
        this.cameras.main.stopFollow();
        this.cameras.main.setZoom(1).setScroll(0, 0);
        this.phase = 'inside'; this.player.setVelocity(0, 0); this.prompt.setVisible(false);
        (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
        this.background.setTexture('house-interior').setDisplaySize(this.scale.width, this.scale.height).setTint(0x777788);
        this.player.setPosition(this.scale.width * 0.5, this.scale.height * 0.75).setTexture('raccoon-up').setDisplaySize(170, 170);
        this.guide.setText('집 안으로 들어왔다.');
      }
    }
  }
}
