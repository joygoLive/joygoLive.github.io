import { json, bad, clean, safeAuthor, ipHash, rateOk, newId, isAdmin, notify, snip } from '../_shared.js';

const LIMITS = { title: 120, problem: 2000, who: 500, outcome: 1000, author: 40 };

/** 목록. 아이디어와 댓글을 한 번에 준다 — 펼칠 때마다 왕복하면 느리고, 이 규모에서
 *  전부 보내는 편이 단순하다. 숨긴 것은 나가지 않는다(관리자에게도 목록에선 뺀다 —
 *  숨김은 «없던 일»이 아니라 «안 보이게»이고, 되살리려면 DB 를 본다). */
export async function onRequestGet({ env }) {
  const db = env.DB;
  const ideas = await db
    .prepare(
      `SELECT id, ts, author, title, problem, who, outcome, status, note
         FROM ideas WHERE hidden = 0 ORDER BY ts DESC LIMIT 200`
    )
    .all();
  const comments = await db
    .prepare(
      `SELECT id, idea_id, ts, author, text, owner
         FROM comments WHERE hidden = 0 ORDER BY ts ASC LIMIT 2000`
    )
    .all();

  const byIdea = new Map();
  for (const c of comments.results ?? []) {
    if (!byIdea.has(c.idea_id)) byIdea.set(c.idea_id, []);
    byIdea.get(c.idea_id).push({ ...c, owner: !!c.owner });
  }
  return json({
    ideas: (ideas.results ?? []).map((i) => ({ ...i, comments: byIdea.get(i.id) ?? [] })),
  });
}

/** 제안 등록. 필요한 것은 한 줄 요약뿐이다 — 양식을 다 채우게 강제하면 «귀찮아서 안
 *  쓴다»가 되고, 그러면 받을 의견이 없다. 나머지는 있으면 좋은 것이다. */
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const db = env.DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽을 수 없습니다');
  }

  const title = clean(body.title, LIMITS.title);
  if (!title) return bad('한 줄 요약은 있어야 합니다');

  const hash = await ipHash(request, env);
  if (!(await rateOk(db, hash, 'idea', 5, 3600)))
    return bad('잠시 뒤에 다시 시도해 주세요 (한 시간에 5건까지)', 429);

  const row = {
    id: newId(),
    ts: new Date().toISOString(),
    author: safeAuthor(body.author, LIMITS.author),
    title,
    problem: clean(body.problem, LIMITS.problem),
    who: clean(body.who, LIMITS.who),
    outcome: clean(body.outcome, LIMITS.outcome),
  };
  await db
    .prepare(
      `INSERT INTO ideas (id, ts, author, title, problem, who, outcome, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
    )
    .bind(row.id, row.ts, row.author, row.title, row.problem, row.who, row.outcome)
    .run();

  notify(
    ctx, env,
    `**새 제안** · ${row.author ?? '익명'}\n` +
      `「${snip(row.title)}」\n` +
      (row.problem ? `${snip(row.problem, 160)}\n` : '') +
      `https://joygolive.pages.dev/#ideas`
  );
  return json({ idea: { ...row, status: 'open', note: null, comments: [] } }, 201);
}

/** 관리자 — 상태·검토의견 갱신, 숨김. 토큰이 없으면 404 로 답한다. 401 을 주면
 *  «여기에 관리자 엔드포인트가 있다»는 사실을 알려 주는 셈이다. */
export async function onRequestPatch({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'not found' }, 404);
  const db = env.DB;
  const body = await request.json().catch(() => null);
  if (!body?.id) return bad('id 가 필요합니다');

  if (body.hidden !== undefined) {
    await db.prepare('UPDATE ideas SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, body.id).run();
  }
  if (body.status || body.note !== undefined) {
    const ok = ['open', 'building', 'shipped', 'declined'];
    if (body.status && !ok.includes(body.status)) return bad('상태값이 이상합니다');
    await db
      .prepare('UPDATE ideas SET status = COALESCE(?, status), note = COALESCE(?, note) WHERE id = ?')
      .bind(body.status ?? null, clean(body.note ?? '', 2000), body.id)
      .run();
  }
  return json({ ok: true });
}
