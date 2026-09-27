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
