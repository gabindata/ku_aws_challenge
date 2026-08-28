import Phaser from 'phaser';

/** NPC 초상화 + "생각 중" 모션 등 상태 표현. */
export class NPC extends Phaser.GameObjects.Container {
  /** LLM 응답 대기 동안의 지연을 가려주는 모션 (설계 문서 7장) */
  showThinking(_on: boolean): void {
    // TODO
  }

  /** trust 변화에 따른 표정/자세 반응 */
  reactToTrust(_trust: number): void {
    // TODO
  }
}
