import type {
  AgreementJudgement,
  LlmTurnOutput,
  Turn,
} from '../../../shared/types/negotiationTypes';
import type { StyleNarrative, StyleSignals } from '../../../shared/types/styleReportTypes';
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
    styleSignals: fakeSignals(playerText, playerTurnId),
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

/**
 * 말투 분석값도 가짜로 만든다. 진짜 LLM은 발화의 의미를 보고 분류한다.
 * 여기서는 프론트가 네 축이 움직이는 것을 확인할 수 있을 정도로만 흉내 낸다.
 */
function fakeSignals(playerText: string, playerTurnId: string): StyleSignals {
  const text = playerText.trim();
  const cushions = ['혹시', '좀', '죄송', '괜찮으시면', '조금'];
  const found = cushions.filter((c) => text.includes(c));

  let formality: StyleSignals['formality'] = null;
  if (/습니다|습니까|십니까/.test(text)) formality = 'formal';
  else if (/요[.?!]?$|요\s/.test(text)) formality = 'polite';
  else if (text.length > 0) formality = 'casual';

  // 요청·제안이 없는 발화는 직접성 집계에서 빠진다.
  // 진짜 LLM은 의미를 보고 판단한다. 여기서는 약속·요청 어미를 훑는 수준이다.
  const asksSomething = /겠|주세요|주실|할게|가능|드릴|바꿔|해 ?주|부탁/.test(text);
  const directness: StyleSignals['directness'] = asksSomething
    ? found.length > 0 ? 'indirect' : 'direct'
    : null;

  return {
    formality,
    directness,
    cushionUsed: found.length > 0,
    cushionPhrases: found,
    stageTags: [],
    evidenceTurnId: playerTurnId,
  };
}

/**
 * 종료 리포트의 가짜 생성.
 *
 * 진짜 LLM은 대화를 읽고 말투 이름을 새로 짓고 근거 발화를 고른다.
 * 여기서는 저장된 분석값만 보고 뻔한 문장을 만든다. 프론트가 화면을 그려볼
 * 수 있을 정도면 충분하다.
 */
export function stubNarrative(input: {
  outcome: string;
  endReason: string | null;
  playerTurns: Turn[];
  signals: StyleSignals[];
}): StyleNarrative {
  const { playerTurns, signals, outcome } = input;

  const cushionTurns = signals.filter((s) => s.cushionUsed);
  const phrases = [...new Set(cushionTurns.flatMap((s) => s.cushionPhrases))];
  const formal = signals.filter((s) => s.formality === 'formal').length;

  const title = cushionTurns.length >= 2
    ? '돌려서 꺼내는 말'
    : formal > playerTurns.length / 2
      ? '깍듯한 설명가'
      : '바로 말하는 쪽';

  const titleNote = cushionTurns.length >= 2 && phrases.length > 0
    ? `요청을 꺼내기 전에 "${phrases[0]}" 같은 말을 자주 먼저 붙였습니다.`
    : '이번 대화에서는 원하는 것을 비교적 바로 꺼내는 쪽이었습니다.';

  // 반복된 습관 하나 + 결정적인 순간 하나. 최대 5개 규칙 안에서 단순하게 고른다.
  const highlights = [];
  const firstCushion = cushionTurns[0];
  if (firstCushion) {
    const turn = playerTurns.find((t) => t.id === firstCushion.evidenceTurnId);
    if (turn) {
      highlights.push({
        turnId: turn.id,
        quote: turn.text,
        note: `"${firstCushion.cushionPhrases[0]}" 같은 말을 ${cushionTurns.length}번 썼습니다.`,
      });
    }
  }
  const last = playerTurns[playerTurns.length - 1];
  if (last && !highlights.some((h) => h.turnId === last.id)) {
    highlights.push({
      turnId: last.id,
      quote: last.text,
      note: outcome === 'success'
        ? '이 발화로 마지막 합의가 성립했습니다.'
        : '대화는 이 발화 뒤에 끝났습니다.',
    });
  }

  const summary = outcome === 'success'
    ? '상대가 필요로 하는 조건을 확인하고 그에 맞는 약속을 직접 제안했습니다. 요청을 꺼낼 때 사정을 먼저 설명하는 편이었고, 상대는 그 조건을 확인한 뒤 합의했습니다. 무엇을 약속하는지 분명하게 전달한 대화였습니다. (가짜 총평)'
    : '상대의 설명을 들은 뒤 조건을 조정하는 과정까지는 이어지지 못했습니다. 원하는 것을 꺼내기는 했지만 합의에 필요한 내용이 남은 채로 대화가 끝났습니다. (가짜 총평)';

  return { title, titleNote, highlights, summary };
}
