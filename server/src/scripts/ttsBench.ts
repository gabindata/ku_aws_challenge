import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { apiKey, model, requestSpeech, voiceFor } from '../tts/config';

/**
 * 일레븐랩스가 쓸 만한 지연인지 재본다.
 *
 *   npm run tts:bench
 *
 * 실제 플레이에서 나온 NPC 대사로 생성해 보고, 두 가지를 잰다.
 *   첫 소리까지  스트리밍이라 여기서부터 재생이 시작된다. 체감 지연이 이 값이다.
 *   전체 완료    대사 전체가 만들어질 때까지
 *
 * 생성한 음성은 tts-samples/ 에 저장하니 품질도 직접 들어보면 된다.
 */

// 2판차 실제 플레이 기록에서 가져왔다. 평균 62자.
const SAMPLES = [
  '네, 야간 자리는 평일 월요일부터 금요일까지 밤 11시에서 아침 7시예요. 그 시간대로 근무 가능하세요?',
  '금요일을 빼면 평일 5일 야간 근무는 어려워져요. 금요일도 밤 11시부터 아침 7시까지 가능하신가요?',
  '최소 1년은 계속 근무하시고, 못 나오실 일이 있으면 일주일 전에 미리 말씀해 주시는 걸로 알겠습니다.',
];

const OUT_DIR = 'tts-samples';

async function bench(text: string, voiceId: string, index: number) {
  const started = Date.now();
  let firstByteMs = 0;
  const chunks: Uint8Array[] = [];

  const response = await requestSpeech({ text, voiceId });
  if (!response.body) throw new Error('응답 본문이 비어 있습니다');

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (firstByteMs === 0) firstByteMs = Date.now() - started;
    chunks.push(chunk);
  }
  const totalMs = Date.now() - started;

  const audio = Buffer.concat(chunks);
  const file = `${OUT_DIR}/sample${index + 1}.mp3`;
  writeFileSync(file, audio);

  console.log(`  ${index + 1}. ${text.length}자`);
  console.log(`     첫 소리까지 ${firstByteMs}ms   전체 ${totalMs}ms   ${(audio.length / 1024).toFixed(0)}KB → ${file}`);
  return { firstByteMs, totalMs };
}

async function main() {
  if (!apiKey()) {
    console.log('.env에 ELEVENLABS_API_KEY를 넣고 다시 실행하세요.');
    process.exit(1);
  }
  const voiceId = voiceFor('store_owner_yang');
  if (!voiceId) {
    console.log('.env에 ELEVENLABS_VOICE_DEFAULT (또는 NPC별 목소리)를 넣으세요.');
    console.log('목소리 ID는 일레븐랩스 Voice Library에서 고른 뒤 확인할 수 있습니다.');
    process.exit(1);
  }

  console.log(`모델 ${model()}   목소리 ${voiceId}\n`);
  mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < SAMPLES.length; i += 1) {
    try {
      results.push(await bench(SAMPLES[i], voiceId, i));
    } catch (err) {
      console.log(`  ${i + 1}. 실패 — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (results.length === 0) return;

  const avgFirst = results.reduce((a, r) => a + r.firstByteMs, 0) / results.length;
  const avgTotal = results.reduce((a, r) => a + r.totalMs, 0) / results.length;

  console.log(`\n평균 첫 소리까지 ${avgFirst.toFixed(0)}ms, 전체 ${avgTotal.toFixed(0)}ms`);
  console.log('\n판정에 이미 3.6초가 걸린다. 여기에 첫 소리까지의 시간이 더해진다.');
  console.log(`  플레이어가 말하고 NPC 목소리가 나오기까지: 약 ${((3600 + avgFirst) / 1000).toFixed(1)}초`);
  console.log(`\n${OUT_DIR}/ 의 mp3를 직접 들어보고 품질도 판단하세요.`);
}

main();
