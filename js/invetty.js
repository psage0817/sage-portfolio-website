/* invetty.js: behaviour for the case study page
   1 process rail · 2 chat bubbles on the screens · 3 journey map zoom · 4 count-up numbers · 5 the two videos */
(()=>{
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const touchOnly=matchMedia('(hover:none)').matches;

/* ---------- 1. the process rail: appears after the header, marks the section you're in ---------- */
const rail=$('#rail'),rlinks=$$('#rail a'),hero=$('#top');
if(rail&&window.Fog){
  const secs=rlinks.map(a=>document.getElementById(a.dataset.sec));
  let last=-1e9;
  (function loop(){
    requestAnimationFrame(loop);
    const y=Fog.y;if(Math.abs(y-last)<.5)return;last=y;
    rail.classList.toggle('show',y>hero.offsetHeight*.55);
    let cur=0;
    secs.forEach((s,i)=>{if(s&&Fog.pageTop(s)<=y+innerHeight*.4)cur=i});
    rlinks.forEach((a,i)=>a.classList.toggle('on',i===cur));
  })();
}

/* ---------- 2. before/after screens: hover (or focus, or tap) and the chat bubbles arrive ---------- */
$$('.pair').forEach(pair=>{
  const scr=$('.screens',pair);let t=0;
  const on=()=>{clearTimeout(t);pair.classList.add('on')};
  const off=()=>{t=setTimeout(()=>pair.classList.remove('on'),180)};
  scr.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')on()});
  scr.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')off()});
  scr.addEventListener('focus',on);
  scr.addEventListener('blur',off);
  scr.addEventListener('click',()=>{if(touchOnly)pair.classList.toggle('on')});
});

/* ---------- 3. journey map: hover to zoom in and look around ---------- */
const jm=$('#jmap');
if(jm&&fine&&!RM){
  jm.addEventListener('pointerenter',()=>jm.classList.add('zoomed'));
  jm.addEventListener('pointerleave',()=>jm.classList.remove('zoomed'));
  jm.addEventListener('pointermove',e=>{
    const r=jm.getBoundingClientRect();
    jm.style.setProperty('--ox',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');
    jm.style.setProperty('--oy',((e.clientY-r.top)/r.height*100).toFixed(1)+'%');
  });
}else if(jm){jm.style.cursor='default';const h=$('.zhint',jm);h&&h.remove()}

/* ---------- 4. the three numbers count up when they come into view ---------- */
const counts=$$('.count');
if(counts.length&&!RM&&'IntersectionObserver'in window){
  counts.forEach(c=>{c.textContent='0'});
  const io=new IntersectionObserver(es=>es.forEach(e=>{
    if(!e.isIntersecting)return;
    io.unobserve(e.target);
    const el=e.target,to=+el.dataset.to,t0=performance.now(),dur=1100;
    (function step(now){
      const p=Math.min(1,(now-t0)/dur),eased=1-Math.pow(1-p,3);
      el.textContent=Math.round(to*eased);
      if(p<1)requestAnimationFrame(step);
    })(t0);
  }),{threshold:.6});
  counts.forEach(c=>io.observe(c));
}

/* ---------- 5. the two videos start together when you scroll to them and stay in sync ---------- */
const fin=$('#final'),vids=[$('#vA'),$('#vB')].filter(Boolean),btn=$('#vctl');
if(fin&&vids.length){
  let inView=false,userPaused=RM;               // reduced motion: wait for the viewer to press play
  const label=btn&&btn.querySelector('span');
  const sync=()=>{
    fin.classList.toggle('paused',userPaused);
    if(btn){btn.setAttribute('aria-label',userPaused?'Play the videos':'Pause the videos');label.textContent=userPaused?'play':'pause'}
  };
  const playAll=()=>{
    if(userPaused||!inView)return;
    vids.forEach(v=>{const p=v.play();if(p&&p.catch)p.catch(()=>{})});
  };
  const pauseAll=()=>vids.forEach(v=>v.pause());
  // the shorter video waits on its last frame; when both have finished, both restart together
  vids.forEach(v=>v.addEventListener('ended',()=>{
    if(vids.every(x=>x.ended)){vids.forEach(x=>{x.currentTime=0});playAll()}
  }));
  new IntersectionObserver(([e])=>{inView=e.isIntersecting;inView?playAll():pauseAll()},{threshold:.35}).observe(fin);
  if(btn)btn.addEventListener('click',()=>{userPaused=!userPaused;sync();userPaused?pauseAll():playAll()});
  sync();
}
})();
