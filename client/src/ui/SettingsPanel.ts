import Phaser from 'phaser';

export class SettingsPanel {
  private container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    onClose: () => void
  ) {
    const { width, height } = scene.scale;
    const mainBgm = scene.sound.get('main-bgm') as
      | Phaser.Sound.WebAudioSound
      | Phaser.Sound.HTML5AudioSound
      | null;

    let bgmVolume = mainBgm?.volume ?? 0.4;

    // 뒤 화면 어둡게
    const overlay = scene.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        0x000000,
        0.55
      )
      .setInteractive();

    // 설정창 본체
    const panel = scene.add.rectangle(
      width / 2,
      height / 2,
      760,
      650,
      0x16244a
    );

    // 설정 제목
    const title = scene.add
      .text(
        width / 2,
        height / 2 - 250,
        '설정',
        {
          fontFamily: 'YPairing',
          fontSize: '52px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    // 배경음악
    const bgmText = scene.add
      .text(
        width / 2,
        height / 2 - 130,
        '배경음악 조절',
        {
          fontFamily: 'YPairing',
          fontSize: '34px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    const bgmMinus = scene.add
      .text(width / 2 - 150, height / 2 - 90, '-', {
        fontFamily: 'YPairing',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    
    const bgmValueText = scene.add
      .text(width / 2, height / 2 - 90, `${Math.round(bgmVolume * 100)}%`, {
        fontFamily: 'YPairing',
        fontSize: '34px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    
    const bgmPlus = scene.add
      .text(width / 2 + 150, height / 2 - 90, '+', {
        fontFamily: 'YPairing',
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    bgmMinus.on('pointerdown', () => {
      bgmVolume = Math.max(0, bgmVolume - 0.1);
      
      mainBgm?.setVolume(bgmVolume);
      
      bgmValueText.setText(`${Math.round(bgmVolume * 100)}%`);
    });
      
    bgmPlus.on('pointerdown', () => {
      bgmVolume = Math.min(1, bgmVolume + 0.1);
      
      mainBgm?.setVolume(bgmVolume);
      
      bgmValueText.setText(`${Math.round(bgmVolume * 100)}%`);
    });

    // UI 음악
    const uiSoundText = scene.add
      .text(
        width / 2,
        height / 2 - 50,
        'UI 음악 조절',
        {
          fontFamily: 'YPairing',
          fontSize: '34px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    // 밝기
    const brightnessText = scene.add
      .text(
        width / 2,
        height / 2 + 30,
        '밝기 조절',
        {
          fontFamily: 'YPairing',
          fontSize: '34px',
          color: '#ffffff',
        }
      )
      .setOrigin(0.5);

    // 마이크 테스트
    const micTestButton = scene.add
      .text(
        width / 2,
        height / 2 + 120,
        '마이크 테스트',
        {
          fontFamily: 'YPairing',
          fontSize: '34px',
          color: '#ffffff',
          backgroundColor: '#2f5597',
          padding: {
            left: 24,
            right: 24,
            top: 10,
            bottom: 10,
          },
        }
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // 종료 버튼
    const closeButton = scene.add
    .text(
      width / 2 + 320,
      height / 2 - 270,
      'X',
      {
        fontFamily: 'YPairing',
        fontSize: '36px',
        color: '#ffffff',
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.container = scene.add.container(0, 0, [
      overlay,
      panel,
      title,
      
      uiSoundText,
      brightnessText,
      micTestButton,
      closeButton,

      bgmText,
      bgmMinus,
      bgmValueText,
      bgmPlus,
    ]);

    // 설정창이 항상 위에 뜨게
    this.container.setDepth(1000);

    micTestButton.on('pointerdown', () => {
      console.log('마이크 테스트 클릭');
    });

    closeButton.on('pointerdown', () => {
      scene.sound.play('button-click', {
        volume: 0.5,
      });
    
      this.close();
      onClose();
    });
  }

  close(): void {
    this.container.destroy();
  }
}
