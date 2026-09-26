import { installGlobalSettingsButton } from './ui/GlobalSettingsButton';
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

const game = new Phaser.Game(gameConfig);
installGlobalSettingsButton(game);
