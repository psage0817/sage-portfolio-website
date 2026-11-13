/* ui.js: small behaviours shared by every page
   1 menu highlight · 2 time chip (hover opens the sky slider) · 3 card tilt + glow
   4 magnetic buttons · 5 reveal on scroll */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 0. toast (a little message at the bottom) + cards that are "coming soon" ---------- */
let toastEl=null,toastT=0;
function toast(msg){
  if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';toastEl.setAttribute('role','status');document.body.appendChild(toastEl)}
  toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),2600);
}
window.sp={toast};
document.addEventListener('click',e=>{
  const c=e.target.closest&&e.target.closest('[data-soon]');
  if(c){e.preventDefault();toast('this case study is coming soon')}
});

/* ---------- 1. menu: a highlight glides to the link you hover ---------- */
const menu=$('.menu');
if(menu){
  const ind=document.createElement('i');ind.className='ind';menu.prepend(ind);
  const links=$$('a',menu),cur=menu.querySelector('a[aria-current]');
  const place=a=>{ind.style.width=a.offsetWidth+'px';ind.style.transform=`translateX(${a.offsetLeft}px)`;ind.style.opacity=1};
  links.forEach(a=>{a.addEventListener('pointerenter',()=>place(a));a.addEventListener('focus',()=>place(a))});
  menu.addEventListener('pointerleave',()=>cur?place(cur):(ind.style.opacity=0));
  menu.addEventListener('focusout',()=>cur?place(cur):(ind.style.opacity=0));
  const home=()=>cur?place(cur):(ind.style.opacity=0);
  home();addEventListener('resize',home);document.fonts&&document.fonts.ready.then(home);
}

/* ---------- 2. time chip: hover (or tap the sun) opens the slider; the little hint fades once used ---------- */
const time=$('.time'),hint=$('#timehint');
if(time){
  const seen=()=>{try{return sessionStorage.getItem('sp-time-hint')}catch(_){return null}};
  const used=()=>{hint&&hint.classList.add('gone');try{sessionStorage.setItem('sp-time-hint','1')}catch(_){}};
  if(hint){
    if(seen())hint.classList.add('gone');
    if(!fine)hint.querySelector('span').textContent='tap the sun to change the sky';
  }
  time.addEventListener('pointerenter',used);
  time.addEventListener('focusin',used);
  const sun=$('.time-sun',time);
  sun&&sun.addEventListener('click',()=>{if(!fine){time.classList.toggle('open');used()}});
  document.addEventListener('pointerdown',e=>{if(!fine&&!time.contains(e.target))time.classList.remove('open')});
}

/* ---------- 3. cards: tilt toward the cursor + a light that follows it ---------- */
if(fine&&!RM){
  $$('.fx').forEach(el=>{
    const tilt=parseFloat(el.dataset.tilt||'5');let raf=0,ev=null;
    const apply=()=>{
      raf=0;const r=el.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width,py=(ev.clientY-r.top)/r.height;
      el.style.setProperty('--mx',(px*100).toFixed(1)+'%');el.style.setProperty('--my',(py*100).toFixed(1)+'%');
      el.style.setProperty('--px',px.toFixed(3));el.style.setProperty('--py',py.toFixed(3));
      el.style.setProperty('--ry',((px-.5)*tilt).toFixed(2)+'deg');el.style.setProperty('--rx',((.5-py)*tilt).toFixed(2)+'deg');
    };
    el.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;ev=e;if(!raf)raf=requestAnimationFrame(apply)});
    el.addEventListener('pointerleave',()=>{
      ['--rx','--ry'].forEach(p=>el.style.setProperty(p,'0deg'));el.style.setProperty('--px','.5');el.style.setProperty('--py','.5');
    });
  });

  /* ---------- 4. magnetic buttons: they lean toward the cursor ---------- */
  $$('.mag').forEach(el=>{
    el.addEventListener('pointermove',e=>{
      const r=el.getBoundingClientRect();
      el.style.transform=`translate(${((e.clientX-r.left-r.width/2)*.22).toFixed(1)}px,${((e.clientY-r.top-r.height/2)*.28).toFixed(1)}px)`;
    });
    el.addEventListener('pointerleave',()=>{el.style.transform=''});
  });
}

/* ---------- 5. reveal on scroll (.rv / .rv-a; children of .stagger come in one after another) ---------- */
$$('.stagger').forEach(g=>[...g.children].forEach((c,i)=>c.style.setProperty('--d',(i*0.09).toFixed(2)+'s')));
const items=$$('.rv,.rv-a');
if(RM||!('IntersectionObserver'in window)){items.forEach(el=>el.classList.add('in'))}
else{
  const io=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}
  }),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  items.forEach(el=>io.observe(el));
}
})();
