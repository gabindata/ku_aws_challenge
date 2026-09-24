import Phaser from 'phaser';
import { SceneKey } from '../types';
import type { ClientNegotiationView, ReturnLocation } from '../types';
import { ApiError } from '../systems/ApiClient';
import { SessionResultPoller } from '../systems/SessionResultPoller';
import { ResultReportView } from '../ui/ResultReportView';
import { playUiClick } from '../ui/UiFeedback';

/** 모든 정식 스테이지가 사용하는 결과/리포트 화면. */
export class ResultScene extends Phaser.Scene {
  constructor() { super(SceneKey.Result); }
  create(data: { sessionId: string; stageId: number; view: ClientNegotiationView; returnTo?: ReturnLocation }): void {
    let active=true;
    let poller: SessionResultPoller | undefined;
    const view=data.view;
    const finish=(scene: string, payload: object) => {
      if (!active) return;
      active=false; poller?.stop(); this.scene.start(scene,payload);
    };
    const ui=new ResultReportView(view,data.stageId,()=>{
      if (data.returnTo) {
        finish(data.returnTo.scene, { returnPosition: data.returnTo.position });
      } else {
        finish(SceneKey.StageSelect, { spawnAt: data.stageId===1 ? 'store' : data.stageId===2 ? 'school' : 'default' });
      }
    },()=>{
      const scene=[SceneKey.Tutorial,SceneKey.Negotiation1,SceneKey.Negotiation2,SceneKey.Negotiation3][data.stageId];
      if (scene) finish(scene,{npcId:['landlord','store_owner_yang','ta_han','landlord'][data.stageId],returnTo:data.returnTo});
    },()=>playUiClick(this));
    const offline=()=>ui.setConnection('연결이 끊겼어요. 연결되면 같은 대화의 리포트를 다시 확인할게요.');
    const online=()=>ui.setConnection('연결됐어요. 리포트를 확인하고 있어요.');
    window.addEventListener('offline',offline); window.addEventListener('online',online);
    if (!navigator.onLine) offline();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      active=false; poller?.stop(); ui.destroy();
      window.removeEventListener('offline',offline); window.removeEventListener('online',online);
    });
    if (view.styleReport || view.reportStatus==='ready' || view.reportStatus==='failed') return;
    poller=new SessionResultPoller(data.sessionId,result=>{
      if (!active || result.sessionId!==data.sessionId || result.stageId!==data.stageId) return;
      ui.setConnection('');
      if (!result.view) return;
      ui.update(result.view);
      if (result.view.reportStatus==='ready' || result.view.reportStatus==='failed') poller?.stop();
    },error=>{
      if (!active) return;
      if (error instanceof ApiError && error.missingResultEndpoint) {
        poller?.stop();
        ui.update({ ...view, reportStatus: 'failed' });
        ui.setConnection('현재 서버는 리포트 추가 조회를 지원하지 않아요. 받은 협상 결과를 표시합니다.');
      } else if (error instanceof ApiError && error.missingSession) {
        poller?.stop(); ui.setConnection('세션이 만료돼 리포트를 더 불러올 수 없어요. 협상 결과는 그대로 확인할 수 있어요.');
      } else ui.setConnection('서버에 연결하지 못했어요. 같은 대화의 리포트를 다시 확인하고 있어요.');
    });
  }
}
