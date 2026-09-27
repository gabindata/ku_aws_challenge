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
  // 씬 전환 중에도 게임 전체의 업데이트에서 음량 페이드를 이어간다.
  const fadeMs = 900;
  type Track = {
    sound: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
    gain: number;
  };
  const playing = new Map<string, Track>();
  let selected: string | undefined;
  let lastTime = performance.now();
  const updateVolume = () => {
    for (const { sound, gain } of playing.values()) sound.setVolume(gameSettings.bgm * gain);
  };
  const update = () => {
    const now = performance.now();
    const step = Math.max(0, now - lastTime) / fadeMs;
    lastTime = now;
    const scene = game.scene.getScenes(true).at(-1);
    const key = scene && tracks[scene.sys.settings.key];
    if (key && key !== selected && game.cache.audio.exists(key)) {
      selected = key;
      if (!playing.has(key)) {
        const sound = game.sound.add(key, { loop: true, volume: 0 }) as Track['sound'];
        playing.set(key, { sound, gain: 0 });
        sound.play();
      }
    }
    for (const [key, track] of playing) {
      track.gain = key === selected
        ? Math.min(1, track.gain + step)
        : Math.max(0, track.gain - step);
      track.sound.setVolume(gameSettings.bgm * track.gain);
      if (key !== selected && track.gain === 0) {
        track.sound.stop();
        track.sound.destroy();
        playing.delete(key);
      }
    }
  };
  game.events.on(Phaser.Core.Events.POST_STEP, update);
  window.addEventListener('game-settings-change', updateVolume);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    game.events.off(Phaser.Core.Events.POST_STEP, update);
    window.removeEventListener('game-settings-change', updateVolume);
    for (const { sound } of playing.values()) sound.destroy();
    playing.clear();
  });
}
