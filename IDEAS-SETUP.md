# 아이디어 게시판 — Cloudflare 설정

게시판은 **Cloudflare Pages Functions + D1** 위에서 돈다. GitHub Pages 는 정적 파일만
주므로 `/api/*` 가 없고, 그 상태에서는 게시판이 「지금은 제안을 받을 수 없습니다」로
뜨고 **제안 폼은 아예 숨는다** — 사람이 길게 써서 보냈는데 사라지는 일이 없게.

## 로컬에서 돌려보기 (계정 없이 됨)

```bash
npx wrangler d1 execute joygolive-ideas --local --file=schema.sql
npx wrangler pages dev . --port 8788 --local
```

관리자 경로까지 보려면 토큰을 붙인다:

```bash
npx wrangler pages dev . --port 8788 --local --binding ADMIN_TOKEN=아무거나
```

## 배포 — 끝났다 (2026-08-24)

```
계정        iamsehwan@gmail.com  (b51b3d70c5cec181630b9e9c5f87375b)
D1          joygolive-ideas · f11bac51-950c-4219-bf2e-d69a15d7d3ef · APAC
Pages       joygolive → https://joygolive.pages.dev
비밀값      ADMIN_TOKEN · RATE_SALT (Pages 프로덕션 환경에 암호화 저장)
```

`ADMIN_TOKEN` 과 `RATE_SALT` 의 평문은 **`.secrets.local`** 에 있다 (권한 600,
`.gitignore` 로 막힘). Cloudflare 쪽은 암호화 저장이라 다시 못 읽으므로, 이 파일을
잃으면 새로 발급해서 양쪽을 함께 갈아야 한다.

**`RATE_SALT` 를 바꾸면 기존 속도제한 기록이 무의미해진다** — 해시가 달라지므로
전부 새 사람으로 보인다. 유출이 아니면 굳이 돌리지 않는다.

### 다시 배포하려면

```bash
npx wrangler pages deploy . --project-name joygolive --branch main --commit-dirty=true
```

`.assetsignore` 가 정적 자산에서 뺄 것들을 적어 둔다 — 설정·문서·비밀값이
`*.pages.dev` 로 그대로 새어 나가지 않게.

### 스키마를 고쳤을 때

```bash
npx wrangler d1 execute joygolive-ideas --remote --file=schema.sql
```

`CREATE TABLE IF NOT EXISTS` 라 여러 번 돌려도 안전하다. 열을 **추가**하는 변경은
`ALTER TABLE` 을 따로 써야 한다 — 위 파일은 없는 것만 만들지 있는 것을 고치지 않는다.
그래서 `migrations/` 가 따로 있다. 이미 만들어진 표에는 이쪽을 돌린다:

```bash
npx wrangler d1 execute joygolive-ideas --remote --file=migrations/002-private-ideas.sql
```

**한 번만 돌아간다** — `ALTER TABLE ADD COLUMN` 은 두 번째에 「열이 이미 있다」로
죽는다. 새로 만드는 D1 은 `schema.sql` 만으로 충분하다(같은 열이 거기 이미 있다).

| 적용 | 날짜 |
|---|---|
| `002-private-ideas.sql` — 제안 비공개 전환 | 2026-08-28 (remote 적용 완료) |

## 제안은 올린 사람과 운영자만 본다

**2026-08-28 부터 모든 제안이 비공개다.** 목적은 사생활이 아니라 **도용 방지**다 —
아직 만들어지지 않은 아이디어가 그대로 공개돼 있으면 먼저 가져가는 사람이 이긴다.

계정도 연락처도 만들지 않는다는 전제는 그대로다. 대신 **올릴 때 정한 비밀번호를
아는 사람**을 올린 사람으로 본다.

- 목록(`GET /api/ideas`)에 잠긴 글은 **제목 앞부분 · 날짜 · 상태**만 나간다.
  제목은 `titleHint()` 가 자른다 — 길이의 40%, 최대 10자, 항상 원본보다 짧게.
  본문·이름·검토 의견·댓글은 아예 실리지 않는다
- 내용은 `GET /api/ideas/{id}` 로 따로 받는다. `X-Idea-Key` 헤더가 있어야 하고,
  없으면 **404** 로 답한다(403 은 「그 id 는 실재한다」를 알려 주는 셈이다)
- 열쇠는 `POST /api/ideas/{id}/open` 에 비밀번호를 넣어 받는다. 브라우저는 이것을
  30일간 들고 있고 **비밀번호 자체는 저장하지 않는다**
- 비밀번호는 PBKDF2-SHA256 5만 회 + 글마다 다른 소금. 반복수를 행에 같이 저장하므로
  나중에 올려도 옛 글이 안 깨진다. 5만인 이유는 Workers 무료 등급의 CPU 한도(10ms)
  때문이다 — 10만 회는 실측 7ms 라 한도에 너무 붙는다
- 무차별 대입은 **실패만** 센다. IP 해시 기준 10회/시간, 그리고 IP 를 갈아 가며
  두드리는 것을 막는 전체 60회/시간. 성공을 세면 자기 글 여러 개를 여는 것만으로
  올린 사람이 스스로 잠긴다

**비밀번호를 잊으면 되찾을 수 없다.** 되찾는 길을 만들려면 연락처를 받아야 하고,
그건 이 게시판이 하지 않기로 한 것이다. 대신 운영자가 그 글을 공개로 돌릴 수 있다
(아래 `private`). 공개로 돌려도 **비밀번호는 지우지 않으므로**, 다시 비공개로
내리면 올린 사람의 열쇠가 그대로 다시 듣는다.

옛 글처럼 비밀번호가 없는 잠긴 글은 **아무도 못 연다** — 운영자만 본다.
「설정 안 함」이 「누구나」가 되면 안 된다는 규칙이 여기에도 그대로 걸린다.

## 관리자 조작 (토큰으로)

검토 의견을 달고 상태를 바꾼다.

```bash
TOK=…   # ADMIN_TOKEN
SITE=https://joygolive.pages.dev   # .secrets.local 의 ADMIN_TOKEN

# 상태 + 검토 의견
curl -X PATCH $SITE/api/ideas -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"id":"…","status":"building","note":"…"}'

# 운영자 답글 (파란 강조로 붙는다)
curl -X POST $SITE/api/ideas/<id>/comments -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"text":"…"}'

# 문제 글 가리기 (지우지 않는다)
curl -X PATCH $SITE/api/ideas -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"id":"…","hidden":true}'

# 공개로 돌리기 — 비밀번호를 잊었을 때의 탈출구. 비밀번호는 그대로 둔다
curl -X PATCH $SITE/api/ideas -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"id":"…","private":false}'
```

상태값 넷 — `open`(검토 전) · `building`(만드는 중) · `shipped`(만들었음) ·
`declined`(안 만듦). **셋이 아니라 넷인 이유**는 「아직 안 봤다」와 「보고 안 만들기로
했다」가 구분돼야 하고 후자에 이유가 남아야 하기 때문이다(BOR 의 같은 규칙). 거기에
「만드는 중」과 「만들었다」를 더한 것은 이 게시판이 검토로 끝나지 않고 **만들어 주겠다는
약속**이기 때문이다.

## 스팸을 어떻게 다루나

익명을 유지하면서 할 수 있는 것은 **비싸게 만드는 것**까지다. 막는 것이 아니다.

- IP 해시 기준 속도 제한 — 제안 5건/시간, 댓글 20건/시간
- IP 원문은 저장하지 않는다. `RATE_SALT` 를 섞은 해시만 둔다 — 익명 게시판이
  IP 대장을 갖고 있으면 익명이 아니다
- 운영자 사칭 차단 — `joygoLive`·`운영자`·`admin` 류 이름은 익명으로 처리된다.
  owner 표시는 토큰 없이 얻을 수 없다
- 그래서 **사후 숨김이 같이 있어야 한다.** 지우지 않고 가리므로 기록은 남는다

더 세게 막아야 하면 Cloudflare Turnstile(무료)을 폼에 붙인다 — 지금은 안 붙였다.
쓸 사람이 없는 상태에서 먼저 붙이면 참여 문턱만 올린다.

## 새 글 알림

`DISCORD_WEBHOOK_URL` 로 새 제안·새 의견이 즉시 나간다. 응답을 붙잡지 않으므로
(`waitUntil`) Discord 가 느리거나 죽어도 글은 올라간다.

멘션 대상은 `DISCORD_MENTION_ID`, **없으면 `DISCORD_ADMIN_ID` 로 물러난다.**
2026-08-28 이전에는 물러나는 길이 없어서, 후자만 설정된 채로 알림이 **조용히**
올라오고 있었다. 제안이 비공개가 된 뒤로 디스코드가 새 글을 아는 유일한 길이라
이 침묵은 그냥 못 본다는 뜻이 된다.
