// .env를 제일 먼저 읽는다. 다른 import보다 위에 있어야 한다.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { negotiationRouter } from './routes/negotiation';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', negotiationRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
