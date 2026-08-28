import Phaser from 'phaser';
import type { NegotiationState } from '../types';

/** 협상 게이지 — trust(0~100)와 priceGap을 시각화. */
export class NegotiationMeter extends Phaser.GameObjects.Container {
  update(_state: NegotiationState): void {
    // TODO: trust 바 트윈, priceGap 수치 갱신
  }
}
