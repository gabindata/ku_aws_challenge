import { Router } from 'express';

// GET /api/stages, POST /api/negotiation/start, POST /api/negotiation/turn
// 요청/응답 형태는 shared/types/negotiationTypes.ts (설계 문서 5장) 그대로.
export const negotiationRouter = Router();

// GET /api/stages
negotiationRouter.get('/stages', (_req, res) => {
  // TODO: npcPersonaService.listStages()
  res.status(501).json({ error: 'not implemented' });
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
