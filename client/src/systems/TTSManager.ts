import { gameSettings } from './GameSettings';
import * as ort from 'onnxruntime-web';

import {
  configureOrt,
  loadTextToSpeech,
  loadVoiceStyle,
  writeWavFile,
} from './supertonic/helper';

type VoiceId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'F1'
  | 'F2'
  | 'F3';


/**
 * NPC별 Supertonic 음성
 *
 * 양점장 → 남성 M1
 * 한조교 → 남성 M2
 * 서희정 → 여성 F1
 */
const NPC_VOICES: Record<string, VoiceId> = {
  store_owner_yang: 'M1',
  ta_han: 'M2',
  landlord: 'F1',
};


const BASE_PATH = '/assets/audio/supertonic';

const ONNX_PATH =
  `${BASE_PATH}/onnx`;

const VOICE_PATH =
  `${BASE_PATH}/voice_styles`;


/**
 * NPC 음성 출력 관리자
 *
 * 1. WebGPU 우선
 * 2. 실패 시 WASM
 * 3. 둘 다 실패 시 Browser SpeechSynthesis
 */
export class TTSManager {

  private initialized = false;

  private initializingPromise:
    Promise<void> | null = null;

  private tts: any = null;

  private supertonicAvailable = true;

  private voiceStyles =
    new Map<VoiceId, any>();

  private currentAudio:
    HTMLAudioElement | null = null;

  private currentAudioUrl:
    string | null = null;


  constructor() {
    configureOrt(ort);
    window.addEventListener('game-settings-change', () => {
      if (this.currentAudio) this.currentAudio.volume = gameSettings.voice;
    });
  }


  /**
   * Supertonic 최초 1회 초기화
   */
  async init(): Promise<void> {

    if (this.initialized) {
      return;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise =
      this.loadModels();

    try {

      await this.initializingPromise;

      this.initialized = true;

      console.log(
        'Supertonic 초기화 완료'
      );

    } catch (error) {

      console.error(
        'Supertonic 초기화 실패:',
        error
      );

      console.warn(
        '브라우저 SpeechSynthesis fallback 사용'
      );

      this.supertonicAvailable = false;

      this.initialized = true;

    } finally {

      this.initializingPromise = null;
    }
  }


  /**
   * 게임 시작 시 미리 호출하면
   * 모델 + NPC 3명의 음성 스타일을 전부 준비한다.
   */
  async preloadVoices(): Promise<void> {

    await this.init();

    if (
      !this.supertonicAvailable ||
      !this.tts
    ) {
      return;
    }

    await Promise.all([
      this.getVoiceStyle('M1'),
      this.getVoiceStyle('M2'),
      this.getVoiceStyle('F1'),
    ]);

    console.log(
      'Supertonic NPC 음성 스타일 사전 로딩 완료'
    );
  }


  /**
   * 모델 로딩
   *
   * WebGPU를 먼저 사용하고,
   * 안 되면 WASM으로 fallback
   */
  private async loadModels(): Promise<void> {

    const createOptions = (
      provider: 'webgpu' | 'wasm'
    ) => ({
      executionProviders: [
        provider,
      ],

      graphOptimizationLevel:
        'all',
    });


    // =========================
    // 1. WebGPU
    // =========================

    try {

      console.log(
        'Supertonic WebGPU 로딩 시도'
      );

      const result =
        await loadTextToSpeech(
          ONNX_PATH,
          createOptions('webgpu')
        );

      this.tts =
        result.textToSpeech;

      console.log(
        'Supertonic: WebGPU 사용'
      );

      return;

    } catch (error) {

      console.warn(
        'WebGPU 사용 불가 → WASM fallback',
        error
      );
    }


    // =========================
    // 2. WASM
    // =========================

    console.log(
      'Supertonic WASM 로딩 시도'
    );

    const result =
      await loadTextToSpeech(
        ONNX_PATH,
        createOptions('wasm')
      );

    this.tts =
      result.textToSpeech;

    console.log(
      'Supertonic: WASM 사용'
    );
  }


  /**
   * NPC voice style 불러오기
   *
   * 한 번 불러온 voice는 메모리에 캐싱
   */
  private async getVoiceStyle(
    voiceId: VoiceId
  ): Promise<any> {

    const cached =
      this.voiceStyles.get(
        voiceId
      );

    if (cached) {
      return cached;
    }

    const stylePath =
      `${VOICE_PATH}/${voiceId}.json`;

    console.log(
      `Voice Style 로딩: ${stylePath}`
    );

    const style =
      await loadVoiceStyle(
        [
          stylePath,
        ],
        false
      );

    this.voiceStyles.set(
      voiceId,
      style
    );

    return style;
  }


  /**
   * NPC 대사 재생
   */
  private speechGeneration = 0;
  private finishPlayback?: () => void;

  async speak(text: string, npcId: string): Promise<void> {
    this.cancel();
    const generation = this.speechGeneration;
    if (!text.trim()) return;
    await this.init();
    if (generation !== this.speechGeneration) return;
    if (this.supertonicAvailable && this.tts) {
      try {
        const voiceId = NPC_VOICES[npcId] ?? 'F1';
        const style = await this.getVoiceStyle(voiceId);
        if (generation !== this.speechGeneration) return;
        const { wav, duration } = await this.tts.call(text, 'ko', style, 4, 0.95, 0.3);
        if (generation !== this.speechGeneration) return;
        const buffer = writeWavFile(wav.slice(0, Math.floor(this.tts.sampleRate * duration[0])), this.tts.sampleRate);
        const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'audio/wav' }));
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
        console.warn('Supertonic 재생 실패, 브라우저 음성 사용:', error);
      }
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
    this.currentAudio?.pause();
    this.finishPlayback?.();
    this.finishPlayback = undefined;
    if (this.currentAudioUrl) URL.revokeObjectURL(this.currentAudioUrl);
    this.currentAudio = null;
    this.currentAudioUrl = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}
