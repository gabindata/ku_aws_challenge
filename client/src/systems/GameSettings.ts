export interface GameSettings { voice: number; bgm: number; ui: number; brightness: number }
const defaults: GameSettings = { voice: 1, bgm: 0.4, ui: 0.4, brightness: 1 };
export const gameSettings = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem('game-settings') ?? '{}');
  for (const key of Object.keys(defaults) as (keyof GameSettings)[]) {
    if (typeof saved[key] === 'number' && Number.isFinite(saved[key]))
      gameSettings[key] = Math.max(key === 'brightness' ? 0.5 : 0, Math.min(key === 'brightness' ? 1.5 : 1, saved[key]));
  }
} catch { /* 저장소를 사용할 수 없어도 기본 설정으로 실행한다. */ }
export function applyBrightness(): void {
  document.documentElement.style.setProperty('--game-brightness', String(gameSettings.brightness));
  if (!document.getElementById('game-brightness-style')) {
    const style = document.createElement('style'); style.id = 'game-brightness-style';
    style.textContent = 'canvas, .result-report { filter: brightness(var(--game-brightness, 1)); }';
    document.head.append(style);
  }
}
export function setGameSetting(key: keyof GameSettings, value: number): void {
  if (!Number.isFinite(value)) return;
  gameSettings[key] = Math.max(key === 'brightness' ? 0.5 : 0, Math.min(key === 'brightness' ? 1.5 : 1, value));
  try { localStorage.setItem('game-settings', JSON.stringify(gameSettings)); } catch { /* 세션에는 적용 */ }
  applyBrightness();
  window.dispatchEvent(new Event('game-settings-change'));
}
