import Phaser from 'phaser';

/** 에셋이 준비되기 전에 씬이 시작되거나 누락된 텍스처로 진행되는 것을 막는다. */
export class ResourceLoadingScreen {
  private root = document.createElement('section');
  private message = document.createElement('p');
  private failed = false;
  private progress = (value: number) => {
    if (!this.failed) this.message.textContent = `게임을 준비하고 있어요. ${Math.round(value * 100)}%`;
  };
  private error = () => { this.failed = true; this.message.textContent = '일부 리소스를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'; };
  constructor(private scene: Phaser.Scene) {
    Object.assign(this.root.style, { position:'fixed', inset:'0', zIndex:'99995', background:'#10172c', color:'#fff', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', font:'24px Galmuri11,sans-serif', padding:'24px' });
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.progress(0);
    this.root.append(this.message);
    document.body.append(this.root);
    scene.load.on('progress', this.progress);
    scene.load.on('loaderror', this.error);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }
  finish(): boolean {
    this.scene.load.off('progress', this.progress);
    this.scene.load.off('loaderror', this.error);
    if (!this.failed) { this.destroy(); return true; }
    const retry = document.createElement('button');
    retry.textContent = '새로고침하고 다시 시도';
    Object.assign(retry.style, { font:'bold 24px Galmuri11,sans-serif', padding:'14px 24px', cursor:'pointer' });
    retry.onclick = () => window.location.reload();
    this.root.append(retry);
    retry.focus();
    return false;
  }
  private destroy(): void {
    this.scene.load.off('progress', this.progress);
    this.scene.load.off('loaderror', this.error);
    this.root.remove();
  }
}
