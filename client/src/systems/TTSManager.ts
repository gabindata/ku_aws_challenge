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
  manager_yang: 'M1',
  assistant_han: 'M2',
  seo_heejung: 'F1',
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
  async speak(
    text: string,
    npcId: string
  ): Promise<void> {

    if (!text.trim()) {
      return;
    }

    await this.init();


    /**
     * Supertonic 초기화 실패 시
     * Browser TTS
     */
    if (
      !this.supertonicAvailable ||
      !this.tts
    ) {

      console.warn(
        'Supertonic 사용 불가 → Browser TTS'
      );

      return this.speakBrowser(
        text,
        npcId
      );
    }


    try {

      await this.speakSupertonic(
        text,
        npcId
      );

    } catch (error) {

      console.error(
        'Supertonic 음성 생성 실패:',
        error
      );

      console.warn(
        'Browser TTS fallback'
      );

      await this.speakBrowser(
        text,
        npcId
      );
    }
  }


  /**
   * 실제 Supertonic 음성 생성
   */
  private async speakSupertonic(
    text: string,
    npcId: string
  ): Promise<void> {

    this.cancelAudio();

    const voiceId =
      NPC_VOICES[npcId]
      ?? 'F1';

    console.log(
      `TTS 생성 시작: ${npcId} → ${voiceId}`
    );

    const style =
      await this.getVoiceStyle(
        voiceId
      );


    /**
     * Supertonic 합성
     *
     * steps = 4
     * 기존 8보다 빠름
     */
    const {
      wav,
      duration,
    } =
      await this.tts.call(
        text,
        'ko',
        style,
        4,
        0.95,
        0.3
      );


    const wavLength =
      Math.floor(
        this.tts.sampleRate *
        duration[0]
      );

    const wavOutput =
      wav.slice(
        0,
        wavLength
      );

    const wavBuffer =
      writeWavFile(
        wavOutput,
        this.tts.sampleRate
      );

    const blob =
      new Blob(
        [
          wavBuffer as BlobPart,
        ],
        {
          type: 'audio/wav',
        }
      );

    const audioUrl =
      URL.createObjectURL(
        blob
      );

    this.currentAudioUrl =
      audioUrl;

    const audio =
      new Audio(
        audioUrl
      );

    this.currentAudio =
      audio;


    return new Promise<void>(
      (resolve, reject) => {

        audio.onended = () => {

          console.log(
            'Supertonic TTS 재생 완료'
          );

          this.cleanupAudio();

          resolve();
        };


        audio.onerror = () => {

          this.cleanupAudio();

          reject(
            new Error(
              'Supertonic Audio 재생 실패'
            )
          );
        };


        audio
          .play()
          .catch(
            (error) => {

              this.cleanupAudio();

              reject(error);
            }
          );
      }
    );
  }


  /**
   * Supertonic 실패 시 브라우저 기본 TTS
   */
  private speakBrowser(
    text: string,
    npcId: string
  ): Promise<void> {

    if (
      !(
        'speechSynthesis'
        in window
      )
    ) {

      return Promise.reject(
        new Error(
          '이 브라우저는 TTS를 지원하지 않습니다.'
        )
      );
    }


    window
      .speechSynthesis
      .cancel();


    const utterance =
      new SpeechSynthesisUtterance(
        text
      );


    utterance.lang =
      'ko-KR';


    switch (npcId) {

      case 'manager_yang':

        utterance.rate =
          0.9;

        utterance.pitch =
          0.75;

        break;


      case 'assistant_han':

        utterance.rate =
          0.95;

        utterance.pitch =
          0.9;

        break;


      case 'seo_heejung':

        utterance.rate =
          1.0;

        utterance.pitch =
          1.05;

        break;


      default:

        utterance.rate =
          1.0;

        utterance.pitch =
          1.0;
    }


    const voices =
      window
        .speechSynthesis
        .getVoices();


    const koreanVoice =
      voices.find(
        (voice) =>
          voice.lang
            .toLowerCase()
            .startsWith('ko')
      );


    if (koreanVoice) {

      utterance.voice =
        koreanVoice;
    }


    return new Promise<void>(
      (resolve, reject) => {

        utterance.onend =
          () => {

            console.log(
              'Browser TTS 재생 완료'
            );

            resolve();
          };


        utterance.onerror =
          (event) => {

            reject(
              new Error(
                `Browser TTS 오류: ${event.error}`
              )
            );
          };


        window
          .speechSynthesis
          .speak(
            utterance
          );
      }
    );
  }


  /**
   * 현재 재생 중인 TTS 전부 중단
   */
  cancel(): void {

    this.cancelAudio();


    if (
      'speechSynthesis'
      in window
    ) {

      window
        .speechSynthesis
        .cancel();
    }
  }


  /**
   * Supertonic Audio 중단
   */
  private cancelAudio(): void {

    if (
      this.currentAudio
    ) {

      this.currentAudio.pause();

      this.currentAudio.currentTime =
        0;
    }


    this.cleanupAudio();
  }


  /**
   * Blob URL 정리
   */
  private cleanupAudio(): void {

    if (
      this.currentAudioUrl
    ) {

      URL.revokeObjectURL(
        this.currentAudioUrl
      );
    }


    this.currentAudio =
      null;


    this.currentAudioUrl =
      null;
  }
}