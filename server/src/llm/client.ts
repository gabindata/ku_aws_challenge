import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { RoleConfig } from './config';

/**
 * Claude 호출 한 곳.
 *
 * 부르는 쪽은 모델 이름도 SDK도 모른다. 프롬프트와 스키마만 주면 된다.
 * 그래서 모델을 바꿀 때 고칠 자리가 config.ts 한 군데로 끝난다.
 */

let cached: Anthropic | null = null;

/** 키는 환경 변수에서 SDK가 직접 읽는다. 코드가 키 값을 만지지 않는다. */
export function anthropic(): Anthropic {
  if (!cached) cached = new Anthropic();
  return cached;
}

export interface StructuredRequest<T extends z.ZodType> {
  config: RoleConfig;
  /** 스테이지마다 고정인 부분. 앞에 두어야 프롬프트 캐시가 걸린다 */
  system: string;
  /** 매 턴 바뀌는 부분 */
  userContent: string;
  schema: T;
}

/**
 * 구조화 출력으로 한 번 호출한다.
 *
 * 스키마에 맞지 않으면 parsed_output이 비어 오므로, 그때는 던져서
 * 호출부의 수정 재요청 규칙을 타게 한다.
 */
export async function callStructured<T extends z.ZodType>(
  request: StructuredRequest<T>,
): Promise<z.infer<T>> {
  const { config, system, userContent, schema } = request;

  const response = await anthropic().messages.parse(
    {
      model: config.model,
      max_tokens: config.maxOutputTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(schema) },
    },
    { timeout: config.timeoutMs },
  );

  if (response.stop_reason === 'refusal') {
    throw new Error('모델이 응답을 거절했습니다');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`출력이 ${config.maxOutputTokens}토큰에서 잘렸습니다`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('구조화 출력 파싱 실패');
  return parsed as z.infer<T>;
}

/**
 * 프롬프트 토큰 수. 자를지 말지를 정하는 데 쓴다.
 *
 * 실측이라 정확하지만 호출이 한 번 더 들어간다. 판정·리포트 예산과는
 * 별개이며 요금도 들지 않는다.
 */
export async function countPromptTokens(
  config: RoleConfig,
  system: string,
  userContent: string,
): Promise<number> {
  const result = await anthropic().messages.countTokens({
    model: config.model,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: userContent }],
  });
  return result.input_tokens;
}
