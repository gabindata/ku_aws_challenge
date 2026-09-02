/**
 * 마이크 캡처 + STT. Web Speech API 고정, 크롬 기준으로만 검증한다 (설계 문서 7장).
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

  /** 녹음 시작. 인식 결과가 나오면 onResult(text) 호출. */
  start(
    onResult: (text: string) => void,
    onError?: (e: unknown) => void
  ): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const error = new Error(
        '이 브라우저는 Speech Recognition을 지원하지 않습니다.'
      );

      console.error(error);

      onError?.(error);
      return;
    }

    if (this.isListening) {
      return;
    }

    this.recognition = new SpeechRecognition();

    // 한국어
    this.recognition.lang = 'ko-KR';

    // 한 번의 발화를 인식하고 종료
    this.recognition.continuous = false;

    // 현재는 최종 결과만 받음
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;

      console.log('STT 시작');
    };

    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;

      console.log('STT 결과:', text);

      onResult(text);
    };

    this.recognition.onerror = (event: any) => {
      console.error('STT 오류:', event.error);

      onError?.(event);
    };

    this.recognition.onend = () => {
      this.isListening = false;

      console.log('STT 종료');
    };

    this.recognition.start();
  }

  stop(): void {
    if (!this.recognition || !this.isListening) {
      return;
    }

    this.recognition.stop();
  }
}
