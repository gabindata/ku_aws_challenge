import Phaser from 'phaser';
import { SceneKey } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';

/** 스테이지 3 — 302호 복도 서희정 협상 화면 */
export class NegotiationScene3 extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private dialogueBox!: DialogueBox;
  private micButton!: MicButton;
  private npcId!: string;
  private timerDisplay!: TimerDisplay;
  private remainingSeconds = 600;
  private timerEvent?: Phaser.Time.TimerEvent;

  constructor() {
    super(SceneKey.Negotiation3);
  }

  init(data: { npcId: string }): void {
    this.npcId = data.npcId;

    console.log('선택된 NPC:', this.npcId);
  }

  create(): void {
    const { width, height } = this.scale;

    // =========================
    // 배경
    // =========================

    const background = this.add.image(
      width / 2,
      height / 2,
      'stage3-bg'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 서희정 캐릭터
    // =========================

    const seoHeejung = this.add.image(
      width * 0.72,
      height * 0.58,
      'seo-heejung'
    );

    seoHeejung.setScale(0.6);
    seoHeejung.setDepth(10);

    // =========================
    // 대화창
    // =========================

    this.dialogueBox = new DialogueBox(
      this,
      width / 2,
      height * 0.72,
      width * 0.75,
      '서희정'
    );

    // 첫 화면
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showText(
      '무슨 일이에요?'
    );

    // =========================
    // STT 관리자
    // =========================

    this.voiceInput = new VoiceInputManager();

    // =========================
    // 마이크 버튼
    // =========================

    this.micButton = new MicButton(
      this,
      width / 2,
      height - 100,
      () => {
        this.startVoiceInput();
      }
    );

    // =========================
    // 타이머
    // =========================

    this.timerDisplay = new TimerDisplay(
      this,
      150,
      80
    );

    this.startTemporaryTimer();

    // TODO:
    // 나중에 ApiClient.startNegotiation(this.npcId)
    // 호출해서 실제 NPC 첫 대사를 받아오도록 변경
  }

  /**
   * 마이크 버튼 클릭 시 STT 시작
   */
  private startVoiceInput(): void {
    this.dialogueBox.setSpeaker('player');
    this.dialogueBox.showThinking();

    this.micButton.setRecording(true);
    this.micButton.setDisabled(true);

    this.voiceInput.start(
      (text) => {
        console.log('플레이어 발화:', text);

        // STT 결과가 비어있는 경우
        if (!text.trim()) {
          this.dialogueBox.setSpeaker('system');
          this.dialogueBox.showText(
            '말소리가 들리지 않았어요. 다시 한 번 말해 주세요.'
          );

          this.micButton.setDisabled(false);
          this.micButton.setRetry();

          return;
        }

        this.dialogueBox.setSpeaker('player');
        this.dialogueBox.showText(text);

        // 다시 말할 수 있게 버튼 복구
        this.micButton.setRecording(false);
        this.micButton.setDisabled(false);

        this.time.delayedCall(1800, () => {
          this.dialogueBox.setSpeaker('npc');
          this.dialogueBox.showThinking();

          // LLM 아직 안 붙였으니까 지금은 버튼 잠그지 않음
        });
      },

      (error) => {
        console.error('STT 오류:', error);

        this.dialogueBox.setSpeaker('system');
        this.dialogueBox.showText(
          '음성을 제대로 인식하지 못했어요. 다시 한 번 말해 주세요.'
        );

        this.micButton.setDisabled(false);
        this.micButton.setRetry();
      }
    );
  }

  private startTemporaryTimer(): void {
    this.timerDisplay.setRemainingSeconds(
      this.remainingSeconds
    );

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,

      callback: () => {
        this.remainingSeconds -= 1;

        this.timerDisplay.setRemainingSeconds(
          this.remainingSeconds
        );

        if (this.remainingSeconds <= 0) {
          this.remainingSeconds = 0;

          this.timerDisplay.setRemainingSeconds(0);

          this.timerEvent?.remove();

          console.log('협상 시간 종료');

          // 나중에 서버 결과에 따라 ResultScene으로 이동
          // this.scene.start(SceneKey.Result);
        }
      },
    });
  }

  /**
   * 플레이어 발화 1턴 처리
   *
   * 나중에:
   * STT 결과
   * → 백엔드 /turn
   * → NPC 응답
   * → 대화창 갱신
   * → TTS
   */
  private async handlePlayerUtterance(
    _playerText: string
  ): Promise<void> {
    // TODO:
    // const response =
    //   await ApiClient.sendTurn(
    //     this.sessionId,
    //     _playerText
    //   );

    // TODO:
    // this.dialogueBox.setSpeaker('npc');
    // this.dialogueBox.showText(
    //   response.npcReply
    // );

    // TODO:
    // TTS 재생

    // TODO:
    // 응답 처리 끝난 뒤
    // this.micButton.setDisabled(false);
    // this.micButton.setRecording(false);

    // TODO:
    // 서버 outcome이 success/failure이면
    // this.scene.start(SceneKey.Result);
  }
}