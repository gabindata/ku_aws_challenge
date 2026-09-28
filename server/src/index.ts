// .env를 제일 먼저 읽는다. 다른 import보다 위에 있어야 한다.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { negotiationRouter } from './routes/negotiation';
import { ttsRouter } from './routes/tts';

const app = express();

/**
 * 게임 화면과 서버가 다른 도메인에 놓이므로 브라우저가 출처를 따진다.
 *
 * CLIENT_ORIGIN에 배포된 게임 주소를 넣으면 그 주소만 허용한다.
 * 비워 두면 전부 허용한다 — 개발 중에는 편하지만 배포에서는 넣는 편이 낫다.
 * 쉼표로 여러 개를 적을 수 있다 (미리보기 주소를 함께 쓸 때).
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors(allowedOrigins.length === 0 ? undefined : { origin: allowedOrigins }));
if (allowedOrigins.length > 0) {
  console.log(`허용 출처: ${allowedOrigins.join(', ')}`);
}

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', negotiationRouter);
app.use('/api', ttsRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
