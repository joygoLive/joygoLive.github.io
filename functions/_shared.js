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
  const mention = env.DISCORD_MENTION_ID ? `<@${env.DISCORD_MENTION_ID}> ` : '';
  const body = JSON.stringify({
    content: `${mention}${text}`.slice(0, 1900),
    // 사용자가 쓴 글이 그대로 들어간다. @everyone 이나 역할 멘션이 섞여 있으면
    // 채널 전체가 울린다 — 아무나 익명으로 쓸 수 있는 글에 그 힘을 주면 안 된다.
    allowed_mentions: { parse: [], users: env.DISCORD_MENTION_ID ? [env.DISCORD_MENTION_ID] : [] },
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
