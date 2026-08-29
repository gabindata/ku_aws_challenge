import fs from 'node:fs';
import path from 'node:path';
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

// __dirname = 지금 이 파일이 있는 폴더(src/services)의 절대 경로.
// 상대경로('./data/...')를 쓰면 "터미널을 어느 폴더에서 실행했는가"에 따라
// 경로가 달라져서 깨진다. 항상 이 파일 위치를 기준으로 잡는다.
const PERSONA_DIR = path.join(__dirname, '..', 'data', 'npcPersonas');

/**
 * npcPersonas/ 폴더를 읽어서 페르소나를 로드한다.
 * 파일이 몇 개 있든 코드 변경 없이 반영되어야 한다 (설계 문서 4장).
 *
 * 매 호출마다 파일을 다시 읽는다 — 파일이 3개뿐이라 비용이 없고,
 * 기획 담당이 JSON을 추가하면 서버 재시작 없이 바로 반영되는 이점이 크다.
 */
export function loadAllPersonas(): NpcPersona[] {
  // 폴더 안의 파일 이름 목록. .DS_Store 같은 게 섞이므로 .json만 추린다.
  const fileNames = fs.readdirSync(PERSONA_DIR).filter((f) => f.endsWith('.json'));

  const personas: NpcPersona[] = [];
  for (const fileName of fileNames) {
    const raw = fs.readFileSync(path.join(PERSONA_DIR, fileName), 'utf-8');
    try {
      // JSON.parse: 파일에서 읽은 "문자열"을 실제 객체로 바꾼다.
      // `as NpcPersona`는 TS에게 모양을 알려줄 뿐 실제 검증은 하지 않는다.
      personas.push(JSON.parse(raw) as NpcPersona);
    } catch {
      // 파일 하나가 깨져도 나머지는 살린다.
      // 전체를 감쌌다면 기획 담당의 쉼표 하나 때문에 스테이지 목록이 통째로 죽는다.
      console.warn(`[persona] ${fileName} JSON 문법 오류 — 건너뜁니다`);
    }
  }

  // 스테이지 순서대로(1 → 2 → 3). 빼서 음수면 a가 앞으로 오는 게 sort의 관례.
  return personas.sort((a, b) => a.stageId - b.stageId);
}

export function getPersona(npcId: string): NpcPersona | undefined {
  return loadAllPersonas().find((p) => p.id === npcId);
}

/**
 * GET /api/stages 응답 형태로 변환.
 *
 * 중요: 페르소나를 통째로 내보내지 않고 4개 필드만 고른다.
 * floorPrice(NPC가 수용하는 최저가)는 게임의 정답이라서,
 * 프론트로 나가면 브라우저 개발자도구에서 그대로 보인다.
 */
export function listStages(): StageSummary[] {
  return loadAllPersonas().map((p) => ({
    stageId: p.stageId,
    npcId: p.id,
    name: p.name,
    difficulty: p.difficulty,
  }));
}
