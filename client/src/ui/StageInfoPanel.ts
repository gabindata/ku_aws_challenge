import { gameSettings } from '../systems/GameSettings';
import Phaser from 'phaser';

interface StageInfoPanelConfig {
  stageTitle: string;
  npcName: string;
  description: string;
  onStart: () => void;
}

export class StageInfoPanel {
  private container: Phaser.GameObjects.Container;

  constructor(
    private scene: Phaser.Scene,
    config: StageInfoPanelConfig
  ) {
    const { width, height } = scene.scale;

    const centerX = width / 2;
    const centerY = height / 2;

    const panelWidth = Math.min(width * 0.75, 760);
    const panelHeight = Math.min(height * 0.7, 480);

    // =========================
    // 정보창 바깥쪽 어두운 배경
    // =========================

    const overlay = scene.add
      .rectangle(
        0,
        0,
        width,
        height,
        0x000000,
        0.65
      )
      .setOrigin(0)
      .setInteractive();

    // =========================
    // 메인 정보창
    // =========================

    const panel = scene.add.image(centerX, centerY, 'stage-info-panel').setDisplaySize(panelWidth, panelHeight);

    // =========================
    // 스테이지 제목
    // =========================

    const title = scene.add
      .text(
        centerX,
        centerY - panelHeight / 2 + 55,
        config.stageTitle,
        {
          fontFamily: 'YPairing',
          fontSize: '36px',
          fontStyle: 'normal',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    // =========================
    // NPC 이름
    // =========================

    const npcName = scene.add
      .text(
        centerX,
        centerY - 75,
        config.npcName,
        {
          fontFamily: 'YPairing',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#263746',
        }
      )
      .setOrigin(0.5);

    // =========================
    // 스테이지 설명
    // =========================

    const description = scene.add
      .text(
        centerX,
        centerY + 20,
        config.description,
        {
          fontFamily: 'YPairing',
          fontSize: '24px',
          color: '#263746',
          align: 'center',
          wordWrap: {
            width: panelWidth - 100,
          },
          lineSpacing: 12,
        }
      )
      .setOrigin(0.5);

    // =========================
    // 하단 버튼
    // 나가기: 왼쪽 / 시작하기: 오른쪽
    // =========================

    const buttonY =
      centerY + panelHeight / 2 - 70;

    const exitButtonX = centerX - 185;
    const startButtonX = centerX + 185;

    // 나가기 버튼
    const exitButton = this.createMenuButton(
      exitButtonX,
      buttonY,
      '나가기',
      () => {
        this.close();
      }
    );

    // 시작하기 버튼
    const startButton = this.createMenuButton(
      startButtonX,
      buttonY,
      '시작하기',
      () => {
        config.onStart();
      }
    );

    // =========================
    // UI 전체 묶기
    // =========================

    this.container = scene.add.container(0, 0, [
      overlay,
      panel,
      title,
      npcName,
      description,
      ...exitButton,
      ...startButton,
    ]);

    this.container
      .setDepth(20000)
      // 컨테이너와 자식 버튼 모두 동일한 월드 좌표로 렌더링·입력을 처리한다.
      .setScrollFactor(1, 1, true)
      .setVisible(false);
  }

  // =========================
  // 메인메뉴와 동일한 이미지 버튼
  // =========================

  private createMenuButton(
    x: number,
    y: number,
    text: string,
    onClick: () => void
  ): Phaser.GameObjects.GameObject[] {
    const button = this.scene.add
      .image(x, y, 'button-default')
      .setDisplaySize(290, 75)
      .setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(x, y, text, {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'YPairing',
        fontStyle: 'bold',
        letterSpacing: 12,
        padding: {
          top: 8,
          bottom: 8,
        },
      })
      .setOrigin(0.5);

    // 마우스를 올렸을 때
    button.on('pointerover', () => {
      button.setTexture('button-highlight');

      this.scene.sound.play('button-hover', {
        volume: gameSettings.ui,
      });
    });

    // 마우스가 버튼 밖으로 나갔을 때
    button.on('pointerout', () => {
      button.setTexture('button-default');
    });

    // 버튼을 눌렀을 때
    button.on('pointerdown', () => {
      button.setTexture('button-highlight');

      this.scene.sound.play('button-click', {
        volume: gameSettings.ui,
      });

      onClick();
    });

    // 버튼에서 손을 뗐을 때
    button.on('pointerup', () => {
      button.setTexture('button-default');
    });

    return [button, label];
  }

  open(): void {
    // 확대된 월드맵에서도 화면 가운데에 원래 UI 크기로 표시한다.
    const zoom = this.scene.cameras.main.zoom;
    const origin = this.scene.cameras.main.getWorldPoint(0, 0);
    this.container.setScale(1 / zoom);
    this.container.setPosition(origin.x, origin.y);
    this.container.setVisible(true);
  }

  close(): void {
    this.container.setVisible(false);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }
}