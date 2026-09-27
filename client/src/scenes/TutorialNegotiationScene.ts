import { SceneKey } from '../types';
import { BaseNegotiationScene } from './BaseNegotiationScene';

/** 튜토리얼 API는 stage 0, 집주인 리소스는 stage 3과 공유한다. */
export class TutorialNegotiationScene extends BaseNegotiationScene {
  constructor() {
    super({
      sceneKey: SceneKey.TutorialNegotiation,
      stageId: 0,
      npcId: 'landlord',
      npcName: '고금자',
      background: 'stage3-bg',
      returnScene: SceneKey.MainMenu,
    });
  }
}
