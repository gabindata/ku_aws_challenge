/**
 * 마이크 캡처 + STT. Web Speech API 고정, 크롬 기준으로만 검증한다 (설계 문서 7장).
 * 음성 원본은 저장하지 않고 인식된 텍스트만 넘긴다.
 */
export class VoiceInputManager {
  /** 마이크 권한 확인. BootScene에서 사전 체크용. */
  static async checkPermission(): Promise<boolean> {
    // TODO: navigator.mediaDevices.getUserMedia({ audio: true })
    throw new Error('not implemented');
  }

  /** 녹음 시작. 인식 결과가 나오면 onResult(text) 호출. */
  start(_onResult: (text: string) => void, _onError?: (e: unknown) => void): void {
    // TODO: webkitSpeechRecognition, lang='ko-KR', interimResults로 자막 미리보기
    throw new Error('not implemented');
  }

  stop(): void {
    // TODO
    throw new Error('not implemented');
  }
}
