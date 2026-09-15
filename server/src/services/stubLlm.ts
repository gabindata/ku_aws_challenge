import type {
  AgreementJudgement,
  LlmTurnOutput,
} from '../../../shared/types/negotiationTypes';
import type { Session } from '../models/session';
import type { StageDefinition } from '../data/stageSchema';

/**
 * 판정 LLM 자리를 대신하는 가짜.
 *
 * 프론트가 협상 화면을 실제 서버에 붙일 수 있게 하려고 둔 것이며,
 * 2주차에 llmService.evaluateTurn()이 Claude를 부르면 이 파일은 통째로 지운다.
 * 파이프라인에서 가짜인 부분은 여기 하나뿐이다 — 근거 ID 검증, 합의 병합,
 * 종료 판정, 타이머는 전부 진짜 코드가 돈다.
 *
 * 규칙을 일부러 단순하고 예측 가능하게 뒀다. 프론트가 같은 조작을 반복해
 * 화면 전환을 확인할 수 있어야 하기 때문이다.
 *
 *   - 열 글자 이상 말하면  → 배열 순서상 첫 미충족 키를 confirm
 *   - 그보다 짧게 말하면   → 그 키를 clarify (NPC가 되묻는 흐름 확인용)
 *   - "협박테스트"를 넣으면 → stageVerdict: fatal (실패 화면 확인용)
 *
 * 필수 키를 전부 채우려면 충분히 긴 발화를 키 수만큼 하면 된다.
 */

const MIN_CONFIRM_LENGTH = 10;
/** 실패 화면을 확인하기 위한 개발용 문구. 진짜 LLM이 붙으면 사라진다. */
export const FATAL_TEST_PHRASE = '협박테스트';

const REPLIES = [
  '그렇게 적을게요.',
  '알겠습니다. 다음은요?',
  '그 부분은 확인했습니다.',
];

export function stubEvaluateTurn(
  stage: StageDefinition,
  session: Session,
  playerTurnId: string,
  playerText: string,
): LlmTurnOutput {
  const base = {
    stageVerdict: 'continue' as const,
    fatalBehavior: { detected: false, type: null, evidenceTurnIds: [] },
    expressionKey: stage.defaultExpressionKey,
    styleSignals: {
      formality: 70,
      directness: 55,
      hedging: 25,
      isQuestion: playerText.trimEnd().endsWith('?'),
      stageTags: [],
      evidenceTurnId: playerTurnId,
    },
  };

  if (playerText.includes(FATAL_TEST_PHRASE)) {
    return {
      ...base,
      npcReply: '지금 뭐라고 하셨어요.',
      judgements: {},
      stageVerdict: 'fatal',
      fatalBehavior: { detected: true, type: 'threat', evidenceTurnIds: [playerTurnId] },
    };
  }

  // 배열 순서상 첫 미충족 키를 고른다. 시간 초과 힌트와 같은 기준이다.
  const targetKey = stage.requiredAgreementKeys.find(
    (key) => session.agreements[key]?.status !== 'met',
  );
  if (targetKey === undefined) {
    return { ...base, npcReply: '그럼 그렇게 하기로 하죠.', judgements: {} };
  }

  const definition = stage.agreementDefinitions[targetKey];
  const enough = playerText.trim().length >= MIN_CONFIRM_LENGTH;

  const judgement: AgreementJudgement = enough
    ? {
        action: 'confirm',
        // 진짜 LLM은 실제 발화 내용을 요약한다. 가짜는 플레이어가 한 말을 그대로 쓴다.
        agreementSummary: playerText.trim(),
        reason: `(가짜 판정) ${MIN_CONFIRM_LENGTH}자 이상이라 confirm`,
        evidenceTurnIds: [playerTurnId],
        // playerMustPropose 키도 통과시켜야 프론트가 성공 화면까지 볼 수 있다.
        selfProposed: definition.playerMustPropose ? true : null,
      }
    : {
        action: 'clarify',
        reason: '(가짜 판정) 너무 짧아 clarify',
        evidenceTurnIds: [playerTurnId],
      };

  const npcReply = enough
    ? REPLIES[session.turns.length % REPLIES.length]
    : '무슨 말씀이신지 조금 더 자세히 말해 주시겠어요?';

  return {
    ...base,
    npcReply,
    judgements: { [targetKey]: judgement },
    nextGoalKey: targetKey,
  };
}
