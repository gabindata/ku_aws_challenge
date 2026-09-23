import { SceneKey } from '../types';
import { BaseNegotiationScene } from './BaseNegotiationScene';

/** 동작은 공통 씬을 사용하고 스테이지별 리소스만 지정한다. */
export class NegotiationScene1 extends BaseNegotiationScene {
  constructor() {
    super({
      sceneKey: SceneKey.Negotiation1,
      stageId: 1,
      npcId: 'store_owner_yang',
      npcName: '양점장',
      background: 'stage1-bg',
      returnScene: SceneKey.ConvenienceStore,
    });
  }
}
