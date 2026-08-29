import Phaser from 'phaser';
import type { NegotiationState } from '../types';

/** 협상 게이지 — trust와 agreementGap(둘 다 0~100)을 시각화. */
export class NegotiationMeter extends Phaser.GameObjects.Container {
  update(_state: NegotiationState): void {
    // TODO: trust 바 트윈, agreementGap 바 갱신, currentOffer 문장 표시
  }
}
