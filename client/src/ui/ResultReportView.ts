import type { ClientNegotiationView } from '../types';
import './resultReport.css';
const AXES = [['formality','발화 격식','일상적','격식적'],['directness','직접성','암시적','직접적'],['cushion','쿠션 표현','적게 사용','많이 사용'],['length','발화 길이','짧게','길게']] as const;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') {
  const n = document.createElement(tag); n.textContent = text; n.className = cls; return n;
}
/** 서버 문구를 HTML로 해석하지 않고 원문 그대로 표시한다. */
export class ResultReportView {
  readonly root = el('main', '', 'result-report');
  private analysis = el('div');
  private notice = el('p', '', 'connection');
  private signature = '';
  constructor(view: ClientNegotiationView, stageId: number, onExit: () => void, onRetry: () => void, onButtonClick: () => void) {
    this.root.tabIndex = -1;
    this.root.setAttribute('aria-label','협상 결과 리포트');
    const page = el('div','','report-page');
    page.append(el('p',`STAGE ${stageId} · 대화 기록`,'eyebrow'));
    const hero = el('section','','card hero');
    const success = view.outcome === 'success';
    hero.append(el('h1',success ? '성공!' : '실패!'));
    const text = success ? view.successText : view.failureText;
    if (text) hero.append(el('p',text,'result-text'));
    if (!success) {
      const reasons = {time:'제한 시간이 끝났습니다.',fatal:'대화를 계속할 수 없어 협상이 종료됐습니다.',system:'시스템 문제로 협상이 종료됐습니다.',limit:view.limitText ?? '대화 가능 횟수에 도달했습니다.'};
      if (view.endReason) hero.append(el('p',reasons[view.endReason]));
      if (view.hintText) hero.append(el('p',view.hintText));
    }
    const img = el('img','','mascot');
    img.src = `${import.meta.env.BASE_URL}assets/images/ui/report-${success ? 'success' : 'failure'}.png`;
    img.alt = success ? '기쁜 너구리' : '아쉬운 너구리'; hero.append(img);
    this.notice.setAttribute('role','status');
    const actions = el('footer','','actions');
    const button = (text: string, fn: () => void) => { const b=el('button',text); b.type='button'; b.onclick=() => { onButtonClick(); fn(); }; return b; };
    if (!success) actions.append(button('다시 하기',onRetry));
    if (success || view.onClose !== 'restart') actions.append(button('나가기',onExit));
    page.append(hero,this.notice,this.analysis,actions); this.root.append(page);
    document.body.append(this.root); this.update(view); this.root.focus();
  }
  setConnection(message: string): void { this.notice.textContent=message; }
  private section(title: string, cls=''): HTMLElement {
    const s=el('section','',`card ${cls}`); s.append(el('h2',title)); this.analysis.append(s); return s;
  }
  update(view: ClientNegotiationView): void {
    const signature=JSON.stringify([view.reportStatus,view.styleReport]);
    if (signature===this.signature) return;
    this.signature=signature;
    const scroll=this.root.scrollTop;
    this.analysis.replaceChildren();
    const report=view.styleReport, narrative=report?.narrative;
    const failed=view.reportStatus==='failed' || report?.analysisFailed===true;
    if (!failed && (view.reportStatus==='pending' || !report)) {
      const s=this.section('대화를 분석하고 있어요','loading'); s.setAttribute('role','status');
      s.append(el('p','결과는 확정됐어요. 말투 리포트를 준비하고 있어요.'));
    } else {
      if (report?.sampleNote) this.analysis.append(el('p',report.sampleNote,'sample-note'));
      if (failed) this.analysis.append(el('p','대화 분석을 불러오지 못했습니다','sample-note'));
      else {
        const obs=this.section('이번 대화의 말투','observation');
        if (narrative?.title) obs.append(el('h3',narrative.title));
        if (narrative?.titleNote) obs.append(el('p',narrative.titleNote));
        const quotes=this.section('당신의 기록','quotes');
        for (const h of (narrative?.highlights ?? []).slice(0,5)) {
          const f=el('figure'); f.append(el('blockquote',h.quote),el('figcaption',h.note)); quotes.append(f);
        }
      }
      const axes=this.section('말투의 네 가지 모습','axes');
      for (const [code,title,left,right] of AXES) {
        const a=report?.axes.find(a=>a.code===code);
        const enough=!!a && a.sampleCount>=3 && !a.insufficient && a.position!==null && Number.isFinite(a.position);
        const row=el('div','',`axis${enough ? '' : ' muted'}`); row.append(el('h3',title));
        const scale=el('div','','scale'), track=el('div','','track'); track.setAttribute('aria-hidden','true');
        if (enough) { const dot=el('span','','dot'); dot.style.left=`${Math.max(0,Math.min(100,a!.position!))}%`; track.append(dot); }
        scale.append(el('span',left),track,el('span',right)); row.append(scale);
        if (!enough) row.append(el('p',a ? '판단할 발화가 부족해요.' : '분석값을 불러오지 못했어요.','axis-note'));
        axes.append(row);
      }
      if (!failed || report?.validUtteranceCount===0) {
        const summary=this.section('협상 총평'); if (narrative?.summary) summary.append(el('p',narrative.summary,'summary'));
      }
    }
    this.root.scrollTop=scroll;
  }
  destroy(): void { this.root.remove(); }
}
