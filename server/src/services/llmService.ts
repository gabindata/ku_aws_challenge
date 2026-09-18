import type { LlmTurnOutput, Turn } from '../../../shared/types/negotiationTypes';
import type { StyleNarrative, StyleSignals } from '../../../shared/types/styleReportTypes';
import type { Session } from '../models/session';
import { MAX_REPORT_CALLS_PER_SESSION, type StageDefinition } from '../data/stageSchema';
import {
  buildReportInput,
  exceedsBudgetWithoutExchanges,
  type ReportInput,
} from './reportInput';
import { stubEvaluateTurn, stubNarrative } from './stubLlm';

/**
 * Claude API 래퍼. API 키는 서버에만 존재한다.
 *
 * LLM이 의미 판정의 주체다. 발화와 대화 맥락을 읽고 각 합의 키의
 * 성립·번복·모호함을 판단하며, NPC 대사·치명적 행동·말투 신호를 함께 반환한다.
 * 성공·실패, 시간, 보상, 해금은 결정하지 않는다.
 *
 * 프롬프트 인젝션과 JSON 위조 요구는 게임 속 플레이어 발화로만 취급한다.
 */

export interface EvaluateTurnInput {
  stage: StageDefinition;
  session: Session;
  /** 이번 플레이어 발화의 메시지 id */
  playerTurnId: string;
  /** 판정 호출 35회 도달. NPC가 서사적으로 압박한다 */
  nearCallLimit: boolean;
  /** 40번째 판정 호출. NPC가 마무리 문장을 만든다 */
  finalCall: boolean;
  /** 이번 플레이어 발화 원문 */
  playerText: string;
  /** 선언 x 충족 교집합으로 걸러낸 월드 상태 참조 */
  worldStateReferences: Record<string, string>;
}

/**
 * true면 Claude 대신 stubLlm이 답한다.
 * API 키가 준비되고 프롬프트가 완성되면 false로 바꾸고 stubLlm.ts를 지운다.
 */
export const USE_STUB = true;

/**
 * 플레이어 발화 1건을 판정한다.
 *
 * 프롬프트에는 고정 시스템 규칙, 스테이지 판정 기준표, 최근 6왕복,
 * 현재 합의 요약, 이번 발화의 messageId, nearCallLimit/finalCall만 넣는다.
 * 전체 과거 대화는 보내지 않는다.
 *
 * 상한을 넘으면 가장 오래된 왕복부터 제거한다. 고정 시스템 규칙,
 * 판정 기준표, 현재 합의 요약은 어떤 경우에도 자르지 않는다.
 */
export async function evaluateTurn(input: EvaluateTurnInput): Promise<LlmTurnOutput> {
  if (USE_STUB) {
    return stubEvaluateTurn(input.stage, input.session, input.playerTurnId, input.playerText);
  }
  // TODO(2주차): 프롬프트 조립 → messages.parse()로 스키마 강제 → 결과 반환
  // 스키마·정합성 오류는 같은 입력으로 수정 재요청을 한 번 한다.
  // 수정 재요청은 세션당 5회이며 판정 호출 예산과 분리된다.
  //
  // 프롬프트에 넣을 월드 상태는 negotiationEngine.activeWorldStateReferences()로
  // 선언 x 충족 교집합만 고른다.
  throw new Error('not implemented');
}

// ─────────────────────────────────────────────
// 종료 리포트 생성 (기획 「결과 리포트 기획」 §2·§3·§5)
// ─────────────────────────────────────────────

/** 시도당 응답 시간 제한 */
export const REPORT_TIMEOUT_MS = 15_000;
export const REPORT_MAX_OUTPUT_TOKENS = 2_000;

export interface NarrativeInput {
  stage: StageDefinition;
  session: Session;
  /** 서버가 확정한 결과. LLM이 다시 판정하지 않는다. */
  outcome: string;
  endReason: string | null;
  playerTurns: Turn[];
  signals: StyleSignals[];
}

/**
 * 말투 이름·짧은 설명·근거 발화·협상 총평을 한 번에 생성한다.
 *
 * 성공·시간 초과·호출 상한·치명적 종료 모두 같은 규칙을 적용한다.
 * 최초 1회, 실패하면 재시도 1회까지만 부른다. 실패에는 형식 검증 실패,
 * 응답 시간 초과, API 오류가 포함된다. 재시도까지 실패하면 null을 돌려주고
 * 화면은 이름·설명·근거·총평을 숨긴 채 안내를 띄운다.
 *
 * 판정 호출(4000토큰)과 예산이 분리된다.
 */
export async function generateNarrative(input: NarrativeInput): Promise<StyleNarrative | null> {
  const { session } = input;
  const report = buildReportInput(session, input.playerTurns);

  // 유지해야 할 자료와 지침만으로도 상한을 넘으면 생성하지 않는다.
  if (exceedsBudgetWithoutExchanges(report)) {
    console.error('[report] 유지 자료만으로 입력 상한 초과 — 생성 실패 화면을 적용합니다');
    return null;
  }
  if (report.truncated) {
    console.warn(`[report] 기록 축약: 인용 후보 ${report.exchanges.length}/${input.playerTurns.length}개 유지`);
  }

  while (session.reportCallCount < MAX_REPORT_CALLS_PER_SESSION) {
    session.reportCallCount += 1;
    const attempt = session.reportCallCount;
    try {
      const attemptWork: Promise<StyleNarrative> = USE_STUB
        ? Promise.resolve(stubNarrative(report, input.playerTurns))
        : callReportModel(input, report);
      const raw = await withTimeout(attemptWork, REPORT_TIMEOUT_MS);
      // 근거 발화 ID가 이 세션의 리포트 대상 플레이어 발화인지 확인하고
      // 저장된 원문으로 교체한 뒤 시간순으로 배치한다.
      const verified = verifyNarrative(raw, input.playerTurns, report);
      if (verified) return verified;
      console.warn(`[report] 형식 검증 실패 (${attempt}/${MAX_REPORT_CALLS_PER_SESSION})`);
    } catch (err) {
      console.warn(`[report] 생성 실패 (${attempt}/${MAX_REPORT_CALLS_PER_SESSION})`, err);
    }
  }
  return null;
}

async function callReportModel(_input: NarrativeInput, _report: ReportInput): Promise<StyleNarrative> {
  // TODO(LLM 연결): 확정된 결과·종료 이유·합의 상태·전체 분석값·검증된 집계와
  // 인용 후보 묶음을 넣고 호출한다. 기록을 일부 뺐다면 그 사실도 함께 전달한다.
  // 입력 선택은 reportInput.ts가 끝내고, 여기서는 직렬화와 스키마 강제만 한다.
  throw new Error('not implemented');
}

/** 타임아웃도 형식 검증 실패와 같은 재시도·실패 규칙을 따른다. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`리포트 생성 ${ms}ms 초과`)), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * 잘못된 근거 ID는 검증 실패로 처리한다. 조용히 버리지 않는다.
 * 인용문은 LLM이 준 것을 쓰지 않고 저장된 원문으로 교체한다.
 */
function verifyNarrative(
  raw: StyleNarrative,
  playerTurns: Turn[],
  report: ReportInput,
): StyleNarrative | null {
  if (!raw.title?.trim() || !raw.summary?.trim()) return null;
  if (!Array.isArray(raw.highlights) || raw.highlights.length > 5) return null;

  const byId = new Map(playerTurns.map((t) => [t.id, t]));
  const order = new Map(playerTurns.map((t, i) => [t.id, i]));
  // 원문을 제공한 발화만 인용 후보다. 축약으로 뺀 기록은 인용할 수 없다.
  const quotable = new Set(report.exchanges.map((e) => e.playerTurnId));

  const merged = new Map<string, { turnId: string; quote: string; note: string }>();
  for (const h of raw.highlights) {
    const turn = byId.get(h.turnId);
    if (!turn || !quotable.has(h.turnId)) return null;

    // 같은 발화가 두 종류에 걸리면 하나로 합치고 두 이유를 함께 적는다.
    const existing = merged.get(h.turnId);
    if (existing) {
      if (h.note && !existing.note.includes(h.note)) existing.note = `${existing.note} · ${h.note}`;
      continue;
    }
    merged.set(h.turnId, { turnId: h.turnId, quote: turn.text, note: h.note });
  }

  // 대화 흐름대로 놓는다.
  const highlights = [...merged.values()]
    .sort((a, b) => (order.get(a.turnId) ?? 0) - (order.get(b.turnId) ?? 0));

  return { ...raw, highlights };
}
