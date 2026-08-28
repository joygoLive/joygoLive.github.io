import {
  json, bad, clean, isReserved, ipHash, rateOk, newId, isAdmin, notify, snip,
  newSalt, derivePass, ideaKey, PASS_ITER, stub,
} from '../_shared.js';

const LIMITS = { title: 120, problem: 2000, who: 500, outcome: 1000, author: 40, pass: 100 };
const PASS_MIN = 4;

/** 목록. 아이디어와 댓글을 한 번에 준다 — 펼칠 때마다 왕복하면 느리고, 이 규모에서
 *  전부 보내는 편이 단순하다. 숨긴 것은 나가지 않는다(관리자에게도 목록에선 뺀다 —
 *  숨김은 «없던 일»이 아니라 «안 보이게»이고, 되살리려면 DB 를 본다).
 *
 *  **잠긴 글은 여기서 열리지 않는다.** 목록에는 자물쇠 줄(제목·시각·상태)만 나가고,
 *  내용은 글마다 열쇠를 들고 /api/ideas/{id} 로 따로 받아 간다. 목록 한 번에
 *  여러 열쇠를 실어 보내는 길도 있었지만, 헤더 하나에 여러 비밀을 묶으면 어느
 *  글의 열쇠가 어디까지 통하는지가 흐려진다. 열쇠는 글 하나에만 듣는 편이 낫다. */
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const admin = isAdmin(request, env);
  // 관리자가 ?all=1 로 부르면 가린 것까지 준다. 가리기를 되돌리려면 그 글의 id 를
  // 알아야 하는데, 목록에서 사라진 뒤에는 알 길이 없다 — 되돌릴 수 없는 «가리기»는
  // 사실상 삭제이고, 그건 이 게시판이 하지 않기로 한 것이다.
  const all = admin && new URL(request.url).searchParams.get('all') === '1';
  const ideas = await db
    .prepare(
      `SELECT id, ts, author, title, problem, who, outcome, status, note, hidden, locked, private
         FROM ideas ${all ? '' : 'WHERE hidden = 0'} ORDER BY ts DESC LIMIT 200`
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
    ideas: (ideas.results ?? []).map((i) =>
      !admin && i.private
        ? stub(i)
        : {
            ...i, hidden: !!i.hidden, locked: !!i.locked, private: !!i.private,
            comments: byIdea.get(i.id) ?? [],
          }
    ),
  });
}

/** 제안 등록. **모든 칸이 필수다.**
 *
 *  문턱이 올라간다는 것은 안다 — 다 채우게 하면 「귀찮아서 안 쓴다」가 늘고, 원래는
 *  한 줄 요약만 받았다. 대신 이 게시판은 받은 제안을 검토하고 만들어 주겠다는
 *  약속이라, 무엇이 불편한지·누가 쓸지·되면 뭐가 달라지는지가 비면 판단할 것이
 *  없어 어차피 되물어야 한다. 되묻는 왕복이 빈칸보다 비싸다.
 *
 *  비밀번호가 필수인 이유는 다르다. 없이 올라간 글은 올린 사람도 다시 못 여는
 *  글이 된다 — 답을 댓글로 준다고 해 놓고 그 답을 볼 수 없게 만드는 것은 받을 수
 *  없는 곳으로 편지를 보내는 것과 같다.
 *
 *  **어느 칸이 빈지 하나씩 말해 준다.** 「입력값이 잘못됐습니다」로 뭉뚱그리면
 *  사람이 자기 화면을 뒤져 가며 찾아야 한다. */
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const db = env.DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽을 수 없습니다');
  }

  const need = [
    ['title', '한 줄 요약을 적어 주세요'],
    ['problem', '무엇이 불편한지 적어 주세요'],
    ['who', '누가 쓰게 될지 적어 주세요'],
    ['outcome', '되면 무엇이 달라지는지 적어 주세요'],
    ['author', '이름을 적어 주세요'],
  ];
  const v = {};
  for (const [k, msg] of need) {
    v[k] = clean(body[k], LIMITS[k]);
    if (!v[k]) return bad(msg);
  }
  // 이름이 필수인 자리에서는 사칭을 조용히 익명으로 바꾸지 않는다 — 적은 사람은
  // 자기 이름이 올라간 줄 아는데 화면에는 「익명」이 떠 있게 된다.
  // 화면이 이 문구를 「보내지 못했습니다 — …」 뒤에 붙이므로 여기서 또 대시를
  // 쓰면 한 줄에 대시가 둘이 된다.
  if (isReserved(v.author)) return bad('그 이름은 쓸 수 없습니다 (운영자로 오해됩니다)');

  // 공백을 털지 않는다 — 사람이 넣은 그대로가 비밀번호다. 길이만 본다.
  const pass = typeof body.pass === 'string' ? body.pass : '';
  if (pass.length < PASS_MIN) return bad(`비밀번호는 ${PASS_MIN}자 이상이어야 합니다`);
  if (pass.length > LIMITS.pass) return bad('비밀번호가 너무 깁니다');

  const hash = await ipHash(request, env);
  if (!(await rateOk(db, hash, 'idea', 5, 3600)))
    return bad('잠시 뒤에 다시 시도해 주세요 (한 시간에 5건까지)', 429);

  const salt = newSalt();
  const passHash = await derivePass(pass, salt);
  const row = { id: newId(), ts: new Date().toISOString(), ...v };
  await db
    .prepare(
      `INSERT INTO ideas (id, ts, author, title, problem, who, outcome, status,
                          private, pass_salt, pass_hash, pass_iter)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?)`
    )
    .bind(row.id, row.ts, row.author, row.title, row.problem, row.who, row.outcome,
          salt, passHash, PASS_ITER)
    .run();

  notify(
    ctx, env,
    `**새 제안** · ${row.author}\n` +
      `「${snip(row.title)}」\n` +
      `${snip(row.problem, 160)}\n` +
      `https://joygolive.pages.dev/#ideas`
  );
  // 열쇠를 바로 함께 준다. 올리자마자 비밀번호를 다시 묻는 것은, 방금 정한 것을
  // 그 자리에서 시험하는 셈이라 사람을 짜증나게 하고 오타를 발견하기만 한다.
  return json({
    idea: { ...row, status: 'open', note: null, private: true, locked: false, comments: [] },
    key: await ideaKey(passHash, row.id),
  }, 201);
}

/** 관리자 — 상태·검토의견 갱신, 숨김, 공개 전환. 토큰이 없으면 404 로 답한다.
 *  401 을 주면 «여기에 관리자 엔드포인트가 있다»는 사실을 알려 주는 셈이다. */
export async function onRequestPatch({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'not found' }, 404);
  const db = env.DB;
  const body = await request.json().catch(() => null);
  if (!body?.id) return bad('id 가 필요합니다');

  if (body.locked !== undefined) {
    await db.prepare('UPDATE ideas SET locked = ? WHERE id = ?').bind(body.locked ? 1 : 0, body.id).run();
  }
  if (body.hidden !== undefined) {
    await db.prepare('UPDATE ideas SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, body.id).run();
  }
  // 잠금 해제 — 비밀번호를 잊었을 때의 유일한 탈출구다. **비밀번호는 건드리지
  // 않는다.** 지워 버리면 나중에 다시 잠글 때 올린 사람이 자기 글에서 밀려난다.
  if (body.private !== undefined) {
    await db.prepare('UPDATE ideas SET private = ? WHERE id = ?').bind(body.private ? 1 : 0, body.id).run();
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
