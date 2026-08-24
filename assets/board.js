/* 아이디어 게시판 — 익명·공개. BOR 의 절별 의견과 같은 규칙을 따른다:
 * 덧붙이기만 하고 고치지 않으며, 「아직 안 봤다」와 「보고 안 만들기로 했다」를
 * 구분하고 후자에는 이유를 남긴다.
 *
 * i18n 은 페이지의 _L 이 아니라 여기 있다 — 이 화면은 서버 응답으로 다시 그려지므로
 * data-i18n 속성으로는 덮이지 않는다. setLang 이 쏘는 joygo:lang 을 받아 다시 그린다. */
(function () {
  const API = '/api/ideas';
  const T = {
    ko: {
      propose: '아이디어 제안하기', list: '들어온 제안', pending: '검토 전 %d',
      title: '한 줄로 말하면', titleH: '무엇을 만들었으면 하는지 한 문장으로.',
      problem: '무엇이 불편한가요', problemH: '지금은 어떻게 하고 있고, 어디가 막히는지. 이게 있으면 만들 물건이 훨씬 또렷해집니다.',
      who: '누가 쓰게 될까요', whoH: '본인만 쓸 것인지, 비슷한 사람이 더 있는지.',
      outcome: '되면 무엇이 달라지나요', outcomeH: '만들어졌다고 치고, 그래서 뭐가 좋아지는지.',
      author: '이름', authorH: '비워 두면 익명으로 올라갑니다.',
      anon: '익명', submit: '제안 올리기', sending: '올리는 중…',
      notice: '적으신 내용은 전부 이 페이지에 공개됩니다. 이름·연락처·개인정보는 적지 마세요 — 답은 여기 댓글로 드리므로 연락처가 필요 없습니다. 한 번 올라간 글은 지우지 않고 필요하면 가립니다.',
      need: '한 줄 요약은 있어야 합니다', done: '올라갔습니다. 검토하고 여기에 답하겠습니다.',
      fail: '보내지 못했습니다', reply: '의견 남기기', send: '남기기',
      empty: '아직 들어온 제안이 없습니다. 처음이 되어 주세요.',
      loading: '불러오는 중…', off: '지금은 제안을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
      review: '검토 의견', cmtN: '의견 %d',
      st: { open: '검토 전', building: '만드는 중', shipped: '만들었음', declined: '안 만듦' },
    },
    en: {
      propose: 'Propose an idea', list: 'Ideas submitted', pending: '%d unreviewed',
      title: 'In one line', titleH: 'One sentence on what you would like built.',
      problem: 'What is awkward today', problemH: 'How you do it now and where it stalls. This is what makes the thing to build concrete.',
      who: 'Who would use it', whoH: 'Only you, or are there others like you.',
      outcome: 'What changes if it exists', outcomeH: 'Assume it is built — what gets better.',
      author: 'Name', authorH: 'Leave empty to post anonymously.',
      anon: 'anonymous', submit: 'Post it', sending: 'Posting…',
      notice: 'Everything you write here is published on this page. Do not include names, contact details, or personal data — replies come as comments here, so no contact details are needed. Posts are not deleted; they are hidden if they have to be.',
      need: 'The one-line summary is required', done: 'Posted. It will be reviewed and answered here.',
      fail: 'Could not send', reply: 'Leave a comment', send: 'Send',
      empty: 'No ideas yet. Be the first.',
      loading: 'Loading…', off: 'Submissions are unavailable right now. Please try again shortly.',
      review: 'Review', cmtN: '%d comments',
      st: { open: 'Unreviewed', building: 'Building', shipped: 'Built', declined: 'Not building' },
    },
  };

  let lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
  let t = T[lang];
  let ideas = null;
  let loadFailed = false;
  const openSet = new Set();

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const when = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function field(id, key, tag) {
    const hint = t[key + 'H'];
    return `<div class="ff">
      <label for="${id}">${esc(t[key])}</label>
      <span class="hint">${esc(hint)}</span>
      ${tag === 'textarea' ? `<textarea id="${id}" rows="3"></textarea>` : `<input id="${id}" type="text" />`}
    </div>`;
  }

  function renderForm() {
    const el = $('ideaForm');
    if (!el) return;
    el.innerHTML = `
      <p class="form-note">${esc(t.notice)}</p>
      ${field('f_title', 'title')}
      ${field('f_problem', 'problem', 'textarea')}
      ${field('f_who', 'who', 'textarea')}
      ${field('f_outcome', 'outcome', 'textarea')}
      ${field('f_author', 'author')}
      <div class="form-row">
        <button type="submit" class="btn btn-primary btn-sm">${esc(t.submit)}</button>
        <span class="form-msg" id="formMsg"></span>
      </div>`;
    window.brandify?.(el);
  }

  function ideaHtml(i) {
    const open = openSet.has(i.id);
    const cs = i.comments ?? [];
    const qa = (key, val) =>
      val ? `<div class="qa"><div class="q">${esc(t[key])}</div><div class="a">${esc(val)}</div></div>` : '';
    return `<div class="idea">
      <button class="idea-head" data-idea="${esc(i.id)}">
        <span class="sign">${open ? '−' : '+'}</span>
        <span style="flex:1">
          <span class="idea-title">${esc(i.title)}</span>
          <span class="idea-meta">
            <span>${esc(i.author || t.anon)}</span>
            <span>${when(i.ts)}</span>
            ${cs.length ? `<span>${t.cmtN.replace('%d', cs.length)}</span>` : ''}
          </span>
        </span>
        <span class="st ${esc(i.status)}">${esc(t.st[i.status] ?? i.status)}</span>
      </button>
      ${
        open
          ? `<div class="idea-body">
              ${qa('problem', i.problem)}${qa('who', i.who)}${qa('outcome', i.outcome)}
              ${i.note ? `<div class="review"><div class="rk">${esc(t.review)}</div><div class="rv">${esc(i.note)}</div></div>` : ''}
              ${
                cs.length
                  ? `<div class="cmts">${cs
                      .map(
                        (c) => `<div class="cmt${c.owner ? ' own' : ''}">
                          <div class="cmt-h"><b>${esc(c.author || t.anon)}</b><span>${when(c.ts)}</span></div>
                          <div class="cmt-t">${esc(c.text)}</div>
                        </div>`
                      )
                      .join('')}</div>`
                  : ''
              }
              <form class="cmt-form" data-cmt="${esc(i.id)}">
                <textarea rows="2" placeholder="${esc(t.reply)}"></textarea>
                <div class="form-row">
                  <input type="text" placeholder="${esc(t.author)} (${esc(t.anon)})" style="max-width:200px" />
                  <button type="submit" class="btn btn-ghost btn-sm">${esc(t.send)}</button>
                  <span class="form-msg"></span>
                </div>
              </form>
            </div>`
          : ''
      }
    </div>`;
  }

  function renderList() {
    const el = $('ideaList');
    const cnt = $('ideaCount');
    const pend = $('ideaPending');
    if (!el) return;
    if (loadFailed) {
      el.innerHTML = `<div class="board-empty">${esc(t.off)}</div>`;
      return;
    }
    if (ideas === null) {
      el.innerHTML = `<div class="board-empty">${esc(t.loading)}</div>`;
      return;
    }
    if (cnt) cnt.textContent = ideas.length ? String(ideas.length) : '';
    const n = ideas.filter((i) => i.status === 'open').length;
    if (pend) {
      pend.textContent = n ? t.pending.replace('%d', n) : '';
      pend.hidden = !n;
    }
    el.innerHTML = ideas.length
      ? ideas.map(ideaHtml).join('')
      : `<div class="board-empty">${esc(t.empty)}</div>`;
    window.brandify?.(el);
  }

  async function load() {
    try {
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      ideas = (await r.json()).ideas ?? [];
      loadFailed = false;
    } catch {
      // 백엔드가 없으면(정적 호스팅) 조용히 «지금은 안 된다»로 둔다. 폼을 그대로
      // 열어 두면 사람이 길게 써서 보냈는데 사라지는 일이 생긴다.
      loadFailed = true;
      const ft = $('ideaFormToggle');
      if (ft) ft.hidden = true;
    }
    renderList();
  }

  function bindToggle(btnId, panelId, onOpen) {
    const b = $(btnId), p = $(panelId);
    if (!b || !p) return;
    b.addEventListener('click', () => {
      const show = p.hidden;
      p.hidden = !show;
      const s = b.querySelector('.sign');
      if (s) s.textContent = show ? '−' : '+';
      if (show && onOpen) onOpen();
    });
  }

  function init() {
    renderForm();
    renderList();
    load();

    bindToggle('ideaFormToggle', 'ideaForm');
    bindToggle('ideaListToggle', 'ideaList');

    $('ideaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('formMsg');
      const v = (id) => $(id)?.value ?? '';
      if (!v('f_title').trim()) {
        msg.className = 'form-msg err';
        msg.textContent = t.need;
        return;
      }
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = t.sending;
      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: v('f_title'), problem: v('f_problem'),
            who: v('f_who'), outcome: v('f_outcome'), author: v('f_author'),
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || t.fail);
        // renderForm() 이 폼 innerHTML 을 갈아끼우므로 #formMsg 도 같이 사라진다.
        // 먼저 다시 그리고, **새로 생긴** 자리에 결과를 적는다 — 순서가 반대면
        // 「올라갔습니다」가 뜨자마자 지워져서 성공했는지 알 수 없다.
        renderForm();
        const done = $('formMsg');
        if (done) { done.className = 'form-msg ok'; done.textContent = t.done; }
        await load();
        const lp = $('ideaList');
        if (lp?.hidden) $('ideaListToggle')?.click();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = `${t.fail} — ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    $('ideaList')?.addEventListener('click', (e) => {
      const h = e.target.closest('[data-idea]');
      if (!h) return;
      const id = h.dataset.idea;
      openSet.has(id) ? openSet.delete(id) : openSet.add(id);
      renderList();
    });

    $('ideaList')?.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-cmt]');
      if (!f) return;
      e.preventDefault();
      const ta = f.querySelector('textarea');
      const au = f.querySelector('input');
      const msg = f.querySelector('.form-msg');
      const btn = f.querySelector('button');
      if (!ta.value.trim()) return;
      btn.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = t.sending;
      try {
        const r = await fetch(`${API}/${encodeURIComponent(f.dataset.cmt)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ta.value, author: au.value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || t.fail);
        await load();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = `${t.fail} — ${err.message}`;
        btn.disabled = false;
      }
    });

    document.addEventListener('joygo:lang', (e) => {
      lang = e.detail.lang === 'en' ? 'en' : 'ko';
      t = T[lang];
      renderForm();
      renderList();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
