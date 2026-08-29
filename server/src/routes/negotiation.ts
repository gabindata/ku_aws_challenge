import { Router } from 'express';
import { listStages } from '../services/npcPersonaService';

// GET /api/stages, POST /api/negotiation/start, POST /api/negotiation/turn
// 요청/응답 형태는 shared/types/negotiationTypes.ts (설계 문서 5장) 그대로.
export const negotiationRouter = Router();

// GET /api/stages
negotiationRouter.get('/stages', (_req, res) => {
  try {
    res.json(listStages()); // res.json()은 상태 코드 200(성공)을 자동으로 붙인다
  } catch (err) {
    // 폴더가 없는 등 서버 쪽 문제. 감싸두지 않으면 서버가 통째로 죽을 수 있다.
    console.error('[GET /stages]', err);
    res.status(500).json({ error: 'failed to load stages' });
  }
});

// POST /api/negotiation/start
negotiationRouter.post('/negotiation/start', (_req, res) => {
  // TODO: createSession → generateOpeningLine → initialState
  res.status(501).json({ error: 'not implemented' });
});

// POST /api/negotiation/turn
negotiationRouter.post('/negotiation/turn', (_req, res) => {
  // TODO: appendTurn(player) → generateNpcReply → applyTurn → appendTurn(npc)
  res.status(501).json({ error: 'not implemented' });
});
