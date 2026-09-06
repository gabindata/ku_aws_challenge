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

    this.recognition = new SpeechRecognition();

    // 한국어
    this.recognition.lang = 'ko-KR';

    // 한 번의 발화를 인식하고 종료
    this.recognition.continuous = false;

    // 최종 결과만 사용
    this.recognition.interimResults = false;

    // STT 시작
    this.recognition.onstart = () => {
      this.isListening = true;

      console.log('STT 시작');
    };

    // STT 성공
    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;

      console.log('STT 결과:', text);

      onResult(text);
    };

    // STT 실패
    this.recognition.onerror = (event: any) => {
      console.error('STT 오류:', event.error);

      onError?.(event);
    };

    // STT 종료
    this.recognition.onend = () => {
      this.isListening = false;

      console.log('STT 종료');
    };

    // 실제 음성 인식 시작
    this.recognition.start();
  }

  /** 음성 인식 강제 종료 */
  stop(): void {
    if (!this.recognition || !this.isListening) {
      return;
    }

    this.recognition.stop();
  }
}