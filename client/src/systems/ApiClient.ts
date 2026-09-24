import { API_BASE_URL } from '../config/gameConfig';
import type {
  ResultResponse,
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
 * 발화 식별자와 처리 시도 식별자 (공통규칙 §3).
 *
 * - 새 발화: newMessageId()와 newRequestId()를 둘 다 새로 만든다
 * - 응답을 못 받아 처리 여부를 모를 때: 같은 messageId·requestId·발화 내용으로 재전송
 * - outcome이 retry일 때: 같은 messageId·발화 내용에 requestId만 새로 만든다
 * - 발화 내용을 고쳤다면: 새 발화로 보고 두 ID를 새로 만든다 (같은 ID로 내용을 바꾸면 409)
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export function newMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

async function post<TReq, TRes>(path: string, body: TReq, signal?: AbortSignal): Promise<TRes> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return res.json() as Promise<TRes>;
}

export async function getStages(): Promise<StagesResponse> {
  if (USE_MOCK) return mockStages();
  const res = await fetch(`${API_BASE_URL}/stages`);
  if (!res.ok) throw new Error(`/stages failed: ${res.status}`);
  return res.json() as Promise<StagesResponse>;
}

/**
 * 협상 시작. worldState는 로컬 저장소에 보관한 월드 상태 키 목록이다.
 * 세션 중에는 바뀌지 않으므로 여기서 한 번만 보낸다.
 */
export function startNegotiation(
  stageId: number,
  worldState: string[] = [],
  requestId = newRequestId(),
) {
  return post<StartRequest, StartResponse>('/negotiation/start', { stageId, requestId, worldState });
}

export function sendTurn(input: {
  sessionId: string;
  messageId: string;
  playerText: string;
  requestId?: string;
}, signal?: AbortSignal) {
  return post<TurnRequest, TurnResponse>('/negotiation/turn', {
    sessionId: input.sessionId,
    messageId: input.messageId,
    playerText: input.playerText,
    requestId: input.requestId ?? newRequestId(),
  }, signal);
}

// 종료 응답에 successText·failureText·limitText·hintText·rewards·styleReport가 함께 실린다.
// 결과 화면에는 합의 메모·고정 안내·후일담을 표시하지 않는다. rewards는 로컬 저장소에만 반영한다.

function mockStages(): StagesResponse {
  return [
    {
      stageId: 1, npcId: 'store_owner_yang', npcName: '양점장',
      location: '동네 편의점', difficulty: 'easy', unlocked: true, recommended: true,
    },
  ];
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail = '') { super(`서버 요청 실패: ${status} ${detail}`); }
  get missingSession(): boolean { return this.status === 404 && /session[ _]not[ _]found/i.test(this.detail); }
  get missingResultEndpoint(): boolean { return this.status === 404 && /Cannot GET|not found/i.test(this.detail) && !this.missingSession; }
  static async fromResponse(response: Response): Promise<ApiError> {
    const body = await response.text();
    try { const data = JSON.parse(body); return new ApiError(response.status, String(data.error ?? data.message ?? body)); }
    catch { return new ApiError(response.status, body); }
  }
}

export async function getSessionResult(sessionId: string, signal?: AbortSignal): Promise<ResultResponse> {
  const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/result`, {
    signal, cache: 'no-store',
  });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return res.json() as Promise<ResultResponse>;
}
