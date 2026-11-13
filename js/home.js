/* home.js: rolling words + the work filters */
(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

/* ---------- rolling words (hover the sentence to pause them so you can read) ---------- */
const ADJ=['human centered','coffee loving','music obsessed','mildly perfectionistic','animal loving','creatively curious'],
      TAIL=['based in st. louis and san diego','who has too many tabs open','who loooves to sing','who always takes the scenic route'];
const tw=n=>{const r=document.createRange();r.selectNodeContents(n);return Math.ceil(r.getBoundingClientRect().width)};
function roller(el,list){
  let i=0;
  return{
    fix(){const w=el.querySelector('.w:not(.out)');if(w)el.style.width=tw(w)+'px'},
    next(){
      i=(i+1)%list.length;
      const old=el.querySelector('.w:not(.out)'),n=document.createElement('span');
      n.className='w';n.textContent=list[i];el.appendChild(n);el.style.width=tw(n)+'px';
      if(old){old.classList.add('out');setTimeout(()=>old.remove(),950)}
    }
  };
}
const adj=$('#adj'),tail=$('#tail');
if(adj&&tail){
  const R=[roller(adj,ADJ),roller(tail,TAIL)],fix=()=>R.forEach(r=>r.fix());
  let ri=0,paused=false;
  fix();addEventListener('resize',fix);document.fonts&&document.fonts.ready.then(fix);
  const sub=$('.sub');
  sub.addEventListener('pointerenter',()=>{paused=true});
  sub.addEventListener('pointerleave',()=>{paused=false});
  setInterval(()=>{if(!paused){R[ri].next();ri^=1}},2600);   // one timer alternates the two, so they never change together
}

/* ---------- filters: cards that don't match fade back (the layout stays put) ---------- */
const chips=$$('.fchip'),cards=$$('.card[data-cat]');
chips.forEach(c=>c.addEventListener('click',()=>{
  chips.forEach(x=>{x.classList.toggle('on',x===c);x.setAttribute('aria-pressed',x===c)});
  const f=c.dataset.f;
  cards.forEach(cd=>cd.classList.toggle('dim',f!=='all'&&!cd.dataset.cat.split(' ').includes(f)));
}));
})();
