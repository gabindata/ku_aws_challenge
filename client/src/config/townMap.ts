interface BlockedArea {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const SOURCE_MAP_WIDTH = 1672;
export const SOURCE_MAP_HEIGHT = 941;

export const BLOCKED_AREAS: BlockedArea[] = [
  {
    name: 'north-west',
    left: 0,
    top: 0,
    width: 302,
    height: 340,
  },

  // 편의점 통로
  {
    name: 'store-back',
    left: 302,
    top: 0,
    width: 70,
    height: 245,
  },

  {
    name: 'north-center',
    left: 372,
    top: 0,
    width: 693,
    height: 340,
  },

  {
    name: 'north-east-center',
    left: 1190,
    top: 0,
    width: 150,
    height: 340,
  },

  {
    name: 'house-back',
    left: 1345,
    top: 0,
    width: 60,
    height: 270,
  },

  {
    name: 'north-east',
    left: 1407,
    top: 0,
    width: 267,
    height: 340,
  },

  // 학교 입구 주변
  {
    name: 'south-west-left',
    left: 0,
    top: 570,
    width: 670,
    height: 371,
  },

  {
    name: 'school-back',
    left: 640,
    top: 635,
    width: 90,
    height: 306,
  },

  {
    name: 'south-west-right',
    left: 735,
    top: 570,
    width: 355,
    height: 371,
  },

  {
    name: 'south-east',
    left: 1290,
    top: 570,
    width: 391,
    height: 371,
  },
];
