# 보이스 협상 게임

음성으로 NPC와 협상하고, 대화가 끝나면 발화 스타일을 분석해 리포트로 보여주는 Phaser 게임.
설계 문서: [docs/design-doc.md](docs/design-doc.md)

## 구성

| 폴더 | 담당 | 내용 |
|---|---|---|
| `client/` | 프론트 | Phaser 클라이언트, 음성 입출력, UI |
| `server/src/` (data 제외) | 백엔드 | Express, Claude API 연동, 판정·분석 로직 |
| `server/src/data/npcPersonas/` | 기획 | NPC 페르소나 JSON (스테이지 = 파일 1개) |
| `shared/types/` | 공동 | 프론트↔백엔드 API 계약 타입 (설계 문서 5장) |

## 실행

```bash
cd server && npm install && cp .env.example .env   # ANTHROPIC_API_KEY 채우기
npm run dev                                        # http://localhost:3000
```

```bash
cd client && npm install && npm run dev            # http://localhost:5173
```

## 설계 규칙

- API 키는 서버에만. 클라이언트에서 Claude API를 직접 호출하지 않는다.
- 성공/실패 판정은 `negotiationEngine.ts`의 결정적 코드로만 한다. LLM은 `trust`, `agreementGap` 같은 재료 값만 제공한다.
- 새 NPC(=스테이지)는 `npcPersonas/`에 JSON 파일을 추가하는 것만으로 늘어난다. 엔진 코드는 건드리지 않는다.
- STT는 Web Speech API(크롬 기준). 음성 원본은 저장하지 않고 텍스트만 세션에 남긴다.

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
