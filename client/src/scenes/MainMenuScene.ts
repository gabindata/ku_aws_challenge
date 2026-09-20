import Phaser from 'phaser';
import { SceneKey } from '../types';
import { SettingsPanel } from '../ui/SettingsPanel';

/** 스테이지 선택. GET /api/stages 결과를 난이도 순으로 나열한다. */
/**홈 화면 */
export class MainMenuScene extends Phaser.Scene {
  private settingsPanel?: SettingsPanel;

  constructor() {
    super(SceneKey.MainMenu);
  }

  async create(): Promise<void> {
    // TODO: ApiClient.getStages() → 버튼 생성 → 클릭 시
    //       this.scene.start(SceneKey.Negotiation, { npcId })
  
    const { width, height } = this.scale;
    
    //배경 이미지
    const background = this.add.image(
      width / 2,
      height / 2,
      'main-menu-bg'
    );

    background.setDisplaySize(width, height);
    
    //배경 bgm
    if (!this.sound.get('main-bgm')) {
      this.sound.play('main-bgm', {
        loop: true,
        volume: 0.4,
      });
    }

    // 튜토리얼 버튼
    this.createMenuButton(width / 2, 630, '튜토리얼', () => {
      this.scene.start(SceneKey.Tutorial);
    });

    // 시작하기 버튼
    this.createMenuButton(width / 2, 750, '시작하기', () => { 
      const tutorialCompleted =
        localStorage.getItem('tutorialCompleted');
    
      if (tutorialCompleted === 'true') {
        this.scene.start(SceneKey.StageSelect);
      } else {
        this.showTutorialRequiredPopup();
      }
    });

    // 설정 버튼
    this.createMenuButton(width / 2, 870, '설정', () => {
      if (!this.settingsPanel) {
        this.settingsPanel = new SettingsPanel(this, () => {
          this.settingsPanel = undefined;
        });
      }
    });
  }
  

  //튜툐리얼 봤는지 확인하는 코드//
  private showTutorialRequiredPopup(): void {
    const { width, height } = this.scale;

    const overlay = this.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x000000,
        0.6
      )
      .setInteractive();

    const popup = this.add.rectangle(
      width / 2,
      height / 2,
      650,
      300,
      0xffffff
    );

    const message = this.add
      .text(
        width / 2,
        height / 2 - 55,
        '튜토리얼을 아직 완료하지 않았습니다.\n먼저 보고 오시겠습니까?',
        {
          fontSize: '28px',
          color: '#000000',
          fontFamily: 'YPairing',
          align: 'center',
          lineSpacing: 10,
        }
      )
      .setOrigin(0.5);

    const yesButton = this.add
      .text(
        width / 2 - 100,
        height / 2 + 70,
        '예',
        {
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#555555',
          padding: {
            x: 30,
            y: 12,
          },
        }
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const noButton = this.add
      .text(
        width / 2 + 100,
        height / 2 + 70,
        '아니요',
        {
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#555555',
          padding: {
            x: 30,
            y: 12,
          },
        }
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const closePopup = () => {
      overlay.destroy();
      popup.destroy();
      message.destroy();
      yesButton.destroy();
      noButton.destroy();
    };

    yesButton.on('pointerdown', () => { 
      closePopup(); 
      this.scene.start(SceneKey.Tutorial);
    });

    noButton.on('pointerdown', () => {
      closePopup();
      this.scene.start(SceneKey.StageSelect);
    });
  }

  private createMenuButton(
    x: number,
    y: number,
    text: string,
    onClick: () => void
  ): void {
    const button = this.add
      .image(x, y, 'button-default')
      .setDisplaySize(500, 90)
      .setInteractive({ useHandCursor: true });
    
    const label = this.add
    .text(x, y, text, {
      fontSize: '36px',
      color: '#ffffff',
      fontFamily: 'YPairing',
      fontStyle: 'bold',
      letterSpacing: 20,

      padding: {
        top: 8,
        bottom: 8,
      },
    })
    .setOrigin(0.5); 
    
    //마우스를 버튼 위에 올렸을 때
    button.on('pointerover', () => {
      button.setTexture('button-highlight');
      this.sound.play('button-hover', {
        volume: 0.4,
      });
    });
    
    //마우스 버튼 밖
    button.on('pointerout', () => {
      button.setTexture('button-default');
    });
    
    //버튼 누르는 순간
    button.on('pointerdown', () => {
      button.setTexture('button-highlight');
      this.sound.play('button-click', {
        volume: 0.4,
      });
      onClick();
    });
    
    //버튼에서 손을 뗐을 때
    button.on('pointerup', () => {
      button.setTexture('button-default');
    });

  }
}
