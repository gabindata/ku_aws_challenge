import Phaser from 'phaser';
import { SceneKey } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';
import { TTSManager } from '../systems/TTSManager';
import { BackButton } from '../ui/BackButton';
import { startNegotiation } from '../systems/ApiClient';

/** 스테이지 2 — 학과 사무실 한조교 협상 화면 */
export class NegotiationScene2 extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private dialogueBox!: DialogueBox;
  private micButton!: MicButton;
  private npcId!: string;
  private sessionId: string | null = null;
  private sceneGeneration = 0;

  private timerDisplay!: TimerDisplay;
  private remainingSeconds = 600;
  private timerEvent?: Phaser.Time.TimerEvent;

  private ttsManager!: TTSManager;

  constructor() {
    super(SceneKey.Negotiation2);
  }

  init(data: { npcId: string }): void {
    this.npcId = data.npcId;
    this.sessionId = null;
    this.remainingSeconds = 600;
    this.sceneGeneration += 1;

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
      'stage2-bg'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 뒤로가기 버튼
    // 협상 화면 → 학과 사무실 내부
    // =========================

    new BackButton(this, () => {
      this.scene.start(SceneKey.DepartmentOffice);
    });

    // =========================
    // 한조교 캐릭터
    // =========================

    const assistantHan = this.add.image(
      width * 0.72,
      height * 0.58,
      'assistant-han'
    );

    assistantHan.setScale(0.6);
    assistantHan.setDepth(10);

    // =========================
    // 대화창
    // =========================

    this.dialogueBox = new DialogueBox(
      this,
      width / 2,
      height * 0.72,
      width * 0.75,
      '한조교'
    );

    // =========================
    // STT 관리자
    // =========================

    this.voiceInput = new VoiceInputManager();

    // =========================
    // TTS 관리자
    // BootScene에서 만든 인스턴스 재사용
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // 이전 입장의 응답이 재입장한 화면을 변경하지 못하게 한다.
      this.sceneGeneration += 1;
      this.sessionId = null;
      this.timerEvent?.remove();
      this.timerEvent = undefined;
      this.voiceInput.stop();
      this.ttsManager.cancel();
    });

    void this.beginNegotiation();
  }

  /** 서버 세션과 첫 대사를 받은 뒤에만 플레이어 입력을 연다. */
  private async beginNegotiation(): Promise<void> {
    const generation = this.sceneGeneration;
    this.micButton.setDisabled(true);
    this.dialogueBox.setSpeaker('system');
    this.dialogueBox.showText('한조교와 대화를 준비하고 있어요.');

    try {
      const response = await startNegotiation(2);
      if (generation !== this.sceneGeneration) return;

      this.sessionId = response.sessionId;
      this.remainingSeconds = response.remainingSeconds ?? 600;
      this.timerDisplay.setRemainingSeconds(this.remainingSeconds);
      await this.playNpcLine(response.npcReply);
      if (generation !== this.sceneGeneration) return;

      // 첫 대사 재생 뒤 시작하는 임시 표시. 서버 시간 동기화는 후속 작업이다.
      this.startTemporaryTimer();
    } catch (error) {
      if (generation !== this.sceneGeneration) return;
      console.error('협상 시작 오류:', error);
      this.sessionId = null;
      this.micButton.setDisabled(true);
      this.dialogueBox.setSpeaker('system');
      this.dialogueBox.showText(
        '대화를 시작하지 못했어요. 서버 연결을 확인한 뒤 뒤로가기로 나갔다가 다시 시작해 주세요.'
      );
    }
  }

  /**
   * NPC 대사 공통 처리
   *
   * 1. DialogueBox에 표시
   * 2. 입력 잠금
   * 3. TTS 재생
   * 4. 재생 종료 후 입력 복구
   */
  private async playNpcLine(
    text: string
  ): Promise<void> {
    const generation = this.sceneGeneration;
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showText(text);

    this.micButton.setDisabled(true);

    try {
      await this.ttsManager.speak(
        text,
        'ta_han'
      );
    } catch (error) {
      console.error(
        '한조교 TTS 재생 오류:',
        error
      );
    } finally {
      if (generation === this.sceneGeneration) {
        this.micButton.setRecording(false);
        this.micButton.setDisabled(this.sessionId === null);
      }
    }
  }

  /**
   * 마이크 버튼 클릭 시 STT 시작
   */
  private startVoiceInput(): void {
    if (!this.sessionId) return;
    const generation = this.sceneGeneration;
    this.dialogueBox.setSpeaker('player');
    this.dialogueBox.showThinking();

    this.micButton.setRecording(true);
    this.micButton.setDisabled(true);

    this.voiceInput.start(
      (text) => {
        if (generation !== this.sceneGeneration) return;
        console.log(
          '플레이어 발화:',
          text
        );

        // =========================
        // STT 결과 없음
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

        // NPC 응답이 끝날 때까지 잠금
        this.micButton.setDisabled(true);

        // =========================
        // 한 턴 처리
        // =========================

        void this.handlePlayerUtterance(
          text
        );
      },

      (error) => {
        if (generation !== this.sceneGeneration) return;
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
   * 한조교 TTS
   */
  private async handlePlayerUtterance(
    playerText: string
  ): Promise<void> {
    try {
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
      // if (
      //   response.outcome === 'success' ||
      //   response.outcome === 'failure'
      // ) {
      //   this.scene.start(SceneKey.Result);
      //   return;
      // }

      /**
       * 현재는 백엔드 미연결 상태.
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