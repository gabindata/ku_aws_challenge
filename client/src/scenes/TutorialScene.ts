import Phaser from 'phaser';
import { SceneKey } from '../types';

export class TutorialScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Tutorial);
  }

  create(): void {
    console.log('TutorialScene 실행됨');
  }
}