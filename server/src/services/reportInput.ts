import type { EndReason, Outcome, Turn } from '../../../shared/types/negotiationTypes';
import type { StyleSignals } from '../../../shared/types/styleReportTypes';
import type { Session } from '../models/session';
import { normalizeForLength } from './styleAnalyzer';

/**
 * 종료 리포트에 넣을 자료를 고른다 (결과 리포트 기획 §5).
 *
 * LLM 호출과 무관한 순수 계산이다. 프롬프트로 어떻게 직렬화할지는 llm 쪽이 정한다.
 *
 * 기록이 길면 전부 넣을 수 없다. 그때 무엇을 지킬지가 이 파일의 전부다.
 * - 최종 결과·종료 이유·합의 상태와 전체 유효 발화의 분석값은 언제나 유지한다
 * - 인용 후보는 원문을 그대로 넣는다. 요약으로 바꾸거나 잘라서 의미를 바꾸지 않는다
 * - 플레이어 원문과 앞뒤 NPC 맥락은 묶어서 넣고, 상한에 맞지 않으면 묶음째 뺀다
 * - 합의 변화·종료 원인, 극단적인 발화, 반복된 말버릇의 대표 사례를 먼저 지킨다
 * - 뺀 기록이 있으면 그 사실을 LLM에 알린다
 */

/** 첫 구현 기준. 지침을 포함한 전체 입력 상한 */
export const REPORT_MAX_INPUT_TOKENS = 16_000;
/** 규칙·결과·분석값처럼 자를 수 없는 부분에 잡아두는 여유 */
export const REPORT_RESERVED_TOKENS = 4_000;

/**
 * 토큰 수 어림. 한국어는 글자당 약 1토큰으로 보고 여유 있게 잡는다.
 * TODO(LLM 연결 시): client.messages.countTokens로 실측해 이 어림을 대체한다.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.1) + 4;
}

/** 플레이어 발화 하나와 그 앞뒤 NPC 맥락. 인용 후보의 단위다. */
export interface ReportExchange {
  playerTurnId: string;
  /** 원문 그대로 */
  playerText: string;
  npcBefore: string | null;
  npcAfter: string | null;
  /** 클수록 먼저 지킨다 */
  priority: number;
}

/** 전체 기록에서 서버가 직접 센 값. LLM이 횟수를 추측하지 않게 하려고 넘긴다. */
export interface VerifiedCounts {
  validUtterances: number;
  /** 쿠션 표현을 쓴 발화 수 */
  cushionUtterances: number;
  /** 표현별 등장 발화 수. 예: { "혹시": 5 } */
  cushionExpressions: Record<string, number>;
  /** 태그별 집계. 화면에 표시하지 않고 근거 선정과 총평의 보조자료로만 쓴다 */
  stageTags: Record<string, number>;
  /** 정규화된 글자 수 평균 */
  averageLength: number;
}

export interface ReportInput {
  outcome: Outcome;
  endReason: EndReason;
  /** 서버가 확정한 합의 상태. LLM이 결과를 다시 판정하지 않는다 */
  agreements: { key: string; status: string; summary: string | null }[];
  /** 전체 유효 발화의 분석값. 축약해도 유지한다 */
  signals: StyleSignals[];
  counts: VerifiedCounts;
  /** 원문을 제공한 발화만 인용 후보가 된다 */
  exchanges: ReportExchange[];
  /** 일부 기록을 뺐는가 */
  truncated: boolean;
}

/**
 * 서버가 전체 기록에서 직접 센 값.
 *
 * 습관 횟수를 LLM에게 세게 하면, 축약으로 잘린 부분을 못 본 채 전체 횟수를
 * 추측하게 된다. 검증 가능한 집계만 쓰라는 규칙이 이것 때문이다.
 */
export function countVerified(playerTurns: Turn[], signals: StyleSignals[]): VerifiedCounts {
  const cushionExpressions: Record<string, number> = {};
  const stageTags: Record<string, number> = {};
  let cushionUtterances = 0;

  for (const s of signals) {
    if (s.cushion.used) {
      cushionUtterances += 1;
      // 한 발화에 같은 표현이 여러 번 나와도 발화 1개로 센다.
      for (const phrase of new Set(s.cushion.expressions)) {
        cushionExpressions[phrase] = (cushionExpressions[phrase] ?? 0) + 1;
      }
    }
    // 태그도 유효 발화당 최대 1회.
    for (const tag of new Set(s.stageTags)) {
      stageTags[tag] = (stageTags[tag] ?? 0) + 1;
    }
  }

  const lengthSum = playerTurns.reduce((sum, t) => sum + normalizeForLength(t.text).length, 0);
  return {
    validUtterances: playerTurns.length,
    cushionUtterances,
    cushionExpressions,
    stageTags,
    averageLength: playerTurns.length === 0 ? 0 : lengthSum / playerTurns.length,
  };
}

/**
 * 발화별 우선순위.
 *
 * 3 합의 상태를 만든 근거이거나 치명적 행동의 근거. 없으면 총평의 결론이 흔들린다
 * 2 대화를 끝낸 마지막 발화
 * 1 말버릇이나 스테이지 태그가 붙은 발화. 반복된 습관의 대표 사례가 된다
 * 0 나머지
 */
function priorityOf(
  turn: Turn,
  index: number,
  lastIndex: number,
  evidenceIds: Set<string>,
  signalById: Map<string, StyleSignals>,
): number {
  if (evidenceIds.has(turn.id)) return 3;
  if (index === lastIndex) return 2;
  const signal = signalById.get(turn.id);
  if (signal && (signal.cushion.used || signal.stageTags.length > 0)) return 1;
  return 0;
}

export function buildReportInput(
  session: Session,
  playerTurns: Turn[],
  maxInputTokens = REPORT_MAX_INPUT_TOKENS,
): ReportInput {
  const signalById = new Map(session.styleSignals.map((s) => [s.evidenceTurnId, s]));
  const turnIndex = new Map(session.turns.map((t, i) => [t.id, i]));

  // 합의를 만든 근거와 치명적 행동의 근거
  const evidenceIds = new Set<string>(session.fatalTurnIds);
  for (const state of Object.values(session.agreements)) {
    for (const id of state.evidenceTurnIds) evidenceIds.add(id);
  }

  const lastIndex = playerTurns.length - 1;
  const all: ReportExchange[] = playerTurns.map((turn, i) => {
    const at = turnIndex.get(turn.id) ?? 0;
    const before = [...session.turns.slice(0, at)].reverse().find((t) => t.speaker === 'npc');
    const after = session.turns.slice(at + 1).find((t) => t.speaker === 'npc');
    return {
      playerTurnId: turn.id,
      playerText: turn.text,
      npcBefore: before?.text ?? null,
      npcAfter: after?.text ?? null,
      priority: priorityOf(turn, i, lastIndex, evidenceIds, signalById),
    };
  });

  const budget = maxInputTokens - REPORT_RESERVED_TOKENS;
  const cost = (e: ReportExchange) =>
    estimateTokens(e.playerText) + estimateTokens(e.npcBefore ?? '') + estimateTokens(e.npcAfter ?? '');

  let kept = all;
  let truncated = false;
  if (all.reduce((sum, e) => sum + cost(e), 0) > budget) {
    truncated = true;
    // 우선순위가 낮고 오래된 묶음부터 뺀다. 묶음 단위로만 빼서 원문이 잘리지 않게 한다.
    const order = all
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.priority - b.e.priority) || (a.i - b.i));

    const dropped = new Set<string>();
    let total = all.reduce((sum, e) => sum + cost(e), 0);
    for (const { e } of order) {
      if (total <= budget) break;
      dropped.add(e.playerTurnId);
      total -= cost(e);
    }
    kept = all.filter((e) => !dropped.has(e.playerTurnId));
  }

  return {
    outcome: session.outcome,
    endReason: session.endReason,
    agreements: Object.entries(session.agreements).map(([key, state]) => ({
      key, status: state.status, summary: state.summary,
    })),
    signals: session.styleSignals,
    counts: countVerified(playerTurns, session.styleSignals),
    exchanges: kept,
    truncated,
  };
}

/**
 * 유지해야 할 자료와 지침만으로도 상한을 넘는가.
 * 넘으면 로그를 남기고 생성 실패 화면을 적용한다.
 */
export function exceedsBudgetWithoutExchanges(input: ReportInput): boolean {
  const fixed = estimateTokens(JSON.stringify({
    outcome: input.outcome, endReason: input.endReason,
    agreements: input.agreements, signals: input.signals, counts: input.counts,
  }));
  return fixed + REPORT_RESERVED_TOKENS > REPORT_MAX_INPUT_TOKENS;
}
