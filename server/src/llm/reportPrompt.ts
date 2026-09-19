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
"당신은 이렇게 말했다"를 보여줍니다. "이렇게 하라"고 지시하지 않고,
잘했다·못했다를 말하지 않습니다. 사람의 성격을 단정하거나 점수·등급을 붙이지 않습니다.

## 말투 이름 (title)
이번 대화에서 실제로 두드러진 특징에 맞춰 매번 새로 짓습니다.
- 좋음: "돌려 말하는 설명가", "사과로 시작한 부탁"
- 나쁨: "회피형", "소극적인 사람" — 사람을 규정하는 말

## 짧은 설명 (titleNote)
무슨 일이 있었는지만 적습니다.
- 좋음: 원하는 조건을 꺼내기 전에 "죄송하지만"을 자주 먼저 붙였습니다.
- 나쁨: 당신은 소극적입니다.

## 근거 발화 (highlights)
최대 5개, 없으면 0개입니다. 억지로 채우지 않습니다. 아래 셋에서 고릅니다.
- 반복된 습관 0~2개: 같은 패턴이 여러 번 나온 것 중 대표 하나
- 극단적인 발화 0~2개: 상대의 설명·거절을 무시하고 요구를 밀어붙였거나,
  들어주지 않으면 자해·민폐 같은 일을 하겠다고 말한 발화.
  단순히 반말을 썼거나 직접적으로 요청했다는 이유로 고르지 않습니다
- 결정적인 순간 0~1개: 합의가 성립하거나 흔들린 지점

**제공된 인용 후보의 turnId만 씁니다.** 목록에 없는 ID를 지어내지 않습니다.
같은 발화가 두 종류에 걸리면 하나만 내고 이유를 함께 적습니다.

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

export function buildReportUser(report: ReportInput): string {
  const result = [
    `결과: ${OUTCOME_TEXT[report.outcome] ?? report.outcome}`,
    report.endReason ? `종료 이유: ${REASON_TEXT[report.endReason] ?? report.endReason}` : null,
  ].filter(Boolean).join('\n');

  const agreements = report.agreements
    .map((a) => `- ${a.key}: ${a.status}${a.summary ? ` — ${a.summary}` : ''}`).join('\n');

  const c = report.counts;
  const cushionList = Object.entries(c.cushionExpressions)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, n]) => `"${phrase}" ${n}개 발화`).join(', ');
  const tagList = Object.entries(c.stageTags).map(([tag, n]) => `${tag} ${n}회`).join(', ');

  const counts = [
    `유효 발화 ${c.validUtterances}개`,
    `쿠션 표현을 쓴 발화 ${c.cushionUtterances}개`,
    cushionList ? `표현별: ${cushionList}` : null,
    tagList ? `태그: ${tagList}` : null,
    `평균 길이 ${Math.round(c.averageLength)}자`,
  ].filter(Boolean).join('\n');

  const signals = report.signals.map((s) => {
    const parts = [
      `격식 ${s.formality ?? '판단 불가'}`,
      `직접성 ${s.directness ?? '요청·제안 없음'}`,
      s.cushion.used ? `쿠션 ${s.cushion.expressions.join('·')}` : '쿠션 없음',
      s.stageTags.length > 0 ? `태그 ${s.stageTags.join('·')}` : null,
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
