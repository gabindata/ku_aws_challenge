import { z } from 'zod';

/**
 * LLM이 돌려줄 출력의 모양.
 *
 * 문서의 JSON 예시는 judgements와 disclosureUpdates를 "키 -> 값" 객체로 그리지만,
 * 여기서는 배열로 받는다. 구조화 출력은 키 이름이 미리 정해진 객체만 보장할 수 있고,
 * 합의 키 이름은 스테이지마다 다르기 때문이다. 서버가 받아서 문서의 객체 형태로 바꾼다.
 */

export const judgementSchema = z.object({
  key: z.string().describe('이번 발화가 영향을 준 합의 키. 영향 없는 키는 아예 넣지 않는다'),
  action: z.enum(['confirm', 'revoke', 'clarify', 'keep']),
  agreementSummary: z.string().nullable()
    .describe('confirm일 때 실제로 합의한 내용. 근거 발화와 NPC 제안에 실제로 포함된 것만 적는다'),
  reason: z.string().describe('판정 기준과 대화 맥락에 따른 판단 이유. 서버 로그 전용'),
  evidenceTurnIds: z.array(z.string())
    .describe('이번 판정을 만든 플레이어 발화 ID. 과거 합의 발화 ID를 다시 넣지 않는다'),
  contextAnchorTurnId: z.string().nullable()
    .describe('NPC 안내에 기댄 맥락 동의일 때 실제로 참조한 NPC 메시지 ID'),
  selfProposed: z.boolean().nullable()
    .describe('플레이어가 스스로 꺼냈는가. playerMustPropose 키의 confirm에서는 필수'),
});

export const styleSignalsSchema = z.object({
  formality: z.enum(['casual', 'polite', 'formal']).nullable()
    .describe('일상체 / 공손한 해요체 / 격식체. 판단할 수 없으면 null'),
  directness: z.enum(['direct', 'indirect']).nullable()
    .describe('요청·제안이 없는 발화는 null'),
  cushion: z.object({
    used: z.boolean(),
    expressions: z.array(z.string()).describe('used가 true면 근거가 된 실제 표현'),
  }),
  stageTags: z.array(z.string()).describe('스테이지 허용 태그만'),
});

export const disclosureUpdateSchema = z.object({
  key: z.string(),
  status: z.enum(['active', 'withdrawn']),
  summary: z.string().describe('이번 대사에 근거한 최신 안내 내용'),
});

export const judgeOutputSchema = z.object({
  npcReply: z.string(),
  judgements: z.array(judgementSchema),
  disclosureUpdates: z.array(disclosureUpdateSchema)
    .describe('이번 대사에서 실제로 안내·변경·철회한 항목만. 없으면 빈 배열'),
  stageVerdict: z.enum(['continue', 'success', 'fatal']),
  fatalBehavior: z.object({
    detected: z.boolean(),
    type: z.enum(['threat', 'abuse', 'fraud', 'harm_pressure']).nullable(),
    evidenceTurnIds: z.array(z.string()),
  }),
  nextGoalKey: z.string().nullable(),
  expressionKey: z.string(),
  styleSignals: styleSignalsSchema,
});

export const narrativeSchema = z.object({
  title: z.string().describe('이번 대화의 말투 이름. 사람을 단정하지 않는다'),
  titleNote: z.string().describe('관찰 한 줄. 지시도 평가도 쓰지 않는다'),
  highlights: z.array(z.object({
    turnId: z.string().describe('인용 후보로 제공된 플레이어 발화 ID만'),
    note: z.string().describe('무슨 일이 있었는지만. 횟수는 제공된 집계 값만 쓴다'),
  })).describe('0~5개. 억지로 채우지 않는다'),
  summary: z.string().describe('협상 총평. 공백 포함 180~220자. 조언을 넣지 않는다'),
});

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;
export type NarrativeOutput = z.infer<typeof narrativeSchema>;
