
import Phaser from 'phaser';
import { SceneKey } from '../types';

/** NPC 초상화·배경·효과음 로드. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Preload);
  }

  preload(): void {
    // TODO: this.load.image('npc_merchant_kim', 'assets/images/npc-portraits/merchant_kim.png') 등

    // =========================
    // 기존 너구리 리소스
    // =========================

    this.load.image(
      'player',
      'assets/images/player/player.png'
    );

    // =========================
    // 사람 캐릭터 이미지 12개
    // =========================

    // 아래 방향 (S)
    this.load.image(
      'down-idle',
      'assets/images/player/down-idle.png'
    );

    this.load.image(
      'down-walk-1',
      'assets/images/player/down-walk-1.png'
    );

    this.load.image(
      'down-walk-2',
      'assets/images/player/down-walk-2.png'
    );

    // 위 방향 (W)
    this.load.image(
      'up-idle',
      'assets/images/player/up-idle.png'
    );

    this.load.image(
      'up-walk-1',
      'assets/images/player/up-walk-1.png'
    );

    this.load.image(
      'up-walk-2',
      'assets/images/player/up-walk-2.png'
    );

    // 왼쪽 방향 (A)
    this.load.image(
      'left-idle',
      'assets/images/player/left-idle.png'
    );

    this.load.image(
      'left-walk-1',
      'assets/images/player/left-walk-1.png'
    );

    this.load.image(
      'left-walk-2',
      'assets/images/player/left-walk-2.png'
    );

    // 오른쪽 방향 (D)
    this.load.image(
      'right-idle',
      'assets/images/player/right-idle.png'
    );

    this.load.image(
      'right-walk-1',
      'assets/images/player/right-walk-1.png'
    );

    this.load.image(
      'right-walk-2',
      'assets/images/player/right-walk-2.png'
    );

    // =========================
    // 메인 화면 리소스
    // =========================

    this.load.image(
      'main-menu-bg',
      '/assets/images/main-menu-bg.png'
    );

    // =========================
    // 스테이지 1 리소스
    // =========================

    // 양점장 2D 캐릭터
    this.load.image(
      'manager-yang-2d',
      '/assets/images/npc-portraits/manager-yang/manager-yang-2d.png'
    );

    this.load.image(
      'stage1-bg',
      'assets/images/stage1/convenience-store-bg.png'
    );

    // 편의점 내부
    this.load.image(
      'convenience-store-interior',
      'assets/images/stage1/convenience-store-interior.png'
    );

    this.load.image(
      'manager-yang',
      'assets/images/stage1/manager-yang.png'
    );

    // =========================
    // 스테이지 2 리소스
    // =========================

    // 한조교 2D 캐릭터
    this.load.image(
      'assistant-han-2d',
      '/assets/images/npc-portraits/assistant-han/assistant-han-2d.png'
    );

    this.load.image(
      'stage2-bg',
      'assets/images/stage2/stage2-bg.png'
    );

    this.load.image(
      'assistant-han',
      'assets/images/stage2/assistant-han.png'
    );

    // 학교 복도
    this.load.image(
      'school-hallway-interior',
      'assets/images/stage2/school-hallway-interior.png'
    );

    // 학과 사무실
    this.load.image(
      'department-office-interior',
      'assets/images/stage2/department-office-interior.png'
    );

    // =========================
    // 스테이지 3 리소스
    // =========================

    this.load.image(
      'stage3-bg',
      'assets/images/stage3/stage3-bg.png'
    );

    this.load.image(
      'seo-heejung',
      'assets/images/stage3/seo-heejung.png'
    );

    // =========================
    // UI 리소스
    // =========================

    this.load.image(
      'button-default',
      '/assets/images/ui/button-default.png'
    );

    this.load.image(
      'button-highlight',
      '/assets/images/ui/button-highlight.png'
    );

    // =========================
    // 오디오 리소스
    // =========================

    this.load.audio(
      'main-bgm',
      '/assets/audio/main_bgm.mp3'
    );

    this.load.audio(
      'button-click',
      '/assets/audio/button_click.mp3'
    );

    this.load.audio(
      'button-hover',
      '/assets/audio/button_hover.mp3'
    );

    // =========================
    // 시간대 연출용 맵 레이어
    // =========================

    this.load.image(
      'stage-select-base',
      '/assets/images/stage-selection/tutorial-map-bg.png'
    );

    this.load.image(
      'stage-select-evening',
      '/assets/images/stage-selection/tutorial-map-evening.png'
    );
  }

  create(): void {
    // 사람 캐릭터 걷기 애니메이션 등록
    this.createPlayerAnimations();

    // 메인 화면으로 이동
    this.scene.start(SceneKey.MainMenu);
  }

  
  // =========================
  // 사람 캐릭터 걷기 애니메이션
  // =========================

  private createPlayerAnimations(): void {

    // =========================
    // S키: 아래쪽 걷기
    // =========================

    if (!this.anims.exists('walk-down')) {
      this.anims.create({
        key: 'walk-down',
        frames: [
          { key: 'down-walk-1' },
          { key: 'down-idle' },
          { key: 'down-walk-2' },
          { key: 'down-idle' },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }

    // =========================
    // W키: 위쪽 걷기
    // =========================

    if (!this.anims.exists('walk-up')) {
      this.anims.create({
        key: 'walk-up',
        frames: [
          { key: 'up-walk-1' },
          { key: 'up-idle' },
          { key: 'up-walk-2' },
          { key: 'up-idle' },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }

    // =========================
    // A키: 왼쪽 걷기
    // =========================

    if (!this.anims.exists('walk-left')) {
      this.anims.create({
        key: 'walk-left',
        frames: [
          { key: 'left-walk-1' },
          { key: 'left-idle' },
          { key: 'left-walk-2' },
          { key: 'left-idle' },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }

    // =========================
    // D키: 오른쪽 걷기
    // =========================

    if (!this.anims.exists('walk-right')) {
      this.anims.create({
        key: 'walk-right',
        frames: [
          { key: 'right-walk-1' },
          { key: 'right-idle' },
          { key: 'right-walk-2' },
          { key: 'right-idle' },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }
  }
}
