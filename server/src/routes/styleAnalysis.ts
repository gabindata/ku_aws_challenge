import { Router } from 'express';

// POST /api/analysis/style — 세션 종료 후 1회 호출. 1~2초 지연을 전제로 한다.
export const styleAnalysisRouter = Router();

styleAnalysisRouter.post('/analysis/style', (_req, res) => {
  // TODO: getSession(sessionId).turns → styleAnalyzer.analyzeStyle()
  res.status(501).json({ error: 'not implemented' });
});
