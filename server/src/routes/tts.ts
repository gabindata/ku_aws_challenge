import { Router } from 'express';

/**
 * 음성 합성 중계 (일레븐랩스).
 *
 * 브라우저는 여기만 부른다. API 키는 서버에만 있고 응답에도 실리지 않는다.
 * Node 18 이상의 내장 fetch를 쓰므로 SDK를 따로 설치하지 않는다.
 *
 * 클라이언트가 response.blob()으로 통째로 받으므로 여기서도 다 모아 보낸다.
 * 스트리밍해도 재생이 빨라지지 않고, 도중에 실패하면 JSON 오류를 못 준다.
 */
export const ttsRouter = Router();

/** 한 대사가 이보다 길 일은 없다. 긴 입력으로 과금을 키우는 것을 막는다 */
const MAX_TEXT_LENGTH = 3000;

/** 클라이언트의 15초 제한보다 먼저 끝나야 한다 */
const UPSTREAM_TIMEOUT_MS = 12_000;

/**
 * NPC별 목소리. 키는 스테이지 JSON의 npcId와 같아야 한다.
 * 튜토리얼과 스테이지 3은 같은 인물(고금자)이라 목소리를 공유한다.
 */
function voiceFor(npcId: string): string | undefined {
  const voices: Record<string, string | undefined> = {
    landlord: process.env.ELEVENLABS_VOICE_LANDLORD,
    store_owner_yang: process.env.ELEVENLABS_VOICE_STORE_OWNER_YANG,
    ta_han: process.env.ELEVENLABS_VOICE_TA_HAN,
  };
  return Object.prototype.hasOwnProperty.call(voices, npcId) ? voices[npcId] : undefined;
}

/** 아는 NPC인가. 목소리가 설정되지 않은 것과 구분해야 응답 코드가 갈린다 */
function isKnownNpc(npcId: string): boolean {
  return ['landlord', 'store_owner_yang', 'ta_han'].includes(npcId);
}

ttsRouter.post('/tts', async (req, res) => {
  const { text, npcId } = req.body ?? {};

  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > MAX_TEXT_LENGTH ||
    typeof npcId !== 'string' ||
    !isKnownNpc(npcId)
  ) {
    res.status(400).json({ error: 'INVALID_TTS_REQUEST' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = voiceFor(npcId);

  // 키나 목소리가 없으면 클라이언트가 브라우저 음성으로 넘어간다. 오류가 아니다.
  if (!apiKey || !voiceId) {
    res.status(503).json({ error: 'TTS_NOT_CONFIGURED' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  // 플레이어가 대사를 건너뛰면 만들던 음성도 멈춘다. 안 끊으면 요금만 나간다.
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
        }),
      },
    );

    if (!response.ok) {
      // 본문에 키가 섞여 오지는 않지만 그대로 넘기지 않고 상태 코드만 남긴다.
      console.error('[tts] 일레븐랩스 응답 오류:', response.status);
      await response.body?.cancel();
      if (!res.destroyed) res.status(502).json({ error: 'TTS_UPSTREAM_FAILED' });
      return;
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0) throw new Error('빈 음성');

    if (!res.destroyed) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    }
  } catch (err) {
    // 중단은 플레이어가 건너뛴 경우가 대부분이라 오류로 남기지 않는다.
    if (!controller.signal.aborted) console.error('[tts] 생성 실패', err);
    if (!res.destroyed) {
      res.status(controller.signal.aborted ? 504 : 502).json({
        error: controller.signal.aborted ? 'TTS_TIMEOUT' : 'TTS_FAILED',
      });
    }
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
  }
});
