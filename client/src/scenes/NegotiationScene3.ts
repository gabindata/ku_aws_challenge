import { SceneKey } from '../types';
import { BaseNegotiationScene } from './BaseNegotiationScene';

/** 동작은 공통 씬을 사용하고 스테이지별 리소스만 지정한다. */
export class NegotiationScene3 extends BaseNegotiationScene {
  constructor() {
    super({
      sceneKey: SceneKey.Negotiation3,
      stageId: 3,
      npcId: 'landlord',
      npcName: '고금자',
      background: 'stage3-bg',
      returnScene: SceneKey.StageSelect,
    });
  }
}
