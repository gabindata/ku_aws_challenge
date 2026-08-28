import type { Difficulty, StageSummary } from '../../../shared/types/negotiationTypes';

/** data/npcPersonas/*.json 의 스키마. 기획 담당이 채우는 파일. */
export interface NpcPersona {
  id: string;
  name: string;
  tone: string;
  goal: {
    item: string;
    floorPrice: number;
    targetPrice: number;
  };
  resistancePoints: string[];
  successCriteria: string;
  /** 스테이지 순서/난이도 (MainMenuScene 목록 정렬용) */
  stageId: number;
  difficulty: Difficulty;
}

/**
 * npcPersonas/ 폴더를 읽어서 페르소나를 로드한다.
 * 파일이 몇 개 있든 코드 변경 없이 반영되어야 한다 (설계 문서 4장).
 */
export function loadAllPersonas(): NpcPersona[] {
  // TODO: fs.readdirSync(data/npcPersonas) → JSON 파싱 → stageId 정렬
  throw new Error('not implemented');
}

export function getPersona(_npcId: string): NpcPersona | undefined {
  // TODO
  throw new Error('not implemented');
}

export function listStages(): StageSummary[] {
  // TODO: loadAllPersonas() 결과를 GET /api/stages 응답 형태로 변환
  throw new Error('not implemented');
}
