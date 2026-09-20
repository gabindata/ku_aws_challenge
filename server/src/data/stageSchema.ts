// 스테이지 정의 스키마 — 기획 공통규칙 §5, 스테이지 1 §11 운영 JSON 기준.
//
// 이 타입은 shared/가 아니라 서버에 둔다. 판정 기준표와 비공개 요구가
// 들어 있어 클라이언트가 보관해서는 안 되기 때문이다.
// 클라이언트에 나가는 요약은 shared의 StageSummary만 쓴다.

import type {
  Difficulty,
  FailureCloseBehavior,
} from '../../../shared/types/negotiationTypes';

/** 스테이지 전용 서사 데이터. 결과 화면에는 표시하지 않고 단서 본문으로만 쓴다. */
export interface StageEpilogue {
  clueId: string;
  text: string;
}

/**
 * 합의 키 하나의 판정 기준표. 수치 비교값이 아니라 LLM이 읽는 자연어다.
 *
 * 특정 문장이나 키워드가 아니라 "플레이어가 전달해야 할 의미와 행동 약속"을 적는다.
 * 표현이 달라도 의미가 충분하면 LLM이 충족으로 판단할 수 있다.
 */
export interface AgreementDefinition {
  /** 이 합의가 필요한 이유 */
  intent: string;
  /** 충족으로 볼 의미 기준 */
  passWhen: string[];
  /** 애매해서 바로 통과시키면 안 되는 사례 */
  clarifyWhen: string[];
  /** 이전 약속과 충돌하거나 철회하는 의미 */
  revokeWhen: string[];
  /** NPC 제안에 대한 맥락상 동의를 성립으로 인정할지 */
  contextConsentAllowed: boolean;
  /**
   * 맥락 동의의 앵커로 허용할 NPC 메시지 범위. contextConsentAllowed가 true일 때만 쓴다.
   * immediate(기본) — 직전 NPC 메시지만
   * session         — 현재 플레이어 발화보다 앞선 같은 세션의 NPC 메시지 전부.
   *                   "아까 안내한 서류는 제가 쓸게요" 같은 지연된 수락용
   */
  contextAnchorScope?: 'immediate' | 'session';
  /**
   * 플레이어가 스스로 약속을 제안해야 충족되는 키인지.
   * 공통규칙이 정한 유일한 이름이다 (selfProposalRequired 같은 다른 이름을 쓰지 않는다).
   */
  playerMustPropose: boolean;
  /** 합의 메모 작성 기준. 없으면 LLM의 agreementSummary를 그대로 쓴다. */
  memoGuide?: string;
}

export interface StageDefinition {
  stageId: number;
  npcId: string;
  /**
   * npcName·location은 공통규칙 §5의 예시 JSON에는 없지만,
   * §2의 "맵에 스테이지 번호와 난이도를 표시한다"를 구현하려면 필요하다.
   * (기획 확인 필요 항목)
   */
  npcName: string;
  location: string;
  difficulty: Difficulty;

  /** 월드 상태 키 목록. successState와 같은 네임스페이스를 쓴다. */
  unlockRequirements: string[];

  /** 정식 스테이지는 600. 튜토리얼은 null(시간 제한 없음) */
  timeLimitSeconds: number | null;
  /**
   * 판정 호출 상한. 공통규칙 §4가 전역 40으로 정하고 스테이지 JSON에도 같은 값이 있다.
   * 값이 어긋나면 공통규칙 §1 우선순위에 따라 공통규칙이 이긴다. (기획 확인 필요 항목)
   */
  maxLlmCallsPerSession: number;

  /** 배열 순서가 NPC 재질문과 시간 초과 힌트의 우선순위다 */
  requiredAgreementKeys: string[];
  agreementDefinitions: Record<string, AgreementDefinition>;

  /**
   * 고정 첫 NPC 대사. 공통규칙 §5의 예시 JSON에는 없지만,
   * §3의 시작 절차상 서버가 첫 대사를 반환하고 그 TTS 추정 시간으로
   * startedAt을 계산해야 하므로 데이터로 필요하다. (기획 확인 필요 항목)
   */
  openingLines: string[];

  expressionKeys: string[];
  defaultExpressionKey: string;
  /** 종료 화면 표정은 LLM이 정하지 않는다. 서버가 이 값으로 고정한다. */
  successExpressionKey: string;
  failureExpressionKey: string;

  /** 성공 결과 화면의 고정 문구 */
  successText: string;
  /** 협상 대상이 아닌 고정 안내. 합의 내용과 시각적으로 구분해 표시한다. */
  fixedTerms: string[];
  /** 판정 호출 상한 도달로 끝났을 때의 고정 문구 */
  limitText: string;
  /** 합의 키 → 시간 초과 시 보여줄 비정답형 힌트 */
  failureHints: Record<string, string>;

  styleReportConfig: {
    /**
     * 내부 분석용 태그 화이트리스트. 밖의 값은 제외한다.
     * 저장·집계는 하지만 태그 영역·태그명·횟수는 화면에 표시하지 않는다.
     * 근거 발화 선정과 협상 총평 작성의 보조자료로만 쓴다.
     */
    allowedStageTags: string[];
  };

  successState: string;

  // ── 선택 필드 (공통규칙 §5 필드 계약) ──

  /**
   * 있으면 모든 실패 화면 상단에 endReason과 무관하게 표시한다.
   * 없으면 종료 이유 문구부터 표시한다.
   */
  failureText?: string;
  /**
   * true면 검증된 치명적 발화를 failure / fatal로 끝내지 않고 경고 후
   * 직전 상태로 복원한다(outcome: reverted). 학습용 스테이지에만 켠다.
   * 정식 스테이지는 false를 유지한다.
   */
  fatalRecovery?: boolean;
  /**
   * 실패 화면과 말투 리포트를 닫았을 때의 이동. 기본 "world_map".
   * "restart"면 돌아갈 맵 없이 같은 스테이지의 새 세션을 즉시 시작한다.
   */
  onFailureClose?: FailureCloseBehavior;
  /**
   * 다른 스테이지의 결과에 따라 NPC 대사가 달라져야 할 때 선언한다.
   * 월드 상태 키 -> NPC가 한 세션에 최대 한 번 언급할 수 있는 내용.
   *
   * 서버는 여기 선언된 키 중 현재 충족된 것만 프롬프트에 넣는다.
   * LLM은 이것을 NPC 대사에만 쓰고 판정 기준·필수 키·성공 조건을 바꾸지 않는다.
   * 본문은 비공개이며 브라우저로 보내지 않는다.
   *
   * 진행도가 클라이언트 로컬 저장소에 있으므로, 월드 상태가 판정에 닿으면
   * 저장값을 고쳐 스테이지를 뚫는 길이 열린다. 그래서 대사에서 멈춘다.
   */
  worldStateReferences?: Record<string, string>;
  /**
   * 보존할 안내 항목 키 -> 의미. 생략하면 빈 객체다.
   * 선언만으로 안내됐다고 보지 않는다. LLM이 실제로 안내한 대사를 근거로 기록한다.
   */
  disclosureDefinitions?: Record<string, string>;
  /** 성공 시 클라이언트가 반영할 퀘스트·단서. clueIds의 본문은 successEpilogue에서 찾는다. */
  successRewards?: {
    completeQuests?: string[];
    addQuests?: string[];
    clueIds?: string[];
  };
  /** 스테이지 전용 서사 데이터. 결과 화면에 표시하지 않고 단서 본문으로만 쓴다. */
  successEpilogue?: StageEpilogue;
}

// ── 공통규칙 §4 전역 상한 ──

/** 판정 호출 상한 */
export const MAX_LLM_CALLS_PER_SESSION = 40;
/** 판정 호출 예산과 분리된 수정 재요청 상한. 세션 총 호출은 45회를 넘지 않는다. */
export const MAX_REPAIR_REQUESTS_PER_SESSION = 5;
/** 종료 후 리포트 생성. 최초 1회 + 재시도 1회. 세션 총 호출은 40 + 5 + 2 = 47회 */
export const MAX_REPORT_CALLS_PER_SESSION = 2;
/** 이 횟수에 도달하면 프롬프트에 nearCallLimit를 넣어 NPC가 서사적으로 압박한다 */
export const NEAR_CALL_LIMIT_THRESHOLD = 35;

/** LLM·서버 처리로 타이머를 멈출 수 있는 요청당 최대 시간 */
export const MAX_LLM_PAUSE_SECONDS = 20;
/** NPC TTS 정지 시간 = clamp(2, ceil(한글 글자 수 / 5), 15)초 */
export const TTS_PAUSE_MIN_SECONDS = 2;
export const TTS_PAUSE_MAX_SECONDS = 15;
export const TTS_CHARS_PER_SECOND = 5;

/** 프롬프트에 포함할 최근 왕복 수 */
export const MAX_HISTORY_EXCHANGES = 6;
/**
 * 판정 입력 상한. 공통규칙 §4의 원안은 4000이지만 9000으로 올렸다.
 *
 * 고정 규칙과 판정 기준표만으로 스테이지1 4,186 / 2 5,201 / 3 5,155토큰이다.
 * 판정 기준표는 어떤 경우에도 자를 수 없으니 4000으로는 대화를 한 줄도 못 싣는다.
 * 최근 왕복 6회를 다 실은 최악이 7,586토큰이라 여유를 두고 9000으로 잡았다.
 *
 * 대회 게이트웨이는 프롬프트 캐시를 지원하지 않으므로 매 턴 이 크기를 그대로 문다.
 */
export const MAX_PROMPT_TOKENS = 9000;
/**
 * 출력 상한. 공통규칙 §4의 원안은 500이지만 1500으로 올렸다.
 *
 * 실제 응답 크기를 재보니 합의 키 하나만 판정해도 약 660토큰이고,
 * 스테이지 3에서 다섯 키가 한 턴에 판정되면 1700토큰을 넘는다.
 * 500을 유지하면 거의 매 턴 JSON이 잘려 파싱에 실패하고,
 * 수정 재요청 -> 재실패 -> retry/system으로 이어져 오히려 호출이 늘어난다.
 * 비용을 아끼려는 값이 비용을 키우는 상황이라 올렸다.
 *
 * 글자 수 기반 추정이므로 2주차에 count_tokens로 실측해 확정한다.
 */
export const MAX_OUTPUT_TOKENS = 1500;

/** 남은 시간 경고 시점(초) */
export const TIMER_WARNING_SECONDS = [120, 30] as const;

// ── 로드 시점 검증 (공통규칙 §5) ──
//
// "필수 필드가 빠진 스테이지 JSON은 로드 시점에 거부한다.
//  결과 화면 문구가 조용히 undefined로 비는 것을 막기 위해서다."

const REQUIRED_STRING_FIELDS = [
  'npcId', 'npcName', 'location', 'difficulty',
  'defaultExpressionKey', 'successExpressionKey', 'failureExpressionKey',
  'successText', 'limitText', 'successState',
] as const;

const REQUIRED_ARRAY_FIELDS = [
  'unlockRequirements', 'requiredAgreementKeys',
  'openingLines', 'expressionKeys', 'fixedTerms',
] as const;

/** 문제 목록을 돌려준다. 비어 있으면 통과. */
export function validateStage(raw: unknown): string[] {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['스테이지 정의가 객체가 아님'];
  const s = raw as Record<string, unknown>;

  if (typeof s.stageId !== 'number') problems.push('stageId가 숫자가 아님');
  if (typeof s.timeLimitSeconds !== 'number' && s.timeLimitSeconds !== null) {
    problems.push('timeLimitSeconds가 숫자도 null도 아님');
  }
  if (typeof s.maxLlmCallsPerSession !== 'number') problems.push('maxLlmCallsPerSession 누락');

  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof s[f] !== 'string' || s[f] === '') problems.push(`${f} 누락`);
  }
  for (const f of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(s[f])) problems.push(`${f} 누락`);
  }

  const keys = Array.isArray(s.requiredAgreementKeys) ? (s.requiredAgreementKeys as string[]) : [];
  const defs = (s.agreementDefinitions ?? {}) as Record<string, unknown>;
  if (typeof s.agreementDefinitions !== 'object' || s.agreementDefinitions === null) {
    problems.push('agreementDefinitions 누락');
  } else {
    for (const key of keys) {
      const d = defs[key] as Record<string, unknown> | undefined;
      if (!d) { problems.push(`agreementDefinitions.${key} 누락`); continue; }
      for (const f of ['intent', 'passWhen', 'clarifyWhen', 'revokeWhen'] as const) {
        if (d[f] === undefined) problems.push(`agreementDefinitions.${key}.${f} 누락`);
      }
      for (const f of ['contextConsentAllowed', 'playerMustPropose'] as const) {
        if (typeof d[f] !== 'boolean') problems.push(`agreementDefinitions.${key}.${f} 누락`);
      }
    }
  }

  // failureHints는 모든 requiredAgreementKeys에 대한 항목이 있어야 한다
  const hints = (s.failureHints ?? {}) as Record<string, unknown>;
  if (typeof s.failureHints !== 'object' || s.failureHints === null) {
    problems.push('failureHints 누락');
  } else {
    for (const key of keys) {
      if (typeof hints[key] !== 'string') problems.push(`failureHints.${key} 누락`);
    }
  }

  // 표정 세 개는 화이트리스트 안에 있어야 한다
  const expressions = Array.isArray(s.expressionKeys) ? (s.expressionKeys as string[]) : [];
  for (const f of ['defaultExpressionKey', 'successExpressionKey', 'failureExpressionKey'] as const) {
    const v = s[f];
    if (typeof v === 'string' && expressions.length > 0 && !expressions.includes(v)) {
      problems.push(`${f}(${v})가 expressionKeys에 없음`);
    }
  }

  const cfg = s.styleReportConfig as Record<string, unknown> | undefined;
  if (!cfg || !Array.isArray(cfg.allowedStageTags)) {
    problems.push('styleReportConfig.allowedStageTags 누락');
  }

  // contextAnchorScope는 두 값 중 하나여야 한다
  for (const key of keys) {
    const d = defs[key] as Record<string, unknown> | undefined;
    const scope = d?.contextAnchorScope;
    if (scope !== undefined && scope !== 'immediate' && scope !== 'session') {
      problems.push(`agreementDefinitions.${key}.contextAnchorScope(${String(scope)})가 immediate·session이 아님`);
    }
  }

  if (s.disclosureDefinitions !== undefined &&
      (typeof s.disclosureDefinitions !== 'object' || s.disclosureDefinitions === null)) {
    problems.push('disclosureDefinitions가 객체가 아님');
  }

  // 보상 단서는 본문이 있어야 한다. 없으면 단서 ID만 저장되고 내용이 비어 버린다.
  const rewards = s.successRewards as Record<string, unknown> | undefined;
  const clueIds = Array.isArray(rewards?.clueIds) ? (rewards!.clueIds as string[]) : [];
  const epilogue = s.successEpilogue as Record<string, unknown> | undefined;
  for (const id of clueIds) {
    if (epilogue?.clueId !== id || typeof epilogue?.text !== 'string') {
      problems.push(`successRewards.clueIds의 ${id}에 대응하는 successEpilogue 본문 없음`);
    }
  }

  return problems;
}
