import { SettingsPanel } from '../ui/SettingsPanel';
import { SessionResultPoller } from '../systems/SessionResultPoller';
import { playUiClick } from '../ui/UiFeedback';
import Phaser from 'phaser';
import { SceneKey } from '../types';
import type { ReturnLocation } from '../types';
import { VoiceInputManager } from '../systems/VoiceInputManager';
import { DialogueBox } from '../ui/DialogueBox';
import { MicButton } from '../ui/MicButton';
import { TimerDisplay } from '../ui/TimerDisplay';
import { TTSManager } from '../systems/TTSManager';
import { BackButton } from '../ui/BackButton';
import {
  ApiError,
  newMessageId,
  newRequestId,
  pauseSession,
  resumeSession,
  sendTurn,
  startNegotiation,
} from '../systems/ApiClient';
import type { TurnRequest, TurnResponse } from '../types';
import { AgreementMemoPanel } from '../ui/AgreementMemoPanel';
import { NpcExpressionController, npcExpressionTexture } from '../systems/NpcExpressionController';

interface NegotiationStageConfig {
  sceneKey: string;
  stageId: number;
  npcId: 'store_owner_yang' | 'ta_han' | 'landlord';
  npcName: string;
  background: string;
  returnScene: string;
}

/** 세 스테이지의 API·음성·표정·메모·타이머·종료·복귀를 동일하게 처리한다. */
export class BaseNegotiationScene extends Phaser.Scene {
  private voiceInput!: VoiceInputManager;
  private dialogueBox!: DialogueBox;
  private micButton!: MicButton;
  private npcId!: string;
  private returnTo?: ReturnLocation;
  private sessionId: string | null = null;
  private sceneGeneration = 0;
  private pendingTurn: TurnRequest | null = null;
  private turnBusy = false;
  private ended = false;
  private retryButton!: Phaser.GameObjects.Text;
  private agreementPanel!: AgreementMemoPanel;
  private expressionController!: NpcExpressionController;
  private latestResponse: TurnResponse | null = null;

  private timerDisplay!: TimerDisplay;
  private remainingSeconds = 600;
  private resultPoller?: SessionResultPoller;
  private serverReady = false;
  private legacyResultApi = false;
  private displayDeadline = 0;
  private timeoutRequest?: AbortController;
  private nextTimeoutCheck = 0;
  private settingsPanel?: SettingsPanel;
  /** 설정창 정지 중인가. 서버가 시간을 멈춘 동안 로컬 표시도 멈춘다 */
  private paused = false;
  private exitDialog?: HTMLElement;
  private closeExitDialog?: () => void;
  private speaking = false;
  private recording = false;

  private ttsManager!: TTSManager;

  constructor(private readonly stage: NegotiationStageConfig) {
    super(stage.sceneKey);
  }

  init(data: { npcId?: string; returnTo?: ReturnLocation } = {}): void {
    this.settingsPanel = undefined;
    this.paused = false;
    this.exitDialog = undefined;
    this.returnTo = data.returnTo;
    this.npcId = this.stage.npcId;
    this.sessionId = null;
    this.pendingTurn = null;
    this.turnBusy = false;
    this.ended = false;
    this.serverReady = false;
    this.legacyResultApi = false;
    this.displayDeadline = 0;
    this.nextTimeoutCheck = 0;
    this.timeoutRequest = undefined;
    this.speaking = false;
    this.recording = false;
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
      this.stage.background
    );

    background.setDisplaySize(width, height);
    background.setDepth(-10);

    // =========================
    // 뒤로가기 버튼
    // 진입했던 장소와 위치로 복귀
    // =========================

    new BackButton(this, () => {
      this.confirmExit();
    });

    // =========================
    // NPC 캐릭터
    // =========================

    const npcPortrait = this.add.image(
      width * 0.72,
      height * 0.58,
      npcExpressionTexture(this.stage.npcId)
    );

    npcPortrait.setScale(0.6);
    npcPortrait.setDepth(10);
    this.expressionController = new NpcExpressionController(this, npcPortrait, this.stage.npcId);
    this.agreementPanel = new AgreementMemoPanel(this, 45, 190);

    // =========================
    // 대화창
    // =========================

    this.dialogueBox = new DialogueBox(
      this,
      width / 2,
      height * 0.72,
      width * 0.75,
      this.stage.npcName
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
      fontFamily: 'YPairing', fontStyle: 'bold', fontSize: '24px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(40).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.retryButton.on('pointerdown', () => {
      playUiClick(this);
      void this.submitPendingTurn();
    });

    // =========================
    // 타이머
    // =========================

    this.timerDisplay = new TimerDisplay(
      this,
      150,
      130
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // 이전 입장의 응답이 재입장한 화면을 변경하지 못하게 한다.
      this.closeExitDialog?.();
      this.exitDialog?.remove();
      this.exitDialog = undefined;
      this.sceneGeneration += 1;
      this.sessionId = null;
      this.timeoutRequest?.abort();
      this.timeoutRequest = undefined;
      this.resultPoller?.stop();
      this.resultPoller = undefined;
      this.voiceInput.stop();
      this.ttsManager.cancel();
    });

    const settings = this.add.image(width - 60, 60, 'settings-button')
      .setDisplaySize(72, 72).setDepth(100).setInteractive({ useHandCursor: true });
    settings.on('pointerdown', () => {
      if (this.settingsPanel || this.exitDialog || this.ended) return;
      playUiClick(this);
      this.voiceInput.stop(); this.recording = false;
      this.ttsManager.cancel(); this.micButton.setRecording(false);
      this.settingsPanel = new SettingsPanel(this, () => {
        this.settingsPanel = undefined;
        if (this.scene.isActive()) this.updateInputState();
        // 닫히면 서버 시간이 다시 흐른다. 응답으로 표시를 맞춘다.
        void this.setServerPause(false);
      });
      this.updateInputState();
      // 설정창을 보는 동안 남은 시간이 흐르면 안 된다 (공통규칙 §4 예외).
      void this.setServerPause(true);
    });
    void this.beginNegotiation();
  }

  /** 서버 세션과 첫 대사를 받은 뒤에만 플레이어 입력을 연다. */
  private async beginNegotiation(): Promise<void> {
    const generation = this.sceneGeneration;
    this.micButton.setDisabled(true);
    this.dialogueBox.setSpeaker('system');
    this.dialogueBox.showText(`${this.stage.npcName} 대화를 준비하고 있어요.`);

    try {
      const response = await startNegotiation(this.stage.stageId);
      if (generation !== this.sceneGeneration) return;

      this.sessionId = response.sessionId;
      this.applyPresentation(response);
      this.syncTimer(response.remainingSeconds ?? 600);
      this.startResultPolling();
      await this.playNpcLine(response.npcReply);
      if (generation !== this.sceneGeneration) return;

      this.updateInputState();
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
    this.speaking = true;
    this.dialogueBox.setSpeaker('npc');
    this.dialogueBox.showText(text);

    // NPC가 말하는 동안 플레이어 입력 잠금
    this.micButton.setDisabled(true);

    try {
      if (this.settingsPanel || this.exitDialog) return;
      await this.ttsManager.speak(
        text,
        this.stage.npcId
      );
    } catch (error) {
      console.error(
        'NPC TTS 재생 오류:',
        error
      );
    } finally {
      if (generation === this.sceneGeneration) {
        this.micButton.setRecording(false);
        this.speaking = false;
        this.updateInputState();
      }
    }
  }

  /**
   * 마이크 버튼 클릭 시 STT 시작
   */
  private startVoiceInput(): void {
    if (!this.sessionId || !this.serverReady || this.speaking || this.recording || this.ended || this.turnBusy || this.pendingTurn || this.remainingSeconds <= 0) return;
    const generation = this.sceneGeneration;
    this.dialogueBox.setSpeaker('player');
    this.dialogueBox.showThinking();

    this.micButton.setRecording(true);
    this.micButton.setDisabled(true);

    this.recording = true;
    this.voiceInput.start(
      (text) => {
        if (generation !== this.sceneGeneration || this.ended) return;
        this.recording = false;
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
          this.updateInputState();
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
        if (generation !== this.sceneGeneration || this.ended) return;
        this.recording = false;
        console.error(
          'STT 오류:',
          error
        );

        this.dialogueBox.setSpeaker('system');

        this.dialogueBox.showText(
          '음성을 제대로 인식하지 못했어요. 다시 한 번 말해 주세요.'
        );

        this.micButton.setRecording(false);
        this.updateInputState();
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

  private applyPresentation(response: TurnResponse): void {
    this.agreementPanel.update(response.agreementMemo);
    void this.expressionController.setExpression(response.expressionKey);
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
      if (this.ended) return;
      this.latestResponse = response;
      this.applyPresentation(response);
      if (response.remainingSeconds !== null) {
        this.syncTimer(response.remainingSeconds);
      }

      if (response.outcome === 'retry') {
        this.pendingTurn = { ...request, requestId: newRequestId() };
        this.dialogueBox.setSpeaker('system');
        this.dialogueBox.showText('발화를 처리하지 못했어요. 아래 버튼으로 같은 발화를 다시 전송해 주세요.');
        this.retryButton.setVisible(true);
        return;
      }

      this.pendingTurn = null;
      if (response.outcome === 'success' || response.outcome === 'failure') {
        this.finishNegotiation(response);
        return;
      }
      if (response.npcReply.trim()) await this.playNpcLine(response.npcReply);
      if (generation !== this.sceneGeneration || this.ended) return;
      void this.resultPoller?.refresh();
    } catch (error) {
      if (generation !== this.sceneGeneration) return;
      if (this.ended) return;
      if (error instanceof ApiError && error.missingSession) {
        this.ended = true;
        this.pendingTurn = null;
        this.resultPoller?.stop();
        this.voiceInput.stop();
        this.ttsManager.cancel();
        this.dialogueBox.setSpeaker('system');
        this.dialogueBox.showText('서버에 대화 기록이 없어요. 뒤로가기로 나간 뒤 다시 시작해 주세요.');
        return;
      }
      // 처리 여부를 모르므로 pendingTurn의 내용과 두 ID를 그대로 보존한다.
      console.error('턴 처리 오류:', error);
      this.dialogueBox.setSpeaker('system');
      this.dialogueBox.showText('응답을 받지 못했어요. 연결을 확인하고 아래 버튼으로 같은 발화를 다시 전송해 주세요.');
      this.retryButton.setVisible(true);
    } finally {
      if (generation === this.sceneGeneration) {
        this.turnBusy = false;
        this.micButton.setRecording(false);
        this.updateInputState();
      }
    }
  }

  private updateInputState(): void {
    this.micButton.setDisabled(!!this.settingsPanel || !!this.exitDialog || !this.sessionId || !this.serverReady || this.speaking ||
      this.recording || this.ended || this.turnBusy || this.pendingTurn !== null || this.remainingSeconds <= 0);
  }

  private startResultPolling(): void {
    const generation = this.sceneGeneration;
    this.resultPoller?.stop();
    this.resultPoller = new SessionResultPoller(this.sessionId!, (result) => {
      if (generation !== this.sceneGeneration || this.ended) return;
      if (result.sessionStatus === 'ended' && result.view) {
        this.finishNegotiation(result.view);
        return;
      }
      this.serverReady = result.sessionStatus === 'in_progress';
      // 서버의 남은 시간을 그대로 표시한다. 클라이언트가 종료를 판정하지 않는다.
      if (result.remainingSeconds !== null) {
        this.syncTimer(result.remainingSeconds);
      }
      this.updateInputState();
    }, (error) => {
      if (generation !== this.sceneGeneration || this.ended) return;
      if (error instanceof ApiError && error.missingResultEndpoint) {
        this.resultPoller?.stop();
        this.legacyResultApi = true;
        this.serverReady = true;
        this.updateInputState();
        return;
      }
      if (error instanceof ApiError && error.missingSession) {
        this.ended = true;
        this.resultPoller?.stop();
        this.voiceInput.stop();
        this.ttsManager.cancel();
        this.retryButton.setVisible(false);
        this.updateInputState();
        this.dialogueBox.setSpeaker('system');
        this.dialogueBox.showText('협상 세션이 만료됐어요. 뒤로가기로 나간 뒤 다시 시작해 주세요.');
      }
    });
  }

  private confirmExit(): void {
    if (this.exitDialog || this.settingsPanel) return;
    this.voiceInput.stop(); this.recording = false;
    this.ttsManager.cancel(); this.micButton.setRecording(false);
    const root = document.createElement('div'); root.className = 'game-settings-overlay';
    const panel = document.createElement('section'); panel.className = 'game-settings-panel';
    panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '대화 종료 확인');
    panel.tabIndex = -1;
    panel.classList.add('exit-confirm-panel');
    const message = document.createElement('p'); message.textContent = '진행 중인 대화를 종료할까요?';
    const detail = document.createElement('p'); detail.className = 'settings-status';
    detail.textContent = '나가면 이번 대화를 이어서 진행할 수 없어요.';
    const cancel = document.createElement('button'); cancel.className = 'exit-confirm-button'; cancel.textContent = '계속하기';
    const leave = document.createElement('button'); leave.className = 'exit-confirm-button'; leave.textContent = '대화 종료';
    const inputEnabled = this.input.enabled;
    const keyboardEnabled = this.input.keyboard?.enabled;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const close = () => {
      root.remove(); this.exitDialog = undefined; this.closeExitDialog = undefined; this.input.enabled = inputEnabled;
      if (this.input.keyboard && keyboardEnabled !== undefined) this.input.keyboard.enabled = keyboardEnabled;
      this.updateInputState();
    };
    cancel.onclick = () => { playUiClick(this); close(); };
    leave.onclick = () => {
      playUiClick(this); close();
      this.scene.start(this.returnTo?.scene ?? this.stage.returnScene, { returnPosition: this.returnTo?.position });
    };
    root.onkeydown = event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === panel ? (event.shiftKey ? leave : cancel) : document.activeElement === cancel ? leave : cancel).focus(); }
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) root.addEventListener(type, event => event.stopPropagation());
    const actions = document.createElement('div'); actions.className = 'exit-confirm-actions';
    actions.append(cancel, leave);
    panel.append(message, detail, actions); root.append(panel); document.body.append(root);
    this.closeExitDialog = close;
    this.exitDialog = root; this.updateInputState(); panel.focus();
  }

  /**
   * 서버에 정지·재개를 알리고 돌아온 남은 시간으로 표시를 맞춘다.
   *
   * 실패하면 로컬 정지를 풀어 시간이 계속 흐르게 둔다. 서버가 멈추지 않았는데
   * 화면만 멈춰 있으면 플레이어가 남은 시간을 잘못 믿게 된다.
   */
  private async setServerPause(paused: boolean): Promise<void> {
    if (!this.sessionId || this.ended) return;
    const generation = this.sceneGeneration;
    this.paused = paused;
    try {
      const result = paused
        ? await pauseSession(this.sessionId)
        : await resumeSession(this.sessionId);
      if (generation !== this.sceneGeneration) return;
      if (result.remainingSeconds !== null) this.syncTimer(result.remainingSeconds);
      // 서버가 이미 끝낸 세션이면 결과 화면으로 넘긴다.
      if (result.sessionStatus === 'ended' && result.view) this.finishNegotiation(result.view);
    } catch (error) {
      if (generation !== this.sceneGeneration) return;
      console.error(paused ? '타이머 정지 실패:' : '타이머 재개 실패:', error);
      this.paused = false;
    }
  }

  private syncTimer(seconds: number): void {
    this.displayDeadline = performance.now() + Math.max(0, seconds) * 1000;
    this.remainingSeconds = Math.min(600, Math.max(0, seconds));
    this.timerDisplay.setRemainingSeconds(this.remainingSeconds);
  }

  update(): void {
    if (!this.legacyResultApi || this.ended || !this.displayDeadline) return;
    // 서버가 멈춘 동안에는 표시도 멈춘다. 재개하면 응답으로 다시 맞춰진다.
    if (this.paused) {
      this.displayDeadline = performance.now() + this.remainingSeconds * 1000;
      return;
    }
    this.remainingSeconds = Math.min(600, Math.max(0, Math.ceil((this.displayDeadline - performance.now()) / 1000)));
    this.timerDisplay.setRemainingSeconds(this.remainingSeconds);
    if (this.remainingSeconds <= 0 && !this.turnBusy && !this.timeoutRequest && performance.now() >= this.nextTimeoutCheck) {
      void this.collectTimeoutResult();
    }
  }

  /** 빈 요청은 발화를 추가하지 않고 서버가 자동 생성한 종료 결과만 확인한다. */
  private async collectTimeoutResult(): Promise<void> {
    if (!this.sessionId) return;
    const generation = this.sceneGeneration;
    const controller = new AbortController();
    this.timeoutRequest = controller;
    this.pendingTurn = null;
    this.recording = false;
    this.voiceInput.stop();
    this.ttsManager.cancel();
    this.micButton.setRecording(false);
    this.retryButton.setVisible(false);
    this.updateInputState();
    this.dialogueBox.setSpeaker('system');
    this.dialogueBox.showText('시간이 끝났어요. 결과 리포트를 불러오고 있어요.');
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await sendTurn({
        sessionId: this.sessionId, messageId: newMessageId(), requestId: newRequestId(), playerText: '',
      }, controller.signal);
      if (generation !== this.sceneGeneration || this.ended) return;
      if (response.outcome === 'success' || response.outcome === 'failure') {
        this.finishNegotiation(response);
      } else if (response.remainingSeconds !== null && response.remainingSeconds > 0) {
        // 처리 중이던 턴에 서버가 인정한 정지 시간이 있으면 최신 마감을 따른다.
        this.syncTimer(response.remainingSeconds);
        this.dialogueBox.showText('서버에서 남은 시간을 갱신했어요. 대화를 계속해 주세요.');
        this.updateInputState();
      }
    } catch (error) {
      if (generation !== this.sceneGeneration || this.ended) return;
      if (error instanceof ApiError && error.missingSession) {
        this.ended = true;
        this.dialogueBox.showText('서버에 대화 기록이 없어 리포트를 불러올 수 없어요. 뒤로가기로 나가 다시 시작해 주세요.');
      } else {
        this.dialogueBox.showText('결과를 아직 받지 못했어요. 서버 연결을 다시 확인하고 있어요.');
      }
    } finally {
      clearTimeout(timeout);
      if (generation === this.sceneGeneration) {
        this.timeoutRequest = undefined;
        this.nextTimeoutCheck = performance.now() + 2000;
      }
    }
  }

  private finishNegotiation(response: TurnResponse): void {
    if (this.ended) return;
    this.ended = true;
    this.pendingTurn = null;
    this.resultPoller?.stop();
    this.voiceInput.stop();
    this.ttsManager.cancel();
    this.retryButton.setVisible(false);
    this.updateInputState();
    this.scene.start(SceneKey.Result, { sessionId: this.sessionId, view: response, stageId: this.stage.stageId, returnTo: this.returnTo });
  }
}
