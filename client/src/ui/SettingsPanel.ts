import Phaser from 'phaser';
import { playUiClick } from './UiFeedback';
import { gameSettings, setGameSetting, type GameSettings } from '../systems/GameSettings';
import './settingsPanel.css';

export class SettingsPanel {
  private root = document.createElement('div');
  private stream?: MediaStream;
  private context?: AudioContext;
  private frame = 0;
  private generation = 0;
  private testing = false;
  private previousSoundMute?: boolean;
  private closed = false;
  private previousFocus = document.activeElement as HTMLElement | null;
  private keyboardEnabled: boolean;
  private inputEnabled: boolean;
  private blockGameInput = (event: Event): void => { event.stopPropagation(); };
  private meter = document.createElement('meter');
  private status = document.createElement('p');
  private mic = document.createElement('button');
  private keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); this.close(); }
    if (event.key !== 'Tab') return;
    const items = [...this.root.querySelectorAll<HTMLElement>('button, input')];
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  constructor(private scene: Phaser.Scene, private onClose: () => void) {
    this.inputEnabled = scene.input.enabled;
    scene.input.enabled = false;
    this.keyboardEnabled = scene.input.keyboard?.enabled ?? false;
    if (scene.input.keyboard) scene.input.keyboard.enabled = false;
    this.root.className = 'game-settings-overlay';
    // DOM 슬라이더의 기본 동작은 유지하고 Phaser 전역 입력으로의 전파만 차단한다.
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove', 'click', 'wheel']) {
      this.root.addEventListener(type, this.blockGameInput);
    }
    const panel = document.createElement('section'); panel.className = 'game-settings-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '설정');
    const title = document.createElement('h2'); title.textContent = '설정';
    const close = document.createElement('button'); close.className = 'settings-close'; close.textContent = '×'; close.setAttribute('aria-label', '설정 닫기');
    close.onclick = () => { playUiClick(scene); this.close(); };
    panel.append(close, title);
    const rows: [keyof GameSettings, string, number, number][] = [
      ['voice', 'NPC 음성', 0, 100], ['bgm', '배경음악', 0, 100],
      ['ui', '버튼 소리', 0, 100], ['brightness', '화면 밝기', 50, 150],
    ];
    for (const [key, label, min, max] of rows) {
      const row = document.createElement('label'); row.className = 'settings-row';
      const heading = document.createElement('span'); heading.textContent = label;
      const value = document.createElement('output');
      const input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '1'; input.value = String(Math.round(gameSettings[key] * 100));
      input.setAttribute('aria-label', label);
      const display = () => { value.textContent = input.value + '%'; input.setAttribute('aria-valuetext', value.textContent); };
      display();
      input.oninput = () => {
        setGameSetting(key, Number(input.value) / 100); display();
        if (key === 'bgm') {
          const bgm = scene.sound.get('main-bgm') as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | null;
          bgm?.setVolume(gameSettings.bgm);
        }
      };
      input.onchange = () => { if (key === 'ui') playUiClick(scene); };
      row.append(heading, value, input); panel.append(row);
    }
    this.mic.textContent = '마이크 테스트'; this.mic.className = 'settings-mic';
    this.mic.onclick = () => { playUiClick(scene); if (this.testing) { this.stopMic(); this.status.textContent = '테스트를 종료했어요.'; } else void this.testMic(); };
    this.meter.min = 0; this.meter.max = 1; this.meter.value = 0; this.meter.setAttribute('aria-label', '마이크 입력 크기');
    this.status.className = 'settings-status'; this.status.setAttribute('role', 'status'); this.status.textContent = '테스트를 누르고 말해 보세요. 음성은 저장하지 않아요.';
    panel.append(this.mic, this.meter, this.status); this.root.append(panel); document.body.append(this.root);
    this.root.addEventListener('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.close, this);
    close.focus();
  }

  private async testMic(): Promise<void> {
    this.testing = true; const generation = ++this.generation;
    // 저장된 개별 음량은 유지한 채 테스트 동안 게임 소리만 임시 음소거한다.
    this.previousSoundMute = this.scene.sound.mute;
    this.scene.sound.mute = true;
    this.mic.textContent = '테스트 중지'; this.status.textContent = '마이크 사용 권한을 확인하고 있어요.';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.closed || generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; const context = new AudioContext(); this.context = context;
      await context.resume();
      if (this.closed || generation !== this.generation) return;
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      this.status.textContent = '말할 때 막대가 움직이면 마이크가 정상 작동해요.';
      const tick = () => {
        if (generation !== this.generation || this.closed) return;
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length);
        this.meter.value = Math.min(1, rms * 5); this.frame = requestAnimationFrame(tick);
      }; tick();
    } catch {
      if (generation !== this.generation || this.closed) return;
      this.stopMic(); this.status.textContent = '마이크를 사용할 수 없어요. 브라우저 권한과 연결된 장치를 확인해 주세요.';
    }
  }

  private stopMic(): void {
    this.generation++; this.testing = false; cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
    if (this.previousSoundMute !== undefined) {
      this.scene.sound.mute = this.previousSoundMute;
      this.previousSoundMute = undefined;
    }
    this.meter.value = 0; this.mic.textContent = '마이크 테스트';
  }

  close(): void {
    if (this.closed) return;
    this.closed = true; this.stopMic(); this.root.remove();
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.close, this);
    this.scene.input.enabled = this.inputEnabled;
    if (this.scene.input.keyboard) this.scene.input.keyboard.enabled = this.keyboardEnabled;
    this.previousFocus?.focus(); this.onClose();
  }
}
