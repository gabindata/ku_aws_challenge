import { Router } from 'express';
import { Readable } from 'node:stream';
import { requestSpeech, ttsMode, voiceFor } from '../tts/config';

/**
 * 음성 합성 중계.
 *
 * 브라우저는 여기만 부른다. API 키는 서버에만 있고 응답에도 실리지 않는다.
 * 받은 오디오는 통째로 모으지 않고 오는 대로 흘려보낸다.
 */
export const ttsRouter = Router();

/** NPC 대사 한 줄이 이보다 길 일은 없다. 긴 입력으로 과금을 키우는 것을 막는다. */
const MAX_TEXT_LENGTH = 500;

ttsRouter.post('/tts', async (req, res) => {
  if (ttsMode() === 'off') {
    // 클라이언트가 자체 폴백으로 넘어가도록 알린다. 오류가 아니다.
    return res.status(503).json({ error: 'tts disabled' });
  }

  const { text, npcId } = req.body as { text?: unknown; npcId?: unknown };
  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text required' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `text too long (max ${MAX_TEXT_LENGTH})` });
  }
  if (typeof npcId !== 'string' || npcId === '') {
    return res.status(400).json({ error: 'npcId required' });
  }

  const voiceId = voiceFor(npcId);
  if (!voiceId) {
    console.error(`[tts] ${npcId}의 목소리가 설정되지 않았습니다`);
    return res.status(503).json({ error: 'voice not configured' });
  }

  try {
    const upstream = await requestSpeech({ text, voiceId });
    if (!upstream.body) throw new Error('응답 본문이 비어 있습니다');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    // 오는 대로 흘려보낸다. 브라우저가 앞부분부터 재생할 수 있다.
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (err) {
    // 실패해도 게임은 멈추지 않는다. 클라이언트가 자막만 띄우거나 폴백한다.
    console.error('[tts] 생성 실패', err);
    if (!res.headersSent) res.status(502).json({ error: 'tts failed' });
    else res.end();
  }
});
