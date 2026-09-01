import Phaser from 'phaser';

export type TimeOfDayPreset = 'day' | 'sunset' | 'night';

interface TimeOfDayLook {
  baseTint: number;
  darkness: number;
  sunlight: number;
}

const LOOKS: Record<TimeOfDayPreset, TimeOfDayLook> = {
  day: {
    baseTint: 0xffffff,
    darkness: 0,
    sunlight: 0.035,
  },
  sunset: {
    baseTint: 0xffead8,
    darkness: 0.02,
    sunlight: 0.06,
  },
  night: {
    baseTint: 0xffffff,
    darkness: 0,
    sunlight: 0,
  },
};

// 낮에서 저녁까지 5분, 저녁에서 다시 낮까지 5분.
const HALF_CYCLE_DURATION_MS = 5 * 60 * 1000;

// 숫자 키로 시간대를 시험할 때도 약 6초에 걸쳐 자연스럽게 전환한다.
const MANUAL_TRANSITION_SMOOTHING_MS = 2_000;

/**
 * 중립 베이스맵 위에 색조와 야간 조명 레이어를 합성한다.
 * progress 0 = 낮, 0.5 = 노을, 1 = 저녁이다.
 */
export class TimeOfDaySystem {
  private progress = 0;
  private targetProgress = 0;
  private autoPlay = true;
  private autoDirection = 1;

  constructor(
    private readonly baseMap: Phaser.GameObjects.Image,
    private readonly eveningMap: Phaser.GameObjects.Image,
    private readonly sunlight: Phaser.GameObjects.Graphics,
    private readonly darkness: Phaser.GameObjects.Rectangle
  ) {
    this.applyLook(this.progress);
  }

  update(delta: number): void {
    if (this.autoPlay) {
      // 낮→저녁 5분, 저녁→낮 5분으로 천천히 왕복한다.
      this.progress += this.autoDirection * (delta / HALF_CYCLE_DURATION_MS);

      if (this.progress >= 1) {
        this.progress = 1;
        this.autoDirection = -1;
      } else if (this.progress <= 0) {
        this.progress = 0;
        this.autoDirection = 1;
      }
    } else {
      // 숫자 키로 바꿀 때도 화면이 갑자기 전환되지 않도록 보간한다.
      this.progress = Phaser.Math.Linear(
        this.progress,
        this.targetProgress,
        1 - Math.exp(-delta / MANUAL_TRANSITION_SMOOTHING_MS)
      );
    }

    this.applyLook(this.progress);
  }

  setPreset(preset: TimeOfDayPreset): void {
    this.autoPlay = false;
    this.targetProgress = preset === 'day' ? 0 : preset === 'sunset' ? 0.5 : 1;
  }

  toggleAutoPlay(): boolean {
    this.autoPlay = !this.autoPlay;
    this.targetProgress = this.progress;
    return this.autoPlay;
  }

  private applyLook(progress: number): void {
    const first = progress <= 0.5 ? LOOKS.day : LOOKS.sunset;
    const second = progress <= 0.5 ? LOOKS.sunset : LOOKS.night;
    const amount = progress <= 0.5 ? progress * 2 : (progress - 0.5) * 2;

    this.baseMap.setTint(Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(first.baseTint),
      Phaser.Display.Color.IntegerToColor(second.baseTint),
      100,
      Math.round(amount * 100)
    ).color);

    this.darkness.setAlpha(Phaser.Math.Linear(first.darkness, second.darkness, amount));
    this.sunlight.setAlpha(Phaser.Math.Linear(first.sunlight, second.sunlight, amount));

    // 시간 흐름의 대부분을 교차 구간으로 사용한다. 밤→낮에서는 같은 계산을
    // 역방향으로 지나가므로 저녁 이미지가 동일하게 부드럽게 사라진다.
    const rawEveningBlend = Phaser.Math.Clamp((progress - 0.08) / 0.84, 0, 1);
    const eveningBlend = rawEveningBlend * rawEveningBlend * (3 - 2 * rawEveningBlend);
    this.eveningMap.setAlpha(eveningBlend);
  }
}
