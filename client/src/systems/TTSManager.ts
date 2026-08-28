/** NPC 음성 출력. 브라우저 내장 SpeechSynthesis 사용. */
export class TTSManager {
  /** 대사 재생. 재생이 끝나면 resolve. */
  speak(_text: string): Promise<void> {
    // TODO: new SpeechSynthesisUtterance(text), lang='ko-KR', NPC별 voice/pitch/rate
    throw new Error('not implemented');
  }

  cancel(): void {
    // TODO: window.speechSynthesis.cancel()
    throw new Error('not implemented');
  }
}
