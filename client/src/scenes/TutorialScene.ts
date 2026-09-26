import { StageInfoPanel } from '../ui/StageInfoPanel';
import { TutorialPhone } from '../ui/TutorialPhone';
import { BLOCKED_AREAS, SOURCE_MAP_WIDTH, SOURCE_MAP_HEIGHT } from '../config/townMap';
import Phaser from 'phaser';
import { SceneKey } from '../types';
import { BackButton } from '../ui/BackButton';
import { gameSettings } from '../systems/GameSettings';

type Phase = 'move' | 'trash' | 'door' | 'enter' | 'inside' | 'bed' | 'transition' | 'phone-ready' | 'phone' | 'landlord-door' | 'complete';
// 원본 지도(1672 × 941)의 좌표. 쓰레기통과 문 앞에서 상호작용한다.
const TRASH = { x: 1235, y: 340 };
const DOOR = { x: 1373, y: 340 };
// 너구리 몸통에 맞춰 현관 통로만 좌우 18px씩 넓힌다(원본 지도 기준).
const TUTORIAL_BLOCKED_AREAS = BLOCKED_AREAS.map(area => {
  if (area.name === 'north-east-center') return { ...area, width: area.width - 18 };
  if (area.name === 'north-east') return { ...area, left: area.left + 18, width: area.width - 18 };
  if (area.name === 'house-back') return { ...area, left: 1322, width: 103 };
  return area;
});

/** 골목 탐색과 어두운 원룸의 휴대폰 확인과 노크 소리까지 진행한다. 튜토리얼 완료/해금은 처리하지 않는다. */
export class TutorialScene extends Phaser.Scene {
  private finishedNegotiation = false;
  private stageInfo?: StageInfoPanel;
  private human = false;
  private phase: Phase = 'move';
  private player!: Phaser.Physics.Arcade.Image;
  private background!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private guideText = '';
  private guide!: Phaser.GameObjects.Text;
  private guideWindow!: Phaser.GameObjects.Container;
  private speaking = false;
  private speaker!: Phaser.GameObjects.Text;
  private nextHint!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private dialogue!: Phaser.GameObjects.Container;
  private line!: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private afterDialogue?: () => void;
  private moved = 0;
  private sx = 1;
  private sy = 1;
  private walls: Phaser.GameObjects.Rectangle[] = [];
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private darkness?: Phaser.GameObjects.Image;
  private room = { left: 0, top: 0, width: 0, height: 0 };
  private blackout!: Phaser.GameObjects.Rectangle;
  private phoneSound?: Phaser.Sound.BaseSound;
  private doorSound?: Phaser.Sound.BaseSound;
  private whoosh?: Phaser.Sound.BaseSound;
  private impact?: Phaser.Sound.BaseSound;

  constructor() { super(SceneKey.Tutorial); }

  init(data: { finishedNegotiation?: boolean } = {}): void {
    this.finishedNegotiation = data.finishedNegotiation === true;
  }

  preload(): void {
    for (const page of ['home', 'memo', 'messages', 'close-button']) {
      this.load.image(`tutorial-phone-${page}`, `assets/images/tutorial/tutorial-phone-${page}.png`);
    }
    this.load.audio('tutorial-phone-vibrate', 'assets/audio/freesound_community-cell-phone-vibrate.mp3');
    this.load.audio('tutorial-door-knock', 'assets/audio/tanweraman-door-bang-echo.mp3');
    this.load.image('tutorial-room-empty', 'assets/images/tutorial/tutorial-room-empty.png');
    this.load.audio('tutorial-whoosh', 'assets/audio/trading_nation-deep-strange-whoosh.mp3');
    this.load.image('tutorial-room-dark', 'assets/images/tutorial/tutorial-room-dark.png');
    this.load.image('tutorial-town', 'assets/images/tutorial/town-map.png');
    for (const direction of ['up', 'down', 'left', 'right']) {
      this.load.image(`raccoon-${direction}`, `assets/images/player/raccoon-${direction}.png`);
    }
    this.load.audio('tutorial-impact', 'assets/audio/universfield-heavy-object-falling.mp3');
  }

  create(): void {
    const { width, height } = this.scale;
    this.registry.set('tutorialSeen', true);
    try { localStorage.setItem('tutorialSeen', 'true'); } catch { /* 저장 제한 시 현재 실행에서는 기록 유지 */ }
    this.walls = []; this.darkness = undefined; this.human = false; this.stageInfo = undefined;
    this.speaking = false; this.guideText = '';
    this.phase = 'transition'; this.lines = []; this.afterDialogue = undefined; this.moved = 0;
    this.sx = width / SOURCE_MAP_WIDTH; this.sy = height / SOURCE_MAP_HEIGHT;
    this.background = this.add.image(width / 2, height / 2, 'tutorial-town').setDisplaySize(width, height);
    this.player = this.physics.add.image(1190 * this.sx, 615 * this.sy, 'raccoon-down').setDisplaySize(140, 140).setDepth(10).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // 꼬리와 투명 여백을 제외한 몸통 중심의 충돌 영역.
    body.setSize(650, 520).setOffset(302, 390);
    for (const { left: x, top: y, width: w, height: h } of TUTORIAL_BLOCKED_AREAS) {
      const wall = this.add.rectangle((x + w / 2) * this.sx, (y + h / 2) * this.sy, w * this.sx, h * this.sy, 0, 0);
      this.physics.add.existing(wall, true); this.physics.add.collider(this.player, wall);
      this.walls.push(wall);
    }
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height).setZoom(1.5).setRoundPixels(true);
    this.cameras.main.setDeadzone(280, 180).startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    const worldObjects = [...this.children.list];
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,F') as typeof this.keys;
    const style = { fontFamily: 'YPairing', fontSize: '28px', color: '#ffffff', align: 'center' };
    const guideBox = this.add.image(width / 2, height - 58, 'dialogue-box').setDisplaySize(width * 0.78, 88);
    this.guide = this.add.text(width / 2, height - 58, '', { ...style, wordWrap: { width: width * 0.72 } }).setOrigin(0.5);
    this.guideWindow = this.add.container(0, 0, [guideBox, this.guide]).setDepth(60).setVisible(false);
    this.prompt = this.add.text(0, 0, '[F]', { ...style, color: '#ffffff', fontStyle: 'bold', backgroundColor: '#000000aa', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(30).setVisible(false);
    const box = this.add.image(width / 2, height - 220, 'dialogue-box').setDisplaySize(width * 0.78, 190);
    this.speaker = this.add.text(width * 0.14, height - 282, '너구리', { ...style, color: '#ffe08c', fontStyle: 'bold' });
    this.line = this.add.text(width * 0.14, height - 225, '', { ...style, color: '#ffffff', align: 'left', wordWrap: { width: width * 0.7 } });
    this.nextHint = this.add.text(width * 0.85, height - 174, '[F] 다음', { ...style, fontSize: '22px' }).setOrigin(1, 0.5);
    this.dialogue = this.add.container(0, 0, [box, this.speaker, this.line, this.nextHint]).setDepth(60).setVisible(false);
    this.showGuide('');
    const back = new BackButton(this, () => this.scene.start(SceneKey.MainMenu));
    // 별도 UI 카메라로 안내/대화창과 버튼의 표시 및 클릭 좌표를 고정한다.
    const uiCamera = this.cameras.add(0, 0, width, height);
    this.uiCamera = uiCamera;
    // 가장 위 UI 카메라를 페이드해 배경과 안내가 함께 자연스럽게 나타난다.
    uiCamera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.phase = 'move';
      if (this.finishedNegotiation) {
        this.human = true;
        this.player.setTexture('down-idle');
        this.player.setPosition(1373 * this.sx, 380 * this.sy);
        this.phase = 'complete';
        try { localStorage.setItem('tutorialCompleted', 'true'); } catch {}
        this.showGuide('이제 튜토리얼이 완료되었습니다. 스테이지를 클리어하며 게임을 진행해보세요.');
        this.time.delayedCall(4500, () => this.scene.start(SceneKey.StageSelect, { returnPosition: { x: 1373 / 1672, y: 380 / 941 } }));
      } else this.showGuide('WASD로 움직여보자. (방향키도 사용할 수 있어요)');
    });
    uiCamera.fadeIn(1800, 0, 0, 0);
    uiCamera.ignore([...worldObjects, this.prompt]);
    this.cameras.main.ignore([this.guideWindow, this.dialogue, back.button]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.impact?.stop(); this.impact?.destroy(); this.impact = undefined; this.whoosh?.stop(); this.whoosh?.destroy(); this.whoosh = undefined; this.phoneSound?.destroy(); this.phoneSound = undefined; this.doorSound?.destroy(); this.doorSound = undefined; });
  }

  private enterRoom(): void {
    const { width, height } = this.scale;
    this.phase = 'inside';
    this.player.setVelocity(0, 0);
    this.prompt.setVisible(false);
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1).setScroll(0, 0);
    this.physics.world.colliders.destroy();
    this.walls.forEach(wall => wall.destroy());
    this.walls = [];

    const source = this.textures.get('tutorial-room-dark').getSourceImage();
    const scale = Math.min(width / source.width, height / source.height);
    const rw = source.width * scale, rh = source.height * scale;
    const left = (width - rw) / 2, top = (height - rh) / 2;
    this.room = { left, top, width: rw, height: rh };
    this.blackout = this.add.rectangle(width / 2, height / 2, width, height, 0x000000).setDepth(41).setAlpha(0);
    this.uiCamera.ignore(this.blackout);
    this.background.setTexture('tutorial-room-dark').setDisplaySize(rw, rh).clearTint();
    this.physics.world.setBounds(left, top, rw, rh);
    this.player.setPosition(left + rw * 0.5, top + rh * 0.78)
      .setTexture('raccoon-up').setDisplaySize(170, 170);
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
    // 실내 벽과 가구. 침대 오른쪽 통로까지 접근할 수 있다.
    const obstacles = [
      // 벽과 가구 뒤 상단 공간 전체를 막아 옆 틈으로도 들어가지 못하게 한다.
      [0, 0, 1, 0.24], [0, 0, 0.055, 1], [0.94, 0, 0.06, 1],
      [0, 0.86, 1, 0.14], [0.055, 0.07, 0.205, 0.47],
      [0.38, 0.07, 0.25, 0.22], // 책상
      [0.44, 0.27, 0.09, 0.06], // 의자 몸체만 막고 앞쪽 바닥과 양옆 통로는 개방
      [0.755, 0.07, 0.10, 0.31], // 책장
      [0.85, 0.15, 0.09, 0.5], [0.825, 0.64, 0.115, 0.22],
      [0.055, 0.53, 0.29, 0.33],
    ];
    for (const [x, y, w, h] of obstacles) {
      const wall = this.add.rectangle(left + (x + w / 2) * rw, top + (y + h / 2) * rh, w * rw, h * rh, 0, 0);
      this.physics.add.existing(wall, true);
      this.physics.add.collider(this.player, wall);
      this.walls.push(wall);
      this.uiCamera.ignore(wall);
    }

    // 작은 원형 시야: 중앙은 투명하고 가장자리에서 부드럽게 암전된다.
    const key = 'tutorial-room-spotlight';
    if (this.textures.exists(key)) this.textures.remove(key);
    const size = Math.ceil(Math.max(width, height) * 2);
    const texture = this.textures.createCanvas(key, size, size)!;
    const context = texture.context;
    const radius = Math.min(rw, rh) * 0.105;
    const gradient = context.createRadialGradient(size / 2, size / 2, radius * 0.55, size / 2, size / 2, radius);
    gradient.addColorStop(0, 'rgba(0, 4, 10, 0)');
    gradient.addColorStop(1, 'rgba(0, 4, 10, 1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
    this.darkness = this.add.image(this.player.x, this.player.y, key).setDepth(40);
    this.uiCamera.ignore(this.darkness);
    this.showGuide('');
    this.say(['너무 어둡다...근데 맛있는 냄새가 나네'], () => {
      this.showGuide('침대로 가보자.');
    });
  }

  private nearBed(): boolean {
    const { left, top, width, height } = this.room;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const x = (body.center.x - left) / width;
    const y = (body.bottom - top) / height;
    return x >= 0.255 && x <= 0.38 && y >= 0.20 && y <= 0.50;
  }

  private revealBed(): void {
    this.phase = 'transition';
    this.player.setVelocity(0, 0);
    this.showGuide('');
    this.tweens.add({
      targets: this.darkness, alpha: 0, duration: 900,
      onComplete: () => {
        this.whoosh = this.sound.add('tutorial-whoosh', { volume: gameSettings.ui });
        this.whoosh.play();
        this.jumpInSurprise();
        this.say(['!!!!!!!!!!!', '뭐야...인간이네. 자고 있나?'], () => {
          this.phase = 'bed';
          this.showGuide('침대 옆에서 F를 눌러 조사해보자.');
        });
      },
    });
  }

  private jumpInSurprise(): void {
    const startX = this.player.x, startY = this.player.y;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.player.setVelocity(0, 0);
    body.enable = false;
    this.tweens.add({
      targets: this.player, y: startY - 30, duration: 180, ease: 'Sine.easeOut', yoyo: true,
      onComplete: () => {
        this.player.setPosition(startX, startY);
        body.enable = true;
        body.reset(startX, startY);
      },
    });
  }

  private investigateBed(): void {
    this.phase = 'transition';
    this.player.setVelocity(0, 0);
    this.prompt.setVisible(false);
    this.showGuide('');
    // 느린 암전에서 빠른 암전으로 이어진 뒤 완전히 어두워진다.
    const durations = [650, 500, 350, 220];
    const blink = (index: number) => {
      if (index === durations.length) {
        this.tweens.add({ targets: this.blackout, alpha: 1, duration: 350,
          onComplete: () => this.say(['우웩...토할 것 같아...무슨 일이지?'], () => this.revealHuman()),
        });
        return;
      }
      this.tweens.add({ targets: this.blackout, alpha: 0.95, duration: durations[index], yoyo: true,
        onComplete: () => blink(index + 1),
      });
    };
    blink(0);
  }

  private revealHuman(): void {
    const { left, top, width, height } = this.room;
    this.background.setTexture('tutorial-room-empty').setDisplaySize(width, height);
    this.darkness?.setVisible(false);
    this.player.setTexture('down-idle').setDisplaySize(height * 0.22, height * 0.22);
    // 예시처럼 침대 오른쪽에 서 있는 모습으로 배치한다.
    this.player.setPosition(left + width * 0.33, top + height * 0.36);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.tweens.add({ targets: this.blackout, alpha: 0, duration: 1200,
      onComplete: () => this.say(['!!!!!!!!!!!', '뭐야! 이게 무슨 일이지?! 내가 왜 이 인간이 된거야!'], () => {
        this.promptPhone();
      }),
    });
  }

  private promptPhone(): void {
    this.phase = 'transition';
    this.showGuide('');
    this.phoneSound = this.sound.add('tutorial-phone-vibrate', { volume: gameSettings.ui });
    this.afterSound(this.phoneSound, () => {
      this.phase = 'phone-ready';
      this.showGuide('주머니에서 진동이 느껴진다. F를 눌러 휴대폰을 확인해보자.');
    });
  }

  private openPhone(): void {
    this.phase = 'phone';
    this.phoneSound?.stop();
    this.showGuide('');
    const phone = new TutorialPhone(this, () => {
      this.phase = 'transition';
      this.showGuide('');
      this.doorSound = this.sound.add('tutorial-door-knock', { volume: gameSettings.ui });
      this.afterSound(this.doorSound, () => {
        this.say(['안에 있는 거 다 알아! 문 열어요!'], () => this.prepareLandlordDoor());
        this.speaker.setText('고금자');
      });
    });
    this.cameras.main.ignore(phone.container);
  }

  private prepareLandlordDoor(): void {
    this.phase = 'landlord-door';
    this.human = true;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(this.player.width * 0.45, this.player.height * 0.65);
    body.setOffset(this.player.width * 0.275, this.player.height * 0.25);
    body.enable = true;
    body.reset(this.player.x, this.player.y);
    this.showGuide('현관문 앞으로 가서 F를 눌러보자.');
    this.stageInfo = new StageInfoPanel(this, {
      stageTitle: '튜토리얼 · 원룸 현관', npcName: '고금자',
      description: `난이도: Tutorial

배경
낯선 인간의 몸이 된 당신 앞에 집주인 고금자가 찾아왔다. 두 달째 밀린 월세 때문에 방을 비우라는 말을 듣게 됐다.

이번 목표
집주인과 대화해 당장 방을 빼지 않고 기다려 줄 여지를 얻자.

공개 조건
• 월세가 두 달 밀려 있다.
• 집주인은 다음 주까지 해결하지 않으면 방을 빼라고 요구하고 있다.`,
      onStart: () => this.scene.start(SceneKey.TutorialNegotiation),
    });
    // 정보창은 UI 카메라에서만 그려 중복 렌더링을 막는다.
    this.stageInfo.useUiCamera(this.uiCamera);
  }

  /** 소리를 먼저 들려준 뒤 상황 안내를 이어간다. 재생 실패 시에도 진행한다. */
  private afterSound(sound: Phaser.Sound.BaseSound, done: () => void): void {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      sound.off('complete', finish);
      fallback.remove(false);
      this.time.delayedCall(200, done);
    };
    const fallback = this.time.delayedCall(Math.max(10000, sound.totalDuration * 1000 + 1000), finish);
    sound.once('complete', finish);
    if (!sound.play()) finish();
  }

  private showGuide(text: string): void {
    this.guideText = text.trim();
    this.guide.setText(this.guideText);
    this.guideWindow.setVisible(!this.speaking && this.guideText.length > 0);
  }

  private say(lines: string[], done: () => void): void {
    this.speaking = true;
    this.showGuide('');
    this.speaker.setText('너구리');
    this.nextHint.setVisible(true);
    this.lines = [...lines]; this.afterDialogue = done;
    this.player.setVelocity(0, 0); this.prompt.setVisible(false);
    this.dialogue.setVisible(true); this.line.setText(this.lines.shift()!);
  }

  update(_time: number, delta: number): void {
    const pressed = Phaser.Input.Keyboard.JustDown(this.keys.F);
    if (this.stageInfo?.isOpen) { this.player.setVelocity(0, 0); this.prompt.setVisible(false); return; }
    if (this.speaking) {
      this.player.setVelocity(0, 0);
      if (pressed) {
        const line = this.lines.shift();
        if (line) this.line.setText(line);
        else {
          this.speaking = false;
          this.dialogue.setVisible(false);
          const done = this.afterDialogue;
          this.afterDialogue = undefined;
          this.showGuide(this.guideText);
          done?.();
        }
      }
      return;
    }

    if (this.phase === 'phone-ready') {
      if (pressed) this.openPhone();
      return;
    }
    if (this.phase === 'transition' || this.phase === 'phone' || this.phase === 'complete') {
      this.player.setVelocity(0, 0);
      return;
    }
    const dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const length = Math.hypot(dx, dy) || 1;
    this.player.setVelocity(dx / length * 260, dy / length * 260);
    if (dx || dy) {
      const direction = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
      this.player.setTexture(this.human ? `${direction}-idle` : `raccoon-${direction}`);
      this.moved += Math.min(delta, 100);
    }
    if (this.phase === 'landlord-door') {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const near = Math.abs((body.center.x - this.room.left) / this.room.width - 0.5) < 0.12
        && (body.bottom - this.room.top) / this.room.height > 0.72;
      this.prompt.setPosition(this.room.left + this.room.width * 0.5, this.room.top + this.room.height * 0.8).setVisible(near);
      if (near && pressed) this.stageInfo?.open();
      return;
    }
    if (this.phase === 'inside') {
      this.darkness?.setPosition(this.player.x, this.player.y);
      if (this.nearBed()) this.revealBed();
      return;
    }
    if (this.phase === 'bed') {
      const nearBed = this.nearBed();
      this.prompt.setPosition(this.room.left + this.room.width * 0.26, this.room.top + this.room.height * 0.32).setVisible(nearBed);
      if (nearBed && pressed) this.investigateBed();
      return;
    }
    if (this.phase === 'move' && this.moved >= 350) { this.phase = 'trash'; this.showGuide('집 왼쪽의 쓰레기통을 조사해보자.'); }
    const near = (p: { x: number; y: number }, radius: number) => Math.hypot(this.player.x / this.sx - p.x, this.player.y / this.sy - p.y) < radius;
    this.prompt.setVisible(false);
    if (this.phase === 'trash' && near(TRASH, 90)) {
      this.prompt.setPosition(TRASH.x * this.sx, (TRASH.y - 70) * this.sy).setVisible(true);
      this.showGuide('F버튼을 눌러 상호작용해보자.');
      if (pressed) this.say(['먹을 게 없네…', '인간들은 이렇게 많이 버리면서 먹을 건 하나도 안 버리나?'], () => {
        this.phase = 'transition';
        this.impact = this.sound.add('tutorial-impact', { volume: gameSettings.ui });
        this.afterSound(this.impact, () => this.say(['뭐지? 저 집에서 소리가 난 것 같은데…'], () => {
          this.phase = 'door';
          this.showGuide('소리가 난 집의 문 앞으로 가보자.');
        }));
      });
    } else if (this.phase === 'trash') this.showGuide('집 왼쪽의 쓰레기통을 조사해보자.');
    if (this.phase === 'door' && near(DOOR, 110)) {
      this.say(['문도 열려있네, 한 번 가보자.'], () => { this.phase = 'enter'; this.showGuide('문 앞에서 F버튼을 눌러 집 안으로 들어가자.'); });
    }
    if (this.phase === 'enter' && near(DOOR, 80)) {
      this.prompt.setPosition(DOOR.x * this.sx, (DOOR.y - 50) * this.sy).setVisible(true);
      if (pressed) {
        this.enterRoom();
      }
    }
  }
}
