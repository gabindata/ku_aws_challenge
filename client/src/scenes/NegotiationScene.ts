import Phaser from 'phaser';
import { SceneKey } from '../types';

/** 실시간 협상 — 마이크 버튼, 자막, 협상 게이지. */
export class NegotiationScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Negotiation);
  }

  create(_data: { npcId: string }): void {
    // TODO: ApiClient.startNegotiation(npcId) → 첫 대사 표시 + TTS 재생
    // TODO: MicButton / DialogueBox / NegotiationMeter 배치
  }

  /** 플레이어 발화 1턴 처리: STT 결과 → /turn → 화면 갱신 → TTS */
  private async handlePlayerUtterance(_playerText: string): Promise<void> {
    // TODO: 응답 대기 동안 NPC "생각 중" 모션으로 지연을 가린다 (설계 문서 7장)
    // TODO: dealClosed === true 면 더 이상 턴을 보내지 않고 ResultScene으로 전환
    this.scene.start(SceneKey.Result);
  }
}
