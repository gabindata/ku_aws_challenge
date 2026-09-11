import Phaser from 'phaser';
import { SceneKey } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';
import { TTSManager } from '../systems/TTSManager';

/** 스테이지 1 — 편의점 양점장 협상 화면 */
export class NegotiationScene1 extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private dialogueBox!: DialogueBox;
  private micButton!: MicButton;
  private npcId!: string;

  private timerDisplay!: TimerDisplay;
  private remainingSeconds = 600;
  private timerEvent?: Phaser.Time.TimerEvent;

  private ttsManager!: TTSManager;

  constructor() {
    super(SceneKey.Negotiation1);
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
      'stage1-bg'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 양점장 캐릭터
    // =========================

    const managerYang = this.add.image(
      width * 0.72,
      height * 0.58,
      'manager-yang'
    );

    managerYang.setScale(0.6);
    managerYang.setDepth(10);

    // =========================
    // 대화창
    // =========================

    this.dialogueBox = new DialogueBox(
      this,
      width / 2,
      height * 0.72,
      width * 0.75,
      '양점장'
    );

    // =========================
    // STT 관리자
    // =========================

    this.voiceInput = new VoiceInputManager();

    // =========================
    // TTS 관리자
    // BootScene에서 만들어 둔 인스턴스 재사용
    // =========================

    this.ttsManager =
      this.registry.get('ttsManager') as TTSManager;

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

    // =========================
    // 실제 첫 NPC 대사
    // =========================

    void this.playNpcLine(
      '어서 와요. 무슨 일로 왔어요?'
    );

    // TODO:
    // 백엔드 startNegotiation 연결 후에는
    // 위 고정 문자열 대신 서버가 반환한
    // 첫 npcReply를 playNpcLine()에 전달
  }

  /**
   * NPC 대사를
   *
   * 1. 대화창에 표시
   * 2. TTS로 재생
   *
   * 하는 공통 함수.
   */
  private async playNpcLine(
    text: string
  ): Promise<void> {
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showText(text);

    // NPC가 말하는 동안 플레이어 입력 잠금
    this.micButton.setDisabled(true);

    try {
      await this.ttsManager.speak(
        text,
        'manager_yang'
      );
    } catch (error) {
      console.error(
        'NPC TTS 재생 오류:',
        error
      );
    } finally {
      // NPC 발화가 끝나면 다시 말할 수 있음
      this.micButton.setRecording(false);
      this.micButton.setDisabled(false);
    }
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
        console.log(
          '플레이어 발화:',
          text
        );

        // =========================
        // STT 결과가 비어 있음
        // =========================

        if (!text.trim()) {
          this.dialogueBox.setSpeaker('system');

          this.dialogueBox.showText(
            '말소리가 들리지 않았어요. 다시 한 번 말해 주세요.'
          );

          this.micButton.setRecording(false);
          this.micButton.setDisabled(false);
          this.micButton.setRetry();

          return;
        }

        // =========================
        // 플레이어 발화 표시
        // =========================

        this.dialogueBox.setSpeaker('player');
        this.dialogueBox.showText(text);

        this.micButton.setRecording(false);

        // NPC 응답이 끝날 때까지 입력 잠금
        this.micButton.setDisabled(true);

        // =========================
        // 한 턴 처리
        // =========================

        void this.handlePlayerUtterance(
          text
        );
      },

      (error) => {
        console.error(
          'STT 오류:',
          error
        );

        this.dialogueBox.setSpeaker('system');

        this.dialogueBox.showText(
          '음성을 제대로 인식하지 못했어요. 다시 한 번 말해 주세요.'
        );

        this.micButton.setRecording(false);
        this.micButton.setDisabled(false);
        this.micButton.setRetry();
      }
    );
  }

  /**
   * 플레이어 발화 1턴 처리
   *
   * 최종 흐름:
   *
   * STT
   * ↓
   * 백엔드 /turn
   * ↓
   * npcReply
   * ↓
   * DialogueBox
   * ↓
   * Supertonic TTS
   */
  private async handlePlayerUtterance(
    playerText: string
  ): Promise<void> {
    try {
      // =========================
      // NPC 생각 중
      // =========================

      this.dialogueBox.setSpeaker('npc');
      this.dialogueBox.showThinking();

      console.log(
        '백엔드로 보낼 플레이어 발화:',
        playerText
      );

      // =========================
      // TODO: 백엔드 연결
      // =========================
      //
      // 실제 백엔드가 연결되면:
      //
      // const response =
      //   await ApiClient.sendTurn(
      //     this.sessionId,
      //     playerText
      //   );
      //
      // await this.playNpcLine(
      //   response.npcReply
      // );
      //
      // if (response.outcome === 'success') {
      //   this.scene.start(SceneKey.Result);
      //   return;
      // }
      //
      // if (response.outcome === 'failure') {
      //   this.scene.start(SceneKey.Result);
      //   return;
      // }

      /**
       * 현재는 백엔드 /turn이 아직 연결되지 않았으므로
       * 여기서 가짜 NPC 대사를 만들지 않는다.
       *
       * 백엔드 연결 전까지는
       * 플레이어가 다시 말할 수 있도록 버튼만 복구.
       */
      this.dialogueBox.setSpeaker('system');

      this.dialogueBox.showText(
        'NPC 응답 서버 연결 전입니다.'
      );

      this.micButton.setDisabled(false);

    } catch (error) {
      console.error(
        '턴 처리 오류:',
        error
      );

      this.dialogueBox.setSpeaker('system');

      this.dialogueBox.showText(
        '응답을 불러오지 못했어요. 다시 시도해 주세요.'
      );

      this.micButton.setRecording(false);
      this.micButton.setDisabled(false);
      this.micButton.setRetry();
    }
  }

  /**
   * 임시 클라이언트 타이머
   *
   * 나중에는 서버 remainingSeconds 기준으로 교체.
   */
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

          console.log(
            '협상 시간 종료'
          );

          this.micButton.setDisabled(true);

          // TODO:
          // 서버 결과에 따라 ResultScene 이동
        }
      },
    });
  }
}