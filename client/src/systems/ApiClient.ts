import { API_BASE_URL } from '../config/gameConfig';
import type {
  StagesResponse,
  StartRequest,
  StartResponse,
  TurnRequest,
  TurnResponse,
} from '../types';

/**
 * 백엔드 통신. 요청/응답 형태는 shared/types/negotiationTypes.ts가 단일 소스다.
 * 백엔드가 아직 없을 때는 USE_MOCK으로 같은 형태의 더미를 쓴다.
 */
const USE_MOCK = false;

/**
 * 요청 식별자. 같은 requestId로 재전송하면 서버가 저장된 결과를 그대로 돌려준다.
 * 네트워크 오류로 재시도할 때는 반드시 같은 값을 다시 보내야 턴이 중복 소비되지 않는다.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}

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

export function startNegotiation(stageId: number, requestId = newRequestId()) {
  return post<StartRequest, StartResponse>('/negotiation/start', { stageId, requestId });
}

export function sendTurn(sessionId: string, playerText: string, requestId = newRequestId()) {
  return post<TurnRequest, TurnResponse>('/negotiation/turn', {
    sessionId,
    playerText,
    requestId,
  });
}

// 말투 리포트는 별도 호출이 아니라 종료 응답(TurnResponse.styleReport)에 함께 실린다.
// ResultScene이 그 값을 StyleReportScene으로 넘기면 된다.

function mockStages(): StagesResponse {
  return [
    {
      stageId: 1, npcId: 'store_owner_yang', npcName: '양점장',
      location: '동네 편의점', difficulty: 'easy', unlocked: true, recommended: true,
    },
  ];
}
