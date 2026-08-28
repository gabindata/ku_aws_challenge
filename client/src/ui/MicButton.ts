import Phaser from 'phaser';

/** 마이크 버튼 — 누르는 동안 녹음(push-to-talk), 상태별 시각 피드백. */
export class MicButton extends Phaser.GameObjects.Container {
  setRecording(_on: boolean): void {
    // TODO
  }

  /** 서버 응답 대기 중에는 입력을 막는다 */
  setDisabled(_disabled: boolean): void {
    // TODO
  }
}
