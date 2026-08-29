// 게시판 공용 — 응답 형식, 입력 정리, 속도 제한.

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export const bad = (msg, status = 400) => json({ error: msg }, status);

/** 길이 상한을 두고 앞뒤 공백을 턴다. 빈 문자열은 null 로 — DB 에서 «있는데 빈 값»과
 *  «안 낸 값»이 갈리면 화면에서 둘을 다르게 처리해야 한다. */
export function clean(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}

/** IP 를 그대로 저장하지 않는다. 익명 게시판이 IP 대장을 갖고 있으면 익명이 아니다.
 *  솔트를 섞어 해시만 남기므로, DB 가 새도 누가 썼는지는 안 나온다. */
export async function ipHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  const salt = env.RATE_SALT ?? 'joygolive-local-dev';
  const buf = new TextEncoder().encode(`${salt}:${ip}`);
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 창(window) 안에서 limit 회를 넘으면 막는다. 넘지 않으면 이번 시도를 기록한다.
 *  스팸을 「막는」 것이 아니라 「비싸게」 만드는 장치다 — 익명을 유지하면서 할 수 있는
 *  것은 여기까지이고, 그래서 사후 숨김(hidden)이 같이 있어야 한다. */
export async function rateOk(db, hash, kind, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - windowSec;
  await db.prepare('DELETE FROM rate WHERE ts < ?').bind(now - 86400).run();
  const { results } = await db
    .prepare('SELECT COUNT(*) AS n FROM rate WHERE ip_hash = ? AND kind = ? AND ts >= ?')
    .bind(hash, kind, from)
    .all();
  if ((results?.[0]?.n ?? 0) >= limit) return false;
  await db.prepare('INSERT INTO rate (ip_hash, kind, ts) VALUES (?, ?, ?)').bind(hash, kind, now).run();
  return true;
}

/** 세기만 한다 — 기록하지 않는다.
 *  rateOk 는 확인과 기록을 함께 하므로, «실패만 세고 싶은» 자리에는 쓸 수 없다.
 *  그대로 쓰면 성공한 시도까지 한도에 쌓여 정상 사용자가 스스로 잠긴다. */
export async function rateCount(db, hash, kind, windowSec) {
  const from = Math.floor(Date.now() / 1000) - windowSec;
  const { results } = await db
    .prepare('SELECT COUNT(*) AS n FROM rate WHERE ip_hash = ? AND kind = ? AND ts >= ?')
    .bind(hash, kind, from)
    .all();
  return results?.[0]?.n ?? 0;
}

/** 정렬 가능한 id. 시각이 앞에 오므로 목록 정렬이 id 만으로도 된다. */
export const newId = () =>
  `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;

/** 관리자 조작인가. 토큰이 설정돼 있지 않으면 **아무도** 관리자가 아니다 —
 *  «설정 안 함»이 «누구나 통과»가 되면 안 된다. */
export function isAdmin(request, env) {
  const want = env.ADMIN_TOKEN;
  if (!want) return false;
  const got = request.headers.get('X-Admin-Token');
  return typeof got === 'string' && got.length === want.length && got === want;
}

/** 운영자를 사칭하는 이름을 막는다. owner 표시(파란 테두리)는 토큰 없이 못 얻지만,
 *  **이름 자체를 «joygoLive»로 적는 것**은 별개다 — 스타일만 다르고 이름이 그대로
 *  뜨면 읽는 사람은 그 차이를 못 읽는다. 검토 의견이라는 말이 값을 가지려면
 *  그 이름을 아무나 못 써야 한다. */
const RESERVED = /joygo\s*live|조이고\s*라이브|운영자|관리자|admin|official/i;
export function safeAuthor(v, max) {
  const s = clean(v, max);
  if (!s) return null;
  return RESERVED.test(s) ? null : s;   // 사칭이면 이름 없이 = 익명으로 올라간다
}

/** 사칭하는 이름인가. **이름이 필수인 자리에서는 조용히 익명으로 바꾸면 안 된다** —
 *  적은 사람은 자기 이름이 올라간 줄 아는데 화면에는 「익명」이 떠 있게 된다.
 *  거기서는 이걸로 먼저 걸러 내고 왜 안 되는지 말해 준다. safeAuthor 의 조용한
 *  처리는 이름이 원래 없어도 되는 자리(댓글)에서만 맞다. */
export const isReserved = (v) => RESERVED.test(String(v ?? ''));

/** 새 글이 올라오면 Discord 로 알린다.
 *
 * **응답을 붙잡지 않는다.** waitUntil 로 뒤에서 보내므로 Discord 가 느리거나 죽어도
 * 제안을 올린 사람은 기다리지 않는다. 실패해도 삼킨다 — 알림이 안 간 것보다
 * **글이 안 올라간 것**이 훨씬 나쁘고, 글은 이미 D1 에 들어가 있다.
 *
 * 웹훅이 설정 안 돼 있으면 조용히 넘어간다. 알림은 있으면 좋은 것이지 전제가 아니다.
 */
export function notify(ctx, env, text) {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  // 멘션 대상. DISCORD_ADMIN_ID 로 물러난다 — 운영자 한 사람뿐인 채널에서 굳이
  // 변수를 둘 두게 하면, 실제로 그랬듯 **하나만 설정되고 알림은 조용히 안 울린다.**
  // 제안이 비공개가 된 뒤로 디스코드가 새 글을 아는 유일한 길이라 더 그렇다.
  const who = env.DISCORD_MENTION_ID || env.DISCORD_ADMIN_ID;
  const mention = who ? `<@${who}> ` : '';
  const body = JSON.stringify({
    content: `${mention}${text}`.slice(0, 1900),
    // 사용자가 쓴 글이 그대로 들어간다. @everyone 이나 역할 멘션이 섞여 있으면
    // 채널 전체가 울린다 — 아무나 익명으로 쓸 수 있는 글에 그 힘을 주면 안 된다.
    allowed_mentions: { parse: [], users: who ? [who] : [] },
  });
  ctx.waitUntil(
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
  );
}

/** 알림 한 줄에 넣을 만큼만 자른다. */
export const snip = (s, n = 120) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/* ── 제안 잠금 ──────────────────────────────────────────────────────────────
 *
 * 제안은 올린 사람과 운영자만 본다. 목적은 사생활이 아니라 **도용 방지**다 —
 * 아직 만들어지지 않은 아이디어가 그대로 공개돼 있으면 먼저 가져가는 사람이 이긴다.
 *
 * 신원 확인은 하지 않는다(계정도 연락처도 만들지 않기로 한 게 이 게시판의 전제다).
 * 대신 **올릴 때 정한 비밀번호를 아는 사람**을 올린 사람으로 본다.
 *
 * 그래서 비밀번호를 잊으면 되돌릴 길이 없다. 되돌릴 길을 만들려면 연락처를 받아야
 * 하고, 그러면 이 게시판이 하지 않기로 한 것을 하게 된다. 대신 운영자가 그 글을
 * 공개로 돌리는 탈출구를 둔다(ideas.PATCH 의 private).
 */

/** PBKDF2 반복수. **행마다 저장한다** — 바꿔도 옛 글이 안 깨지게(open.js 가 그 행의
 *  pass_iter 로 검증한다).
 *
 *  **5만에서 1만으로 낮춘다 (2026-08-30).** 5만을 고를 때의 계산은 「10ms 한도에
 *  3.7ms 면 여유가 있다」였는데, 그 3.7ms 는 **개발 기계에서 잰 값**이다. 엣지 CPU 는
 *  그보다 2~4배 느리므로 실제로는 8~16ms 이고, 한도 10ms 위에 걸친다.
 *  제안 등록이 「보내지 못했습니다」로 끝나는 일이 실제로 났고(원인 미확정이지만
 *  이것이 가장 유력했다), 여기서 사는 여유가 그 위험보다 값이 없다.
 *
 *  **깎는 것이 거의 없기 때문이다.** 온라인 추측은 반복수와 무관하게 시간당 60회로
 *  막혀 있다(open.js — IP당 10회 + IP 무관 전체 60회). 그러니 반복수는 DB 가 통째로
 *  샜을 때의 오프라인 대입에만 작용하는데, PASS_MIN 이 4자라 조합이 170만뿐이다 —
 *  5만이든 1만이든 GPU 로 9초와 2초의 차이이고 **둘 다 안 막는다.**
 *  짧은 비밀번호를 지키는 실질은 반복수가 아니라 시도 횟수 제한에서 나온다. */
export const PASS_ITER = 10000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

/** 비밀번호 → 저장할 해시. 소금은 글마다 다르므로, 같은 비밀번호를 쓴 글 둘이
 *  같은 해시를 갖지 않는다 — DB 만 보고 «이 둘은 같은 사람»이라고 못 읽게. */
export async function derivePass(pass, salt, iter = PASS_ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter },
    key, 256
  );
  return hex(bits);
}

/** 기기에 저장할 열쇠. **저장된 해시를 그대로 주지 않는다** — 브라우저에 남는 값과
 *  DB 에 있는 값이 같으면, 한쪽이 새는 순간 다른 쪽도 같이 새는 셈이 된다. */
export async function ideaKey(passHash, ideaId) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${passHash}:${ideaId}`));
  return hex(d);
}

/** 길이가 같을 때만 내용을 보고, 비교는 끝까지 돈다 — 몇 번째에서 틀렸는지가
 *  걸린 시간으로 새어 나가지 않게. */
export function constEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 이 요청이 그 글을 볼 자격이 있는가. 공개 글이면 누구나, 잠긴 글이면 열쇠를 가진
 *  사람만. **비밀번호가 없는 잠긴 글은 아무도 못 연다** — 「설정 안 함」이
 *  「누구나」가 되면 안 된다는 규칙이 여기에도 그대로 걸린다. */
export async function canOpen(request, idea) {
  if (!idea.private) return true;
  if (!idea.pass_hash) return false;
  const got = request.headers.get('X-Idea-Key');
  if (typeof got !== 'string' || !got) return false;
  return constEq(got, await ideaKey(idea.pass_hash, idea.id));
}

/** 제목의 앞부분만. 올린 사람은 자기가 쓴 문장이라 몇 자만 봐도 알아보지만,
 *  처음 보는 사람에게는 무엇을 만들자는 것인지가 안 잡히는 길이다.
 *
 *  **길이에 비례시키되 상한을 둔다.** 고정 글자수로 자르면 짧은 제목일수록 더 많이
 *  드러나는데, 한 줄이 짧을수록 그 한 줄이 곧 아이디어 전부다. 그래서 짧은 것은
 *  비율로 더 세게 자르고, 긴 것은 10자에서 멈춘다.
 *
 *  자른 티(…)를 반드시 남긴다 — 잘린 줄 모르면 저게 제목 전부인 줄 읽는다. */
export function titleHint(title) {
  const ch = [...String(title ?? '').trim()];
  // 제목보다 짧게 자른다 — 두 글자짜리 제목에 「앞 두 글자」를 주면 전부 준 것이다.
  const n = Math.max(1, Math.min(10, ch.length - 1, Math.ceil(ch.length * 0.4)));
  return `${ch.slice(0, n).join('').trimEnd()}…`;
}

/** 잠긴 글을 바깥에 내보낼 때의 모습.
 *
 *  **나가는 것** — 제목 · 시각 · 상태. 도용을 막자고 글을 통째로 숨기면 「그
 *  아이디어가 그때 이미 여기 있었다」는 사실까지 같이 사라지는데, 나중에 선후를
 *  다툴 때 근거가 되는 것이 바로 그 자국이다. 올린 사람이 자기 글을 찾아 열려면
 *  목록에 자리도 있어야 한다.
 *
 *  **안 나가는 것** — 불편한 점 · 대상 · 기대효과 · 이름 · 검토 의견 · 의견 전부.
 *
 *  제목은 통째로 내보내지 않는다. 폼이 제목에 「한 문장으로」를 요구하므로 제목은
 *  사실상 아이디어 그 자체다. 그렇다고 아주 가리면 올린 사람이 자기 글을 못 찾아
 *  나중에 내용을 보태러 돌아올 수 없다 — 그래서 앞부분만 남긴다(titleHint).
 *  완전히 가리려면 아래 title 한 줄만 지우면 된다. */
export const stub = (i) => ({
  id: i.id, ts: i.ts, title: titleHint(i.title), status: i.status,
  // 화면에게 «이건 잘린 것»이라고 대놓고 말해 준다. 내용이 비었는지로 짐작하게
  // 두면, 본문 없이 제목만 쓴 진짜 글이 자물쇠로 그려진다.
  stub: true, private: true, locked: !!i.locked, comments: [],
});
