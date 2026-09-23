import { SceneKey } from '../types';
import { BaseNegotiationScene } from './BaseNegotiationScene';

/** 동작은 공통 씬을 사용하고 스테이지별 리소스만 지정한다. */
export class NegotiationScene2 extends BaseNegotiationScene {
  constructor() {
    super({
      sceneKey: SceneKey.Negotiation2,
      stageId: 2,
      npcId: 'ta_han',
      npcName: '한조교',
      background: 'stage2-bg',
      returnScene: SceneKey.DepartmentOffice,
    });
  }
}
