import { Router } from 'express';
import { listStages } from '../services/npcPersonaService';

// GET /api/stages, POST /api/negotiation/start, POST /api/negotiation/turn
// 요청/응답 형태는 shared/types/negotiationTypes.ts (설계 문서 5장) 그대로.
export const negotiationRouter = Router();

// GET /api/stages
negotiationRouter.get('/stages', (req, res) => {
  try {
    // 해금 여부는 플레이어가 보유한 월드 상태 키로 계산한다.
    // 공통규칙 §3에 따라 이 기록은 클라이언트 로컬 저장소에 있으므로
    // 프론트가 쿼리로 넘겨준다. 없으면 전부 잠긴 것으로 본다.
    // TODO: 프론트 담당과 파라미터 이름 확정 (?worldState=tutorial_completed,...)
    const worldState = String(req.query.worldState ?? '').split(',').filter(Boolean);
    res.json(listStages(worldState)); // res.json()은 상태 코드 200을 자동으로 붙인다
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
