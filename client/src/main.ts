import { installSceneBgm } from './systems/SceneBgm';
import { installGlobalSettingsButton } from './ui/GlobalSettingsButton';
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

async function startGame(): Promise<void> {
  await Promise.all([
    document.fonts.load('400 28px Galmuri11', '가나다'),
    document.fonts.load('700 28px Galmuri11', '가나다'),
  ]).catch(error => console.error('게임 폰트 로딩 실패:', error));
  const game = new Phaser.Game(gameConfig);
  installGlobalSettingsButton(game);
  installSceneBgm(game);
}

void startGame();
