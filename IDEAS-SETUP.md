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

## 배포 (계정 필요)

1. **Cloudflare 계정 생성** → dash.cloudflare.com (무료)
2. **D1 생성** — Workers & Pages → D1 → Create → 이름 `joygolive-ideas`.
   만들어진 **Database ID** 를 `wrangler.toml` 의 `database_id` 에 넣는다.
3. **스키마 적용**
   ```bash
   npx wrangler d1 execute joygolive-ideas --remote --file=schema.sql
   ```
4. **Pages 프로젝트 연결** — Workers & Pages → Create → Pages → Connect to Git →
   `joygoLive/joygoLive.github.io` 선택. 빌드 명령 **없음**, 출력 디렉토리 **`/`**.
5. **바인딩** — 프로젝트 Settings → Functions → D1 bindings 에
   변수명 `DB` → `joygolive-ideas`.
6. **비밀값** — Settings → Environment variables 에 (암호화로)
   - `ADMIN_TOKEN` — 검토 의견을 다는 데 쓴다. **길고 무작위로.**
   - `RATE_SALT` — IP 해시용 소금. 아무 무작위 문자열.
7. 배포되면 `*.pages.dev` 주소가 생긴다. 확인 후 Custom domain 을 붙인다.

## 관리자 조작 (토큰으로)

검토 의견을 달고 상태를 바꾼다.

```bash
TOK=…   # ADMIN_TOKEN
SITE=https://joygolive.pages.dev

# 상태 + 검토 의견
curl -X PATCH $SITE/api/ideas -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"id":"…","status":"building","note":"…"}'

# 운영자 답글 (파란 강조로 붙는다)
curl -X POST $SITE/api/ideas/<id>/comments -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"text":"…"}'

# 문제 글 가리기 (지우지 않는다)
curl -X PATCH $SITE/api/ideas -H 'Content-Type: application/json' -H "X-Admin-Token: $TOK" \
  -d '{"id":"…","hidden":true}'
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
