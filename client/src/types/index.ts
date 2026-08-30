// 백엔드 계약 타입은 shared/에서 그대로 재수출해서 쓴다 (중복 정의 금지).
export type * from '../../../shared/types/negotiationTypes';
export type * from '../../../shared/types/styleReportTypes';

/** 씬 간 전달용 키 — game.scene.start(SceneKey.Negotiation, data) */
export const SceneKey = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  MainMenu: 'MainMenuScene',
  StageSelect: 'StageSelectScene',
  Negotiation: 'NegotiationScene',
  Result: 'ResultScene',
  StyleReport: 'StyleReportScene',
} as const;
