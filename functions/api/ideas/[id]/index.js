import { json, isAdmin, canOpen } from '../../../_shared.js';

/* 제안 하나를 통째로. 목록(/api/ideas)이 자물쇠 줄만 주므로, 열쇠를 가진 사람은
 * 여기로 와서 내용과 의견을 받아 간다.
 *
 * 자격이 없으면 **404 로 답한다.** 403 을 주면 「그 id 는 실재하고 잠겨 있다」를
 * 알려 주는 셈인데, 목록에 이미 있는 글이라 큰 비밀은 아니어도 굳이 확인해 줄
 * 이유가 없다 — 게다가 없는 id 와 답이 갈리면 id 를 훑는 도구가 된다.
 */
export async function onRequestGet({ request, env, params }) {
  const db = env.DB;
  const admin = isAdmin(request, env);
  const found = await db
    .prepare(
      `SELECT id, ts, author, title, problem, who, outcome, status, note, hidden, locked,
              private, pass_hash
         FROM ideas WHERE id = ?${admin ? '' : ' AND hidden = 0'}`
    )
    .bind(params.id).all();
  const i = found.results?.[0];
  if (!i) return json({ error: 'not found' }, 404);
  if (!admin && !(await canOpen(request, i))) return json({ error: 'not found' }, 404);

  const cs = await db
    .prepare('SELECT id, idea_id, ts, author, text, owner FROM comments WHERE idea_id = ? AND hidden = 0 ORDER BY ts ASC')
    .bind(i.id).all();

  // pass_hash 는 절대 내보내지 않는다 — 저장된 값이 나가면 열쇠를 직접 만들 수 있다.
  const { pass_hash, ...rest } = i;
  return json({
    idea: {
      ...rest, hidden: !!i.hidden, locked: !!i.locked, private: !!i.private,
      comments: (cs.results ?? []).map((c) => ({ ...c, owner: !!c.owner })),
    },
  });
}
