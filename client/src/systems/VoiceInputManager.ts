export const VOICE_INPUT_LIMIT_SECONDS = 15;

export function voiceInputErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : '';
  const messages: Record<string, string> = {
    'not-allowed': '마이크 권한이 차단돼 있어요. 주소창의 사이트 설정에서 마이크를 허용해 주세요.',
    'service-not-allowed': '브라우저에서 음성 인식 사용이 차단돼 있어요. 브라우저 설정을 확인해 주세요.',
    'audio-capture': '마이크를 찾을 수 없어요. 연결 상태와 입력 장치를 확인해 주세요.',
    'network': '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 말해 주세요.',
    'no-speech': '말소리가 들리지 않았어요. 마이크 가까이에서 다시 말해 주세요.',
    'unsupported': '이 브라우저는 음성 인식을 지원하지 않아요. Chrome에서 게임을 열어 주세요.',
    'aborted': '음성 인식이 중단됐어요. 말하기 버튼을 다시 눌러 주세요.',
  };
  return messages[code] ?? '음성을 인식하지 못했어요. 설정의 마이크 테스트를 확인하고 다시 말해 주세요.';
}

/**
 * 마이크 캡처 + STT.
 * Web Speech API 고정, 크롬 기준으로만 검증한다.
 * 음성 원본은 저장하지 않고 인식된 텍스트만 넘긴다.
 */
export class VoiceInputManager {
  private recognition: any;
  private isListening = false;

  /** 마이크 권한 확인. BootScene에서 사전 체크용. */
  static async checkPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // 권한 확인만 하는 거라 바로 마이크 해제
      stream.getTracks().forEach((track) => track.stop());

      return true;
    } catch (error) {
      console.error('마이크 권한 오류:', error);

      return false;
    }
  }

  private submit?: () => void;
  private cleanup?: () => void;

  /** 사용자가 말 끝내기를 누를 때까지 문장을 모은다. 중간 결과는 화면에 노출하지 않는다. */
  start(onResult: (text: string) => void, onError?: (e: unknown) => void, onRemaining?: (seconds: number) => void): void {
    if (this.isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { onError?.({ error: 'unsupported' }); return; }
    this.isListening = true;
    let active = true;
    let ending = false;
    let completed = '';
    let current = '';
    let deadline = 0;
    let limitTimer: ReturnType<typeof setTimeout> | undefined;
    let countdown: ReturnType<typeof setInterval> | undefined;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const text = () => [completed, current].filter(Boolean).join(' ').trim();
    const deliver = () => {
      if (!active) return;
      const result = text();
      this.stop();
      onResult(result);
    };
    const fail = (error: unknown) => {
      if (!active) return;
      this.stop();
      onError?.(error);
    };
    this.cleanup = () => {
      active = false;
      clearTimeout(restartTimer);
      clearTimeout(finishTimer);
      clearTimeout(limitTimer);
      clearInterval(countdown);
    };
    const begin = () => {
      if (!active || ending) return;
      const recognition = new SpeechRecognition();
      this.recognition = recognition;
      current = '';
      recognition.onstart = () => {
        if (!active || ending || deadline) return;
        deadline = Date.now() + VOICE_INPUT_LIMIT_SECONDS * 1000;
        onRemaining?.(VOICE_INPUT_LIMIT_SECONDS);
        countdown = setInterval(() => onRemaining?.(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 200);
        limitTimer = setTimeout(() => this.finish(), VOICE_INPUT_LIMIT_SECONDS * 1000);
      };
      recognition.lang = 'ko-KR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        if (!active || this.recognition !== recognition) return;
        // 전체 결과 목록을 다시 조합해 같은 문장이 중복 누적되지 않게 한다.
        current = Array.from(event.results as ArrayLike<any>)
          .map((result: any) => result[0]?.transcript ?? '').join(' ').trim();
      };
      recognition.onerror = (event: any) => {
        if (!active || this.recognition !== recognition) return;
        // 침묵으로 끝나면 onend에서 재시작한다.
        if (event.error === 'no-speech') return;
        fail(event);
      };
      recognition.onend = () => {
        if (!active || this.recognition !== recognition) return;
        this.recognition = null;
        completed = text();
        current = '';
        if (ending) deliver();
        else restartTimer = setTimeout(begin, 250);
      };
      try { recognition.start(); } catch (error) { fail(error); }
    };
    this.submit = () => {
      if (!active || ending) return;
      ending = true;
      clearTimeout(limitTimer);
      clearInterval(countdown);
      onRemaining?.(0);
      clearTimeout(restartTimer);
      if (!this.recognition) { deliver(); return; }
      // stop은 마지막 인식 결과를 받은 후 onend를 발생시킨다.
      finishTimer = setTimeout(deliver, 3000);
      try { this.recognition.stop(); } catch { deliver(); }
    };
    begin();
  }

  /** 마지막 인식 결과를 받은 뒤 한 번만 전송한다. */
  finish(): void { this.submit?.(); }

  /** 화면 이탈이나 설정 열기에서는 발화를 전송하지 않고 취소한다. */
  stop(): void {
    this.cleanup?.();
    this.cleanup = undefined;
    this.submit = undefined;
    const recognition = this.recognition;
    this.recognition = null;
    this.isListening = false;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch { /* 이미 종료됨 */ }
  }
}
