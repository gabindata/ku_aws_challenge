# 작업 규칙

소개는 [README](README.md)에 있다. 이 문서는 팀 내부 규칙이다.

## 폴더

| 폴더 | 담당 | 내용 |
|---|---|---|
| `client/` | 프론트 | Phaser 클라이언트, 음성 입출력, UI |
| `server/src/` (data 제외) | 백엔드 | Express, LLM 연동, 판정·분석 로직 |
| `server/src/data/npcPersonas/` | 기획 | NPC 페르소나 JSON (스테이지 = 파일 1개) |
| `shared/types/` | 공동 | 프론트↔백엔드 API 계약 타입 |

기준 문서는 기획 노션의 **공통규칙**이다. API 계약의 단일 소스는
[`shared/types/negotiationTypes.ts`](shared/types/negotiationTypes.ts).
`docs/design-doc.md`는 구형 설계라 참고하지 않는다.

## 명령어

```bash
cd server && npm run dev         # 서버. http://localhost:3000
cd client && npm run dev         # 게임. http://localhost:5173

cd server && npm test            # 명세 회귀 테스트. stub 모드라 LLM 비용이 들지 않는다
cd server && npm run typecheck
cd server && npm run llm:smoke   # 내 키로 실제 모델이 불리는지 확인
```

## API

| 메서드 | 경로 | 내용 |
|---|---|---|
| `GET` | `/api/stages` | 스테이지 목록 |
| `POST` | `/api/negotiation/start` | 세션 시작. 첫 대사를 돌려준다 |
| `POST` | `/api/negotiation/turn` | 발화 한 번 처리 |
| `GET` | `/api/sessions/:id/result` | 리포트 폴링. 생성 중이면 `pending` |
| `POST` | `/api/sessions/:id/pause` · `/resume` | 설정창 여닫을 때 타이머 정지·재개 |
| `POST` | `/api/tts` | 일레븐랩스 음성 합성 프록시 |
| `GET` | `/health` | 헬스 체크 |

리포트는 대화가 끝난 뒤 백그라운드에서 만든다. 종료 응답을 여기서 기다리면
10초 넘게 멈추기 때문이다. 클라이언트는 `/result`를 폴링해서 `ready`가 되면 띄운다.

## LLM 연동

대회 게이트웨이는 **LiteLLM 프록시가 AWS Bedrock 앞에 선 구조**이고, 말하는 규약은
OpenAI 쪽이다. 그래서 `openai` SDK로 부른다. 모델은 실제 ID가 아니라 게이트웨이
별칭(`bedrock-gpt-5.6-terra` 등)으로 부르며, 신청서에서 승인받은 것만 불린다.

판정용과 리포트용 모델을 따로 지정할 수 있다. 판정은 매 턴 불려서 속도가, 리포트는
세션당 1~2번이라 글솜씨가 중요하다.

## 설계 규칙

- **API 키는 서버에만.** 클라이언트는 우리 서버만 부른다. 모델도 TTS도 직접 부르지 않는다.
- **의미 판단은 LLM, 최종 판정은 서버.** 합의가 성립했는지·번복됐는지는 LLM이
  `confirm`/`revoke`/`clarify`/`keep`으로 판단한다. 서버는 근거 ID·불린 값·시간·호출
  상한만 검증하고, **필수 합의 키가 다 찼는지로 성공만** 정한다.
  스테이지별 문자열 비교기를 만들지 않는다.
- **새 스테이지는 JSON 추가만으로 늘어난다.** 엔진 코드는 건드리지 않는다.
- **말투는 성공 판정에 반영하지 않는다.** 리포트에만 쓴다.
- **음성 원본은 저장하지 않는다.** 텍스트만 세션에 남고, 세션은 메모리에만 있다.

## 배포

| | 주소 |
|---|---|
| 게임 | https://malkori.pages.dev (Cloudflare Pages) |
| 서버 | https://malkori-server.onrender.com (Render) |

둘 다 **레포 루트를 기준으로** 빌드한다. `server/`나 `client/`를 Root Directory로
지정하면 `shared/`를 못 읽어 빌드가 깨진다.

| | Render (서버) | Cloudflare Pages (게임) |
|---|---|---|
| Root Directory | 비워 둔다 | 비워 둔다 |
| Build | `cd server && npm ci && npm run build` | `cd client && npm ci && npm run build` |
| Start · Output | `cd server && npm start` | `client/dist` |
| 환경 변수 | `.env.example`의 값들 | `VITE_API_BASE_URL` |

`VITE_API_BASE_URL`은 **`/api`까지** 적는다. `https://malkori-server.onrender.com/api`

서버의 `CLIENT_ORIGIN`에는 게임 주소를 넣는다. 비워 두면 아무 데서나 부를 수 있다.
`CLIENT_ORIGIN=https://malkori.pages.dev`

Render는 자동 배포가 꺼져 있다. 머지한 뒤 대시보드에서 **Manual Deploy**를 눌러야
반영된다.

세션이 메모리에만 있으므로 **서버 인스턴스는 하나여야 하고, 재배포하면 진행 중인
세션이 전부 끊긴다.** 시연 직전에는 재배포하지 않는다.

## 브랜치 · PR

`main` + 짧은 작업 브랜치 + PR (GitHub Flow). 4주 프로젝트라 `develop`/`release` 브랜치는 쓰지 않는다.

브랜치 이름은 `<타입>/<영역>-<내용>`. 영역을 넣으면 브랜치 목록만 봐도 누구 작업인지 보인다.

| 예시 | 담당 |
|---|---|
| `feat/server-session-store` | 백엔드 |
| `feat/client-negotiation-scene` | 프론트 |
| `content/persona-stage2` | 기획 |
| `fix/server-stages-sort` | 누구나 |

1. **`main`에 직접 push 하지 않는다.** 반드시 PR을 거친다.
2. **브랜치는 1~2일 안에 머지한다.** 오래 끌면 머지 충돌을 감당할 수 없다.
3. **`shared/types/` 변경은 단독 PR로 올리고 전원에게 알린다.** 세 사람의 작업 폴더가 겹치지 않아 다른 곳에서는 충돌이 거의 없지만, 여기만 셋 다 쓴다. 기능 작업에 끼워 넣으면 다른 담당자가 모르고 지나간다.
4. **기획 담당은 git을 몰라도 된다.** GitHub 웹에서 `npcPersonas` 폴더의 "Add file"로 JSON을 추가하면 브랜치와 PR이 자동으로 만들어진다.

새 작업을 시작할 때는 항상 최신 `main`에서 갈라져 나온다. 직전 브랜치 위에서 이어 파면 아직 머지되지 않은 커밋이 딸려 들어간다.

```bash
git checkout main && git pull && git checkout -b feat/server-session-store
```
