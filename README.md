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

## 규칙

- API 키는 서버에만. 클라이언트에서 Claude API를 직접 호출하지 않는다.
- 성공/실패 판정은 `negotiationEngine.ts`의 결정적 코드로만 한다. LLM은 `trust`, `priceGap` 같은 재료 값만 제공한다.
- 새 NPC(=스테이지)는 `npcPersonas/`에 JSON 파일을 추가하는 것만으로 늘어난다. 엔진 코드는 건드리지 않는다.
- STT는 Web Speech API(크롬 기준). 음성 원본은 저장하지 않고 텍스트만 세션에 남긴다.
