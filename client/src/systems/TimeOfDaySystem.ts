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

// 게임 속 24시간 = 실제 5분
const FULL_DAY_DURATION_MS = 5 * 60 * 1000;

// 숫자 키로 시간대를 시험할 때 부드럽게 전환
const MANUAL_TRANSITION_SMOOTHING_MS = 2_000;

export class TimeOfDaySystem {
  // 0 = 00:00, 0.5 = 12:00, 1 = 24:00
  private dayProgress = 0;

  private targetProgress = 0;
  private autoPlay = true;

  constructor(
    private readonly baseMap: Phaser.GameObjects.Image,
    private readonly eveningMap: Phaser.GameObjects.Image,
    private readonly sunlight: Phaser.GameObjects.Graphics,
    private readonly darkness: Phaser.GameObjects.Rectangle
  ) {
    this.applyTimeOfDay(this.dayProgress);
  }

  update(delta: number): void {
    if (this.autoPlay) {
      this.dayProgress += delta / FULL_DAY_DURATION_MS;

      if (this.dayProgress >= 1) {
        this.dayProgress %= 1;
      }
    } else {
      this.dayProgress = Phaser.Math.Linear(
        this.dayProgress,
        this.targetProgress,
        1 - Math.exp(-delta / MANUAL_TRANSITION_SMOOTHING_MS)
      );
    }

    this.applyTimeOfDay(this.dayProgress);
  }

  setPreset(preset: TimeOfDayPreset): void {
    this.autoPlay = false;

    // 테스트용 시간
    this.targetProgress =
      preset === 'day'
        ? 12 / 24
        : preset === 'sunset'
          ? 18 / 24
          : 0;
  }

  toggleAutoPlay(): boolean {
    this.autoPlay = !this.autoPlay;
    this.targetProgress = this.dayProgress;
    return this.autoPlay;
  }

  getGameMinutes(): number {
    return Math.floor(this.dayProgress * 24 * 60);
  }

  setGameMinutes(minutes: number): void {
    this.dayProgress = (minutes % (24 * 60)) / (24 * 60);
    this.targetProgress = this.dayProgress;
    this.applyTimeOfDay(this.dayProgress);
  }

  private applyTimeOfDay(dayProgress: number): void {
    const hour = dayProgress * 24;

    let visualProgress: number;

    // 00:00 ~ 06:00 : 밤 → 낮
    if (hour < 6) {
      visualProgress = Phaser.Math.Linear(1, 0, hour / 6);
    }

    // 06:00 ~ 16:00 : 낮
    else if (hour < 16) {
      visualProgress = 0;
    }

    // 16:00 ~ 20:00 : 낮 → 노을 → 밤
    else if (hour < 20) {
      visualProgress = (hour - 16) / 4;
    }

    // 20:00 ~ 24:00 : 밤
    else {
      visualProgress = 1;
    }

    this.applyLook(visualProgress);
  }

  private applyLook(progress: number): void {
    const first =
      progress <= 0.5
        ? LOOKS.day
        : LOOKS.sunset;

    const second =
      progress <= 0.5
        ? LOOKS.sunset
        : LOOKS.night;

    const amount =
      progress <= 0.5
        ? progress * 2
        : (progress - 0.5) * 2;

    this.baseMap.setTint(
      Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(first.baseTint),
        Phaser.Display.Color.IntegerToColor(second.baseTint),
        100,
        Math.round(amount * 100)
      ).color
    );

    this.darkness.setAlpha(
      Phaser.Math.Linear(
        first.darkness,
        second.darkness,
        amount
      )
    );

    this.sunlight.setAlpha(
      Phaser.Math.Linear(
        first.sunlight,
        second.sunlight,
        amount
      )
    );

    const rawEveningBlend = Phaser.Math.Clamp(
      (progress - 0.08) / 0.84,
      0,
      1
    );

    const eveningBlend =
      rawEveningBlend *
      rawEveningBlend *
      (3 - 2 * rawEveningBlend);

    this.eveningMap.setAlpha(eveningBlend);
  }
}