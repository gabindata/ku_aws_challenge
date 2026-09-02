import Phaser from 'phaser';
import { SceneKey } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';

/** 실시간 협상 — 마이크 버튼, 자막, 협상 게이지. */
export class NegotiationScene extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private npcId!: string;
  
  constructor() {
    super(SceneKey.Negotiation);
  }

  init(data: { npcId: string }): void {
    this.npcId = data.npcId;
  
    console.log('선택된 NPC:', this.npcId);
  }

  create(): void {
    // TODO: ApiClient.startNegotiation(npcId) → 첫 대사 표시 + TTS 재생
    // TODO: MicButton / DialogueBox / NegotiationMeter 배치

    const { width, height } = this.scale;



    this.add
    .text(
      width / 2,
      60,
      `NPC: ${this.npcId}`,
      {
        fontSize: '24px',
        color: '#ffff00',
      }
    )
    .setOrigin(0.5);
        // STT 관리자 생성
    this.voiceInput = new VoiceInputManager();

    // STT 결과 표시
    const resultText = this.add.text(
      width / 2,
      height / 2,
      '말한 내용이 여기에 표시됩니다.',
      {
        fontSize: '24px',
        color: '#ffffff',
        wordWrap: {
          width: 700,
        },
        align: 'center',
      }
    );

    resultText.setOrigin(0.5);

    // 임시 마이크 버튼
    const micButton = this.add.text(
      width / 2,
      height - 100,
      '🎤 말하기',
      {
        fontSize: '30px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: {
          x: 20,
          y: 10,
        },
      }
    );

    micButton.setOrigin(0.5);

    micButton.setInteractive({
      useHandCursor: true,
    });

    // 마이크 클릭
    micButton.on('pointerdown', () => {
      micButton.setText('🎤 듣는 중...');

      this.voiceInput.start(
        (text) => {
          console.log('플레이어 발화:', text);

          resultText.setText(text);

          micButton.setText('🎤 말하기');
        },

        (error) => {
          console.error('STT 오류:', error);

          resultText.setText('음성 인식에 실패했습니다.');

          micButton.setText('🎤 말하기');
        }
      );
    });
  }

  /** 플레이어 발화 1턴 처리: STT 결과 → /turn → 화면 갱신 → TTS */
  private async handlePlayerUtterance(_playerText: string): Promise<void> {
    // TODO: 응답 대기 동안 NPC "생각 중" 모션으로 지연을 가린다 (설계 문서 7장)
    // TODO: dealClosed === true 면 더 이상 턴을 보내지 않고 ResultScene으로 전환
    // this.scene.start(SceneKey.Result);
  }
}
