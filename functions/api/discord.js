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

  // ── 자동완성 (type 4) ────────────────────────────────────────────────────
  // 폰에서 «20260824235648378-ymc2zz» 를 칠 수는 없다. 제목을 보여 주고 값으로는
  // id 를 넘긴다 — 고르는 사람은 제목만 보면 된다.
  if (body.type === 4) {
    const name = body.data?.name;
    const opts = body.data?.options ?? [];
    const undo = !!opts.find((o) => o.name === 'undo')?.value;
    const wantHidden = name === 'hide' && undo;
    const wantLocked = name === 'lock' ? (undo ? 1 : 0) : null;
    const q = (opts.find((o) => o.focused)?.value ?? '').toString().toLowerCase();

    const rows = await env.DB.prepare(
      `SELECT id, title, status FROM ideas WHERE hidden = ?` +
        (wantLocked === null ? '' : ' AND locked = ?') +
        ' ORDER BY ts DESC LIMIT 25'
    ).bind(...(wantLocked === null ? [wantHidden ? 1 : 0] : [0, wantLocked])).all();

    const LABEL = { open: '검토 전', building: '만드는 중', shipped: '만들었음', declined: '안 만듦' };
    const choices = (rows.results ?? [])
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .slice(0, 25)
      .map((r) => ({ name: `[${LABEL[r.status] ?? r.status}] ${r.title}`.slice(0, 100), value: r.id }));
    return json({ type: 8, data: { choices } });
  }

  if (body.type === 2) {
    const user = body.member?.user ?? body.user ?? {};
    const who = user.global_name ?? user.username ?? null;
    const name = body.data?.name;
    const arg = (n) => body.data?.options?.find((o) => o.name === n)?.value;
    const reply = (content) => json({ type: 4, data: { content, flags: 64 } });  // flags 64 = 나에게만

    // 검토와 가리기는 «joygoLive 가 한 말»이 된다. 서버의 아무나 할 수 있으면
    // 그 이름이 값을 잃는다. 설정 전에는 **아무도** 통과하지 못한다 —
    // «설정 안 함»이 «누구나»가 되면 안 된다.
    if (name === 'review' || name === 'hide' || name === 'reply' || name === 'lock') {
      if (!env.DISCORD_ADMIN_ID) {
        return reply(
          `아직 관리자가 지정되지 않았습니다. 이 값을 설정에 넣어 주세요 — 당신의 ID: \`${user.id}\``
        );
      }
      if (user.id !== env.DISCORD_ADMIN_ID) return reply('이 명령은 운영자만 쓸 수 있습니다.');

      const id = arg('idea');
      if (!id) return reply('제안을 고르지 않았습니다.');
      const found = await env.DB.prepare('SELECT title FROM ideas WHERE id = ?').bind(id).all();
      if (!found.results?.length) return reply('없는 제안입니다.');
      const title = found.results[0].title;

      // 검토 의견과 답글은 쓰임이 다르다 — 검토는 **결론**(만들지 말지, 어디까지)이고
      // 답글은 **대화**(되묻기, 조건 협의)다. 화면에서도 자리가 다르다.
      if (name === 'reply') {
        const text = arg('text');
        if (!text) return reply('내용이 없습니다.');
        await env.DB.prepare(
          "INSERT INTO comments (id, idea_id, ts, author, text, owner) VALUES (?,?,?,?,?,1)"
        ).bind(newId(), id, new Date().toISOString(), 'joygoLive', text).run();
        return reply(`「${title}」 에 답글을 달았습니다.\n${text}`);
      }

      if (name === 'lock') {
        const undo = !!arg('undo');
        await env.DB.prepare('UPDATE ideas SET locked = ? WHERE id = ?').bind(undo ? 0 : 1, id).run();
        return reply(`${undo ? '의견을 다시 열었습니다' : '의견을 잠갔습니다'} — 「${title}」`);
      }

      if (name === 'hide') {
        const undo = !!arg('undo');
        await env.DB.prepare('UPDATE ideas SET hidden = ? WHERE id = ?').bind(undo ? 0 : 1, id).run();
        return reply(`${undo ? '되돌렸습니다' : '가렸습니다'} — 「${title}」`);
      }

      const status = arg('status');
      const note = arg('note') ?? null;
      await env.DB.prepare(
        'UPDATE ideas SET status = ?, note = COALESCE(?, note) WHERE id = ?'
      ).bind(status, note, id).run();
      const L = { open: '검토 전', building: '만드는 중', shipped: '만들었음', declined: '안 만듦' };
      return reply(`「${title}」 → **${L[status] ?? status}**${note ? `\n${note}` : ''}`);
    }
    if (name !== 'report') return reply('알 수 없는 명령입니다.');
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
