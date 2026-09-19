import 'dotenv/config';
import { z } from 'zod';
import { callStructured } from '../llm/client';
import { apiKey, baseUrl, judgeConfig, llmMode, reportConfig } from '../llm/config';

/**
 * 키를 넣은 뒤 실제로 붙는지 한 번 확인한다.
 *
 *   npm run llm:smoke
 *
 * 모델을 2번 부른다 (판정용·리포트용 각 1회). 그것 말고는 아무것도 하지 않는다.
 * 게이트웨이가 구조화 출력을 받아주는지는 불러봐야 알 수 있어서 이 스크립트가 있다.
 */

const probe = z.object({
  greeting: z.string(),
  itemCount: z.number(),
  tags: z.array(z.string()),
});

async function listModels(): Promise<string[]> {
  const res = await fetch(`${baseUrl()}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((m) => m.id);
}

async function tryRole(
  label: string,
  config: ReturnType<typeof judgeConfig>,
  allowed: string[],
) {
  process.stdout.write(`\n[${label}] 모델 ${config.model}\n`);

  // 403 원문보다 이게 먼저 눈에 들어온다. 오타인지 미승인인지가 여기서 갈린다.
  if (allowed.length > 0 && !allowed.includes(config.model)) {
    console.log('  승인 목록에 없는 별칭입니다. 호출하지 않았습니다.');
    console.log(`  .env의 LLM_MODEL_${label === '판정' ? 'JUDGE' : 'REPORT'} 를 위 목록 중 하나로 바꾸세요.`);
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  try {
    const out = await callStructured({
      config,
      system: '너는 형식을 정확히 지키는 도우미다. 한국어로 답한다.',
      userContent: '인사말 한 문장, itemCount는 3, tags는 ["가","나"]로 채워라.',
      schema: probe,
      name: 'smoke_probe',
    });
    const ms = Date.now() - started;
    console.log(`  성공 (${ms}ms)${ms > 3000 ? '  ← 판정에 쓰기엔 느립니다' : ''}`);
    console.log(`  받은 값: ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(`  실패 (${Date.now() - started}ms)`);
    console.log(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`게이트웨이 ${baseUrl()}`);
  console.log(`키 ${apiKey() ? `설정됨 (${apiKey().slice(0, 6)}…, ${apiKey().length}자)` : '없음'}`);
  console.log(`모드 ${llmMode()}`);

  if (!apiKey()) {
    console.log('\n.env에 LLM_API_KEY를 넣고 다시 실행하세요.');
    process.exit(1);
  }

  let allowed: string[] = [];
  console.log('\n내 키로 부를 수 있는 별칭:');
  try {
    allowed = await listModels();
    for (const id of allowed) console.log(`  - ${id}`);
  } catch (err) {
    console.log(`  목록 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  await tryRole('판정', judgeConfig(), allowed);
  await tryRole('리포트', reportConfig(), allowed);

  console.log(
    process.exitCode
      ? '\n실패한 항목이 있습니다. 위 메시지를 그대로 보고 원인을 찾으세요.'
      : '\n둘 다 정상입니다. .env의 LLM_MODE를 live로 바꾸면 게임이 실제 모델을 씁니다.',
  );
}

main();
