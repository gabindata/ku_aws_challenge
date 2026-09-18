import { Router } from 'express';
import { listStages } from '../services/npcPersonaService';
import { processTurn, startNegotiation, type RunResult } from '../services/negotiationRunner';

/** HTTP만 다룬다. 협상 절차는 services/negotiationRunner.ts에 있다. */
export const negotiationRouter = Router();

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

function send<T>(res: import('express').Response, result: RunResult<T>) {
  if (result.ok) return res.json(result.value);
  return res.status(result.status).json({ error: result.error });
}

// GET /api/stages?worldState=tutorial_completed,...
negotiationRouter.get('/stages', (req, res) => {
  try {
    // 해금 여부는 클라이언트 로컬 저장소의 월드 상태 키로 계산한다 (공통규칙 §3).
    const worldState = String(req.query.worldState ?? '').split(',').filter(Boolean);
    res.json(listStages(worldState));
  } catch (err) {
    console.error('[GET /stages]', err);
    res.status(500).json({ error: 'failed to load stages' });
  }
});

// POST /api/negotiation/start
negotiationRouter.post('/negotiation/start', async (req, res) => {
  const { stageId, requestId, worldState } = req.body ?? {};
  if (typeof stageId !== 'number' || !isId(requestId)) {
    return res.status(400).json({ error: 'stageId(number)와 requestId(string)가 필요합니다' });
  }
  const keys = Array.isArray(worldState) ? worldState.filter((k): k is string => typeof k === 'string') : [];
  send(res, await startNegotiation({ stageId, requestId, worldState: keys }));
});

// POST /api/negotiation/turn
negotiationRouter.post('/negotiation/turn', async (req, res) => {
  const { sessionId, requestId, messageId, playerText } = req.body ?? {};
  if (!isId(sessionId) || !isId(requestId) || !isId(messageId) || typeof playerText !== 'string') {
    return res.status(400).json({ error: 'sessionId·requestId·messageId·playerText가 필요합니다' });
  }
  send(res, await processTurn({ sessionId, requestId, messageId, playerText }));
});
