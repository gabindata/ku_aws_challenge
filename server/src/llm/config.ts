/**
 * LLM 설정을 읽는 유일한 곳.
 *
 * 호출하는 쪽은 모델 이름도 게이트웨이 주소도 모른다.
 * 판정용과 리포트용을 따로 두는 이유는 성격이 다르기 때문이다.
 * 판정은 매 턴 불려서 응답이 빨라야 하고, 리포트는 세션당 한두 번이지만 글을 잘 써야 한다.
 *
 * 읽는 순서는 개별 설정 -> 공통 설정 -> 기본값이다.
 * 아무것도 안 적으면 기본값, 하나만 적으면 그것만 바뀐다.
 */

/** 프롬프트를 고칠 때마다 올린다. 판정 로그에 남겨 회귀 테스트의 기준으로 쓴다. */
export const PROMPT_VERSION = '2026-09-19.3';

import { MAX_OUTPUT_TOKENS, MAX_PROMPT_TOKENS } from '../data/stageSchema';

export type LlmMode = 'stub' | 'live';

/**
 * 대회에서 받은 게이트웨이. LiteLLM 프록시가 AWS Bedrock 앞에 서 있고
 * 말하는 규약은 OpenAI 쪽이다. 도메인 없이 EIP를 그대로 쓴다.
 */
const DEFAULT_BASE_URL = 'https://52.79.201.46/v1';

export function baseUrl(): string {
  return process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * 키. 코드가 값을 기록하거나 응답에 싣지 않는다.
 * 대회 가이드가 API_KEY를 쓰므로 그 이름도 받아 준다.
 */
export function apiKey(): string {
  return process.env.LLM_API_KEY ?? process.env.API_KEY ?? '';
}

/**
 * stub이면 가짜 LLM이 답한다. 키가 준비되면 live로 바꾸는 것만으로 전환된다.
 * 키가 없는데 live면 호출이 실패하므로, 키가 없으면 stub으로 되돌린다.
 */
export function llmMode(): LlmMode {
  const requested = process.env.LLM_MODE === 'live' ? 'live' : 'stub';
  if (requested === 'live' && !apiKey()) {
    console.warn('[llm] LLM_MODE=live인데 LLM_API_KEY가 없어 stub으로 실행합니다');
    return 'stub';
  }
  return requested;
}

/**
 * 게이트웨이가 아는 별칭만 호출된다. 실제 모델 ID가 아니다.
 *
 * 가이드에 적힌 별칭이 다 불리는 게 아니라 신청서에서 승인받은 것만 불린다.
 * 지금 키로 부를 수 있는 것은 bedrock-gpt-5.6-sol, bedrock-gpt-5.6-terra 둘뿐이고
 * Claude 계열은 하나도 승인돼 있지 않다.
 *
 * 그중 sol은 판정 프롬프트(4.5천 토큰)에 20초를 줘도 응답이 오지 않는다.
 * 실측으로 쓸 수 있는 것은 terra 하나뿐이라 그것을 기본값으로 둔다.
 *
 * 승인 목록이 바뀌면 여기 기본값만 고치면 된다. 확인은 npm run llm:smoke.
 */
const DEFAULT_MODEL = 'bedrock-gpt-5.6-terra';

function model(role: 'JUDGE' | 'REPORT'): string {
  return process.env[`LLM_MODEL_${role}`]
    ?? process.env.LLM_MODEL
    ?? DEFAULT_MODEL;
}

export interface RoleConfig {
  model: string;
  /** 프롬프트 상한. 넘으면 오래된 왕복부터 덜어낸다 */
  maxPromptTokens: number;
  maxOutputTokens: number;
  /** 시도당 응답 시간 제한(ms) */
  timeoutMs: number;
}

/**
 * 판정 호출. 상한은 공통규칙 §4 상수를 그대로 쓴다.
 * 원안에서 올린 이유는 stageSchema.ts의 두 상수 주석에 있다.
 */
export function judgeConfig(): RoleConfig {
  return {
    model: model('JUDGE'),
    maxPromptTokens: MAX_PROMPT_TOKENS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // 타이머가 인정하는 정지 시간이 요청당 최대 20초라 그에 맞춘다.
    timeoutMs: 20_000,
  };
}

/** 리포트 생성. 판정과 예산이 완전히 분리된다. */
export function reportConfig(): RoleConfig {
  return {
    model: model('REPORT'),
    maxPromptTokens: 16_000,
    maxOutputTokens: 2_000,
    // 4.5천 토큰 판정이 5초 걸린다. 리포트 입력은 그 세 배라 원래 잡았던
    // 15초로는 정상 응답도 끊긴다. 종료 화면이라 좀 기다려도 된다.
    timeoutMs: 40_000,
  };
}
