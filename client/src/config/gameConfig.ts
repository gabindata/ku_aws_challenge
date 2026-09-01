import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { StageSelectScene } from '../scenes/StageSelectScene';
import { NegotiationScene } from '../scenes/NegotiationScene';
import { ResultScene } from '../scenes/ResultScene';
import { StyleReportScene } from '../scenes/StyleReportScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#1a1a24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1920,
    height: 1080,
  },

  //캐릭터 움직임
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {
        x: 0,
        y: 0,
      },
      debug: true,
    },
  },


  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    StageSelectScene,
    NegotiationScene,
    ResultScene,
    StyleReportScene,
  ],
};

/** 백엔드 주소. 키가 아니라 주소만 클라이언트에 둔다. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';
