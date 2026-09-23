import Phaser from 'phaser';
import { SceneKey } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';
import { TTSManager } from '../systems/TTSManager';
import { BackButton } from '../ui/BackButton';
import { startNegotiation, sendTurn, newMessageId, newRequestId } from '../systems/ApiClient';
import type { TurnRequest, TurnResponse } from '../types';

/** 스테이지 1 — 편의점 양점장 협상 화면 */
export class NegotiationScene1 extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private dialogueBox!: DialogueBox;
  private micButton!: MicButton;
  private npcId!: string;
  private sessionId: string | null = null;
  private sceneGeneration = 0;
  private pendingTurn: TurnRequest | null = null;
  private turnBusy = false;
  private ended = false;
  private retryButton!: Phaser.GameObjects.Text;
  private latestResponse: TurnResponse | null = null;

  private timerDisplay!: TimerDisplay;
  private remainingSeconds = 600;
  private timerEvent?: Phaser.Time.TimerEvent;

  private ttsManager!: TTSManager;

  constructor() {
    super(SceneKey.Negotiation1);
  }

  init(data: { npcId: string }): void {
    this.npcId = data.npcId;
    this.sessionId = null;
    this.pendingTurn = null;
    this.turnBusy = false;
    this.ended = false;
    this.latestResponse = null;
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
      'stage1-bg'
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 뒤로가기 버튼
    // 협상 화면 → 편의점 내부
    // =========================

    new BackButton(this, () => {
      this.scene.start(SceneKey.ConvenienceStore);
    });

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

    this.retryButton = this.add.text(width / 2, height - 160, '같은 발화 다시 전송', {
      fontSize: '24px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(40).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.retryButton.on('pointerdown', () => {
      void this.submitPendingTurn();
    });

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
    this.dialogueBox.showText('양점장과 대화를 준비하고 있어요.');

    try {
      const response = await startNegotiation(1);
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
    const generation = this.sceneGeneration;
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showText(text);

    // NPC가 말하는 동안 플레이어 입력 잠금
    this.micButton.setDisabled(true);

    try {
      await this.ttsManager.speak(
        text,
        'store_owner_yang'
      );
    } catch (error) {
      console.error(
        'NPC TTS 재생 오류:',
        error
      );
    } finally {
      if (generation === this.sceneGeneration) {
        this.micButton.setRecording(false);
        this.micButton.setDisabled(this.sessionId === null || this.ended || this.turnBusy || this.pendingTurn !== null || this.remainingSeconds <= 0);
      }
    }
  }

  /**
   * 마이크 버튼 클릭 시 STT 시작
   */
  private startVoiceInput(): void {
    if (!this.sessionId || this.ended || this.turnBusy || this.pendingTurn || this.remainingSeconds <= 0) return;
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
   * Supertonic TTS
   */
  private async handlePlayerUtterance(
    playerText: string
  ): Promise<void> {
    if (!this.sessionId || this.ended || this.turnBusy || this.pendingTurn) return;
    if (!playerText.trim()) return;

    this.pendingTurn = {
      sessionId: this.sessionId,
      playerText,
      messageId: newMessageId(),
      requestId: newRequestId(),
    };
    await this.submitPendingTurn();
  }

  /** 통신 실패는 같은 ID, 명시적인 retry 응답은 새 requestId로 재전송한다. */
  private async submitPendingTurn(): Promise<void> {
    if (!this.pendingTurn || this.turnBusy || this.ended) return;
    const generation = this.sceneGeneration;
    const request = this.pendingTurn;
    this.turnBusy = true;
    this.retryButton.setVisible(false);
    this.micButton.setDisabled(true);
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showThinking();

    try {
      const response = await sendTurn(request);
      if (generation !== this.sceneGeneration) return;
      this.latestResponse = response;
      if (response.remainingSeconds !== null) {
        this.remainingSeconds = response.remainingSeconds;
        this.timerDisplay.setRemainingSeconds(this.remainingSeconds);
      }

      if (response.outcome === 'retry') {
        this.pendingTurn = { ...request, requestId: newRequestId() };
        this.dialogueBox.setSpeaker('system');
        this.dialogueBox.showText('발화를 처리하지 못했어요. 아래 버튼으로 같은 발화를 다시 전송해 주세요.');
        this.retryButton.setVisible(true);
        return;
      }

      this.pendingTurn = null;
      this.ended = response.outcome === 'success' || response.outcome === 'failure';
      if (this.ended) this.timerEvent?.remove();
      if (response.npcReply.trim()) await this.playNpcLine(response.npcReply);
      if (generation !== this.sceneGeneration) return;

      if (this.ended) {
        // 결과/리포트 화면 연결 전까지 서버의 종료 문구를 현재 대화창에 표시한다.
        this.dialogueBox.setSpeaker('system');
        const heading = response.outcome === 'success' ? '성공!' : '실패!';
        this.dialogueBox.showText([
          heading,
          response.outcome === 'success' ? response.successText : response.failureText,
          response.endReason === 'time' ? '제한 시간이 끝났습니다.' : null,
          response.endReason === 'limit' ? response.limitText : null,
          response.hintText,
        ].filter(Boolean).join('\n'));
      } else {
        // 로컬 표시가 0초여서 멈췄더라도 서버가 진행 중이면 다시 표시한다.
        this.timerEvent?.remove();
        this.startTemporaryTimer();
      }
    } catch (error) {
      if (generation !== this.sceneGeneration) return;
      // 처리 여부를 모르므로 pendingTurn의 내용과 두 ID를 그대로 보존한다.
      console.error('턴 처리 오류:', error);
      this.dialogueBox.setSpeaker('system');
      this.dialogueBox.showText('응답을 받지 못했어요. 연결을 확인하고 아래 버튼으로 같은 발화를 다시 전송해 주세요.');
      this.retryButton.setVisible(true);
    } finally {
      if (generation === this.sceneGeneration) {
        this.turnBusy = false;
        this.micButton.setRecording(false);
        this.micButton.setDisabled(this.ended || this.pendingTurn !== null || this.remainingSeconds <= 0);
      }
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