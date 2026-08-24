function setLang(lang){
  if(!_L[lang]) lang='en';
  const d=_L[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(d[k]!=null)el.textContent=d[k];});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{const k=el.getAttribute('data-i18n-html');if(d[k]!=null)el.innerHTML=d[k];});
  document.documentElement.lang=lang;
  document.querySelectorAll('.lang-toggle button').forEach(b=>b.classList.toggle('active',b.getAttribute('data-lang')===lang));
  try{localStorage.setItem('joygo_lang',lang);}catch(e){}
}
(function(){
  let lang='en';
  try{const s=localStorage.getItem('joygo_lang');if(s)lang=s;else if((navigator.language||'').toLowerCase().startsWith('ko'))lang='ko';}catch(e){}
  setLang(lang);
  const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll('.fade').forEach(el=>io.observe(el));
  document.querySelectorAll('#navLinks a').forEach(a=>a.addEventListener('click',()=>document.getElementById('navLinks').classList.remove('open')));
})();
