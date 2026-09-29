import Phaser from 'phaser';
import { VOICE_INPUT_LIMIT_SECONDS } from '../systems/VoiceInputManager';

/** 음성 입력의 시작·종료·응답 대기를 보여 주는 공통 버튼. */
export class MicButton extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private icon: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private dot: Phaser.GameObjects.Arc;
  private pulse: Phaser.Tweens.Tween;
  private isDisabled = false;
  private recording = false;
  private waiting = false;
  private retry = false;
  private remaining = VOICE_INPUT_LIMIT_SECONDS;

  constructor(scene: Phaser.Scene, x: number, y: number, onClick: () => void) {
    super(scene, x, y);
    scene.add.existing(this);
    this.background = scene.add.rectangle(0, 0, 420, 76, 0x102c56)
      .setStrokeStyle(3, 0x8ca9d9).setInteractive({ useHandCursor: true });
    this.icon = scene.add.image(-163, 0, 'mic-button').setDisplaySize(58, 58);
    this.label = scene.add.text(22, 0, '', {
      fontFamily: 'Galmuri11', fontStyle: 'bold', fontSize: '25px', color: '#ffffff',
    }).setOrigin(0.5);
    this.hint = scene.add.text(0, 48, '', {
      fontFamily: 'Galmuri11', fontSize: '19px', color: '#ffffff',
      stroke: '#172332', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5, 0);
    this.dot = scene.add.circle(-163, 0, 9, 0xffe4ad).setVisible(false);
    this.add([this.background, this.icon, this.dot, this.label, this.hint]);
    this.pulse = scene.tweens.add({ targets: this.dot, alpha: 0.3, duration: 650, yoyo: true, repeat: -1, paused: true });
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.pulse.remove());
    this.background.on('pointerdown', () => { if (!this.isDisabled) onClick(); });
    this.setDepth(40);
    this.renderState();
  }
  setRecording(on: boolean): void {
    this.recording = on;
    if (on) this.remaining = VOICE_INPUT_LIMIT_SECONDS;
    this.retry = false;
    this.renderState();
  }
  setRemaining(seconds: number): void { this.remaining = seconds; this.renderState(); }
  setWaiting(on: boolean): void { this.waiting = on; this.renderState(); }
  setRetry(): void { this.retry = true; this.renderState(); }
  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    if (disabled) this.background.disableInteractive();
    else this.background.setInteractive({ useHandCursor: true });
    this.renderState();
  }
  private renderState(): void {
    const listening = this.recording && !this.waiting;
    this.background.setFillStyle(listening ? 0x92521e : 0x102c56)
      .setStrokeStyle(3, listening ? 0xffc16b : 0x8ca9d9);
    this.icon.setVisible(!listening);
    this.dot.setVisible(listening);
    if (listening) this.pulse.resume(); else { this.pulse.pause(); this.dot.setAlpha(1); }
    this.label.setText(this.waiting ? '답변 기다리는 중…' : listening ? '말 끝내고 보내기' : this.retry ? '다시 말하기' : '말하기 시작');
    this.hint.setText(this.waiting ? '답변이 오면 다시 말할 수 있어요' : listening ? `다 말했으면 다시 눌러 주세요 · ${this.remaining}초 후 자동 전송` : this.isDisabled ? '잠시만 기다려 주세요' : '버튼을 누르고 말해 주세요 · 최대 15초');
    this.background.setAlpha(this.isDisabled ? 0.65 : 1);
    this.icon.setAlpha(this.isDisabled ? 0.55 : 1);
    this.label.setAlpha(this.isDisabled ? 0.8 : 1);
  }
}
