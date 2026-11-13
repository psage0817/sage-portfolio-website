/* fog.js: the foggy-window engine shared by every page.
   Sky + skyline + frost, finger drawing + drips, hold-Shift breath, smooth scrolling,
   the time-of-day control, and (home page only) the handwritten title.
   Page-specific things live in home.js / invetty.js / ui.js. */
(()=>{
'use strict';

/* ==========================================================================
   0. SETTINGS — the knobs most likely to need tweaking
   ========================================================================== */
const CFG={
  tz:'America/Chicago',     // time zone driving the sky
  sceneQuality:.8,          // resolution of the blurred background (it's blurry anyway, so low is fine)
  maxQuality:2,             // resolution of the title + drawing layers (2 = full retina sharpness)
  maxPixels:4.5e6,          // safety cap on those layers for very large screens
  smoothMs:110,             // scroll smoothing (ms). Lower = snappier, higher = floatier
  smoothMsTouch:45,         // same, for touch screens (they already have momentum)
  parallax:1,               // background scroll speed vs the page: 1 = moves with the page, <1 = slower (more depth)
  frost:.26,                // glass frost level: 0 = clear, ~.6 = very milky
  writeMs:3800,             // how long each line of the title takes to write (ms)
  breathSize:90,            // size of the fog patch when you hold Shift and move the mouse (px)
  breathMs:5000,            // how long the fog takes to clear again (ms)
  titleTint:.6,             // how strongly the title is tinted darker (day) / lighter (night) than the glass behind it
  hintContrast:4,         // hints are tinted toward the background as far as this contrast allows (higher = darker/more readable)
  halo:.22,                 // text halo strength (0 = none). Contrast does most of the work
  inkDark:'#0a1f4a',        // text colour on light backgrounds
  inkLight:'#eef3ff',       // text colour on dark backgrounds
  titleFit:.56,             // title width as a share of the screen (wide screens)
  titleFitNarrow:.84,       // same, when the title wraps to two lines
  narrowAt:720,             // px: below this the title wraps to two lines
  anchorOffset:130          // px of space above a section when the menu scrolls to it
};
const QS=CFG.sceneQuality;   // background scale
let Q=1;                     // title / ink / mask scale (set in resize() from the screen's pixel density)
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE=matchMedia('(pointer: coarse)').matches;

/* ==========================================================================
   1. HELPERS
   ========================================================================== */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const cl=(v,a,b)=>Math.min(b,Math.max(a,v));
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const rgb=c=>`rgb(${c.map(Math.round)})`;
const rgba=(c,a)=>`rgba(${c.map(Math.round)},${a})`;

// seeded random numbers (same city every visit)
let sd=7;
const rnd=()=>{sd|=0;sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
// stable per-window random number (so lit windows don't flicker while scrolling)
const hash=(a,b,c)=>{let h=a*374761393+b*668265263+c*2147483647|0;h=(h^h>>>13)*1274126177|0;return((h^h>>>16)>>>0)/4294967296};

/* ==========================================================================
   2. TIME OF DAY
   ========================================================================== */
const P={
  night:{c:['#02040d','#060d29','#0b1a3d'].map(hex),l:1,k:.05},
  dawn: {c:['#3d4c8a','#d68aa2','#f7c690'].map(hex),l:.35,k:.6},
  day:  {c:['#2060d0','#4592e6','#78c0b6'].map(hex),l:0,k:1},
  dusk: {c:['#363c7d','#b8709a','#f0a070'].map(hex),l:.55,k:.7}
};
// sunrise 6:00, sunset 19:00
const K=[[0,'night'],[5,'night'],[6,'dawn'],[8.5,'day'],[16.5,'day'],[19,'dusk'],[20.5,'night'],[24,'night']];
function sample(h){
  let i=0;while(i<K.length-2&&h>K[i+1][0])i++;
  const[a,pa]=K[i],[b,pb]=K[i+1];
  let t=cl((h-a)/(b-a),0,1);t=t*t*(3-2*t);
  const A=P[pa],B=P[pb];
  return{c:A.c.map((x,j)=>mix(x,B.c[j],t)),l:A.l+(B.l-A.l)*t,k:A.k+(B.k-A.k)*t};
}
function ctHours(){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:CFG.tz,hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(new Date());
  const g=t=>+p.find(x=>x.type===t).value;
  return g('hour')+g('minute')/60+g('second')/3600;
}

/* ==========================================================================
   3. THE CITY
   One tall drawing that runs the full length of the page: sky at the top, a hazy
   skyline, then taller and closer towers, then the street at the very bottom.
   Scrolling just pans down it. Heights are in "screens" (vh = one screen tall).
   ========================================================================== */
const NIGHT=[8,12,30];
const LAYERS=[
  // zone = where the roofs sit · w/gap = widths · dark/haze = colour · cell = window grid · lit = share of lit windows
  {zone:(vh,T)=>[.50*vh,.68*vh],                                      w:[.035,.080],gap:[0,.012],   dark:.50,haze:.38,cell:[5,6],lit:.50},  // far skyline
  {zone:(vh,T)=>{const D=Math.max(0,T-.8*vh);return[.80*vh,.80*vh+.50*D]},   w:[.050,.110],gap:[.004,.03],dark:.70,haze:.20,cell:[6,8],lit:.55},  // mid towers
  {zone:(vh,T)=>{const D=Math.max(0,T-.8*vh);return[.80*vh+.20*D,.80*vh+.60*D]},w:[.060,.130],gap:[.012,.06],dark:.86,haze:.08,cell:[7,9],lit:.60}   // near towers
];
LAYERS.forEach((L,li)=>{
  L.b=[];
  for(let x=-.02,i=0;x<1.02;i++){
    const w=L.w[0]+rnd()*(L.w[1]-L.w[0]);
    L.b.push({id:li*1000+i,x,w,t:rnd(),bias:.4+.9*rnd()});     // t = 0..1 position inside the layer's roof zone
    x+=w+L.gap[0]+rnd()*(L.gap[1]-L.gap[0]);
  }
});
const STREET=Array.from({length:70},()=>({x:rnd(),y:rnd(),r:.008+rnd()*.02}));
const CLOUDS=Array.from({length:6},(_,i)=>({x:i/6+rnd()*.1,y:.08+rnd()*.35,s:.1+rnd()*.12}));

/* ==========================================================================
   4. CANVAS LAYERS
     cv / m  visible canvas                    S    scene, 1/3 resolution
     SH      sharp scene (seen where wiped)    Fs/Md  blur steps
     FG      frosted glass                     SK   finger strokes + drips
     CB      strokes + title (the "wipe" mask) TP   sharp scene cut by CB
     TF      title outline (page coords)       TX   title as written so far
     Mm      extra blur step          BR   breath fog (Shift + move), fades away
     SH, FG, DK and the blur steps are TALL (the whole page); SK (ink) is also page-tall.
     TT      ink tint                          DK/DS  light/dark tint map
   ========================================================================== */
const mk=()=>document.createElement('canvas');
const cv=$('#fog'),m=cv.getContext('2d');
const S=mk(),sx=S.getContext('2d'),
  Fs=mk(),fx=Fs.getContext('2d',{willReadFrequently:true}),
  Md=mk(),dx=Md.getContext('2d'),
  Mm=mk(),mx=Mm.getContext('2d'),
  SH=mk(),hx=SH.getContext('2d'),
  FG=mk(),gx=FG.getContext('2d'),
  SK=mk(),kx=SK.getContext('2d'),
  CB=mk(),bx=CB.getContext('2d'),
  TP=mk(),px=TP.getContext('2d'),
  TX=mk(),tx=TX.getContext('2d'),
  TF=mk(),ox=TF.getContext('2d'),
  TT=mk(),ttx=TT.getContext('2d'),
  BR=mk(),brx=BR.getContext('2d'),
  DK=mk(),dkx=DK.getContext('2d'),
  DS=mk(),dsx=DS.getContext('2d');

// shared state
let cssW=0,cssH=0,W=0,H=0,WS=0,HS=0;   // viewport in css px · in title/ink canvas px (W,H) · in background canvas px (WS,HS)
let SC=0,PHcss=0;                // height of the tall scene (canvas px) and of the page (css px)
let live=true,prevH=12,dirty=1,lastInk=0;
let vy=0,maxY=1,sy=0,lastAdapt=0;   // scroll: smoothed offset (css px), scroll range, same offset in canvas px
const curH=()=>live?ctHours():prevH;
const tl=document.querySelector('#tl'),tin=document.querySelector('#t'),tlive=document.querySelector('#live');   // time chip bits (all pages)

/* ==========================================================================
   5. SCENE  (sky, sun/moon, clouds, buildings, street)
   ========================================================================== */
function glow(c,x,y,r,col,a){
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,rgba(col,a));g.addColorStop(1,rgba(col,0));
  c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}

function drawScene(h,s){
  const c=sx,w=S.width,T=S.height,vh=HS/3;      // T = whole scene height, vh = one screen, both in scene pixels

  // sky: the original one-screen gradient; below the horizon it just holds its colour
  const g=c.createLinearGradient(0,0,0,vh);
  g.addColorStop(0,rgb(s.c[0]));g.addColorStop(.55,rgb(s.c[1]));g.addColorStop(1,rgb(s.c[2]));
  c.fillStyle=g;c.fillRect(0,0,w,T);

  // sun
  const t=(h-6)/13,sa=cl((t+.06)/.12,0,1)*cl((1.06-t)/.12,0,1);
  if(sa>0){
    const e=Math.sin(Math.PI*cl(t,0,1));
    glow(c,w*(.15+.7*cl(t,-.05,1.05)),vh*(.66-.5*e),vh*(.35+.1*(1-e)),mix([255,170,110],[255,244,214],e),.9*sa);
  }
  // moon
  const tm=((h-19+24)%24)/11;
  if(tm<1&&s.l>0){
    const x=w*(.85-.7*tm),y=vh*(.55-.35*Math.sin(Math.PI*tm));
    glow(c,x,y,vh*.3,[190,205,255],.5*s.l);glow(c,x,y,vh*.05,[235,240,255],.9*s.l);
  }
  // clouds
  const cc=mix([255,255,255],s.c[2],.25);
  for(const k of CLOUDS){
    const x=((k.x+h*.012)%1.3-.15)*w,y=k.y*vh;
    for(let j=0;j<5;j++)glow(c,x+(j-2)*k.s*vh*.7,y+(j%2?-1:1)*k.s*vh*.15,k.s*vh*.9,cc,s.k*.5);
  }

  // buildings, far to near
  LAYERS.forEach((L,li)=>{
    const[lo,hi]=L.zone(vh,T),body=mix(mix(s.c[1],NIGHT,L.dark),s.c[2],L.haze);
    c.fillStyle=rgb(body);
    for(const b of L.b){const y0=lo+(hi-lo)*b.t;c.fillRect(b.x*w,y0,b.w*w+1,T-y0+2)}

    // windows: warm lights at night, faint glass by day
    const cw=L.cell[0],ch=L.cell[1],ww=Math.max(1.2,cw*.42),wh=Math.max(1.4,ch*.42);
    const eachWindow=fn=>{
      for(const b of L.b){
        const y0=lo+(hi-lo)*b.t,cols=Math.max(1,Math.floor(b.w*w/cw)-1),rows=Math.ceil((T-y0)/ch);
        for(let r=0;r<rows;r++)for(let q=0;q<cols;q++)fn(b,q,r,b.x*w+cw*.6+q*cw,y0+ch*(r+.6));
      }
    };
    if(s.l>.05){
      c.fillStyle=rgba([255,196,110],.9*s.l);
      eachWindow((b,q,r,x,y)=>{if(hash(b.id,q,r)<L.lit*b.bias)c.fillRect(x,y,ww,wh)});
    }
    if(s.l<.95){
      c.fillStyle=rgba(mix(body,[210,230,255],.5),.45*(1-s.l));
      eachWindow((b,q,r,x,y)=>{if(hash(b.id,q,r+999)<.75)c.fillRect(x,y,ww,wh)});
    }

    // haze at the horizon, between the far skyline and the nearer towers
    if(li===0){
      const hy=vh*.74,hz=c.createLinearGradient(0,hy-vh*.18,0,hy+vh*.06);
      hz.addColorStop(0,rgba(s.c[2],0));hz.addColorStop(.75,rgba(s.c[2],.4));hz.addColorStop(1,rgba(s.c[2],0));
      c.fillStyle=hz;c.fillRect(0,hy-vh*.18,w,vh*.24);
    }
  });

  // street at the very bottom of the page
  const gy=T-vh*.16;
  c.fillStyle=rgb(mix(s.c[1],[6,10,24],.9));c.fillRect(0,gy,w,T-gy+2);
  if(s.l>.05)for(const q of STREET)glow(c,q.x*w,gy+vh*(.01+q.y*.14),q.r*vh,[255,190,110],.6*s.l);
}

/* ==========================================================================
   6. FROSTED GLASS + ADAPTIVE TEXT COLOUR
   ========================================================================== */
const lin=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};
const lum=c=>.2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
const INK_D=hex(CFG.inkDark),INK_L=hex(CFG.inkLight),LD=lum(INK_D),LL=lum(INK_L);
const VEIL_DAY=[214,230,252],VEIL_NIGHT=[12,24,58],TINT_D=[10,32,84],TINT_L=[238,243,255];
let nightL=0,veilCol=VEIL_DAY;                       // colour of the frost layer (milky blue by day, deep navy at night)
let FD=null,FW=0,FH=0,veilA=.3;
// how far down the tall background we're looking right now (canvas px)
const sceneOff=()=>cl(vy*QS*CFG.parallax,0,Math.max(0,SC-HS));

// dark text or light text? picks the better contrast; `prev` adds a little hysteresis so it never flickers
function pickDark(c,prev){
  const l=lum(c),d=ratio(l,LD),w=ratio(l,LL),bias=prev===true?1.1:prev===false?.9:1;
  return d*bias>=w;
}
// average colour of the fog behind a rectangle (viewport px)
function sampleRect(r){
  const so=sceneOff(),kx_=FW/cssW,ky_=FH/SC;
  const x0=cl(Math.floor(r.left*kx_),0,FW-1),x1=cl(Math.ceil(r.right*kx_),x0+1,FW);
  const y0=cl(Math.floor((r.top*QS+so)*ky_),0,FH-1),y1=cl(Math.ceil((r.bottom*QS+so)*ky_),y0+1,FH);
  let R=0,G=0,B=0,n=0;
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*FW+xx)*4;R+=FD[i];G+=FD[i+1];B+=FD[i+2];n++}
  return mix([R/n,G/n,B/n],veilCol,veilA);
}
// lightest version of `ink` that still reads clearly on `bg`: slide the text colour toward the background until contrast hits the target
function softInk(ink,bg,target){
  const lb=lum(bg);
  if(ratio(lum(ink),lb)<target)return ink;
  let lo=0,hi=1;
  for(let i=0;i<9;i++){const t=(lo+hi)/2;if(ratio(lum(mix(ink,bg,t)),lb)>=target)lo=t;else hi=t}
  return mix(ink,bg,lo);
}
// re-colour text so it stays readable on whatever is behind it right now
let adaptEls=[];
function adaptInk(){
  if(!FD)return;
  lastAdapt=performance.now();
  for(const el of adaptEls){
    const r=el.getBoundingClientRect();
    if(r.bottom<0||r.top>cssH)continue;                 // off-screen: leave as is
    const bg=sampleRect(r),d=pickDark(bg,el._d);el._d=d;
    el.style.setProperty('--ink',el.hasAttribute('data-soft')?rgb(softInk(d?INK_D:INK_L,bg,CFG.hintContrast)):(d?CFG.inkDark:CFG.inkLight));
    el.style.setProperty('--halo',rgba(d?[255,255,255]:[5,8,22],CFG.halo));
  }
}

// redraw the whole tall background for the current sky (runs on load, resize and as the time of day changes; NOT on scroll)
function build(h){
  const s=sample(h);
  drawScene(h,s);
  hx.drawImage(S,0,0,WS,SC);                                       // sharp scene
  // heavy blur, built up in small steps so it stays perfectly smooth (no blocks, no grain)
  fx.drawImage(S,0,0,FW,FH);dx.drawImage(Fs,0,0,Md.width,Md.height);mx.drawImage(Md,0,0,Mm.width,Mm.height);gx.drawImage(Mm,0,0,WS,SC);
  // frost: a milky layer (strength = CFG.frost) plus a soft sheen. By night the milk turns deep navy so the glass stays dark, not grey
  nightL=s.l;veilCol=mix(VEIL_DAY,VEIL_NIGHT,s.l*.92);
  veilA=CFG.frost+.14*(1-s.l);
  gx.fillStyle=rgba(veilCol,veilA);gx.fillRect(0,0,WS,SC);
  const sk=1-.75*s.l,sh=gx.createLinearGradient(0,0,WS*.65,SC);
  sh.addColorStop(0,`rgba(255,255,255,${.14*sk})`);sh.addColorStop(.5,`rgba(255,255,255,${.02*sk})`);sh.addColorStop(1,`rgba(255,255,255,${.06*sk})`);
  gx.fillStyle=sh;gx.fillRect(0,0,WS,SC);

  // tint map for the title + ink: a DARKER version of the glass where the glass is light, a LIGHTER version where it is dark
  FD=fx.getImageData(0,0,FW,FH).data;
  const o=dsx.createImageData(FW,FH);
  for(let i=0;i<FD.length;i+=4){
    const l=lum(mix([FD[i],FD[i+1],FD[i+2]],veilCol,veilA)),t=cl(.5+.4*Math.log2(ratio(l,LD)/ratio(l,LL)),0,1),c=t>=.5?TINT_D:TINT_L;
    o.data[i]=c[0];o.data[i+1]=c[1];o.data[i+2]=c[2];
    o.data[i+3]=255*Math.abs(t-.5)*2;
  }
  dsx.putImageData(o,0,0);dkx.clearRect(0,0,WS,SC);dkx.drawImage(DS,0,0,WS,SC);

  adaptInk();

  // time chip: "it is 5:34 PM in my timezone" (or the previewed time while scrubbing)
  const mins=Math.floor(h*60)%1440,hr=Math.floor(mins/60),mn=mins%60,clock=`${(hr%12)||12}:${String(mn).padStart(2,'0')} ${hr<12?'AM':'PM'}`;
  if(tl)tl.textContent=live?`it is ${clock} in my timezone`:`previewing ${clock}`;
  if(live&&tin)tin.value=mins;
  // colours the page's glass panels follow as the sky changes (light and milky by day, deep navy at night)
  const N=s.l,rt=document.documentElement.style;
  rt.setProperty('--sky',rgb(s.c[0]));
  rt.setProperty('--night',N.toFixed(3));
  // light glass with dark text by day, dark glass with light text from dusk on (a hard switch, so the text never sits mid-grey on mid-grey)
  const dk=N>.42;
  rt.setProperty('--glass-bg',dk?'rgba(22,32,76,.64)':'rgba(255,255,255,.56)');
  rt.setProperty('--glass-line',dk?'rgba(255,255,255,.18)':'rgba(255,255,255,.7)');
  rt.setProperty('--glass-ink',dk?'#eef3ff':'#0b1f4d');
  rt.setProperty('--glass-ink2',dk?'#b6c9ee':'#274a82');
  rt.setProperty('--sheet-bg',rgba(mix([34,48,92],[8,14,38],N),.56+.04*N));
  dirty=1;
}

/* ==========================================================================
   7. TITLE  (handwritten "hi, i'm sage park")
   Drawn in page coordinates, so it scrolls away with the page.
   ========================================================================== */
let fs=0,lines=[],slot,scroller;
function pageTop(el){return el.getBoundingClientRect().top+vy}   // element's distance from the top of the page

function layoutTitle(){
  const narrow=cssW<CFG.narrowAt,words=narrow?['hi, i\u2019m','sage park']:['hi, i\u2019m sage park'];
  ox.clearRect(0,0,W,H);
  ox.font='100px "Beth Ellen",cursive';
  const widest=Math.max(...words.map(t=>ox.measureText(t).width));
  fs=Math.min(100*(cssW*(narrow?CFG.titleFitNarrow:CFG.titleFit)*Q)/widest,cssH*.24*Q,240*Q);

  // reserve the title's space in the page so the text below flows underneath it
  slot.style.height=(fs/Q*(1.45+1.4*(words.length-1)))+'px';
  const top=pageTop(slot)*Q;

  ox.font=`${fs}px "Beth Ellen",cursive`;ox.textBaseline='alphabetic';ox.lineJoin='round';
  ox.fillStyle=ox.strokeStyle='#fff';ox.lineWidth=fs*.012;
  lines=words.map((t,i)=>{
    const w=ox.measureText(t).width,x0=(W-w)/2,b=top+fs*(1+1.4*i);
    ox.strokeText(t,x0,b);ox.fillText(t,x0,b);
    return{t,x0,x1:x0+w,y0:b-fs,y1:b+fs*.6,b};
  });
}

/* ==========================================================================
   8. HANDWRITING ANIMATION
   Thin the rendered text to a centre line, walk a pen along it, and reveal
   the glyphs under the pen.
   ========================================================================== */
let written=false,writing=false,wst=0,fadeAt=0,textA=0,paths=[];

function thin(a,w,h){   // Zhang-Suen thinning
  let ch=true;
  while(ch){ch=false;for(let pass=0;pass<2;pass++){const del=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x;if(!a[i])continue;
      const p2=a[i-w],p3=a[i-w+1],p4=a[i+1],p5=a[i+w+1],p6=a[i+w],p7=a[i+w-1],p8=a[i-1],p9=a[i-w-1],B=p2+p3+p4+p5+p6+p7+p8+p9;
      if(B<2||B>6)continue;
      const A=(!p2&&p3?1:0)+(!p3&&p4?1:0)+(!p4&&p5?1:0)+(!p5&&p6?1:0)+(!p6&&p7?1:0)+(!p7&&p8?1:0)+(!p8&&p9?1:0)+(!p9&&p2?1:0);
      if(A!==1)continue;
      if(pass===0){if(p2*p4*p6||p4*p6*p8)continue}else{if(p2*p4*p8||p2*p6*p8)continue}
      del.push(i);
    }
    for(const i of del)a[i]=0;if(del.length)ch=true}}
}
function prune(a,w,h,n){   // shave short side-branches off the centre line (strip end pixels n times)
  for(let it=0;it<n;it++){
    const del=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x;if(!a[i])continue;
      const d=a[i-w-1]+a[i-w]+a[i-w+1]+a[i-1]+a[i+1]+a[i+w-1]+a[i+w]+a[i+w+1];
      if(d===1)del.push(i);
    }
    if(!del.length)break;
    for(const i of del)a[i]=0;
  }
}
function rescue(a0,a,w,h){
  const lab=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(!a0[i]||lab[i])continue;
    const pix=[i];lab[i]=1;let has=false,sx=0,sy=0;
    for(let q=0;q<pix.length;q++){
      const c=pix[q],cx=c%w,cy=(c/w)|0;if(a[c])has=true;sx+=cx;sy+=cy;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const n=(cy+dy)*w+cx+dx;if(a0[n]&&!lab[n]){lab[n]=1;pix.push(n)}}
    }
    if(!has){                                         // no centre line left: use the shape's centre
      let best=pix[0],bd=1e18;const mx=sx/pix.length,my=sy/pix.length;
      for(const c of pix){const d=((c%w)-mx)**2+(((c/w)|0)-my)**2;if(d<bd){bd=d;best=c}}
      a[best]=1;
    }
  }
}
// Builds ONE pen path that writes the text strictly in order, one letter at a time, left to right.
// gl[] says which letter (1..n, in reading order) each centre-line pixel belongs to.
// How each letter is started, following standard cursive:
//   'lowleft' (default) = enter at the bottom-left and stroke UP (h i m r s k e ...)
//   'bowl'  = round letters start at the top of the oval and go COUNTER-CLOCKWISE (a g c d o q)
//   'top'   = start at the top of the stem and pull down (p)
const HINT={a:'bowl',g:'bowl',c:'bowl',d:'bowl',o:'bowl',q:'bowl',p:'top',b:'top',f:'top'};
function order(a,w,h,gl,n,chars){
  const nb=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]],vis=new Uint8Array(w*h),cid=new Uint8Array(w*h),res=[],byG=Array.from({length:n},()=>[]);
  for(let i=0;i<a.length;i++)if(a[i]&&gl[i])byG[gl[i]-1].push(i);
  for(const pix of byG){
    if(!pix.length)continue;
    const g=gl[pix[0]];let y0=1e9,y1=-1;
    // the letter's main body = its biggest connected piece (the stem of an "i"); dots and tips come after it
    let main=null;
    for(const i of pix){
      if(cid[i])continue;
      const q=[i];cid[i]=1;
      for(let t=0;t<q.length;t++){const c=q[t];for(const[dx,dy]of nb){const m2=c+dy*w+dx;if(a[m2]&&gl[m2]===g&&!cid[m2]){cid[m2]=1;q.push(m2)}}}
      if(!main||q.length>main.length)main=q;
    }
    for(const i of main){const y=(i/w)|0;if(y<y0)y0=y;if(y>y1)y1=y}
    // where does this letter start, and which way does the pen first head?
    const mode=HINT[(chars[g-1]||'').toLowerCase()]||'lowleft';
    let start=-1,d0=[0,-1],best=1e18,anyStart=main[0],anyBest=1e18,mx0=1e9,mx1=-1;
    for(const i of main){const x=i%w;if(x<mx0)mx0=x;if(x>mx1)mx1=x}
    if(mode==='bowl'){                                         // top of the oval, heading left (counter-clockwise)
      const lim=mx0+(mx1-mx0)*.7;let by=1e9;
      for(const i of main){const x=i%w,y=(i/w)|0;if(x<=lim&&y<by){by=y;start=i}}
      d0=[-1,0];
    }else{
      const topLimit=y0+(y1-y0)*.42;
      for(const i of main){
        const x=i%w,y=(i/w)|0;let deg=0;
        for(const[dx,dy]of nb){const q=i+dy*w+dx;if(a[q]&&gl[q]===g)deg++}
        if(mode==='top'){                                      // stroke end near the top, else the top-left
          const sc=y+.3*x;
          if(deg<=1&&y<=topLimit&&sc<best){best=sc;start=i}
          if(sc<anyBest){anyBest=sc;anyStart=i}
        }else{                                                 // bottom-left stroke end (the entry stroke)
          const sc=x-.35*y;
          if(deg<=1&&sc<best){best=sc;start=i}
          if(sc<anyBest){anyBest=sc;anyStart=i}
        }
      }
      if(mode==='top')d0=[0,1];
    }
    if(start<0)start=anyStart;
    // walk the strokes of this letter (the dot of an "i" is picked up last, from the nearest unvisited point)
    const out=[];let from=start;
    for(;;){
      const stack=[from];
      while(stack.length){
        const c=stack.pop();if(vis[c])continue;vis[c]=1;out.push(c);
        let dx0=d0[0],dy0=d0[1];
        if(out.length>1){const pc=out[out.length-2],ddx=(c%w)-(pc%w),ddy=((c/w)|0)-((pc/w)|0);if(Math.abs(ddx)<=1&&Math.abs(ddy)<=1&&(ddx||ddy)){dx0=ddx;dy0=ddy}}
        const cand=[];
        for(const[dx,dy]of nb){const q=c+dy*w+dx;if(a[q]&&gl[q]===g&&!vis[q])cand.push([q,dx*dx0+dy*dy0])}
        cand.sort((p,q)=>p[1]-q[1]);                       // best continuation last => popped first
        for(const k of cand)stack.push(k[0]);
      }
      const last=out[out.length-1],lx=last%w,ly=(last/w)|0;let nxt=-1,bd=1e18;
      for(const i of pix)if(!vis[i]){const d=((i%w)-lx)**2+(((i/w)|0)-ly)**2;if(d<bd){bd=d;nxt=i}}
      if(nxt<0)break;from=nxt;
    }
    for(const i of out)res.push(i);
  }
  return res;
}
function trace(L){      // pen path for one line of text
  const ts=Math.min(1,.8/Q);                        // trace a smaller copy: same shape, far faster on retina
  const pad=Math.ceil(fs*.15),x0=Math.max(0,Math.floor(L.x0-pad)),x1=Math.min(W,Math.ceil(L.x1+pad)),y0=Math.max(0,Math.floor(L.y0)),y1=Math.min(H,Math.ceil(L.y1)),sw=x1-x0,sh=y1-y0;
  if(sw<=0||sh<=0)return{pts:[],ends:[]};
  const w=Math.max(3,Math.round(sw*ts)),h=Math.max(3,Math.round(sh*ts));
  const tmp=mk();tmp.width=w;tmp.height=h;const tc=tmp.getContext('2d',{willReadFrequently:true});
  tc.drawImage(TF,x0,y0,sw,sh,0,0,w,h);
  const id=tc.getImageData(0,0,w,h).data,a=new Uint8Array(w*h);
  for(let k=0;k<a.length;k++)a[k]=id[k*4+3]>110?1:0;
  for(let x=0;x<w;x++)a[x]=a[(h-1)*w+x]=0;for(let y=0;y<h;y++)a[y*w]=a[y*w+w-1]=0;
  const a0=Uint8Array.from(a);
  thin(a,w,h);
  prune(a,w,h,Math.max(2,Math.round(fs*ts*.06)));     // trim the little spurs serifs leave behind
  rescue(a0,a,w,h);                                   // thinning erases tiny shapes (i-dots): put a point back for each
  const kx_=sw/w,ky_=sh/h;
  // which letter does each pixel belong to? (from where each character sits in the text)
  const t=L.t,xs=[L.x0];for(let k=1;k<=t.length;k++)xs.push(L.x0+ox.measureText(t.slice(0,k)).width);
  const gl=new Uint8Array(w*h);
  for(let i=0;i<a.length;i++)if(a[i]){
    const X=x0+(i%w)*kx_;let k=0;while(k<t.length-1&&X>=xs[k+1])k++;
    while(k>0&&t[k]===' ')k--;                          // a pixel never belongs to a space
    gl[i]=k+1;
  }
  const ord=order(a,w,h,gl,t.length,t),pts=[],ends=[];
  let cur=-1;
  for(const i of ord){
    const k=gl[i]-1;
    if(k!==cur){if(cur>=0)ends.push({n:pts.length,k:cur});cur=k}
    pts.push([x0+(i%w)*kx_,y0+((i/w)|0)*ky_]);
  }
  if(cur>=0)ends.push({n:pts.length,k:cur});
  // where each letter's box sits: when the pen reaches the end of a letter, that whole box gets filled in
  for(const e of ends){e.xa=e.k===0?L.x0-fs*.2:xs[e.k];e.xb=e.k===t.length-1?L.x1+fs*.2:xs[e.k+1]}
  return{pts,ends};
}
// The title is written by one pen: it starts at the top of the "h" and goes letter by letter to the end of "park".
function startWrite(){
  if(!lines.length)return;
  if(RM){tx.drawImage(TF,0,0);written=true;textA=.8;fadeAt=0;dirty=1;return}
  let t0=0;
  paths=lines.map(L=>{
    const tr=trace(L),pts=tr.pts,p={pts,ends:tr.ends,e:0,L,t0,dur:CFG.writeMs,i:0,d:0,slots:[],totalW:0,fills:[]};
    // time slices: a letter gets time in proportion to its length, but never less than 80% of an average letter
    const avg=pts.length/Math.max(1,tr.ends.length);let prev=0;
    for(const E of tr.ends){const wgt=Math.max(E.n-prev,avg*.8);p.slots.push({s:prev,e:E.n,c0:p.totalW,c1:p.totalW+wgt});p.totalW+=wgt;prev=E.n}
    t0+=CFG.writeMs+350;return p;
  });
  wst=performance.now();writing=true;textA=1;
}
function stepWrite(now){
  const t=now-wst;let done=true;
  for(const p of paths){
    const n=p.pts.length;
    if(!n){if(t>=p.t0&&!p.d){tx.drawImage(TF,0,0);p.d=1}else if(!p.d)done=false;continue}
    const f=cl((t-p.t0)/p.dur,0,1);                            // steady pen speed along the whole path
    let k=n;
    if(f<1){                                                     // which letter's time slice are we in, and how far along it?
      const tw=f*p.totalW;let j=0;while(j<p.slots.length-1&&tw>=p.slots[j].c1)j++;
      const S=p.slots[j],u=cl((tw-S.c0)/(S.c1-S.c0),0,1),ue=.5*u+.5*u*u*(3-2*u);   // each letter eases in and out, like a real pen
      k=Math.floor(S.s+ue*(S.e-S.s));
    }
    if(k>p.i){
      const r=fs*.1;let bx0=1e9,by0=1e9,bx1=-1,by1=-1;
      tx.save();tx.beginPath();
      for(let j=p.i;j<k;j++){
        const q=p.pts[j];tx.moveTo(q[0]+r,q[1]);tx.arc(q[0],q[1],r,0,6.283);
        if(q[0]<bx0)bx0=q[0];if(q[0]>bx1)bx1=q[0];if(q[1]<by0)by0=q[1];if(q[1]>by1)by1=q[1];
      }
      tx.clip();
      const rx=Math.max(0,Math.floor(bx0-r-2)),ry=Math.max(0,Math.floor(by0-r-2)),rw=Math.min(W,Math.ceil(bx1+r+2))-rx,rh=Math.min(H,Math.ceil(by1+r+2))-ry;
      if(rw>0&&rh>0)tx.drawImage(TF,rx,ry,rw,rh,rx,ry,rw,rh);   // only redraw the small area the pen just covered
      tx.restore();
      // a letter is never left half-written: when the pen reaches its end, the rest of the letter fades in
      while(p.e<p.ends.length&&p.ends[p.e].n<=k)p.fills.push({E:p.ends[p.e++],t0:now});
      const q=p.pts[k-1];stamp(q[0],q[1],fs*.17);p.i=k;            // soft glow under the pen
    }
    for(let m=p.fills.length-1;m>=0;m--){
      const F=p.fills[m],E=F.E,ya=Math.max(0,Math.floor(p.L.y0-fs*.3)),yh=Math.min(H,Math.ceil(p.L.y1+fs*.3))-ya,xa=Math.max(0,Math.floor(E.xa)),xw=Math.min(W,Math.ceil(E.xb))-xa;
      const last=now-F.t0>=170;
      if(xw>0&&yh>0){tx.save();tx.globalAlpha=last?1:.45;tx.drawImage(TF,xa,ya,xw,yh,xa,ya,xw,yh);tx.restore()}
      if(last)p.fills.splice(m,1);
    }
    if(p.fills.length)done=false;
    if(p.i<n)done=false;
  }
  if(done){
    writing=false;written=true;fadeAt=now+1200;tx.drawImage(TF,0,0);
    if(!RM)for(let k=0;k<5;k++)setTimeout(()=>{
      const L=lines[lines.length-1];if(!L)return;
      spawn(L.x0+rnd()*(L.x1-L.x0),L.b);                        // a few drips off the last line
    },1800+k*900);
  }
}

/* ==========================================================================
   9. FINGER DRAWING + DRIPS  (lives on the glass, so it stays put while scrolling)
   ========================================================================== */
// Everything drawn on the glass (strokes, drips, the title) lives in PAGE coordinates,
// so it all scrolls with the site.
let inkY0=1e9,inkY1=-1;                                   // rows of the ink layer that currently hold ink (so fading stays cheap)
const inkTouch=(a,b)=>{if(a<inkY0)inkY0=a;if(b>inkY1)inkY1=b};
const drips=[];
function stamp(x,y,r){inkTouch(y-r,y+r);
  const g=kx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,'rgba(255,255,255,.85)');g.addColorStop(1,'rgba(255,255,255,0)');
  kx.fillStyle=g;kx.fillRect(x-r,y-r,r*2,r*2);lastInk=performance.now();
}
function seg(x1,y1,x2,y2){
  inkTouch(Math.min(y1,y2),Math.max(y1,y2));
  kx.save();kx.lineCap=kx.lineJoin='round';kx.lineWidth=24*Q;kx.strokeStyle='#fff';kx.shadowColor='#fff';kx.shadowBlur=12*Q;
  kx.beginPath();kx.moveTo(x1,y1);kx.lineTo(x2,y2);kx.stroke();kx.restore();lastInk=performance.now();
}
function spawn(x,y){
  if(RM||drips.length>28)return;
  drips.push({x,y,py:y,v:(14+rnd()*26)*Q,max:(40+rnd()*110)*Q,d:0,stop:0});lastInk=performance.now();
}
function stepDrips(now,dt){
  for(let i=drips.length-1;i>=0;i--){
    const d=drips[i];
    if(!d.stop){
      const dy=d.v*dt/1000*(1+d.d/(d.max*2));d.y+=dy;d.d+=dy;inkTouch(d.py,d.y);
      kx.save();kx.lineCap='round';kx.strokeStyle='#fff';kx.lineWidth=4*Q;kx.beginPath();kx.moveTo(d.x,d.py);kx.lineTo(d.x,d.y);kx.stroke();kx.restore();
      d.py=d.y;lastInk=now;
      if(d.d>d.max)d.stop=now;
    }else if(now-d.stop>3000)drips.splice(i,1);
  }
}

let down=false,lx=0,ly=0,acc=0,dist=0;
const pt=e=>[e.clientX*Q,e.clientY*Q+sy];   // screen position -> page position
const skip=e=>e.target.closest&&e.target.closest('.menu,.time,.rail,a,button,input,video,.screens,.final,.zoomable,.no-draw');   // clicks on controls and links shouldn't leave a mark

document.addEventListener('pointerdown',e=>{
  if(skip(e)||e.button>0)return;                  // primary button / touch / pen only
  down=true;acc=dist=0;[lx,ly]=pt(e);seg(lx,ly,lx+.01,ly);
  document.body.classList.add('drawn');
});
document.addEventListener('pointermove',e=>{
  if(!down)return;
  if(!e.buttons){down=false;return}               // button released outside the window: stop drawing
  const evs=(e.getCoalescedEvents&&e.getCoalescedEvents())||[];
  for(const ev of(evs.length?evs:[e])){           // coalesced events = smoother strokes on fast drags
    const[x,y]=pt(ev),d=Math.hypot(x-lx,y-ly);
    seg(lx,ly,x,y);acc+=d;dist+=d;
    if(acc>70*Q){acc=0;if(rnd()<.55)spawn(x+(rnd()-.5)*12*Q,y+10*Q)}
    lx=x;ly=y;
  }
});
['pointerup','pointercancel'].forEach(n=>document.addEventListener(n,()=>{down=false}));
addEventListener('blur',()=>{down=false});

// BREATH: hold Shift and move the mouse over the page to fog the glass up, like breathing on a window.
// The fog covers up the clear marks (drawings, title) under it, then slowly evaporates and they come back.
let breathLive=false,lastBreath=0,bfx=0,bfy=0,bfHas=false,breathAcc=0;
function breathe(e){
  const x=e.clientX*Q,y=e.clientY*Q,R=CFG.breathSize*Q;
  if(!bfHas){bfx=x;bfy=y;bfHas=true}
  const steps=Math.max(1,Math.ceil(Math.hypot(x-bfx,y-bfy)/(R*.25)));
  for(let i=1;i<=steps;i++){                         // soft puffs along the path so fast moves don't leave gaps
    const px_=bfx+(x-bfx)*i/steps,py_=bfy+(y-bfy)*i/steps,g=brx.createRadialGradient(px_,py_,0,px_,py_,R);
    g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(.6,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');
    brx.fillStyle=g;brx.fillRect(px_-R,py_-R,R*2,R*2);
  }
  bfx=x;bfy=y;breathLive=true;lastBreath=performance.now();dirty=1;
  document.body.classList.add('breathed');
}
document.addEventListener('pointermove',e=>{
  if(!e.shiftKey||down||e.pointerType==='touch'){bfHas=false;return}
  breathe(e);
});
addEventListener('keyup',e=>{if(e.key==='Shift')bfHas=false});

// a drag that started on a work card shouldn't also count as a click on it
document.addEventListener('click',e=>{
  if(dist>8*Q){e.preventDefault();e.stopPropagation()}
  dist=0;
},true);

/* ==========================================================================
   10. RENDER  (one composite per frame)
   ========================================================================== */
function render(now){
  const so=sceneOff();                                   // how far down the tall background we are
  m.globalCompositeOperation='source-over';m.drawImage(FG,0,so,WS,HS,0,0,W,H);

  // wiped areas = finger strokes + the title; both are page-tall, so they scroll with the page
  bx.clearRect(0,0,W,H);bx.drawImage(SK,0,-sy);
  if(textA>0){bx.globalAlpha=textA;bx.drawImage(TX,0,-sy);bx.globalAlpha=1}
  if(breathLive){bx.globalCompositeOperation='destination-out';bx.drawImage(BR,0,0);bx.globalCompositeOperation='source-over'}   // breath fog hides the clear marks

  // reveal the sharp scene through the wipe
  px.globalCompositeOperation='source-over';px.clearRect(0,0,W,H);px.drawImage(SH,0,so,WS,HS,0,0,W,H);
  px.globalCompositeOperation='destination-in';px.drawImage(CB,0,0);
  m.drawImage(TP,0,0);

  // soft glow around the wipe
  m.save();m.globalCompositeOperation='lighter';m.globalAlpha=.3;m.shadowColor='rgba(255,255,255,.85)';m.shadowBlur=18*Q;m.shadowOffsetX=W+200;
  m.drawImage(CB,-W-200,0);m.restore();

  // ink tint
  ttx.globalCompositeOperation='source-over';ttx.clearRect(0,0,W,H);ttx.drawImage(CB,0,0);
  ttx.globalCompositeOperation='source-in';ttx.fillStyle='#fff';ttx.fillRect(0,0,W,H);
  ttx.globalCompositeOperation='source-atop';ttx.drawImage(DK,0,so,WS,HS,0,0,W,H);
  m.globalAlpha=Math.min(1,CFG.titleTint+.28*nightL);m.drawImage(TT,0,0);m.globalAlpha=1;

  // drip heads
  for(const d of drips){
    const a=d.stop?cl(1-(now-d.stop)/2500,0,1):1;if(a<=0)continue;
    m.fillStyle=`rgba(255,255,255,${.55*a})`;m.beginPath();m.arc(d.x,d.y-sy,3.6*Q,0,6.283);m.fill();
  }

  // breath haze on top: the glass looks milkier where you've breathed on it
  if(breathLive){m.globalAlpha=.42*(1-.45*nightL);m.drawImage(BR,0,0);m.globalAlpha=1}
}

/* ==========================================================================
   11. SMOOTH SCROLL
   The browser still does the real scrolling (wheel, touch, keyboard, scrollbar).
   We ease a visual offset toward it and apply that one number to both the page
   content and the canvas title, so everything moves together, perfectly in sync.
   ========================================================================== */
function measurePage(){
  document.body.style.height=scroller.offsetHeight+'px';
  const de=document.documentElement;
  maxY=Math.max(1,de.scrollHeight-de.clientHeight);
  PHcss=scroller.offsetHeight;
}
function stepScroll(dt){
  const target=window.scrollY,ms=RM?0:(COARSE?CFG.smoothMsTouch:CFG.smoothMs);
  const prev=vy;
  vy+=(target-vy)*(ms?1-Math.exp(-dt/ms):1);
  if(Math.abs(target-vy)<.08)vy=target;
  if(vy===prev)return false;
  scroller.style.transform=`translate3d(0,${-vy}px,0)`;
  sy=vy*Q;
  return true;
}
function scrollToPage(top){scrollTo({top:Math.max(0,top),behavior:RM?'auto':'smooth'})}

// links: anchors on this page scroll smoothly; other pages load normally
const normPath=p=>p.replace(/index\.html$/,'').replace(/\/$/,'');
document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('a[href]');if(!a||a.target==='_blank'||e.defaultPrevented)return;
  const href=a.getAttribute('href');
  if(href==='#'){e.preventDefault();return}
  let u;try{u=new URL(a.href,location.href)}catch(_){return}
  if(u.origin!==location.origin||normPath(u.pathname)!==normPath(location.pathname))return;   // another page
  e.preventDefault();
  const el=u.hash.length>1&&document.getElementById(u.hash.slice(1));
  if(el&&u.hash!=='#top'){scrollToPage(pageTop(el)-CFG.anchorOffset);history.replaceState(null,'',u.hash)}
  else{scrollToPage(0);history.replaceState(null,'',location.pathname)}
});
// keyboard users});
// keyboard users tabbing to something off-screen: bring it into view
document.addEventListener('focusin',e=>{
  const el=e.target;if(!scroller.contains(el))return;
  const r=el.getBoundingClientRect();
  if(r.top<90||r.bottom>cssH-20)scrollToPage(pageTop(el)-cssH*.3);
});

/* ==========================================================================
   12. TIME CONTROLS  (slider + Live button)
   ========================================================================== */
if(tin)tin.addEventListener('input',e=>{live=false;tlive&&tlive.classList.add('off');prevH=e.target.value/60;build(prevH)});
if(tlive)tlive.addEventListener('click',()=>{live=true;tlive.classList.remove('off');build(ctHours())});
setInterval(()=>{if(live)build(ctHours())},20000);


/* ==========================================================================
   14. FRAME LOOP + SIZING + START-UP
   ========================================================================== */
let last=performance.now(),fadeAcc=0,wasMoving=false,inkLive=false;
function frame(now){
  const dt=Math.min(64,now-last);last=now;
  if(!W||!H){requestAnimationFrame(frame);return}   // window has no size yet (hidden tab, etc.)

  // scroll → page + title offset + scene
  const moving=stepScroll(dt);
  if(moving){dirty=1;if(now-lastAdapt>100)adaptInk()}   // scrolling only pans the tall background: no redraw needed
  else if(wasMoving)adaptInk();                          // just stopped: settle the text colours
  wasMoving=moving;

  if(writing)stepWrite(now);
  stepDrips(now,dt);

  // strokes slowly fade
  if(now-lastInk<4300){
    inkLive=true;fadeAcc+=dt;
    // bigger, less frequent steps than before: tiny steps round to nothing at low alpha and leave a faint blocky ghost behind
    while(fadeAcc>=100){
      fadeAcc-=100;
      if(inkY1>=0){const ya=Math.max(0,inkY0-50*Q),yb=Math.min(SK.height,inkY1+50*Q);
        kx.save();kx.globalCompositeOperation='destination-out';kx.fillStyle='rgba(0,0,0,.17)';kx.fillRect(0,ya,SK.width,yb-ya);kx.restore()}
    }
  }else if(inkLive){
    // repeated fading can't reach zero (8-bit rounding leaves a faint, blocky ghost), so finish with a clean wipe
    kx.clearRect(0,0,SK.width,SK.height);inkLive=false;fadeAcc=0;inkY0=1e9;inkY1=-1;dirty=1;
  }
  // breath fog evaporates
  if(breathLive){
    breathAcc+=dt;
    const a=1-Math.pow(.02,100/CFG.breathMs);          // fade so ~98% is gone after breathMs
    while(breathAcc>=100){breathAcc-=100;brx.save();brx.globalCompositeOperation='destination-out';brx.fillStyle=`rgba(0,0,0,${a})`;brx.fillRect(0,0,W,H);brx.restore()}
    if(now-lastBreath>CFG.breathMs+800){brx.clearRect(0,0,W,H);breathLive=false;breathAcc=0;dirty=1}   // clean wipe of the last faint traces
  }
  // title settles to 60% after it's written
  if(written&&!RM){const f=cl((now-fadeAt)/7000,0,1);textA=1-.2*(f*f*(3-2*f))}

  if(dirty||writing||drips.length||breathLive||now-lastInk<4300||(written&&now<fadeAt+7100)){render(now);dirty=0}
  requestAnimationFrame(frame);
}

// size the page-tall layers (tall background + ink). Returns true if the background changed size.
function smooth(list){list.forEach(c=>{c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high'})}
function fitScene(){
  // ink layer: always as tall as the page, never shrinks, keeps what's already drawn
  const ph=Math.max(H,Math.ceil(PHcss*Q));
  if(SK.width!==W||SK.height<ph){
    let tmp=null;
    if(SK.width===W&&SK.height){tmp=mk();tmp.width=W;tmp.height=SK.height;tmp.getContext('2d').drawImage(SK,0,0)}
    SK.width=W;SK.height=ph;if(tmp)kx.drawImage(tmp,0,0);
  }
  // background: one screen + the scroll distance (scaled by parallax)
  const sc=Math.max(HS,Math.round(HS+Math.max(0,PHcss-cssH)*QS*CFG.parallax));
  if(sc===SC&&SH.width===WS)return false;
  SC=sc;
  SH.width=FG.width=DK.width=WS;SH.height=FG.height=DK.height=SC;
  S.width=Math.ceil(WS/3);S.height=Math.ceil(SC/3);
  Fs.width=FW=Math.ceil(WS/32);Fs.height=FH=Math.ceil(SC/32);
  Md.width=Math.ceil(WS/12);Md.height=Math.ceil(SC/12);
  Mm.width=Math.ceil(WS/4);Mm.height=Math.ceil(SC/4);
  DS.width=FW;DS.height=FH;
  smooth([hx,gx,fx,dx,mx,dkx]);
  return true;
}
function resize(){
  cssW=document.documentElement.clientWidth;cssH=innerHeight;
  if(!cssW||!cssH)return;                            // hidden / minimised: nothing to size
  // title/ink layers follow the screen's pixel density (capped so huge screens stay fast); the blurry background stays low-res
  Q=cl(Math.min(window.devicePixelRatio||1,Math.sqrt(CFG.maxPixels/(cssW*cssH))),.8,CFG.maxQuality);
  W=Math.round(cssW*Q);H=Math.round(cssH*Q);WS=Math.round(cssW*QS);HS=Math.round(cssH*QS);
  [cv,CB,TP,TX,TF,TT,BR].forEach(c=>{c.width=W;c.height=H});
  smooth([m,px,bx]);
  drips.length=0;                                    // drips belong to the old layout
  if(slot)layoutTitle();measurePage();
  if(written)tx.drawImage(TF,0,0);
  SC=0;fitScene();                                   // new viewport size: rebuild the tall layers
  build(curH());
}
// the page got taller/shorter (fonts loaded, text wrapped): stretch the background to match
function onPageResize(){measurePage();if(fitScene())build(curH())}

slot=$('.title-slot');scroller=$('#scroller');adaptEls=$$('[data-adapt]');
vy=window.scrollY;                                   // start where the browser restored us
scroller.style.transform=`translate3d(0,${-vy}px,0)`;
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(resize,150)});
if('ResizeObserver'in window)new ResizeObserver(onPageResize).observe(scroller);

// landing on a #section from another page: jump there once the layout is measured
function gotoHash(){
  const id=location.hash.slice(1),el=id&&document.getElementById(id);
  if(el&&id!=='top')scrollTo({top:Math.max(0,pageTop(el)-CFG.anchorOffset),behavior:'auto'});
}

resize();
requestAnimationFrame(frame);
setTimeout(gotoHash,80);addEventListener('load',()=>{onPageResize();gotoHash()});

// the home page writes its handwritten title once the font is ready (or after 1.8s)
if(slot){
  Promise.race([document.fonts.load('64px "Beth Ellen"'),new Promise(r=>setTimeout(r,1800))])
    .catch(()=>{})
    .then(()=>{layoutTitle();measurePage();fitScene();build(curH());setTimeout(startWrite,500)});
}

// small public API for the page scripts (menu indicator, rail, videos...)
window.Fog={
  pageTop,scrollToPage,
  get y(){return vy},
  get night(){return nightL},
  get ready(){return !!FD}
};
})();
