// tsc는 .ts만 옮긴다. 스테이지 JSON은 따로 복사해야 빌드된 서버가 읽을 수 있다.
// 이걸 빼면 서버는 뜨지만 /api/stages가 500을 낸다.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'data');
const to = join(root, 'dist', 'server', 'src', 'data');

if (!existsSync(from)) {
  console.error(`[build] ${from} 가 없습니다`);
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log(`[build] 스테이지 데이터를 dist로 복사했습니다`);
