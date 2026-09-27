import type { NegotiationRewards } from '../types';
const KEY = 'negotiation-progress';
type Progress = { states: string[]; quests: string[]; completed: string[]; clues: { clueId: string; text: string }[] };
let progress: Progress = { states: [], quests: [], completed: [], clues: [] };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (saved && ['states', 'quests', 'completed'].every(key => Array.isArray(saved[key]) && saved[key].every((v: unknown) => typeof v === 'string')) && Array.isArray(saved.clues)) progress = saved;
} catch { /* 저장 제한 시 메모리 사용 */ }
export function getWorldState(): string[] { return [...progress.states]; }
export function saveRewards(rewards: NegotiationRewards): void {
  progress.states = [...new Set([...progress.states, rewards.successState])];
  progress.completed = [...new Set([...progress.completed, ...rewards.completeQuests])];
  progress.quests = [...new Set([...progress.quests, ...rewards.addQuests])].filter(q => !progress.completed.includes(q));
  const clues = new Map(progress.clues.map(c => [c.clueId, c]));
  for (const clue of rewards.clues) clues.set(clue.clueId, clue);
  progress.clues = [...clues.values()];
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* 현재 실행에는 반영 */ }
}

/** 화면 문구는 고정하고, 체크는 서버가 확정한 스테이지 성공 상태로만 표시한다. */
export function getQuests(): { stageId: number; text: string; done: boolean }[] {
  return [
    { stageId: 1, text: '편의점으로 가서 아르바이트를 구하자', state: 'part_time_job_secured' },
    { stageId: 3, text: '집주인과 다시 대화하자', state: 'landlord_cleanup_agreed' },
    { stageId: 2, text: '학교 행정실로 가서 복학신청을 하자', state: 'return_application_opportunity_secured' },
  ].map(({ stageId, text, state }) => ({ stageId, text, done: progress.states.includes(state) }));
}
