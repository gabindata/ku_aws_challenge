import { gameSettings } from './GameSettings';
import { API_BASE_URL } from '../config/gameConfig';

/** 서버가 NPC ID를 ElevenLabs Voice ID로 매핑한다. API 키는 서버에만 둔다. */
export class TTSManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private request?: AbortController;
  private speechGeneration = 0;
  private finishPlayback?: () => void;
  private onSettingsChange = () => {
    if (this.currentAudio) this.currentAudio.volume = gameSettings.voice;
  };

  constructor() {
    window.addEventListener('game-settings-change', this.onSettingsChange);
  }

  async speak(text: string, npcId: string): Promise<void> {
    this.cancel();
    const generation = this.speechGeneration;
    if (!text.trim()) return;
    try {
      const controller = new AbortController();
      this.request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      let blob: Blob;
      try {
        const response = await fetch(`${API_BASE_URL}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text, npcId }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`TTS 요청 실패: ${response.status}`);
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) {
          throw new Error('TTS 응답이 오디오가 아닙니다.');
        }
        blob = await response.blob();
        if (!blob.size) throw new Error('TTS 오디오가 비어 있습니다.');
      } finally {
        window.clearTimeout(timeout);
        if (this.request === controller) this.request = undefined;
      }
      if (generation !== this.speechGeneration) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = gameSettings.voice;
        this.currentAudio = audio;
        this.currentAudioUrl = url;
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (error?: unknown) => {
            if (settled) return;
            settled = true;
            audio.onended = null;
            audio.onerror = null;
            URL.revokeObjectURL(url);
            if (this.currentAudio === audio) {
              this.currentAudio = null;
              this.currentAudioUrl = null;
              this.finishPlayback = undefined;
            }
            if (error && generation === this.speechGeneration) reject(error);
            else resolve();
          };
          this.finishPlayback = () => finish();
          audio.onended = () => finish();
          audio.onerror = () => finish(new Error('음성 재생 실패'));
          audio.play().catch(finish);
        });
      return;
    } catch (error) {
      if (generation !== this.speechGeneration) return;
      console.warn('ElevenLabs 음성 사용 불가, 브라우저 음성 사용:', error);
    }
    if (generation !== this.speechGeneration) return;
    if (!('speechSynthesis' in window)) throw new Error('이 브라우저는 TTS를 지원하지 않습니다.');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.volume = gameSettings.voice;
    const settings: Record<string, [number, number]> = { store_owner_yang: [0.9, 0.75], ta_han: [0.95, 0.9], landlord: [1, 1.05] };
    [utterance.rate, utterance.pitch] = settings[npcId] ?? [1, 1];
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('ko'));
    if (voice) utterance.voice = voice;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: string) => {
        utterance.onend = null;
        utterance.onerror = null;
        if (generation === this.speechGeneration) this.finishPlayback = undefined;
        if (error && generation === this.speechGeneration) reject(new Error(error));
        else resolve();
      };
      this.finishPlayback = () => finish();
      utterance.onend = () => finish();
      utterance.onerror = event => finish(event.error);
      window.speechSynthesis.speak(utterance);
    });
  }

  /** 생성 중인 작업도 무효화하여 화면을 떠난 뒤 재생되지 않게 한다. */
  cancel(): void {
    this.speechGeneration += 1;
    this.request?.abort();
    this.request = undefined;
    this.currentAudio?.pause();
    this.finishPlayback?.();
    this.finishPlayback = undefined;
    if (this.currentAudioUrl) URL.revokeObjectURL(this.currentAudioUrl);
    this.currentAudio = null;
    this.currentAudioUrl = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  destroy(): void {
    this.cancel();
    window.removeEventListener('game-settings-change', this.onSettingsChange);
  }
}
