import fs from 'node:fs';
import path from 'node:path';
import type { StageSummary } from '../../../shared/types/negotiationTypes';
import type { StageDefinition } from '../data/stageSchema';

// __dirname 기준이라 터미널을 어디서 실행하든 안전하다.
const STAGE_DIR = path.join(__dirname, '..', 'data', 'npcPersonas');

/** "권장 시작"을 표시할 stageId */
const RECOMMENDED_STAGE_ID = 1;

/**
 * npcPersonas/ 폴더를 읽어 스테이지 정의를 로드한다.
 * 파일이 몇 개 있든 코드 변경 없이 반영된다.
 *
 * 매 호출마다 다시 읽는다 — 기획 담당이 JSON을 추가하면 서버 재시작 없이 반영된다.
 */
export function loadAllStages(): StageDefinition[] {
  const fileNames = fs.readdirSync(STAGE_DIR).filter((f) => f.endsWith('.json'));

  const stages: StageDefinition[] = [];
  for (const fileName of fileNames) {
    const raw = fs.readFileSync(path.join(STAGE_DIR, fileName), 'utf-8');
    try {
      // 실제 검증은 하지 않는다. 기획이 채우는 중인 파일도 통과시킨다.
      stages.push(JSON.parse(raw) as StageDefinition);
    } catch {
      // 파일 하나가 깨져도 나머지는 살린다.
      console.warn(`[stage] ${fileName} JSON 문법 오류 — 건너뜁니다`);
    }
  }

  return stages.sort((a, b) => a.stageId - b.stageId);
}

export function getStage(stageId: number): StageDefinition | undefined {
  return loadAllStages().find((s) => s.stageId === stageId);
}

/**
 * GET /api/stages 응답. 월드맵 표시에 필요한 값만 고른다.
 *
 * agreementDefinitions에는 판정 기준표와 비공개 요구가 들어 있으므로
 * StageDefinition을 통째로 내보내지 않는다.
 *
 * 해금 여부는 클라이언트가 로컬 저장소에 보관한 월드 상태 키로 판정한다.
 * 공통규칙 §3에 따라 이 저장은 클라이언트를 신뢰하는 구조이며,
 * 조작 방지는 MVP 범위 밖이다.
 */
export function listStages(worldStateKeys: string[] = []): StageSummary[] {
  return loadAllStages().map((s) => ({
    stageId: s.stageId,
    npcId: s.npcId,
    npcName: s.npcName,
    location: s.location,
    difficulty: s.difficulty,
    unlocked: (s.unlockRequirements ?? []).every((r) => worldStateKeys.includes(r)),
    recommended: s.stageId === RECOMMENDED_STAGE_ID,
  }));
}
