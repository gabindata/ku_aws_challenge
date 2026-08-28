import express from 'express';
import cors from 'cors';
import { negotiationRouter } from './routes/negotiation';
import { styleAnalysisRouter } from './routes/styleAnalysis';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', negotiationRouter);
app.use('/api', styleAnalysisRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
