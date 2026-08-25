import { json, bad, clean, safeAuthor, ipHash, rateOk, newId, isAdmin, notify, snip } from '../../../_shared.js';

/** 댓글. 운영자 답글은 토큰이 있을 때만 owner 로 표시된다 — 표시가 자칭이면
 *  아무나 운영자인 척할 수 있고, 그러면 «검토 의견»이라는 말이 값을 잃는다. */
export async function onRequestPost(ctx) {
  const { request, env, params } = ctx;
  const db = env.DB;
  const ideaId = params.id;

  const found = await db
    .prepare('SELECT id, title, locked FROM ideas WHERE id = ? AND hidden = 0')
    .bind(ideaId).all();
  if (!found.results?.length) return bad('없는 제안입니다', 404);

  const body = await request.json().catch(() => null);
  const text = clean(body?.text, 2000);
  if (!text) return bad('내용을 적어 주세요');

  const owner = isAdmin(request, env);

  // 잠근 제안은 의견을 받지 않는다. **상태로 묶지 않는 이유**: 「만드는 중」은
  // 제안자가 세부를 보태는 구간이고, 「안 만듦」은 거절 사유에 반론할 자리다 —
  // 상태로 일괄해 닫으면 정작 필요한 대화가 먼저 막힌다. 그래서 소음이 실제로
  // 생긴 글만 골라 잠근다.
  // 운영자는 예외 — 닫힌 뒤에도 마무리 말을 남길 수 있어야 한다.
  if (!owner && found.results[0].locked) {
    return bad('이 제안의 의견은 닫혀 있습니다', 409);
  }

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

  // 내가 단 답글은 나에게 알리지 않는다.
  if (!owner) {
    notify(
      ctx, env,
      `**새 의견** · ${row.author ?? '익명'}\n` +
        `「${snip(found.results[0].title, 60)}」 에\n` +
        `${snip(row.text, 160)}\n` +
        `https://joygolive.pages.dev/#ideas`
    );
  }
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
