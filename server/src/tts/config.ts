/**
 * TTS 설정을 읽는 유일한 곳.
 *
 * LLM 쪽(llm/config.ts)과 같은 방침이다. 부르는 쪽은 업체도 모델도 목소리도 모르고,
 * 바꿀 자리는 .env 한 군데로 끝난다.
 *
 * 키는 절대 브라우저로 내려가지 않는다. 클라이언트는 우리 서버의
 * /api/tts 만 부르고, 서버가 대신 일레븐랩스를 부른다.
 */

export type TtsMode = 'off' | 'elevenlabs';

export function apiKey(): string {
  return process.env.ELEVENLABS_API_KEY ?? '';
}

/**
 * off면 서버가 음성을 만들지 않고, 클라이언트가 알아서 폴백한다.
 * 키가 없는데 elevenlabs면 부를 수 없으므로 off로 되돌린다.
 */
export function ttsMode(): TtsMode {
  const requested = process.env.TTS_MODE === 'elevenlabs' ? 'elevenlabs' : 'off';
  if (requested === 'elevenlabs' && !apiKey()) {
    console.warn('[tts] TTS_MODE=elevenlabs인데 ELEVENLABS_API_KEY가 없어 off로 실행합니다');
    return 'off';
  }
  return requested;
}

const BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * 모델 ID. 지연과 품질이 맞바뀐다.
 *
 *   eleven_flash_v2_5        가장 빠름. 실시간 대화용
 *   eleven_turbo_v2_5        중간
 *   eleven_multilingual_v2   품질 최상, 가장 느림
 *
 * 이름과 제공 여부는 업체가 바꾼다. 실제로 부를 수 있는지는
 * npm run tts:bench 로 확인한다.
 */
const DEFAULT_MODEL = 'eleven_flash_v2_5';

export function model(): string {
  return process.env.ELEVENLABS_MODEL ?? DEFAULT_MODEL;
}

/**
 * NPC별 목소리. 키는 서버의 npcId와 같아야 한다.
 * 스테이지가 늘면 .env에 한 줄 추가하는 것으로 끝난다.
 */
export function voiceFor(npcId: string): string | null {
  const perNpc = process.env[`ELEVENLABS_VOICE_${npcId.toUpperCase()}`];
  return perNpc ?? process.env.ELEVENLABS_VOICE_DEFAULT ?? null;
}

/** 한 번의 생성에 기다릴 최대 시간(ms) */
export function timeoutMs(): number {
  return Number(process.env.ELEVENLABS_TIMEOUT_MS ?? 10_000);
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
}

/**
 * 음성을 스트리밍으로 받는다.
 *
 * 통째로 받고 나서 재생하면 대사 전체가 만들어질 때까지 기다려야 한다.
 * 스트리밍이면 앞부분이 오는 대로 재생할 수 있어 체감 지연이 줄어든다.
 */
export async function requestSpeech(req: SpeechRequest): Promise<Response> {
  const url = `${BASE_URL}/text-to-speech/${req.voiceId}/stream?output_format=mp3_22050_32`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: req.text, model_id: model() }),
    signal: AbortSignal.timeout(timeoutMs()),
  });

  if (!response.ok) {
    // 본문에 키가 섞여 오지는 않지만, 그대로 브라우저에 넘기지 않고 서버 로그에만 남긴다.
    const detail = await response.text().catch(() => '');
    throw new Error(`일레븐랩스 ${response.status}: ${detail.slice(0, 200)}`);
  }
  return response;
}
