import type { AgreementDefinition } from '../data/stageSchema';

/**
 * 합의 비교기.
 *
 * LLM이 정규화한 value와 스테이지의 expected를 대조해 참/거짓만 돌려준다.
 * 여기서 한국어를 파싱하지 않는다 — 그건 LLM의 몫이다 (공통규칙 §5).
 *
 * 스테이지 JSON은 validatorId(이름)와 expected(숫자·값)만 갖고,
 * "어떻게 비교하는가"는 이 파일이 안다. 그래서 기획은 밸런스 숫자를
 * 혼자 바꿀 수 있고, 새로운 종류의 판정이 필요할 때만 백엔드가 함수를 추가한다.
 */

export type Validator = (
  value: Record<string, unknown>,
  expected: Record<string, unknown>,
) => boolean;

// ── 값 꺼내기 도우미 ──
// value는 LLM이 만든 것이라 어떤 모양이든 올 수 있다. 타입을 확인하고 꺼낸다.

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

function num(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strArray(o: Record<string, unknown>, key: string): string[] | null {
  const v = o[key];
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

/** "9:05" → "09:05". 한국어 파싱이 아니라 HH:MM 표기 통일이다. */
function normalizeTime(raw: string | null): string | null {
  if (raw === null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour > 23 || Number(m[2]) > 59) return null;
  return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

// ── 비교기 ──

/**
 * weekdaySchedule — 요일과 시간대가 요구 조건을 만족하는가.
 *
 * expected: { weekdays: ["MON"..."FRI"], start: "23:00", end: "07:00", minimumDayCount: 5 }
 *
 * 요구 요일을 하나라도 빠뜨리면 미충족이다. 스테이지 1의
 * "평일 2~4일 또는 주말만 제안하면 미충족" 규칙이 여기서 걸린다.
 * 요구보다 많이 제안하는 것(평일 5일 + 토요일)은 막지 않는다.
 */
export const weekdaySchedule: Validator = (value, expected) => {
  const wantDays = strArray(expected, 'weekdays');
  const gotDays = strArray(value, 'weekdays');
  if (wantDays === null || gotDays === null) return false;

  const got = new Set(gotDays.map((d) => d.toUpperCase()));
  if (!wantDays.every((d) => got.has(d.toUpperCase()))) return false;

  const minCount = num(expected, 'minimumDayCount');
  if (minCount !== null && got.size < minCount) return false;

  // 시간대는 expected에 있을 때만 본다. 요일만 보는 스테이지도 있을 수 있다.
  for (const field of ['start', 'end'] as const) {
    const want = normalizeTime(str(expected, field));
    if (want === null) continue;
    if (normalizeTime(str(value, field)) !== want) return false;
  }
  return true;
};

/**
 * exactOffer — NPC가 제시한 선택지 id를 그대로 수락했는가.
 *
 * expected: { startOfferId: "next_monday_night" }
 *
 * 날짜 연산을 하지 않는다. 월드 달력이 없으므로 "다음 주 월요일"이
 * 며칠인지 계산하지 않고, 그 선택지를 받았는지만 본다.
 * expected에 있는 모든 키가 value에서 문자열로 일치해야 한다.
 */
export const exactOffer: Validator = (value, expected) => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return false;
  return keys.every((key) => {
    const want = str(expected, key);
    return want !== null && str(value, key) === want;
  });
};

/**
 * reliabilityAnyOf — 책임 약속. 둘 중 하나만 하면 된다.
 *
 * expected: { minDurationMonths: 3, acceptedAdvanceNotice: "previous_day" }
 *
 * "최소 3개월 근무" 또는 "못 나올 때 전날 연락" 중 하나면 충족이다.
 * 두 경우의 value가 필드부터 달라(durationMonths / advanceNotice)
 * 단순 동등 비교로 표현되지 않기 때문에 별도 비교기로 둔다.
 */
export const reliabilityAnyOf: Validator = (value, expected) => {
  const minMonths = num(expected, 'minDurationMonths');
  const months = num(value, 'durationMonths');
  if (minMonths !== null && months !== null && months >= minMonths) return true;

  const accepted = str(expected, 'acceptedAdvanceNotice');
  if (accepted !== null && str(value, 'advanceNotice') === accepted) return true;

  return false;
};

// ── 레지스트리 ──

export const validators: Record<string, Validator> = {
  weekdaySchedule,
  exactOffer,
  reliabilityAnyOf,
};

export function isKnownValidator(validatorId: string): boolean {
  return validatorId in validators;
}

/**
 * 합의 정의 하나를 놓고 값을 판정한다.
 *
 * 모르는 validatorId면 통과시키지 않는다. 기획이 오타를 냈거나
 * 아직 만들지 않은 비교기를 가리킨 경우인데, 통과시키면 그 스테이지가
 * 조용히 쉬워진다. 서버를 죽이지는 않고 로그만 남긴다.
 */
export function isSatisfied(
  definition: AgreementDefinition,
  value: Record<string, unknown>,
): boolean {
  const validator = validators[definition.validatorId];
  if (!validator) {
    console.error(`[validator] 알 수 없는 validatorId: ${definition.validatorId}`);
    return false;
  }
  return validator(value, definition.expected);
}
