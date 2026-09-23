// 백엔드 계약 타입은 shared/에서 그대로 재수출해서 쓴다 (중복 정의 금지).
export type * from '../../../shared/types/negotiationTypes';
export type * from '../../../shared/types/styleReportTypes';

/** 씬 간 전달용 키 — game.scene.start(SceneKey.Negotiation, data) */
export const SceneKey = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  MainMenu: 'MainMenuScene',
  Tutorial: 'TutorialScene',
  StageSelect: 'StageSelectScene',
  Negotiation1: 'NegotiationScene1',
  Negotiation2: 'NegotiationScene2',
  Negotiation3: 'NegotiationScene3',
  Result: 'ResultScene',
  StyleReport: 'StyleReportScene',
  ConvenienceStore: 'ConvenienceStore',
  DepartmentOffice: 'DepartmentOffice',
  House: 'HouseScene',
  SchoolHallway: 'SchoolHallway',
} as const;

/** 이동 직전 장소와 정규화 좌표. 화면 크기가 달라도 같은 위치로 돌아온다. */
export interface ReturnLocation {
  scene: string;
  position: { x: number; y: number };
}
