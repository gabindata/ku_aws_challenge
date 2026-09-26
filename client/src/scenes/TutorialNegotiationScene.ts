import Phaser from 'phaser';
import { SceneKey } from '../types';
import { BackButton } from '../ui/BackButton';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';
import { AgreementMemoPanel } from '../ui/AgreementMemoPanel';
import { NpcExpressionController, npcExpressionTexture } from '../systems/NpcExpressionController';

/** 백엔드 연결 전 리소스 준비 화면. 세션/API/녹음은 시작하지 않는다. */
export class TutorialNegotiationScene extends Phaser.Scene {
  constructor() { super(SceneKey.TutorialNegotiation); }

  create(): void {
    const { width, height } = this.scale;
    this.add.image(width / 2, height / 2, 'stage3-bg').setDisplaySize(width, height).setDepth(-10);
    const portrait = this.add.image(width / 2, height / 2, npcExpressionTexture('landlord')).setDepth(10);
    new NpcExpressionController(this, portrait, 'landlord');
    new AgreementMemoPanel(this, 45, 190);
    new TimerDisplay(this, 150, 130);
    const dialogue = new DialogueBox(this, width / 2, height * 0.72, width * 0.75, '고금자');
    dialogue.showText('튜토리얼 협상을 준비 중입니다.');
    const mic = new MicButton(this, width / 2, height - 100, () => {});
    mic.setDisabled(true);
    new BackButton(this, () => this.scene.start(SceneKey.StageSelect, {
      returnPosition: { x: 1373 / 1672, y: 380 / 941 },
    }));
  }
}
