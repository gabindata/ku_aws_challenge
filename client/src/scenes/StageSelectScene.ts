import Phaser from 'phaser';
import { SceneKey } from '../types';
import { Player } from '../entities/Player';

export class StageSelectScene extends Phaser.Scene {
    private player!: Player;
    
  constructor() {
    super(SceneKey.StageSelect);
  }

  create(): void {
    const { width, height } = this.scale;
  
    const background = this.add.image(
      width / 2,
      height / 2,
      'stage-select-bg'
    );
  
    background.setDisplaySize(width, height);


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
        0.3       // 투명도
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
        0.3
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
        0.3
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
        0.3
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
        0.3
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
        0.3
      );
      
      const roof2 = this.add.rectangle(
        1580,
        95,
        140,
        25,
        0xff0000,
        0.3
      );
      


      this.physics.add.existing(roof1, true);
      this.physics.add.existing(roof2, true);
 
      
      this.physics.add.collider(this.player, roof1);
      this.physics.add.collider(this.player, roof2);




    }

    

    update(): void {
        this.player.update();
      }

}