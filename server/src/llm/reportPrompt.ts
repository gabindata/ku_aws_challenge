import type { StageDefinition } from '../data/stageSchema';
import type { ReportInput } from '../services/reportInput';
import { PROMPT_VERSION } from './config';

/**
 * 종료 리포트 프롬프트 (결과 리포트 기획 §2·§3·§5).
 *
 * 무엇을 넣을지는 reportInput.ts가 이미 골랐다. 여기서는 글로 옮기기만 한다.
 */

const RULES = `당신은 한국어 협상 게임이 끝난 뒤 플레이어에게 보여줄 말투 리포트를 씁니다.

## 이 리포트가 하는 일
"이번 대화에서 당신은 이렇게 말했다"를 보여줍니다.
"이렇게 하라"고 지시하지 않고, 점수·등급·순위를 붙이지 않습니다.

이번 대화에서 보인 모습에 이름을 붙이는 것은 좋습니다.
다만 그 사람이 원래 어떤 사람인지 단정하지는 않습니다.

## 말투 이름 (title)
이번 대화에서 두드러진 점을 한 손에 잡히게 이름 붙입니다. 매번 새로 짓습니다.
아래 두 방식 중 이번 대화에 더 잘 맞는 쪽을 고릅니다.

- 칭호형 — 대화를 끌어간 방식에 별명을 붙입니다
  "돌려 말하는 설명가", "적극적으로 대화를 주도한 리더",
  "돌려 말하기의 귀재", "조건부터 꺼내는 실무형", "끝까지 버틴 뚝심"
- 말버릇 포착형 — 반복된 말버릇 하나를 집어냅니다
  "사과로 시작한 부탁", "'혹시'로 문을 여는 사람", "숫자로 못 박는 버릇"

읽는 사람이 자기 모습을 알아볼 만큼 살아 있는 말로 씁니다.
- 밋밋함: "바로 말하는 쪽", "조건을 되짚는 확답", "질문 뒤에 약속을 잇는 응답"
- 좋음: "밀어붙이는 돌격형", "돌다리를 두드리는 신중파", "사정부터 꺼내는 호소형"

이번 대화에 실제로 나타난 것에만 이름을 붙입니다.
기록에 없는 성격이나 능력을 지어내지 않습니다.

## 짧은 설명 (titleNote)
그 이름이 왜 붙었는지를 이번 대화에서 있었던 일로 설명합니다.
- 좋음: 원하는 조건을 꺼내기 전에 "죄송하지만"을 자주 먼저 붙였습니다.
- 나쁨: 당신은 소극적인 사람입니다. — 사람 자체를 단정하는 말

## 근거 발화 (highlights)
최대 5개, 없으면 0개입니다. 억지로 채우지 않습니다. 아래 셋에서 고릅니다.
- 반복된 습관 0~2개: 같은 패턴이 여러 번 나온 것 중 대표 하나
- 극단적인 발화 0~2개: 상대의 설명·거절을 무시하고 요구를 밀어붙였거나,
  들어주지 않으면 자해·민폐 같은 일을 하겠다고 말한 발화.
  단순히 반말을 썼거나 직접적으로 요청했다는 이유로 고르지 않습니다
- 결정적인 순간 0~1개: 합의가 성립하거나 흔들린 지점

**제공된 인용 후보의 turnId만 씁니다.** 목록에 없는 ID를 지어내지 않습니다.
같은 발화가 두 종류에 걸리면 하나만 내고 이유를 함께 적습니다.

**게임 내부 용어를 쓰지 않습니다.** 합의 키 이름, 분석 항목 이름, 영어 식별자를
그대로 옮기지 말고 그 발화가 무엇이었는지를 우리말로 풀어 씁니다.
- 나쁨: 영어 밑줄 이름을 그대로 옮기고 "태그가 2회 잡혔습니다"라고 쓰는 것
- 좋음: 구체적인 조건 없이 잘하겠다는 말을 두 번 했습니다
- 나쁨: 영어 키 이름을 그대로 옮기고 "met이 됐습니다"라고 쓰는 것
- 좋음: 근무 요일을 확정했습니다

설명에 횟수를 쓸 때는 **제공된 집계 값만** 씁니다. 직접 세지 않습니다.
일부 대화가 빠졌다고 표시된 경우 전체 횟수를 추측하지 않습니다.
횟수는 반복된 습관에만 씁니다. 한 번뿐인 말에 숫자를 붙이지 않습니다.

## 협상 총평 (summary)
공백 포함 180~220자를 목표로 씁니다. 근거가 부족하면 억지로 채우지 말고 짧게 씁니다.
핵심 행동 → 실제 대화에 미친 영향 → 결과 평가 순서로 씁니다.

- 성공이면 합의에 기여한 구체적인 행동을 짚어 칭찬합니다
- 실패면 실제 종료 이유와 관련된 행동, 미완성된 합의를 평가합니다
- **결과와 종료 이유는 이미 정해져 있습니다.** 다시 판정하지 않습니다
- 과격한 말이 있었어도 실제 종료 이유가 시간 초과라면 그 말 때문에 실패했다고 쓰지 않습니다
- 평가까지만 씁니다. "다음에는 이렇게 해보세요" 같은 조언을 넣지 않습니다
- 상대의 속마음이나 기록에 없는 원인을 지어내지 않습니다`;

const OUTCOME_TEXT: Record<string, string> = {
  success: '성공 — 필수 합의를 모두 채웠습니다',
  failure: '실패',
  reverted: '진행 중',
  in_progress: '진행 중',
  retry: '진행 중',
};

/**
 * 내부 태그 코드를 우리말 설명으로 바꾼다 (각 스테이지 기획 §말투 리포트 설정).
 *
 * 코드를 그대로 보내면 리포트에 "empty_pledge 태그가 2회 잡혔습니다" 같은 문장이
 * 그대로 나온다. 쓰지 말라고 지시하는 것보다, 볼 수 없게 하는 쪽이 확실하다.
 * 기획이 태그를 추가하면 여기에도 설명을 넣어야 한다 (테스트가 빠진 것을 잡는다).
 */
const TAG_TEXT: Record<string, string> = {
  empty_pledge: '구체적 조건 없는 다짐',
  procedure_question: '절차·서류·기한을 묻는 질문',
  specific_action_plan: '주체·행동·시점이 드러난 계획',
  repeated_plea: '새 정보 없이 반복한 선처 요청',
  reflects_concern: '상대의 우려를 자기 말로 되짚은 발화',
};

/** 설명이 없는 태그는 싣지 않는다. 코드값이 리포트에 새는 것보다 낫다. */
export function describeTag(tag: string): string | null {
  return TAG_TEXT[tag] ?? null;
}

const REASON_TEXT: Record<string, string> = {
  time: '제한 시간이 끝났습니다',
  limit: '대화가 너무 길어져 끝났습니다',
  fatal: '치명적인 발화로 대화가 중단됐습니다',
  system: '시스템 오류',
};

export function buildReportSystem(stage: StageDefinition): string {
  return [
    RULES,
    `\n# 이번 스테이지\n프롬프트 버전 ${PROMPT_VERSION}`,
    `NPC: ${stage.npcName} (${stage.location})`,
  ].join('\n');
}

export function buildReportUser(report: ReportInput, stage: StageDefinition): string {
  const result = [
    `결과: ${OUTCOME_TEXT[report.outcome] ?? report.outcome}`,
    report.endReason ? `종료 이유: ${REASON_TEXT[report.endReason] ?? report.endReason}` : null,
  ].filter(Boolean).join('\n');

  // 합의 키 이름도 내부 식별자다. 총평에 그대로 새지 않도록 기획서의 의도 문장으로 바꾼다.
  const STATUS_TEXT: Record<string, string> = {
    met: '성립함',
    unmet: '성립하지 않음',
    pending_reconfirm: '성립했다가 흔들려 재확인이 필요함',
  };
  const agreements = report.agreements
    .map((a) => {
      const intent = stage.agreementDefinitions[a.key]?.intent ?? a.key;
      const status = STATUS_TEXT[a.status] ?? a.status;
      return `- ${intent}: ${status}${a.summary ? ` — ${a.summary}` : ''}`;
    }).join('\n');

  const c = report.counts;
  const cushionList = Object.entries(c.cushionExpressions)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, n]) => `"${phrase}" ${n}개 발화`).join(', ');
  const tagList = Object.entries(c.stageTags)
    .map(([tag, n]) => { const t = describeTag(tag); return t ? `${t} ${n}회` : null; })
    .filter(Boolean).join(', ');

  const counts = [
    `유효 발화 ${c.validUtterances}개`,
    `쿠션 표현을 쓴 발화 ${c.cushionUtterances}개`,
    cushionList ? `표현별: ${cushionList}` : null,
    tagList ? `발화 성격별: ${tagList}` : null,
    `평균 길이 ${Math.round(c.averageLength)}자`,
  ].filter(Boolean).join('\n');

  const signals = report.signals.map((s) => {
    const parts = [
      `격식 ${s.formality ?? '판단 불가'}`,
      `직접성 ${s.directness ?? '요청·제안 없음'}`,
      s.cushion.used ? `쿠션 ${s.cushion.expressions.join('·')}` : '쿠션 없음',
      (() => {
        const t = s.stageTags.map(describeTag).filter(Boolean);
        return t.length > 0 ? t.join('·') : null;
      })(),
    ].filter(Boolean);
    return `- [${s.evidenceTurnId}] ${parts.join(' / ')}`;
  }).join('\n');

  const quotes = report.exchanges.map((e) => [
    e.npcBefore ? `  NPC: ${e.npcBefore}` : null,
    `  [${e.playerTurnId}] 플레이어: ${e.playerText}`,
    e.npcAfter ? `  NPC: ${e.npcAfter}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    `## 서버가 확정한 결과\n${result}`,
    `\n## 합의 상태\n${agreements}`,
    `\n## 서버가 센 집계 (횟수는 이 값만 씁니다)\n${counts}`,
    `\n## 발화별 말투 분석값\n${signals || '없음'}`,
    report.truncated
      ? '\n## 주의\n대화가 길어 일부 기록을 뺐습니다. 아래 인용 후보에 없는 발화는 인용할 수 없고, 전체 횟수는 위 집계만 믿으세요.'
      : '',
    `\n## 인용 후보 (이 turnId만 쓸 수 있습니다)\n${quotes || '없음'}`,
  ].filter(Boolean).join('\n');
}
