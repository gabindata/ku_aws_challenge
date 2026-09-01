import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';
import { TimeOfDaySystem } from '../systems/TimeOfDaySystem';

export class StageSelectScene extends Phaser.Scene {
  private player!: Player;
  private timeOfDay!: TimeOfDaySystem;
    
  constructor() {
    super(SceneKey.StageSelect);
  }

  create(): void {
    const { width, height } = this.scale;
  
    const background = this.add.image(
      width / 2,
      height / 2,
      'stage-select-base'
    ).setDepth(-100);
  
    background.setDisplaySize(width, height);

    // 낮 맵과 동일한 구도의 완성된 저녁 맵을 위에 포개어 시간에 따라
    // 알파를 올린다. 별도 불빛 마스크보다 원본 디테일을 안정적으로 보존한다.
    const eveningBackground = this.add
      .image(width / 2, height / 2, 'stage-select-evening')
      .setDisplaySize(width, height)
      .setDepth(-99)
      .setAlpha(0);

    // 화면 왼쪽 위에서 들어오는 따뜻한 햇빛. 픽셀 맵을 흐리지 않도록
    // 블러 없이 낮은 투명도의 사각 그라데이션만 사용한다.
    const sunlight = this.add.graphics().setDepth(900);
    sunlight.fillGradientStyle(
      0xffd5a3,
      0xffd5a3,
      0xe7a56f,
      0xe7a56f,
      1,
      0.45,
      0,
      0
    );
    sunlight.fillRect(0, 0, width, height);
    sunlight.setBlendMode(Phaser.BlendModes.SCREEN);

    const darkness = this.add
      .rectangle(width / 2, height / 2, width, height, 0x17142f)
      .setDepth(901)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.timeOfDay = new TimeOfDaySystem(
      background,
      eveningBackground,
      sunlight,
      darkness
    );

    this.registerTimeOfDayTestKeys();


    this.player = new Player(
        this,
        width / 2,
        height / 2,
        'player',
        0.045
      );

    //왼쪽 위 큰 집
    const house1Collider = this.add.rectangle(
        390,      // x 좌표
        195,      // y 좌표
        380,      // 가로 길이
        170,      // 세로 길이
        0xff0000, // 빨간색
        0         // 충돌 영역은 화면에 표시하지 않음
      );

      this.physics.add.existing(house1Collider, true);
      this.physics.add.collider(
        this.player,
        house1Collider
      );

    // 가운데 위쪽 작은 집 1
    const house2Collider = this.add.rectangle(
        810,
        175,
        120,
        130,
        0xff0000,
        0
    );
    
    this.physics.add.existing(house2Collider, true);
    this.physics.add.collider(this.player, house2Collider);
    
    
    // 가운데 위쪽 작은 집 2
    const house3Collider = this.add.rectangle(
        1035,
        175,
        120,
        130,
        0xff0000,
        0
    );
    
    this.physics.add.existing(house3Collider, true);
    this.physics.add.collider(this.player, house3Collider);
    
    
    // 오른쪽 위 큰 집
    const house4Collider = this.add.rectangle(
        1570,
        210,
        420,
        220,
        0xff0000,
        0
    );
    
    this.physics.add.existing(house4Collider, true);
    this.physics.add.collider(this.player, house4Collider);
    
    
    // 아래쪽 큰 건물
    const house5Collider = this.add.rectangle(
        780,
        850,
        750,
        330,
        0xff0000,
        0
    );
    
    this.physics.add.existing(house5Collider, true);
    this.physics.add.collider(this.player, house5Collider);
    

    // 지붕 
    const roof1 = this.add.rectangle(
        1580,
        70,
        80,
        25,
        0xff0000,
        0
      );
      
      const roof2 = this.add.rectangle(
        1580,
        95,
        140,
        25,
        0xff0000,
        0
      );
      


      this.physics.add.existing(roof1, true);
      this.physics.add.existing(roof2, true);
 
      
      this.physics.add.collider(this.player, roof1);
      this.physics.add.collider(this.player, roof2);




  }

  update(_time: number, delta: number): void {
    this.player.update();
    this.timeOfDay.update(delta);
  }

  /** 개발 중 1=낮, 2=노을, 3=저녁, T=자동 흐름을 확인한다. */
  private registerTimeOfDayTestKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.on('keydown-ONE', () => this.timeOfDay.setPreset('day'));
    keyboard.on('keydown-TWO', () => this.timeOfDay.setPreset('sunset'));
    keyboard.on('keydown-THREE', () => this.timeOfDay.setPreset('night'));
    keyboard.on('keydown-T', () => {
      const isAutoPlaying = this.timeOfDay.toggleAutoPlay();
      console.info(`시간대 자동 진행: ${isAutoPlaying ? '켜짐' : '꺼짐'}`);
    });
  }

}
