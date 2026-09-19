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
export const PROMPT_VERSION = '2026-09-19.2';

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
 * 승인된 Claude 별칭: bedrock-haiku, bedrock-sonnet,
 *   bedrock-claude-sonnet-5, bedrock-claude-opus-4-8, bedrock-claude-fable-5
 * 내 키로 실제 부를 수 있는 목록은 GET /v1/models 로 확인한다.
 */
const DEFAULT_MODEL = 'bedrock-claude-sonnet-5';

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
 * 판정 호출. 공통규칙 §4의 상한에서 두 값을 올렸다. 둘 다 재봤더니 원안으로는 안 돌아간다.
 *
 * 입력 4,000 -> 9,000
 *   고정 규칙 + 판정 기준표만으로 스테이지1 4,186 / 2 5,201 / 3 5,155토큰이다.
 *   판정 기준표는 어떤 경우에도 자를 수 없으니 4,000으로는 대화를 한 줄도 못 싣는다.
 *   최근 왕복 6회까지 다 실은 최악이 7,586토큰이라 여유를 두고 9,000으로 잡았다.
 *
 * 출력 500 -> 1,500
 *   합의 키 하나만 판정해도 JSON이 660토큰이고 다섯 개면 1,750토큰이다. 500이면 잘린다.
 */
export function judgeConfig(): RoleConfig {
  return {
    model: model('JUDGE'),
    maxPromptTokens: 9_000,
    maxOutputTokens: 1_500,
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
    timeoutMs: 15_000,
  };
}
