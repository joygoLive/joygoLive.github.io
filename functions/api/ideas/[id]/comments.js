import { json, bad, clean, safeAuthor, ipHash, rateOk, newId, isAdmin } from '../../../_shared.js';

/** 댓글. 운영자 답글은 토큰이 있을 때만 owner 로 표시된다 — 표시가 자칭이면
 *  아무나 운영자인 척할 수 있고, 그러면 «검토 의견»이라는 말이 값을 잃는다. */
export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const ideaId = params.id;

  const found = await db.prepare('SELECT id FROM ideas WHERE id = ? AND hidden = 0').bind(ideaId).all();
  if (!found.results?.length) return bad('없는 제안입니다', 404);

  const body = await request.json().catch(() => null);
  const text = clean(body?.text, 2000);
  if (!text) return bad('내용을 적어 주세요');

  const owner = isAdmin(request, env);
  if (!owner) {
    const hash = await ipHash(request, env);
    if (!(await rateOk(db, hash, 'comment', 20, 3600)))
      return bad('잠시 뒤에 다시 시도해 주세요 (한 시간에 20건까지)', 429);
  }

  const row = {
    id: newId(),
    idea_id: ideaId,
    ts: new Date().toISOString(),
    author: owner ? 'joygoLive' : safeAuthor(body?.author, 40),
    text,
    owner,
  };
  await db
    .prepare('INSERT INTO comments (id, idea_id, ts, author, text, owner) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.idea_id, row.ts, row.author, row.text, owner ? 1 : 0)
    .run();
  return json({ comment: row }, 201);
}

/** 관리자 — 댓글 숨김. */
export async function onRequestPatch({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'not found' }, 404);
  const body = await request.json().catch(() => null);
  if (!body?.id) return bad('id 가 필요합니다');
  await env.DB.prepare('UPDATE comments SET hidden = ? WHERE id = ?')
    .bind(body.hidden ? 1 : 0, body.id)
    .run();
  return json({ ok: true });
}
