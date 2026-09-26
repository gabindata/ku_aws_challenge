import Phaser from 'phaser';
import { playUiClick } from './UiFeedback';

/** 이미지에 그려진 앱과 뒤로가기 버튼에 클릭 영역을 연결한다. */
export class TutorialPhone {
  readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    const { width, height } = scene.scale;
    const shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.65)
      .setOrigin(0).setInteractive();
    const phoneHeight = Math.min(height * 0.80, width * 0.9 * 1080 / 720);
    const scale = phoneHeight / 1080;
    const left = width / 2 - 360 * scale;
    const top = (height - phoneHeight) / 2;
    const screen = scene.add.image(left, top, 'tutorial-phone-home').setOrigin(0).setScale(scale);
    const hit = (x: number, y: number, w: number, h: number) => scene.add.zone(
      left + x * scale, top + y * scale, w * scale, h * scale,
    ).setInteractive({ useHandCursor: true });
    const memo = hit(260, 330, 170, 210);
    const messages = hit(460, 330, 170, 210);
    const back = hit(155, 115, 100, 100);
    const close = scene.add.image(left + 580 * scale, top + 112 * scale, 'tutorial-phone-close-button')
      .setDisplaySize(64 * scale, 64 * scale).setInteractive({ useHandCursor: true });
    const hint = scene.add.text(width / 2, top + phoneHeight + 14, '메모장과 메시지를 클릭해 확인해보자.', {
      fontFamily: 'YPairing', fontSize: '26px', color: '#ffffff',
      align: 'center', wordWrap: { width: width * 0.8 },
    }).setOrigin(0.5, 0);
    let readMemo = false;
    let readMessages = false;
    let closed = false;
    const toggle = (target: Phaser.GameObjects.Zone | Phaser.GameObjects.Image, enabled: boolean) => {
      target.setVisible(enabled);
      if (target.input) target.input.enabled = enabled;
    };
    const show = (page: 'home' | 'memo' | 'messages') => {
      screen.setTexture(`tutorial-phone-${page}`);
      hint.setText(page !== 'home'
        ? '왼쪽 위 화살표를 눌러 휴대폰 홈으로 돌아가자.'
        : readMemo && readMessages
          ? '모두 확인했다. 오른쪽 위 X를 눌러 휴대폰을 닫자.'
          : '메모장과 메시지를 클릭해 확인해보자.');
      toggle(memo, page === 'home');
      toggle(messages, page === 'home');
      toggle(back, page !== 'home');
      toggle(close, page === 'home' && readMemo && readMessages);
    };
    memo.on('pointerdown', () => { playUiClick(scene); readMemo = true; show('memo'); });
    messages.on('pointerdown', () => { playUiClick(scene); readMessages = true; show('messages'); });
    back.on('pointerdown', () => { playUiClick(scene); show('home'); });
    close.on('pointerdown', () => {
      if (closed || !readMemo || !readMessages) return;
      closed = true;
      playUiClick(scene);
      this.container.destroy();
      onClose();
    });
    this.container = scene.add.container(0, 0, [shade, screen, memo, messages, back, close, hint]).setDepth(55);
    show('home');
  }
}
