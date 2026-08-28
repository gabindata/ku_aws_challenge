import { API_BASE_URL } from '../config/gameConfig';
import type {
  StagesResponse,
  StartRequest,
  StartResponse,
  TurnRequest,
  TurnResponse,
} from '../types';
import type { StyleAnalysisRequest, StyleAnalysisResponse } from '../types';

/**
 * 백엔드 통신 (설계 문서 5장 계약).
 * 백엔드가 아직 없을 때는 USE_MOCK=true로 두고 같은 형태의 더미 응답으로 붙여본다.
 */
const USE_MOCK = false;

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<TRes>;
}

export async function getStages(): Promise<StagesResponse> {
  if (USE_MOCK) return mockStages();
  const res = await fetch(`${API_BASE_URL}/stages`);
  if (!res.ok) throw new Error(`/stages failed: ${res.status}`);
  return res.json() as Promise<StagesResponse>;
}

export function startNegotiation(npcId: string): Promise<StartResponse> {
  return post<StartRequest, StartResponse>('/negotiation/start', { npcId });
}

export function sendTurn(sessionId: string, playerText: string): Promise<TurnResponse> {
  return post<TurnRequest, TurnResponse>('/negotiation/turn', { sessionId, playerText });
}

export function getStyleReport(sessionId: string): Promise<StyleAnalysisResponse> {
  return post<StyleAnalysisRequest, StyleAnalysisResponse>('/analysis/style', { sessionId });
}

function mockStages(): StagesResponse {
  return [
    { stageId: 1, npcId: 'merchant_kim', name: '시장 상인 김씨', difficulty: 'easy' },
    { stageId: 2, npcId: 'car_dealer_park', name: '중고차 딜러 박씨', difficulty: 'normal' },
    { stageId: 3, npcId: 'lawyer_lee', name: '계약 담당자 이변호사', difficulty: 'hard' },
  ];
}
