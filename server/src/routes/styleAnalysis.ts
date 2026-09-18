import { Router } from 'express';

/**
 * POST /api/analysis/style
 *
 * 기획 공통규칙 §6에서 말투 리포트는 종료 응답(NegotiationView.styleReport)에
 * 함께 실리도록 바뀌었다. 그래서 이 엔드포인트는 필수 경로가 아니다.
 *
 * 종료 응답을 놓친 경우(새로고침 등)를 위한 재조회 용도로만 남겨둔다.
 * 프론트 담당과 확인한 뒤 필요 없으면 라우트째 제거한다.
 */
export const styleAnalysisRouter = Router();

styleAnalysisRouter.post('/analysis/style', (_req, res) => {
  // TODO(3주차): 종료된 세션의 저장된 styleReport를 반환. 진행 중이면 409.
  res.status(501).json({ error: 'not implemented' });
});
