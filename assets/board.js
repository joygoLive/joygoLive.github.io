/* 아이디어 게시판 — 익명·공개. BOR 의 절별 의견과 같은 규칙을 따른다:
 * 덧붙이기만 하고 고치지 않으며, 「아직 안 봤다」와 「보고 안 만들기로 했다」를
 * 구분하고 후자에는 이유를 남긴다.
 *
 * i18n 은 페이지의 _L 이 아니라 여기 있다 — 이 화면은 서버 응답으로 다시 그려지므로
 * data-i18n 속성으로는 덮이지 않는다. setLang 이 쏘는 joygo:lang 을 받아 다시 그린다. */
(function () {
  const API = '/api/ideas';

  /** 응답을 **한 번만** 읽어, JSON 이면 객체로·아니면 진단 문구로 돌려준다.
   *
   *  예전에는 `r.json().catch(() => ({}))` 로 삼켰다. 그래서 서버가 JSON 이 아닌 것을
   *  돌려주면 화면에 「보내지 못했습니다 — 보내지 못했습니다」가 떴다 — 같은 말이 두 번
   *  나오는 것은 **증거를 지운 것**이다. Cloudflare 가 낸 오류 페이지인지 앱이 낸
   *  오류인지, 무엇 때문인지가 전부 사라진다(실제로 그 때문에 원인을 못 짚었다).
   *
   *  이제 상태코드와 본문 앞머리를 남긴다. 태그를 털어 한 줄로 줄이므로 화면이 깨지지 않고,
   *  Cloudflare 의 오류 번호(예: 1102 — Worker exceeded resource limits)가 그대로 보인다. */
  const readBody = async (r) => {
    const txt = await r.text().catch(() => '');
    try {
      return { j: JSON.parse(txt) };
    } catch {
      const head = txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      return { j: {}, notJson: head || '(빈 응답)' };
    }
  };
  const T = {
    ko: {
      propose: '아이디어 제안하기', list: '들어온 제안', pending: '검토 전 %d',
      title: '한 줄로 말하면', titleH: '무엇을 만들었으면 하는지 한 문장으로.',
      problem: '무엇이 불편한가요', problemH: '지금은 어떻게 하고 있고, 어디가 막히는지. 이게 있으면 만들 물건이 훨씬 또렷해집니다.',
      who: '누가 쓰게 될까요', whoH: '본인만 쓸 것인지, 비슷한 사람이 더 있는지.',
      outcome: '되면 무엇이 달라지나요', outcomeH: '만들어졌다고 치고, 그래서 뭐가 좋아지는지.',
      author: '이름', authorH: '부르기 좋은 이름이면 됩니다. 실명이 아니어도 되고, 연락처는 적지 마세요.',
      pass: '비밀번호', passH: '4자 이상. **잊으면 되찾을 수 없습니다.** 다시 들어와 내용을 보태거나 답을 보려면 필요합니다.',
      allNeed: '모든 칸을 채워 주세요. 무엇이 불편한지·누가 쓸지·되면 뭐가 달라지는지가 비면 검토할 것이 없어 결국 되묻게 됩니다.',
      anon: '익명', submit: '제안 올리기', sending: '올리는 중…',
      notice: '올린 사람과 운영자만 내용을 봅니다. 목록에는 제목 앞부분과 날짜·상태만 남습니다. 아이디어를 가려 두면서도 「그때 이미 여기 있었다」는 기록은 남습니다. 연락처·개인정보는 적지 마세요. 답은 이 글의 댓글로 돌아오므로 연락처가 필요 없습니다.',
      needTitle: '한 줄 요약을 적어 주세요', needProblem: '무엇이 불편한지 적어 주세요',
      needWho: '누가 쓰게 될지 적어 주세요', needOutcome: '되면 무엇이 달라지는지 적어 주세요',
      needAuthor: '이름을 적어 주세요', needPass: '비밀번호는 4자 이상이어야 합니다',
      done: '올라갔습니다. 검토하고 여기에 답하겠습니다. 비밀번호를 꼭 기억해 두세요. 다시 열 때 필요하고, 되찾을 수 없습니다.',
      fail: '보내지 못했습니다', reply: '의견 남기기', send: '남기기',
      empty: '아직 들어온 제안이 없습니다. 처음이 되어 주세요.',
      loading: '불러오는 중…', off: '지금은 제안을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
      review: '검토 의견', cmtN: '의견 %d',
      st: { open: '검토 전', building: '만드는 중', shipped: '만들었음', declined: '안 만듦' },
      closed: '이 제안의 의견은 닫혀 있습니다. 지금까지의 대화는 그대로 남습니다.',
      replyOwner: '잠긴 제안. 운영자로 남깁니다',
      lock: '의견 잠그기', unlock: '의견 다시 열기',
      hide: '가리기', unhide: '되돌리기', save: '검토 의견 저장',
      reviewPh: '검토 의견. 왜 그렇게 정했는지 적어 주세요. 화면에 그대로 공개됩니다.',
      passAsk: '비밀번호를 넣으세요. 이 기기에만 저장되고 12시간 뒤 만료됩니다.',
      lockedNote: '이 제안은 올린 사람과 운영자만 봅니다. 올릴 때 정한 비밀번호를 넣으면 내용과 답이 열립니다.',
      lockedTag: '비공개', openPass: '올릴 때 정한 비밀번호', openBtn: '열기',
      opening: '여는 중…', openBad: '비밀번호가 다릅니다',
      keyKept: '이 기기에서는 30일 동안 다시 묻지 않습니다.',
      mine: '내가 연 제안', forget: '이 기기에서 잊기',
      pub: '공개로 전환', unpub: '다시 비공개로',
      adminOn: '운영자 모드. 가린 글도 보이고, 댓글은 joygoLive 이름으로 올라갑니다 · 12시간 뒤 자동 만료',
      adminOut: '토큰 지우기',
      asVisitor: '방문자로 보기', backAdmin: '운영자로 돌아가기',
      visitorOn: '방문자 화면. 토큰은 그대로 있고, 보이는 것만 일반 사용자와 같습니다',
    },
    en: {
      propose: 'Propose an idea', list: 'Ideas submitted', pending: '%d unreviewed',
      title: 'In one line', titleH: 'One sentence on what you would like built.',
      problem: 'What is awkward today', problemH: 'How you do it now and where it stalls. This is what makes the thing to build concrete.',
      who: 'Who would use it', whoH: 'Only you, or are there others like you.',
      outcome: 'What changes if it exists', outcomeH: 'Assume it is built. What gets better.',
      author: 'Name', authorH: 'Whatever you would like to be called. It need not be your real name; do not put contact details here.',
      pass: 'Password', passH: 'Four characters or more. **It cannot be recovered.** You need it to come back, add detail, or read the reply.',
      allNeed: 'Every field is required. Without the problem, the users, and the outcome there is nothing to review, so it only ends in questions back to you.',
      anon: 'anonymous', submit: 'Post it', sending: 'Posting…',
      notice: 'Only you and the owner can read what you write. The list keeps the start of the title, the date, and the status. Enough to show the idea was already here at that time, without giving it away. Do not include contact details or personal data; replies come as comments on this post.',
      needTitle: 'The one-line summary is required', needProblem: 'Say what is awkward today',
      needWho: 'Say who would use it', needOutcome: 'Say what changes if it exists',
      needAuthor: 'A name is required', needPass: 'The password must be at least 4 characters',
      done: 'Posted. It will be reviewed and answered here. Keep the password. It is needed to reopen this and cannot be recovered.',
      fail: 'Could not send', reply: 'Leave a comment', send: 'Send',
      empty: 'No ideas yet. Be the first.',
      loading: 'Loading…', off: 'Submissions are unavailable right now. Please try again shortly.',
      review: 'Review', cmtN: '%d comments',
      st: { open: 'Unreviewed', building: 'Building', shipped: 'Built', declined: 'Not building' },
      closed: 'Comments on this idea are closed. The conversation so far stays.',
      replyOwner: 'Closed thread. Posting as the owner',
      lock: 'Close comments', unlock: 'Reopen comments',
      hide: 'Hide', unhide: 'Unhide', save: 'Save review',
      reviewPh: 'Review. Why it was decided this way. Published as written.',
      passAsk: 'Enter the password. Stored on this device only; expires in 12 hours.',
      lockedNote: 'Only the person who posted this and the owner can read it. Enter the password set when posting to open the content and the reply.',
      lockedTag: 'private', openPass: 'Password set when posting', openBtn: 'Open',
      opening: 'Opening…', openBad: 'Wrong password',
      keyKept: 'This device will not ask again for 30 days.',
      mine: 'Opened by you', forget: 'Forget on this device',
      pub: 'Make public', unpub: 'Make private again',
      adminOn: 'Admin mode. Hidden posts are visible and comments post as joygoLive',
      adminOut: 'Clear token',
      asVisitor: 'View as visitor', backAdmin: 'Back to admin',
      visitorOn: 'Visitor view. The token is still stored; only what you see changes',
    },
  };

  /* 운영자 모드 — 주소에 #admin 을 붙이면 토큰을 묻고 이 기기에 저장한다.
     토큰이 있으면 목록에 가린 글까지 나오고, 각 제안에 검토·가리기 손잡이가 붙고,
     댓글은 자동으로 «joygoLive» 답글이 된다(서버가 토큰을 보고 정한다).
     **이 기기에만 남는다.** 공용 컴퓨터에서는 쓰지 말 것 — 나가기로 지운다. */
  const TK = 'joygo.admin';
  const TTL = 12 * 3600 * 1000;   // 12시간 뒤 만료
  let admin = '';
  let asVisitor = false;          // 토큰은 둔 채 «방문자로 보기» (저장하지 않는다)

  // 만료를 두는 이유: 한 번 넣으면 그 브라우저가 **영영** 운영자로 남는다.
  // 자리를 비운 사이, 혹은 잊고 지나간 뒤에도 열려 있는 것은 좋지 않다.
  try {
    const raw = localStorage.getItem(TK);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && v.t && v.exp > Date.now()) admin = v.t;
      else localStorage.removeItem(TK);
    }
  } catch { admin = ''; }

  const isAdmin = () => !!admin && !asVisitor;
  const H = () => (isAdmin() ? { 'X-Admin-Token': admin } : {});
  const saveTok = (t) => {
    try {
      if (t) localStorage.setItem(TK, JSON.stringify({ t, exp: Date.now() + TTL }));
      else localStorage.removeItem(TK);
    } catch {}
  };

  /* 제안 열쇠 — 잠긴 글을 연 뒤 그 기기에 남는 값.
     **비밀번호는 저장하지 않는다.** 열쇠는 글 하나에만 듣고 서버가 만든 것이라,
     이 값이 새더라도 그 글 하나가 열릴 뿐 같은 비밀번호를 쓴 다른 글은 안 열린다.

     운영자 토큰이 12시간인 것과 달리 30일을 준다 — 운영자는 매일 들어오지만
     제안한 사람은 답이 달릴 때쯤 한 번 돌아온다. 12시간짜리 열쇠는 그 사람에게는
     사실상 매번 비밀번호를 다시 묻는 것과 같다. */
  const KS = 'joygo.keys';
  const KTTL = 30 * 24 * 3600 * 1000;
  let keys = {};
  const readKeys = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KS) || '{}');
      const now = Date.now(), out = {};
      for (const [id, e] of Object.entries(v)) if (e && e.k && e.exp > now) out[id] = e;
      return out;
    } catch { return {}; }
  };
  const writeKeys = () => { try { localStorage.setItem(KS, JSON.stringify(keys)); } catch {} };
  keys = readKeys();
  const keyOf = (id) => keys[id]?.k;
  const putKey = (id, k) => { keys[id] = { k, exp: Date.now() + KTTL }; writeKeys(); };
  // 열쇠가 안 듣는다면 지운다 — 안 듣는 열쇠를 들고 있으면 그 글은 영영 「여는 중」에
  // 머무르고, 비밀번호를 다시 넣을 자리도 안 나온다.
  const dropKey = (id) => { delete keys[id]; writeKeys(); };

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

  // 힌트의 **굵게**만 강조로 바꾼다. 잊으면 못 되찾는다는 말은 다른 안내와 같은
  // 무게로 흘려 읽히면 안 되는데, 그렇다고 힌트 전체를 굵게 하면 아무것도 안 굵다.
  const bold = (v) => esc(v).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  function field(id, key, tag) {
    const hint = t[key + 'H'];
    const input =
      tag === 'textarea' ? `<textarea id="${id}" rows="3"></textarea>`
      : tag === 'password' ? `<input id="${id}" type="password" autocomplete="new-password" />`
      : `<input id="${id}" type="text" />`;
    return `<div class="ff" data-ff="${id}">
      <label for="${id}">${esc(t[key])}</label>
      <span class="hint">${bold(hint)}</span>
      ${input}
      <span class="ff-err" id="${id}_err"></span>
    </div>`;
  }

  function renderForm() {
    const el = $('ideaForm');
    if (!el) return;
    el.innerHTML = `
      <p class="form-note">${esc(t.notice)}</p>
      <p class="form-note req">${esc(t.allNeed)}</p>
      ${field('f_title', 'title')}
      ${field('f_problem', 'problem', 'textarea')}
      ${field('f_who', 'who', 'textarea')}
      ${field('f_outcome', 'outcome', 'textarea')}
      <div class="ff-row">
        ${field('f_author', 'author')}
        ${field('f_pass', 'pass', 'password')}
      </div>
      <div class="form-row">
        <button type="submit" class="btn btn-primary btn-sm">${esc(t.submit)}</button>
        <span class="form-msg" id="formMsg"></span>
      </div>`;
    window.brandify?.(el);
  }

  /* 자물쇠 줄 — 잠긴 글에서 내용 대신 나오는 것. 제목 앞부분·날짜·상태만 있고,
     펼치면 비밀번호를 넣는 자리가 나온다.

     **목록에서 아예 빼지 않는 이유**가 둘이다. 올린 사람이 자기 글을 찾아 돌아와
     내용을 보태려면 자리가 있어야 하고, 「그 아이디어가 그때 이미 여기 있었다」는
     자국이 나중에 선후를 다툴 때의 근거가 된다. */
  function stubHtml(i) {
    const open = openSet.has(i.id);
    return `<div class="idea locked">
      <button class="idea-head" data-idea="${esc(i.id)}">
        <span class="sign lock">${open ? '−' : '+'}</span>
        <span style="flex:1">
          <span class="idea-title">${esc(i.title)}</span>
          <span class="idea-meta">
            <span class="tag-priv">${esc(t.lockedTag)}</span>
            <span>${when(i.ts)}</span>
          </span>
        </span>
        <span class="st ${esc(i.status)}">${esc(t.st[i.status] ?? i.status)}</span>
      </button>
      ${
        open
          ? `<div class="idea-body">
              <p class="cmt-closed">${esc(t.lockedNote)}</p>
              <form class="open-form" data-open="${esc(i.id)}">
                <div class="form-row">
                  <input type="password" autocomplete="current-password"
                         placeholder="${esc(t.openPass)}" style="max-width:260px" />
                  <button type="submit" class="btn btn-ghost btn-sm">${esc(t.openBtn)}</button>
                  <span class="form-msg"></span>
                </div>
              </form>
            </div>`
          : ''
      }
    </div>`;
  }

  function ideaHtml(i) {
    if (i.stub) return stubHtml(i);
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
            ${keyOf(i.id) && !isAdmin() ? `<span class="tag-mine">${esc(t.mine)}</span>` : ''}
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
              ${isAdmin() ? adminBox(i) : ''}
              ${
                !i.locked || isAdmin()
                  ? `<form class="cmt-form" data-cmt="${esc(i.id)}">
                <textarea rows="2" placeholder="${esc(isAdmin() && i.locked ? t.replyOwner : t.reply)}"></textarea>
                <div class="form-row">
                  <input type="text" placeholder="${esc(t.author)} (${esc(t.anon)})" style="max-width:200px" />
                  <button type="submit" class="btn btn-ghost btn-sm">${esc(t.send)}</button>
                  <span class="form-msg"></span>
                </div>
              </form>`
                  : `<p class="cmt-closed">${esc(t.closed)}</p>`
              }
            </div>`
          : ''
      }
    </div>`;
  }

  const ST = ['open', 'building', 'shipped', 'declined'];

  function adminBox(i) {
    return `<div class="adm" data-adm="${esc(i.id)}">
      <div class="adm-row">
        ${ST.map((k) => `<button type="button" class="adm-st${i.status === k ? ' on' : ''}" data-st="${k}">${esc(t.st[k])}</button>`).join('')}
        <button type="button" class="adm-lock" data-lock="${i.locked ? '0' : '1'}">${i.locked ? esc(t.unlock) : esc(t.lock)}</button>
        <button type="button" class="adm-hide" data-hide="${i.hidden ? '0' : '1'}">${i.hidden ? esc(t.unhide) : esc(t.hide)}</button>
        <button type="button" class="adm-priv" data-priv="${i.private ? '0' : '1'}">${i.private ? esc(t.pub) : esc(t.unpub)}</button>
      </div>
      <textarea class="adm-note" rows="2" placeholder="${esc(t.reviewPh)}">${esc(i.note ?? '')}</textarea>
      <div class="adm-row">
        <button type="button" class="btn btn-ghost btn-sm adm-save">${esc(t.save)}</button>
        <span class="form-msg adm-msg"></span>
      </div>
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

  /* 목록은 자물쇠 줄만 준다. 열쇠를 가진 글은 여기서 하나씩 받아 제자리에 끼운다.
     운영자는 목록에서 이미 전부 받으므로 건너뛴다.

     한 글이 실패해도 나머지는 그대로 간다 — 열쇠 하나가 만료됐다고 화면 전체가
     「불러오지 못했습니다」가 되면, 정작 멀쩡한 다른 글까지 못 본다. */
  async function hydrate() {
    if (isAdmin()) return;
    const mine = (ideas ?? []).filter((i) => i.stub && keyOf(i.id));
    await Promise.all(mine.map(async (i) => {
      try {
        const r = await fetch(`${API}/${encodeURIComponent(i.id)}`, {
          cache: 'no-store', headers: { 'X-Idea-Key': keyOf(i.id) },
        });
        if (r.status === 404) { dropKey(i.id); return; }   // 안 듣는 열쇠는 들고 있지 않는다
        if (!r.ok) return;
        const full = (await r.json()).idea;
        const at = ideas.findIndex((x) => x.id === i.id);
        if (at >= 0 && full) ideas[at] = full;
      } catch {}
    }));
  }

  async function load() {
    try {
      const r = await fetch(isAdmin() ? `${API}?all=1` : API, { cache: 'no-store', headers: H() });
      if (!r.ok) throw new Error(String(r.status));
      ideas = (await r.json()).ideas ?? [];
      loadFailed = false;
      await hydrate();
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

    /* 빈 칸 표시. 메시지를 폼 맨 아래에만 두면 긴 폼에서는 화면 밖이라 안 보인다 —
       그 칸 바로 밑에도 같이 적는다. */
    const mark = (id, text) => {
      const box = document.querySelector(`[data-ff="${id}"]`);
      if (box) box.classList.add('bad');
      const e = $(`${id}_err`);
      if (e) e.textContent = text;
    };
    const clearMark = (id) => {
      document.querySelector(`[data-ff="${id}"]`)?.classList.remove('bad');
      const e = $(`${id}_err`);
      if (e) e.textContent = '';
    };
    const clearMarks = () => {
      for (const b of document.querySelectorAll('#ideaForm .ff.bad')) clearMark(b.dataset.ff);
    };
    // 채우기 시작하면 그 칸의 표시는 바로 지운다. 다 채운 뒤에도 빨간 채로 남아
    // 있으면 아직 뭔가 잘못된 줄 읽는다.
    $('ideaForm')?.addEventListener('input', (e) => {
      const box = e.target.closest('[data-ff]');
      if (box?.classList.contains('bad')) clearMark(box.dataset.ff);
    });

    $('ideaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('formMsg');
      const v = (id) => $(id)?.value ?? '';
      /* 모든 칸이 필수다. **어느 칸이 빈지 하나씩 말하고 그 칸으로 커서를 옮긴다** —
         「모두 채워 주세요」만 띄우면 긴 폼에서 사람이 자기 화면을 뒤져야 한다.
         서버도 같은 순서로 같은 검사를 한다. 여기서 막는 것은 왕복을 아끼는
         것이지 관문이 아니다. */
      const need = [
        ['f_title', 'needTitle'], ['f_problem', 'needProblem'],
        ['f_who', 'needWho'], ['f_outcome', 'needOutcome'], ['f_author', 'needAuthor'],
        // 비밀번호만 공백을 안 턴다 — 사람이 넣은 그대로가 비밀번호다. 서버도 같게 본다.
        ['f_pass', 'needPass', (x) => x.length >= 4],
      ];
      clearMarks();
      // **빈 칸을 전부 표시한다.** 하나씩 알려 주면 채우고 누르기를 반복하게 되는데,
      // 어차피 다 필요한 칸이라 처음부터 다 보여 주는 편이 왕복이 적다.
      // 커서는 그중 첫 칸으로 옮긴다 — 표시만 하고 두면 어디부터 볼지 사람이 정해야 한다.
      const bad = need.filter(([id, , ok]) => !(ok ? ok(v(id)) : v(id).trim()));
      if (bad.length) {
        for (const [id, key] of bad) mark(id, t[key]);
        msg.className = 'form-msg err';
        msg.textContent = t[bad[0][1]];
        $(bad[0][0])?.focus();
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
            pass: v('f_pass'),
          }),
        });
        const { j, notJson } = await readBody(r);
        if (!r.ok)
          throw new Error(j.error || (notJson ? `서버 응답 ${r.status} · ${notJson}` : `서버 응답 ${r.status}`));
        // 올리자마자 열쇠를 받아 둔다. 방금 정한 비밀번호를 그 자리에서 다시 묻는
        // 것은 사람을 짜증나게 할 뿐이고, 올린 글이 바로 안 보이면 올라갔는지도
        // 알 수 없다.
        if (j.key) putKey(j.idea.id, j.key);
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

    // 잠긴 글 열기 — 비밀번호를 서버에서 열쇠로 바꿔 이 기기에 둔다.
    $('ideaList')?.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-open]');
      if (!f) return;
      e.preventDefault();
      const id = f.dataset.open;
      const inp = f.querySelector('input');
      const msg = f.querySelector('.form-msg');
      const btn = f.querySelector('button');
      if (!inp.value) return;
      btn.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = t.opening;
      try {
        const r = await fetch(`${API}/${encodeURIComponent(id)}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass: inp.value }),
        });
        const { j, notJson } = await readBody(r);
        // 서버가 JSON 이 아닌 것을 돌려줬는데 「비밀번호가 다릅니다」로 보이면 거짓말이 된다.
        // 다만 진단 문구는 **응답이 실패일 때만** 쓴다 — 200 인데 열쇠만 없는 경우까지
        // 「서버 응답 200」으로 덮으면 원래 맞는 말(비밀번호가 다릅니다)이 사라진다.
        if (!r.ok || !j.key)
          throw new Error(
            j.error ||
              (!r.ok ? (notJson ? `서버 응답 ${r.status} · ${notJson}` : `서버 응답 ${r.status}`) : t.openBad)
          );
        putKey(id, j.key);
        openSet.add(id);
        await load();          // 열린 글을 제자리에 끼워 다시 그린다
        renderList();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = err.message;
        btn.disabled = false;
        inp.select?.();
      }
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
        const k = keyOf(f.dataset.cmt);
        const r = await fetch(`${API}/${encodeURIComponent(f.dataset.cmt)}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...H(),
            // 잠긴 글에는 열쇠를 가진 사람만 남긴다. 서버가 다시 확인하므로 이건
            // 화면의 예의가 아니라 실제 관문이다.
            ...(k ? { 'X-Idea-Key': k } : {}),
          },
          body: JSON.stringify({ text: ta.value, author: au.value }),
        });
        const { j, notJson } = await readBody(r);
        if (!r.ok)
          throw new Error(j.error || (notJson ? `서버 응답 ${r.status} · ${notJson}` : `서버 응답 ${r.status}`));
        await load();
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = `${t.fail} — ${err.message}`;
        btn.disabled = false;
      }
    });

    // 운영자 손잡이
    $('ideaList')?.addEventListener('click', async (e) => {
      const box = e.target.closest('[data-adm]');
      if (!box || !isAdmin()) return;
      const id = box.dataset.adm;
      const msg = box.querySelector('.adm-msg');
      const send = async (body) => {
        msg.className = 'form-msg';
        msg.textContent = t.sending;
        const r = await fetch(API, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...H() },
          body: JSON.stringify({ id, ...body }),
        });
        if (!r.ok) {
          msg.className = 'form-msg err';
          msg.textContent = j.error || (notJson ? `서버 응답 ${r.status} · ${notJson}` : `서버 응답 ${r.status}`);
          return;
        }
        await load();
      };

      const lock = e.target.closest('[data-lock]');
      if (lock) return send({ locked: lock.dataset.lock === '1' });

      const hide = e.target.closest('[data-hide]');
      if (hide) return send({ hidden: hide.dataset.hide === '1' });

      // 공개로 돌리는 것 — 비밀번호를 잊었을 때의 탈출구다. 비밀번호는 그대로
      // 두므로, 다시 비공개로 내려도 올린 사람의 열쇠는 계속 듣는다.
      const priv = e.target.closest('[data-priv]');
      if (priv) return send({ private: priv.dataset.priv === '1' });

      const st = e.target.closest('[data-st]');
      if (st) return send({ status: st.dataset.st });

      if (e.target.closest('.adm-save')) {
        return send({ note: box.querySelector('.adm-note').value });
      }
    });

    // #admin 으로 들어오면 토큰을 묻는다. 취소하면 아무 일도 없다.
    /* 비밀번호를 받아 서버에서 토큰으로 바꾼다. 40자리를 폰에서 붙여 넣는 것은
       못 할 짓이고, 못 할 짓은 결국 안 하게 된다.
       토큰을 그대로 넣는 길도 남긴다 — 비밀번호를 잊었다고 운영을 못 하면 안 된다. */
    async function enterAdmin() {
      const v = prompt(t.passAsk, '');
      if (v === null) return;
      const pass = v.trim();
      if (!pass) return;

      if (pass.length >= 32) {          // 토큰을 직접 넣은 경우
        admin = pass; asVisitor = false; saveTok(admin); renderBar(); load();
        return;
      }
      try {
        const r = await fetch('/api/admin/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass }),
        });
        const { j, notJson } = await readBody(r);
        if (!r.ok) { alert(j.error || (notJson ? `서버 응답 ${r.status} · ${notJson}` : `서버 응답 ${r.status}`)); return; }
        admin = j.token; asVisitor = false;
        saveTok(admin); renderBar(); load();
      } catch {
        alert(t.fail);
      }
    }
    function renderBar() {
      let bar = $('admBar');
      if (!admin) { bar?.remove(); return; }
      // 방문자로 보는 중에도 바는 남긴다 — 돌아올 길이 없으면 갇힌다.
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'admBar'; bar.className = 'adm-bar';
        $('ideaList')?.parentNode?.insertBefore(bar, $('ideaList'));
      }
      bar.innerHTML =
        `<span>${esc(asVisitor ? t.visitorOn : t.adminOn)}</span>` +
        `<button type="button" id="admPeek">${esc(asVisitor ? t.backAdmin : t.asVisitor)}</button>` +
        `<button type="button" id="admOut">${esc(t.adminOut)}</button>`;
      $('admPeek').onclick = () => { asVisitor = !asVisitor; renderBar(); load(); };
      $('admOut').onclick = () => {
        admin = ''; asVisitor = false;
        saveTok('');
        renderBar(); load();
      };
    }
    /* 들어가는 문은 로고다 — 위쪽과 푸터 둘 다. 주소에 #admin 을 치는 것보다
       폰에서 편하고, 옆에서 보는 사람에게 「관리자 입구」를 알려 주지 않는다.

       **비밀은 아니다.** 일곱 번 누르면 누구나 물음창까지는 온다 — 관문은
       비밀번호이고, 그 비밀번호를 확인하는 것은 서버다. 이건 편의지 보안이 아니다.

       위쪽 로고는 #top 링크라 누를 때마다 화면이 튄다. 그래서 기본 동작을 막고,
       **더 이상 두드리지 않을 때만** 맨 위로 올린다 — 연타 중에는 가만히 있고
       한 번만 눌렀을 때는 로고를 누르면 위로 가는 관습이 그대로 살아 있다. */
    const EGG_N = 7, EGG_MS = 3000, EGG_SETTLE = 400;
    let taps = 0, tapAt = 0, settle = null;

    function attachEgg(el, isLink) {
      if (!el) return;
      el.style.touchAction = 'manipulation';   // 두 번 탭해서 확대 방지
      el.addEventListener('click', (e) => {
        if (isLink) e.preventDefault();
        const now = Date.now();
        taps = now - tapAt < EGG_MS ? taps + 1 : 1;
        tapAt = now;

        clearTimeout(settle);
        if (isLink) {
          // 연타가 멈춘 뒤에만 위로. 그래서 일곱 번 두드리는 동안은 조용하다.
          settle = setTimeout(() => {
            if (taps === 1) window.scrollTo({ top: 0, behavior: 'smooth' });
          }, EGG_SETTLE);
        }

        if (taps < EGG_N) return;
        taps = 0;
        clearTimeout(settle);
        if (!admin) return enterAdmin();      // 비밀번호가 없으면 묻는다
        asVisitor = !asVisitor;               // 있으면 켜고 끄는 토글
        renderBar();
        load();
        $('admBar')?.scrollIntoView({ block: 'center' });
      });
    }

    attachEgg(document.querySelector('header .brand'), true);
    attachEgg(document.querySelector('footer .brand'), false);

    if (location.hash === '#admin') enterAdmin();
    window.addEventListener('hashchange', () => { if (location.hash === '#admin') enterAdmin(); });
    renderBar();

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
