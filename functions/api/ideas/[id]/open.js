import { json, bad, ipHash, rateCount, derivePass, constEq, ideaKey, PASS_ITER } from '../../../_shared.js';

/* 잠긴 제안을 연다. 비밀번호를 받아 **그 글에만 듣는 열쇠**로 바꿔 준다.
 *
 * 왜 비밀번호를 매번 쓰지 않고 한 번 바꾸나: 열쇠는 기기에 남지만 비밀번호는
 * 안 남는다. 브라우저에 저장된 값이 새더라도 그 글 하나만 열리지, 같은 비밀번호를
 * 쓴 다른 글까지 따라 열리지 않는다.
 *
 * **무차별 대입 방어가 이 파일의 핵심이다.** 사람이 정한 비밀번호는 대개 짧고,
 * 짧은 것은 시도 횟수를 막지 않으면 뚫린다. admin/unlock.js 와 같은 두 겹을 쓴다 —
 * IP 해시 기준 한도, 그리고 IP 를 갈아 가며 두드리는 것을 막는 전체 실패 한도.
 */
export async function onRequestPost({ request, env, params }) {
  const db = env.DB;

  // **실패만 센다.** rateOk 를 쓰면 성공한 시도까지 한도에 쌓여, 기기 여러 대에서
  // 자기 글 몇 개를 여는 것만으로 올린 사람이 스스로 잠긴다 — 비밀번호를 맞힌
  // 사람을 막는 것은 이 한도가 하려는 일이 아니다.
  const hash = await ipHash(request, env);
  if ((await rateCount(db, hash, 'ideaopen_fail', 3600)) >= 10) {
    return bad('시도가 너무 잦습니다. 한 시간 뒤에 다시 해 주세요.', 429);
  }
  // IP별 제한만으로는 못 지킨다 — 대리 서버로 IP 를 갈아 가며 두드리면 한도가
  // 의미를 잃는다. 그래서 실패는 IP 와 무관하게도 한 번 더 센다.
  if ((await rateCount(db, 'GLOBAL', 'ideaopen_fail', 3600)) >= 60) {
    return bad('지금은 잠겨 있습니다. 잠시 뒤에 다시 해 주세요.', 429);
  }

  const body = await request.json().catch(() => null);
  const pass = typeof body?.pass === 'string' ? body.pass : '';
  // **길이를 먼저 본다.** 이 값은 PBKDF2 로 들어가므로, 1MB 짜리를 던지면 해시 한 번에
  // Worker CPU 예산이 날아간다(전에 1102 로 겪었다). 맞는 비밀번호는 100자를 넘지
  // 않으므로(등록 때 LIMITS.pass 로 막는다) 길면 볼 것도 없이 틀린 값이다.
  if (pass.length > 100) return bad('비밀번호가 다릅니다', 401);

  const found = await db
    .prepare('SELECT id, pass_salt, pass_hash, pass_iter, private FROM ideas WHERE id = ? AND hidden = 0')
    .bind(params.id).all();
  const i = found.results?.[0];

  // 없는 글과 틀린 비밀번호를 같은 말로 돌려준다 — 답이 갈리면 어떤 id 가 실재하는지
  // 를 묻는 도구가 된다. 비밀번호가 아예 없는 글(옛 글)도 여기서 함께 막힌다.
  const wrong = async () => {
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare('INSERT INTO rate (ip_hash, kind, ts) VALUES (?, ?, ?)').bind(hash, 'ideaopen_fail', now),
      db.prepare('INSERT INTO rate (ip_hash, kind, ts) VALUES (?, ?, ?)').bind('GLOBAL', 'ideaopen_fail', now),
    ]);
    return bad('비밀번호가 다릅니다', 401);
  };
  if (!i || !i.pass_hash || !i.pass_salt || !pass) return wrong();

  const got = await derivePass(pass, i.pass_salt, i.pass_iter || PASS_ITER);
  if (!constEq(got, i.pass_hash)) return wrong();

  return json({ key: await ideaKey(i.pass_hash, i.id) });
}
