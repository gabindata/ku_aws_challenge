import type { Turn } from '../../../shared/types/negotiationTypes';
import {
  INSUFFICIENT_AXIS_NOTE,
  LENGTH_AXIS_MAX_CHARS,
  LENGTH_AXIS_MIN_CHARS,
  LOW_SAMPLE_NOTE,
  MIN_AXIS_SAMPLE,
  NO_SPEECH_NOTE,
  STYLE_AXIS_LABELS,
  type StyleAxis,
  type StyleAxisCode,
  type StyleNarrative,
  type StyleReport,
  type StyleSignals,
} from '../../../shared/types/styleReportTypes';

/**
 * 말투 축 집계 (기획 「결과 리포트 기획」 §4).
 *
 * LLM은 발화의 특징을 분류하고 서버는 저장된 판정값을 집계한다.
 * 발화 길이만 서버가 직접 계산한다. 내부 산출값은 축 위치를 그리는 데만 쓰고
 * 화면에는 숫자를 표시하지 않는다.
 *
 * 축은 종료 LLM의 생성 성공 여부와 무관하게 항상 표시한다.
 */

/** 길이 계산용 전처리. 인용에 쓰는 원문은 바꾸지 않는다. */
export function normalizeForLength(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function axis(
  code: StyleAxisCode,
  sampleCount: number,
  computePosition: () => number,
): StyleAxis {
  const enough = sampleCount >= MIN_AXIS_SAMPLE;
  return {
    code,
    ...STYLE_AXIS_LABELS[code],
    // 표본이 부족하면 가운데나 왼쪽 끝을 기본값으로 찍지 않는다.
    position: enough ? Math.round(computePosition()) : null,
    insufficient: !enough,
    sampleCount,
  };
}

/**
 * 네 축을 만든다. 표시 순서는 격식 → 직접성 → 쿠션 → 길이로 고정한다.
 *
 * playerTurns는 유효 발화만 넘긴다. 빈 STT·중복 요청·시스템 재시도는 제외된
 * 상태여야 한다. signals는 그 발화들의 분석값이다.
 */
export function buildAxes(playerTurns: Turn[], signals: StyleSignals[]): StyleAxis[] {
  const total = playerTurns.length;

  // ① 발화 격식 — null이 아닌 발화만. null을 0점으로 바꾸지 않는다.
  const formalityValues = signals
    .map((s) => s.formality)
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .map<number>((f) => (f === 'casual' ? 0 : f === 'polite' ? 50 : 100));

  // ② 직접성 — 요청·제안이 있는 발화만. direct ÷ (direct + indirect)
  const directnessValues = signals
    .map((s) => s.directness)
    .filter((d): d is NonNullable<typeof d> => d !== null);
  const directCount = directnessValues.filter((d) => d === 'direct').length;

  // ③ 쿠션 표현 — 전체 유효 발화 대비 사용한 발화 수
  const cushionCount = signals.filter((s) => s.cushionUsed).length;

  // ④ 발화 길이 — 서버가 직접 계산
  const lengthSum = playerTurns.reduce((sum, t) => sum + normalizeForLength(t.text).length, 0);

  return [
    axis('formality', formalityValues.length, () =>
      formalityValues.reduce((a, b) => a + b, 0) / formalityValues.length),
    axis('directness', directnessValues.length, () =>
      (directCount / directnessValues.length) * 100),
    axis('cushion', total, () => (cushionCount / total) * 100),
    axis('length', total, () => {
      const avg = lengthSum / total;
      const ratio = (avg - LENGTH_AXIS_MIN_CHARS) / (LENGTH_AXIS_MAX_CHARS - LENGTH_AXIS_MIN_CHARS);
      return Math.min(1, Math.max(0, ratio)) * 100;
    }),
  ];
}

/** 표본이 부족한 축에 화면이 붙일 안내. 서버는 판단만 하고 문구는 공유 상수를 쓴다. */
export function axisNote(a: StyleAxis): string | null {
  return a.insufficient ? INSUFFICIENT_AXIS_NOTE : null;
}

/**
 * 리포트를 조립한다.
 *
 * narrative는 종료 LLM이 만든 것이고, 재시도까지 실패하면 null이다.
 * 그때도 축은 저장된 분석값으로 그대로 표시한다 — 화면 구성을 바꾸지 않는다.
 */
export function buildReport(
  playerTurns: Turn[],
  signals: StyleSignals[],
  narrative: StyleNarrative | null,
): StyleReport {
  const count = playerTurns.length;
  return {
    narrative,
    analysisFailed: narrative === null,
    axes: buildAxes(playerTurns, signals),
    // 화면 구성은 평소와 똑같이 두고 맨 위 한 줄만 바꿔 넣는다.
    sampleNote: count === 0 ? NO_SPEECH_NOTE : count <= 2 ? LOW_SAMPLE_NOTE : null,
    validUtteranceCount: count,
  };
}

/**
 * 유효 발화가 0개일 때의 협상 총평.
 *
 * 종료 LLM의 생성 성공 여부와 무관하게 서버가 종료 사실만 한 줄로 적고
 * 행동을 평가하지 않는다. 180~220자 기준을 적용하지 않으며 영역을 숨기지도 않는다.
 */
export function silentSummary(endReason: string | null): string {
  switch (endReason) {
    case 'time': return '말을 하지 않은 채 제한 시간이 끝났습니다.';
    case 'limit': return '말을 하지 않은 채 대화가 끝났습니다.';
    case 'fatal': return '대화가 중단된 채 끝났습니다.';
    default: return '말을 하지 않은 채 대화가 끝났습니다.';
  }
}
