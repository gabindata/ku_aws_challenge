import type { ClientNegotiationView } from '../types';
import './resultReport.css';
import { STYLE_AXIS_LABELS, MIN_AXIS_SAMPLE, INSUFFICIENT_AXIS_NOTE } from '../../../shared/types/styleReportTypes';
const AXES = ['formality', 'directness', 'cushion', 'length'] as const;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') {
  const n = document.createElement(tag); n.textContent = text; n.className = cls; return n;
}
/** 서버 문구를 HTML로 해석하지 않고 원문 그대로 표시한다. */
export class ResultReportView {
  readonly root = el('main', '', 'result-report');
  private analysis = el('div');
  private page = el('div','','report-page');
  private loading = el('section','','report-generating');
  private notice = el('p', '', 'connection');
  private signature = '';
  private delayTimer?: ReturnType<typeof setTimeout>;
  private recovery = el('div', '', 'actions');
  private delayNote = el('p', '생성이 지연되고 있어요. 다시 조회하거나 나갈 수 있어요.');
  constructor(view: ClientNegotiationView, stageId: number, onExit: () => void, onRetry: () => void, onButtonClick: () => void, onRefresh: () => void = () => {}) {
    this.root.tabIndex = -1;
    this.root.setAttribute('aria-label','협상 결과 리포트');
    const page = this.page;
    this.loading.setAttribute('role', 'status');
    this.loading.setAttribute('aria-live', 'polite');
    this.loading.append(el('h1', '생성 중'), el('p', '결과 리포트를 만들고 있어요. 잠시만 기다려 주세요.'));
    const dots = el('div', '', 'report-loading-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) dots.append(el('span', '●'));
    this.recovery.hidden = true;
    this.delayNote.hidden = true;
    for (const [text, action] of [['다시 조회', onRefresh], ['나가기', onExit]] as const) {
      const button = el('button', text); button.type = 'button';
      button.onclick = () => { onButtonClick(); action(); };
      this.recovery.append(button);
    }
    this.loading.append(dots, this.delayNote, this.recovery);
    page.append(el('p',stageId === 0 ? '튜토리얼 · 대화 기록' : `STAGE ${stageId} · 대화 기록`,'eyebrow'));
    const hero = el('section','','card hero');
    const success = view.outcome === 'success';
    hero.append(el('h1',success ? '성공!' : '실패!'));
    const text = success ? view.successText : view.failureText;
    if (text) hero.append(el('p',text,'result-text'));
    if (stageId === 0 && success) {
      if (view.fixedTerms?.length) {
        for (const term of view.fixedTerms) hero.append(el('p', term));
      }
      hero.append(el('p', '이제 튜토리얼이 완료되었습니다. 스테이지를 클리어하며 게임을 진행해보세요.'));
    }
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
    page.append(hero,this.analysis,actions); this.root.append(this.loading,this.notice,page);
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
    const failed=view.reportStatus==='failed' || report?.analysisFailed===true || (view.reportStatus==='ready' && !report);
    const pending = !failed && (view.reportStatus==='pending' || !report);
    this.loading.hidden = !pending;
    this.page.hidden = pending;
    this.root.setAttribute('aria-busy', String(pending));
    if (pending && !this.delayTimer) {
      this.delayTimer = setTimeout(() => {
        this.delayNote.hidden = false; this.recovery.hidden = false;
      }, 20000);
    } else if (!pending) {
      clearTimeout(this.delayTimer); this.delayTimer = undefined;
      this.delayNote.hidden = true; this.recovery.hidden = true;
    }
    if (pending) {
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
      for (const code of AXES) {
        const { label: title, leftLabel: left, rightLabel: right } = STYLE_AXIS_LABELS[code];
        const a=report?.axes.find(a=>a.code===code);
        const enough=!!a && a.sampleCount>=MIN_AXIS_SAMPLE && !a.insufficient && a.position!==null && Number.isFinite(a.position);
        const row=el('div','',`axis${enough ? '' : ' muted'}`); row.append(el('h3',title));
        const scale=el('div','','scale'), track=el('div','','track'); track.setAttribute('aria-hidden','true');
        if (enough) { const dot=el('span','','dot'); dot.style.left=`${Math.max(0,Math.min(100,a!.position!))}%`; track.append(dot); }
        scale.append(el('span',left),track,el('span',right)); row.append(scale);
        if (!enough) row.append(el('p',a ? INSUFFICIENT_AXIS_NOTE : '분석값을 불러오지 못했어요.','axis-note'));
        axes.append(row);
      }
      if (!failed || report?.validUtteranceCount===0) {
        const summary=this.section('협상 총평'); if (narrative?.summary) summary.append(el('p',narrative.summary,'summary'));
      }
    }
    this.root.scrollTop=scroll;
  }
  destroy(): void { clearTimeout(this.delayTimer); this.root.remove(); }
}
