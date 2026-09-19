import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { RoleConfig } from './config';
import { apiKey, baseUrl } from './config';

/**
 * 모델 호출 한 곳.
 *
 * 부르는 쪽은 게이트웨이도 SDK도 모른다. 프롬프트와 스키마만 주면 된다.
 * 그래서 게이트웨이나 모델을 바꿀 때 고칠 자리가 이 파일과 config.ts 두 군데로 끝난다.
 *
 * 대회 게이트웨이는 LiteLLM 프록시가 AWS Bedrock 앞에 선 구조다.
 * 말하는 규약이 OpenAI 쪽이라 Anthropic 공식 SDK가 아니라 openai SDK를 쓴다.
 * 부르는 모델 자체는 Claude가 맞다 (bedrock-claude-* 별칭).
 */

let cached: OpenAI | null = null;

function client(): OpenAI {
  if (!cached) {
    cached = new OpenAI({
      baseURL: baseUrl(),
      apiKey: apiKey(),
      // SDK 기본값은 2회 재시도다. 그대로 두면 timeoutMs가 3배로 늘어나
      // 20초로 잡은 제한이 실제로는 60초가 된다. 재시도는 호출부가 맡는다.
      maxRetries: 0,
    });
  }
  return cached;
}

export interface StructuredRequest<T extends z.ZodType> {
  config: RoleConfig;
  /** 스테이지마다 고정인 부분 */
  system: string;
  /** 매 턴 바뀌는 부분 */
  userContent: string;
  schema: T;
  /** 스키마 이름. 게이트웨이가 응답 형식을 식별하는 데 쓴다 */
  name: string;
}

/**
 * 구조화 출력으로 한 번 호출한다.
 *
 * 스키마에 맞지 않으면 던진다. 호출부의 수정 재요청 규칙이 그걸 받는다.
 */
export async function callStructured<T extends z.ZodType>(
  request: StructuredRequest<T>,
): Promise<z.infer<T>> {
  try {
    return await parseCall(request);
  } catch (err) {
    // 게이트웨이가 json_schema를 못 받는 경우가 있다. 그때만 프롬프트로 형식을 지시하고
    // 돌아온 글에서 JSON을 직접 꺼낸다. 형식이 틀리면 아래에서 똑같이 던진다.
    if (!isFormatUnsupported(err)) throw err;
    console.warn('[llm] 게이트웨이가 json_schema를 거부해 프롬프트 지시 방식으로 재시도합니다');
    return await promptedJsonCall(request);
  }
}

/** 권장 경로. 게이트웨이가 응답 형식을 강제해 준다. */
async function parseCall<T extends z.ZodType>(r: StructuredRequest<T>): Promise<z.infer<T>> {
  const completion = await client().chat.completions.parse(
    {
      model: r.config.model,
      max_tokens: r.config.maxOutputTokens,
      messages: [
        { role: 'system', content: r.system },
        { role: 'user', content: r.userContent },
      ],
      response_format: zodResponseFormat(r.schema, r.name),
    },
    { timeout: r.config.timeoutMs },
  );

  const choice = completion.choices[0];
  if (!choice) throw new Error('응답이 비어 있습니다');
  if (choice.message.refusal) throw new Error(`모델이 응답을 거절했습니다: ${choice.message.refusal}`);
  if (choice.finish_reason === 'length') {
    throw new Error(`출력이 ${r.config.maxOutputTokens}토큰에서 잘렸습니다`);
  }
  const parsed = choice.message.parsed;
  if (!parsed) throw new Error('구조화 출력 파싱 실패');
  return parsed as z.infer<T>;
}

/** 대비 경로. 형식 강제 없이 부르고 글에서 JSON을 꺼내 검사한다. */
async function promptedJsonCall<T extends z.ZodType>(r: StructuredRequest<T>): Promise<z.infer<T>> {
  const shape = JSON.stringify(z.toJSONSchema(r.schema));
  const system = `${r.system}\n\n# 출력 형식\n아래 JSON 스키마에 맞는 JSON 객체 하나만 출력한다.\n설명, 인사말, 코드 펜스를 덧붙이지 않는다.\n${shape}`;

  const completion = await client().chat.completions.create(
    {
      model: r.config.model,
      max_tokens: r.config.maxOutputTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: r.userContent },
      ],
    },
    { timeout: r.config.timeoutMs },
  );

  const choice = completion.choices[0];
  if (!choice) throw new Error('응답이 비어 있습니다');
  if (choice.finish_reason === 'length') {
    throw new Error(`출력이 ${r.config.maxOutputTokens}토큰에서 잘렸습니다`);
  }
  return r.schema.parse(extractJson(choice.message.content ?? '')) as z.infer<T>;
}

/**
 * 글에서 JSON 객체를 꺼낸다.
 *
 * 코드 펜스로 감싸거나 앞뒤에 한 마디 붙이는 모델이 있어서
 * 첫 '{'부터 마지막 '}'까지를 잘라 쓴다.
 */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('응답에서 JSON을 찾지 못했습니다');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * json_schema를 못 받는 게이트웨이인지 가린다.
 *
 * 형식 자체를 거부한 경우에만 대비 경로로 넘긴다.
 * 인증 실패·모델 미승인·시간 초과는 그대로 던져야 원인이 드러난다.
 */
function isFormatUnsupported(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false;
  if (err.status !== 400 && err.status !== 422 && err.status !== 500) return false;
  return /response_format|json_schema|structured output|not supported/i.test(String(err.message));
}
