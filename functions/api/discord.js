import { json, newId, isAdmin } from '../_shared.js';

/* Discord 슬래시 명령 접수 창구.
 *
 * **여기서 리포트를 만들지 않는다.** 두 가지 이유다 —
 *   ① Discord 는 3초 안에 응답을 요구하는데 수집은 BOR 온체인 조회까지 있어 더 걸린다
 *   ② 데이터가 전부 맥에 있다 (UQI sqlite · AMC 로그 · 로컬 파일)
 * 그래서 여기서는 «요청이 있었다»만 D1 에 적고 즉시 답한다. 맥이 가져가 돌린 뒤
 * 웹훅으로 결과를 민다.
 */

/** Discord 는 모든 요청에 Ed25519 서명을 붙인다. 검증하지 않으면 이 주소를 아는
 *  누구나 큐를 채울 수 있다 — 인증이 아니라 «Discord 가 보낸 것이 맞는가»의 문제다. */
async function verify(request, body, publicKey) {
  const sig = request.headers.get('X-Signature-Ed25519');
  const ts = request.headers.get('X-Signature-Timestamp');
  if (!sig || !ts || !publicKey) return false;
  const hex = (s) => Uint8Array.from(s.match(/.{2}/g).map((b) => parseInt(b, 16)));
  try {
    const key = await crypto.subtle.importKey(
      'raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' }, key, hex(sig), new TextEncoder().encode(ts + body)
    );
  } catch {
    return false;
  }
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  // 맥이 «처리했다»고 알려 오는 경로. 서명이 아니라 관리자 토큰으로 가른다.
  if (isAdmin(request, env)) {
    const b = await request.json().catch(() => null);
    if (b?.done) {
      await env.DB.prepare(
        "UPDATE report_requests SET status='done', done_at=? WHERE id = ?"
      ).bind(new Date().toISOString(), b.done).run();
      return json({ ok: true });
    }
    return json({ error: 'done 이 필요합니다' }, 400);
  }

  const raw = await request.text();
  if (!(await verify(request, raw, env.DISCORD_PUBLIC_KEY))) {
    return new Response('bad signature', { status: 401 });
  }

  const body = JSON.parse(raw);

  // PING — Discord 가 Interactions URL 을 등록할 때 한 번 찔러 본다. 이게 통과 못 하면
  // 대시보드에서 URL 저장 자체가 거부된다.
  if (body.type === 1) return json({ type: 1 });

  if (body.type === 2) {
    const who =
      body.member?.user?.global_name ?? body.member?.user?.username ??
      body.user?.global_name ?? body.user?.username ?? null;
    await env.DB.prepare(
      "INSERT INTO report_requests (id, ts, who, status) VALUES (?, ?, ?, 'pending')"
    ).bind(newId(), new Date().toISOString(), who).run();

    // type 4 = 즉시 응답. deferred(5) 를 쓰면 상호작용 토큰으로 뒤이어 «수정»해야 하는데,
    // 그 토큰은 15분짜리라 맥이 늦으면 사라진다. 결과는 어차피 웹훅으로 같은 채널에
    // 올라가므로 여기서는 접수만 알리고 끝낸다.
    return json({
      type: 4,
      data: { content: '현황을 모으는 중입니다 — 잠시 뒤 올라옵니다.' },
    });
  }

  return json({ type: 4, data: { content: '알 수 없는 요청입니다.' } });
}

/** 맥이 «처리할 것 있나»를 물어보는 경로. */
export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: 'not found' }, 404);
  const r = await env.DB.prepare(
    "SELECT id, ts, who FROM report_requests WHERE status='pending' ORDER BY ts ASC LIMIT 10"
  ).all();
  return json({ pending: r.results ?? [] });
}
