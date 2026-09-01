function setLang(lang){
  if(!_L[lang]) lang='en';
  const d=_L[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(d[k]!=null)el.textContent=d[k];});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{const k=el.getAttribute('data-i18n-html');if(d[k]!=null)el.innerHTML=d[k];});
  document.documentElement.lang=lang;
  document.querySelectorAll('.lang-toggle button').forEach(b=>b.classList.toggle('active',b.getAttribute('data-lang')===lang));
  try{localStorage.setItem('joygo_lang',lang);}catch(e){}
  brandify(document.body);
  // 동적으로 그리는 것들(아이디어 게시판)은 _L 로 못 덮으므로 알림을 받아 스스로 다시 그린다.
  document.dispatchEvent(new CustomEvent('joygo:lang',{detail:{lang}}));
}

/** 본문에 평문으로 박힌 «joygoLive» 를 헤더 로고와 같은 대비로 칠한다.
 *
 * 왜 CSS 로 안 되나: 이건 요소가 아니라 문장 가운데 낀 글자다. 그렇다고 문구마다
 * 손으로 <span> 을 넣으면 i18n 사전 두 벌에 마크업이 섞이고, 새 문장을 쓸 때마다
 * 빠뜨릴 자리가 생긴다. 그래서 그린 다음 한 번 훑는다.
 *
 * setLang 이 textContent 로 덮어쓰므로 매번 다시 돌아야 하고, 그래서 **여러 번 돌려도
 * 같은 결과**여야 한다 — 이미 칠한 것(.bi)과 로고(.brand)는 건너뛴다. */
function brandify(root){
  if(!root) return;
  const SKIP=/^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE|TITLE)$/;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
    if(!n.nodeValue||n.nodeValue.indexOf('joygoLive')<0) return NodeFilter.FILTER_REJECT;
    for(let p=n.parentElement;p;p=p.parentElement){
      if(SKIP.test(p.tagName)||p.classList.contains('brand')
         ||p.classList.contains('bi')||p.classList.contains('bi-go')
         ||p.classList.contains('bi-joy'))
        return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
  }});
  const hits=[]; let n;
  while((n=w.nextNode())) hits.push(n);   // 걷는 도중에 고치면 워커가 흐트러진다
  for(const t of hits){
    const frag=document.createDocumentFragment();
    t.nodeValue.split('joygoLive').forEach((seg,i)=>{
      if(i){
        // 세 단어로 나눈다 — joy(그대로) · go(앰버) · Live(시안). 로고와 같은 규칙이라
        // 본문 가운데 낀 이름도 헤더와 같은 대비로 읽힌다.
        // joy 도 감싼다. 안 감싸면 주변 문단 색을 그대로 물려받아 자리마다 달라진다 —
        // 헤더에서는 잉크, 흐린 문단에서는 흐린 회색이 되어 같은 이름이 두 색으로 읽힌다.
        const j=document.createElement('span'); j.className='bi-joy'; j.textContent='joy';
        frag.appendChild(j);
        const g=document.createElement('span'); g.className='bi-go'; g.textContent='go';
        frag.appendChild(g);
        const b=document.createElement('span'); b.className='bi'; b.textContent='Live';
        frag.appendChild(b);
      }
      if(seg) frag.appendChild(document.createTextNode(seg));
    });
    t.parentNode.replaceChild(frag,t);
  }
}
window.brandify=brandify;
(function(){
  let lang='en';
  try{const s=localStorage.getItem('joygo_lang');if(s)lang=s;else if((navigator.language||'').toLowerCase().startsWith('ko'))lang='ko';}catch(e){}
  setLang(lang);
  const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll('.fade').forEach(el=>io.observe(el));
  document.querySelectorAll('#navLinks a').forEach(a=>a.addEventListener('click',()=>document.getElementById('navLinks').classList.remove('open')));
})();

/** 테마. 세 상태다 — 시스템(기본) · 라이트 고정 · 다크 고정.
 *  같은 버튼을 다시 누르면 고정이 풀려 시스템으로 돌아간다. 「끄는 법」이 없으면
 *  한 번 고정한 사람은 OS 를 바꿔도 사이트만 따라오지 않는다. */
function setTheme(t){
  const cur=document.documentElement.getAttribute('data-theme');
  if(cur===t){ document.documentElement.removeAttribute('data-theme'); t=null; }
  else { document.documentElement.setAttribute('data-theme',t); }
  try{ t? localStorage.setItem('joygo_theme',t) : localStorage.removeItem('joygo_theme'); }catch(e){}
  paintThemeButtons();
}
function paintThemeButtons(){
  const cur=document.documentElement.getAttribute('data-theme');
  document.querySelectorAll('.theme-toggle button').forEach(b=>
    b.classList.toggle('active', b.getAttribute('data-theme-set')===cur));
}
window.setTheme=setTheme;
document.addEventListener('DOMContentLoaded',paintThemeButtons);
paintThemeButtons();
