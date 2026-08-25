import { json, bad, ipHash, rateOk } from '../../_shared.js';

/* 짧은 비밀번호를 긴 토큰으로 바꿔 준다.
 *
 * 왜 나누나: 40자리 무작위 문자열을 폰에서 매번 붙여 넣는 것은 못 할 짓이라 결국
 * 안 쓰게 된다. 그렇다고 짧은 비밀번호를 그대로 관문에 쓰면 무차별 대입에 약하다.
 * 그래서 **사람은 짧은 것을 외우고, 기계는 긴 것을 쓴다** — 여기서 한 번 바꾼다.
 *
 * 무차별 대입 방어가 이 파일의 핵심이다. 짧은 비밀번호는 시도 횟수를 막지 않으면
 * 뚫린다. IP 해시 기준 시간당 5회로 조인다.
 *
 * 비밀번호가 설정돼 있지 않으면 **아무도** 통과하지 못한다 — 「설정 안 함」이
 * 「누구나」가 되면 안 된다.
 */
export async function onRequestPost({ request, env }) {
  const want = env.ADMIN_PASS;
  const token = env.ADMIN_TOKEN;
  if (!want || !token) return json({ error: 'not found' }, 404);

  const hash = await ipHash(request, env);
  if (!(await rateOk(env.DB, hash, 'unlock', 5, 3600))) {
    return bad('시도가 너무 잦습니다. 한 시간 뒤에 다시 해 주세요.', 429);
  }

  const body = await request.json().catch(() => null);
  const got = typeof body?.pass === 'string' ? body.pass : '';

  // 길이가 같을 때만 내용을 보고, 비교는 끝까지 돈다 — 몇 번째 글자에서 틀렸는지가
  // 걸린 시간으로 새어 나가지 않게.
  let diff = got.length === want.length ? 0 : 1;
  for (let i = 0; i < want.length; i++) {
    diff |= (got.charCodeAt(i) || 0) ^ want.charCodeAt(i);
  }
  if (diff !== 0) return bad('비밀번호가 다릅니다', 401);

  return json({ token });
}
