import Phaser from 'phaser';
import { SceneKey } from '../types';
import { gameSettings } from './GameSettings';

/** 같은 음악을 사용하는 장소 사이에서는 곡을 끊거나 처음부터 재생하지 않는다. */
export function installSceneBgm(game: Phaser.Game): void {
  const tracks: Record<string, string> = {
    [SceneKey.MainMenu]: 'main-bgm',
    [SceneKey.StageSelect]: 'main-bgm',
    [SceneKey.House]: 'main-bgm',
    [SceneKey.ConvenienceStore]: 'main-bgm',
    [SceneKey.SchoolHallway]: 'main-bgm',
    [SceneKey.DepartmentOffice]: 'main-bgm',
    [SceneKey.Tutorial]: 'tutorial-bgm',
    [SceneKey.TutorialNegotiation]: 'tutorial-bgm',
    [SceneKey.Negotiation1]: 'stage-bgm',
    [SceneKey.Negotiation2]: 'stage-bgm',
    [SceneKey.Negotiation3]: 'stage-bgm',
    [SceneKey.Result]: 'stage-bgm',
    [SceneKey.StyleReport]: 'stage-bgm',
  };
  let current: Phaser.Sound.BaseSound | undefined;
  const update = () => {
    const scene = game.scene.getScenes(true).at(-1);
    const key = scene && tracks[scene.sys.settings.key];
    if (!key || current?.key === key || !game.cache.audio.exists(key)) return;
    current?.stop();
    current?.destroy();
    current = game.sound.add(key, { loop: true, volume: gameSettings.bgm });
    current.play();
  };
  const updateVolume = () => {
    if (current) (current as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(gameSettings.bgm);
  };
  game.events.on(Phaser.Core.Events.POST_STEP, update);
  window.addEventListener('game-settings-change', updateVolume);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    game.events.off(Phaser.Core.Events.POST_STEP, update);
    window.removeEventListener('game-settings-change', updateVolume);
    current?.destroy();
  });
}
