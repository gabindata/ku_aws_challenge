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

  /** 음성 인식 시작 */
  start(
    onResult: (text: string) => void,
    onError?: (e: unknown) => void
  ): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    // Web Speech API 미지원
    if (!SpeechRecognition) {
      const error = new Error(
        '이 브라우저는 Speech Recognition을 지원하지 않습니다.'
      );

      console.error(error);
      onError?.(error);

      return;
    }

    // 이미 듣는 중이면 다시 실행하지 않음
    if (this.isListening) {
      return;
    }

    const recognition = new SpeechRecognition();
    this.recognition = recognition;
    // onstart 이전에도 중복 시작을 막는다.
    this.isListening = true;
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;

    const finish = (callback: () => void): void => {
      if (this.recognition !== recognition) return;
      // 콜백이 재시도를 시작하기 전에 이전 인식과 이벤트를 정리한다.
      this.stop();
      callback();
    };

    recognition.onstart = () => {
      if (this.recognition === recognition) console.log('STT 시작');
    };
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript ?? '';
      finish(() => onResult(text));
    };
    recognition.onerror = (event: any) => {
      finish(() => onError?.(event));
    };
    recognition.onend = () => {
      // 결과/오류 없이 종료돼도 화면의 빈 발화 복구 처리를 실행한다.
      finish(() => onResult(''));
    };

    try {
      recognition.start();
    } catch (error) {
      finish(() => onError?.(error));
    }
  }

  /** 화면 이탈 시에는 결과 콜백 없이 녹음과 뒤늦은 이벤트를 취소한다. */
  stop(): void {
    const recognition = this.recognition;
    this.recognition = null;
    this.isListening = false;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // 이미 종료된 브라우저 인식기는 추가 취소가 필요 없다.
    }
  }
}
