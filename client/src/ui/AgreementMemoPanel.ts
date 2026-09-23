import Phaser from 'phaser';
import type { AgreementMemoItem } from '../types';

/** 서버가 공개한 성립 합의만 표시한다. 매 응답의 전체 목록으로 교체한다. */
export class AgreementMemoPanel {
  private text: Phaser.GameObjects.Text;
  private page = 0;
  private items: AgreementMemoItem[] = [];
  private previous: Phaser.GameObjects.Text;
  private next: Phaser.GameObjects.Text;
  private pageLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, width = 530) {
    scene.add.image(x, y, 'common-panel').setDisplaySize(width, 300).setOrigin(0).setDepth(30);
    scene.add.text(x + 20, y + 16, '합의 메모', { fontFamily: 'YPairing', fontSize: '26px', color: '#ffffff' }).setDepth(31);
    this.text = scene.add.text(x + 20, y + 65, '', { fontFamily: 'YPairing', fontSize: '24px', color: '#ffffff', wordWrap: { width: width - 40 } }).setDepth(31);
    this.previous = scene.add.text(x + 20, y + 257, '◀', { fontSize: '24px' }).setDepth(31).setInteractive({ useHandCursor: true });
    this.next = scene.add.text(x + width - 48, y + 257, '▶', { fontSize: '24px' }).setDepth(31).setInteractive({ useHandCursor: true });
    this.pageLabel = scene.add.text(x + width / 2, y + 257, '', { fontSize: '22px' }).setOrigin(0.5, 0).setDepth(31);
    this.previous.on('pointerdown', () => { this.page = Math.max(0, this.page - 1); this.render(); });
    this.next.on('pointerdown', () => { this.page = Math.min(this.items.length - 1, this.page + 1); this.render(); });
    this.update([]);
  }

  update(items: AgreementMemoItem[]): void {
    this.items = items.map(item => ({ ...item }));
    this.page = Math.max(0, Math.min(this.page, items.length - 1));
    this.render();
  }

  private render(): void {
    this.text.setFontSize(24).setText(this.items[this.page]?.text ?? '아직 성립한 합의가 없습니다.');
    // 긴 메모도 패널을 넘어가지 않도록 맞춘다.
    let size = 24;
    while (this.text.height > 180 && size > 12) this.text.setFontSize(--size);
    this.previous.setVisible(this.page > 0);
    this.next.setVisible(this.page < this.items.length - 1);
    this.pageLabel.setText(this.items.length ? `${this.page + 1} / ${this.items.length}` : '');
  }
}
