// Stage 3 composition primitives (deterministic HTML/CSS on a 2000 px canvas).
//
// Product rule: every product visual is a REAL Stage 2 file, placed whole
// with its own aspect ratio (<img data-art="sha256"> — QC traces and measures
// it). Placement adds only presentation: perspective, rotation, shadow,
// overlap, a leaning or open card, a paper sheet. Pixels are never altered.
// Environments are either an AI background (environment only) or a coded
// scene below. All text is rendered here; factual phrases carry data-claim.
// Seasonal look comes from campaign tokens (campaign.mjs), not from here.
import { esc, brandingFooter } from '../components/index.mjs';

export const CANVAS=2000;
const px=v=>`${Math.round(v)}px`;
const b64=s=>Buffer.from(s).toString('base64');
const svgUri=svg=>`data:image/svg+xml;base64,${b64(svg)}`;

// ---------------------------------------------------------------- text ---
/** Copy item {text, claim?:[key,value]} -> HTML; `\n` becomes a line break. */
export function copyHtml(t){
  if(!t?.text)return '';
  const inner=String(t.text).split('\n').map(esc).join('<br>');
  return t.claim?`<span data-claim="${esc(t.claim[0])}" data-claim-value="${esc(t.claim[1])}">${inner}</span>`:inner;
}
/** A fact phrase: text shown, value checked against the claim allow-list. */
export const fact=(key,value,text)=>`<span data-claim="${esc(key)}" data-claim-value="${esc(value)}">${esc(text??value)}</span>`;
/** The slide's primary headline (QC checks it stays legible at 300 px). */
export const headline=(t,{x,y,w,size=124,color,align='left',cls=''})=>
  `<h1 class="lx-h ${cls}" data-role="headline" style="left:${px(x)};top:${px(y)};width:${px(w)};font-size:${px(size)};color:${color};text-align:${align}">${copyHtml(t)}</h1>`;
export const textBlock=(html,{x,y,w,cls,color,align='left',size})=>
  `<div class="${cls}" style="left:${px(x)};top:${px(y)};width:${px(w)};color:${color};text-align:${align}${size?`;font-size:${px(size)}`:''}">${html}</div>`;

// ------------------------------------------------------------ product ---
const artTag=(a,w,h,shadow)=>`<img class="lx-art sh-${shadow}" data-art="${esc(a.sha256)}" alt="${esc(a.alt??'product artwork')}" src="${a.uri}" style="width:${px(w)};height:${px(h)}">`;
/**
 * A real artwork or page render as a physical object: height follows the
 * source aspect exactly; the wrapper carries perspective and rotation.
 */
export function placeArt(a,{x,y,w,rx=0,ry=0,rz=0,z=10,shadow='table',origin='50% 50%',persp=3200}){
  const h=w*a.height/a.width;
  return `<div class="lx-obj" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};z-index:${z};transform-origin:${origin};transform:perspective(${persp}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${rz}deg)">${artTag(a,w,h,shadow)}</div>`;
}
export const artHeight=(a,w)=>w*a.height/a.width;
/** Open folded card: blank inner-left leaf angled away, the real inside art flat on the right. */
export function openCard(inside,{x,y,w,z=10,T}){
  const h=artHeight(inside,w);
  return `<div class="lx-open" style="left:${px(x-w)};top:${px(y)};width:${px(2*w)};height:${px(h)};z-index:${z}">`+
    `<div class="lx-leaf" style="width:${px(w)};height:${px(h)};background:linear-gradient(90deg,${T.linen} 0%,${T.paper} 70%,#E4D8C3 100%)"></div>`+
    `<div class="lx-obj" style="left:${px(w)};top:0;width:${px(w)};height:${px(h)};transform-origin:0 50%;transform:perspective(2600px) rotateY(-5deg)">${artTag(inside,w,h,'table')}</div></div>`;
}

// ------------------------------------------------- creative (ADR-058) ---
// Cropped display of a real artwork: the WHOLE image sits, at its own aspect
// ratio, inside a clipping frame (data-clip); the frame shows only the chosen
// region. The file and its pixels are unchanged. The renderer measures the
// visible part (product share) and the image box (no stretch).
export const MAX_UPSCALE=2;   // display px per artwork px; beyond this a crop softens
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
/**
 * The largest region of `bounds` (fractions of the image) with the frame's
 * aspect ratio, divided by `zoom`, centred on `focus` and kept inside bounds.
 * @returns {crop:{x,y,w,h} fractions, upscale}
 */
export function fitCrop(a,{frameW,frameH,bounds={x:0,y:0,w:1,h:1},focus=[.5,.5],zoom=1}){
  const bw=bounds.w*a.width, bh=bounds.h*a.height, aspect=frameW/frameH;
  let cw=bw/bh>aspect?bh*aspect:bw, ch=cw/aspect;
  const z=Math.max(1,zoom);cw/=z;ch/=z;
  const bx=bounds.x*a.width, by=bounds.y*a.height;
  const x=clamp(focus[0]*a.width-cw/2,bx,bx+bw-cw), y=clamp(focus[1]*a.height-ch/2,by,by+bh-ch);
  return {crop:{x:x/a.width,y:y/a.height,w:cw/a.width,h:ch/a.height},upscale:frameW/cw};
}
const SHAPE={rect:'border-radius:6px',soft:'border-radius:28px',arch:w=>`border-radius:${Math.round(w/2)}px ${Math.round(w/2)}px 10px 10px`,round:'border-radius:50%',none:''};
/** A real artwork shown through a frame (rect | soft | arch | round). `crop` from fitCrop(). */
export function cropArt(a,{x,y,w,h,crop,shape='rect',z=10,shadow='soft',rz=0,frame=''}){
  const s=w/(crop.w*a.width), iw=a.width*s, ih=a.height*s, r=typeof SHAPE[shape]==='function'?SHAPE[shape](w):SHAPE[shape];
  return `<div class="lx-frame sh-${shadow}" data-clip data-crop="${[crop.x,crop.y,crop.w,crop.h].map(v=>v.toFixed(4)).join(',')}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};z-index:${z};transform:rotate(${rz}deg);${r};${frame}">`+
    `<img class="lx-art lx-crop" data-art="${esc(a.sha256)}" alt="${esc(a.alt??'product artwork')}" src="${a.uri}" style="left:${px(-crop.x*iw)};top:${px(-crop.y*ih)};width:${px(iw)};height:${px(ih)}"></div>`;
}
/** Objects that may run off the canvas edge: clipped at the canvas, never measured as overflow. */
export const bleed=(html,{z=12}={})=>`<div class="lx-bleed" data-clip style="z-index:${z}">${html}</div>`;
/** Overlapping real pages (first = front). Each is placed whole. */
export function stack(items,{x,y,w,dx=60,dy=-40,rz=0,fan=0,z=10,shadow='lift'}){
  const n=items.length;
  return items.map((a,i)=>placeArt(a,{x:x+i*dx,y:y+i*dy,w,rz:rz+i*fan,shadow,z:z+n-1-i})).join('');
}
/** Text zones: where a card's copy block sits. y is resolved by the composition (top or bottom anchored). */
export const TEXT_ZONES=Object.freeze({
  'top-left':{x:120,w:1060,align:'left',anchor:'top'},
  'top-right':{x:820,w:1060,align:'right',anchor:'top'},
  'top-centre':{x:150,w:1700,align:'center',anchor:'top'},
  'bottom-left':{x:120,w:1060,align:'left',anchor:'bottom'},
  'bottom-band':{x:150,w:1700,align:'center',anchor:'bottom'},
  'right-column':{x:1200,w:690,align:'left',anchor:'middle'},
  'left-column':{x:110,w:690,align:'left',anchor:'middle'}});
const NOISE=svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .3 0 0 0 .09 0"/></filter><rect width="400" height="400" filter="url(#n)"/></svg>`);
/**
 * Deterministic grounds (no AI image): linen | paper | ivory | sage | blush | dusk,
 * or `solid` with a colour (e.g. sampled from a full-bleed artwork).
 */
export function ground(kind,{colour}={}){
  const L=(bg,extra='')=>`<div class="lx-env" style="background:${bg}"></div>${extra}`;
  const grain=`<div class="lx-env" style="background:url(${NOISE});opacity:.9"></div>`;
  switch(kind){
    case 'linen':return L('radial-gradient(90% 80% at 40% 30%,#F7F0E4 0%,#EDE3D3 62%,#E2D5C1 100%)',
      `<div class="lx-env" style="background:repeating-linear-gradient(0deg,rgba(110,85,55,.05) 0 2px,transparent 2px 6px),repeating-linear-gradient(90deg,rgba(110,85,55,.045) 0 2px,transparent 2px 7px)"></div>`+grain);
    case 'paper':return L('radial-gradient(110% 90% at 30% 20%,#FFFDF8 0%,#FAF5EC 55%,#F2EADC 100%)',grain);
    case 'ivory':return L('linear-gradient(160deg,#FBF7F0 0%,#F5EEE2 100%)',grain);
    case 'sage':return L('radial-gradient(85% 75% at 30% 35%,#7D8C72 0%,#62705A 55%,#4A5544 100%)',grain);
    case 'blush':return L('radial-gradient(90% 80% at 50% 30%,#F6E7E1 0%,#EED6CD 60%,#E3C4B8 100%)',grain);
    case 'dusk':return L('radial-gradient(95% 85% at 70% 15%,#4C4659 0%,#36323F 55%,#24212B 100%)',
      [[1720,160,3],[1580,300,2],[1840,420,2.5],[1460,120,2],[260,1820,2],[120,1660,2.5]].map(([x,y,r])=>`<div class="lx-bokeh" style="left:${px(x-r)};top:${px(y-r)};width:${px(2*r)};height:${px(2*r)};background:#E9D3A6;opacity:.7"></div>`).join('')+grain);
    case 'solid':return L(colour);
    default:throw new Error(`Unknown ground ${kind}`);
  }
}
/** Coded stand-in for an AI environment (previews before the paid scene exists): a warm oak table in window light. */
export function tableScene(){
  return `<div class="lx-env" style="background:linear-gradient(180deg,#EFE5D6 0%,#E2D2BA 34%,#C9A57E 35%,#BE9770 62%,#A98059 100%)"></div>`+
    `<div class="lx-env" style="top:700px;height:1300px;background:repeating-linear-gradient(179deg,rgba(90,55,25,.05) 0 2px,transparent 2px 19px),repeating-linear-gradient(90deg,transparent 0 662px,rgba(90,55,25,.08) 662px 665px)"></div>`+
    `<div class="lx-env" style="background:radial-gradient(70% 55% at 20% 20%,rgba(255,247,230,.6),transparent 70%),radial-gradient(120% 95% at 50% 45%,transparent 62%,rgba(60,35,15,.28) 100%)"></div>`;
}

// -------------------------------------------------------- environment ---
const BOKEH=[[180,160,90,.55],[420,90,60,.4],[700,210,110,.35],[980,120,70,.45],[1240,200,95,.38],[1500,110,80,.5],[1760,190,120,.35],
  [300,420,70,.3],[860,380,55,.35],[1380,420,75,.3],[1850,420,60,.4],[80,520,50,.3],[1120,520,45,.28]];
/** Soft light bokeh (divs with radial gradients; always inside the canvas). */
export function bokeh(color,{scale=1,alpha=1,dy=0,only}={}){
  return (only?BOKEH.filter((_,i)=>only.includes(i)):BOKEH).map(([x,y,r,a])=>{const R=r*scale;
    return `<div class="lx-bokeh" style="left:${px(x-R)};top:${px(y+dy-R)};width:${px(2*R)};height:${px(2*R)};background:radial-gradient(circle,${color} 0%,${color}00 68%);opacity:${(a*alpha).toFixed(2)}"></div>`;}).join('');
}
/** Evergreen sprig with holly and berries, drawn into its own SVG image (never overflows the canvas). */
export function sprig(T,{x,y,w=720,h=440,angle=-18,flip=false,berries=true,z=4,blur=1.6}){
  // Deterministic pseudo-random jitter so needles look natural but render identically every time.
  let seed=Math.round(w*7+h*13+angle*31+(flip?5:0));const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);
  const s=[], a=angle*Math.PI/180, greens=['#2E5A3C','#24492F','#3A6B47','#1B3A25','#447A52'];
  const stems=[[20,h*0.74,a,w*0.98,62],[w*0.26,h*0.64,a-0.6,w*0.44,44],[w*0.46,h*0.57,a+0.5,w*0.38,40],[w*0.62,h*0.5,a-0.45,w*0.3,34]];
  for(const [x0,y0,ang,len,maxL] of stems){
    const dx=Math.cos(ang), dy=Math.sin(ang);
    s.push(`<path d="M${x0} ${y0} L${(x0+dx*len).toFixed(1)} ${(y0+dy*len).toFixed(1)}" stroke="#5A4128" stroke-width="4" stroke-linecap="round"/>`);
    for(let t=6;t<len;t+=4.2){
      const cx=x0+dx*t, cy=y0+dy*t, k=1-0.55*t/len;
      for(const side of [-1,1]){const g=ang+side*(0.7+rnd()*0.55), L=maxL*k*(0.7+rnd()*0.4);
        s.push(`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx+Math.cos(g)*L).toFixed(1)}" y2="${(cy+Math.sin(g)*L).toFixed(1)}" stroke="${greens[Math.floor(rnd()*greens.length)]}" stroke-width="${(2.2+rnd()*1.4).toFixed(1)}" stroke-linecap="round" opacity="${(0.82+rnd()*0.18).toFixed(2)}"/>`);}
    }
  }
  if(berries){
    const hx=w*0.3, hy=h*0.52;
    const leaf=(r,sc)=>`<path transform="translate(${hx} ${hy}) rotate(${r}) scale(${sc})" d="M0 0 C 14 -10 22 -24 34 -20 C 38 -30 50 -32 58 -24 C 66 -30 78 -26 82 -16 C 94 -16 100 -8 104 0 C 100 8 94 16 82 16 C 78 26 66 30 58 24 C 50 32 38 30 34 20 C 22 24 14 10 0 0 Z" fill="url(#hl)"/><path transform="translate(${hx} ${hy}) rotate(${r}) scale(${sc})" d="M4 0 L98 0" stroke="#8DB08F" stroke-width="2" opacity=".5"/>`;
    s.push(leaf(-35,1),leaf(155,.9),leaf(70,.8));
    for(const [bx,by,r] of [[0,0,15],[22,-12,13],[16,18,14],[-20,12,12],[-6,-22,11]])
      s.push(`<circle cx="${hx+bx}" cy="${hy+by}" r="${r}" fill="url(#bg)"/><circle cx="${hx+bx-r*.35}" cy="${hy+by-r*.4}" r="${r*.22}" fill="#FFD9DC" opacity=".8"/>`);
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>`+
    `<radialGradient id="bg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#E0474F"/><stop offset=".55" stop-color="${T.berryFruit}"/><stop offset="1" stop-color="#4E0B12"/></radialGradient>`+
    `<linearGradient id="hl" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#3F7250"/><stop offset="1" stop-color="#16321F"/></linearGradient></defs>`+
    `<g ${flip?`transform="translate(${w} 0) scale(-1 1)"`:''}>${s.join('')}</g></svg>`;
  return `<img class="lx-prop" alt="" src="${svgUri(svg)}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};z-index:${z};filter:blur(${blur}px) drop-shadow(0 18px 18px rgba(0,0,0,.4))">`;
}
/**
 * Coded environments (used when no AI scene is available, and for the
 * information slides). kind: table | forest | berry | linen | paper.
 */
export function environment(kind,T,{props=true}={}){
  const P=h=>props?h:'';
  switch(kind){
    case 'table':return `<div class="lx-env" style="background:linear-gradient(180deg,#1C120C 0%,#2E1D12 26%,#3A2416 33%,${T.walnut} 34%,#5A3522 55%,${T.walnutDeep} 100%)"></div>`+
      `<div class="lx-env" style="background:repeating-linear-gradient(177deg,rgba(0,0,0,.07) 0 3px,transparent 3px 13px),repeating-linear-gradient(174deg,rgba(255,214,170,.035) 0 60px,transparent 60px 150px);top:680px;height:1320px"></div>`+
      `<div class="lx-env" style="background:radial-gradient(55% 40% at 50% 62%,rgba(255,196,128,.22),transparent 70%),radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)"></div>`+
      bokeh('#FFC877',{alpha:.9,scale:1.1})+P(sprig(T,{x:0,y:1500,w:760,h:500,angle:-14})+sprig(T,{x:1240,y:1520,w:760,h:480,angle:-16,flip:true}));
    case 'forest':return `<div class="lx-env" style="background:radial-gradient(90% 75% at 50% 38%,#2B4D3B 0%,${T.forest} 45%,${T.forestDeep} 100%)"></div>`+
      bokeh('#E8C27A',{alpha:.28,scale:.9})+sprig(T,{x:0,y:1580,w:640,h:420,angle:-12})+sprig(T,{x:1360,y:1600,w:640,h:400,angle:-14,flip:true});
    case 'berry':return `<div class="lx-env" style="background:radial-gradient(85% 75% at 60% 42%,#6E2029 0%,${T.berryDeep} 60%,#22080C 100%)"></div>`+
      bokeh('#F2C27C',{alpha:.3,scale:.9})+sprig(T,{x:0,y:1620,w:560,h:380,angle:-12,berries:false});
    case 'linen':return `<div class="lx-env" style="background:radial-gradient(90% 80% at 45% 35%,#FBF4E6 0%,${T.linen} 60%,#E2D4BC 100%)"></div>`+
      `<div class="lx-env" style="background:repeating-linear-gradient(0deg,rgba(120,90,50,.035) 0 2px,transparent 2px 7px),repeating-linear-gradient(90deg,rgba(120,90,50,.03) 0 2px,transparent 2px 8px)"></div>`+
      sprig(T,{x:1480,y:0,w:520,h:360,angle:14,flip:true})+sprig(T,{x:0,y:1640,w:520,h:360,angle:-12,berries:false});
    case 'paper':return `<div class="lx-env" style="background:radial-gradient(100% 80% at 50% 20%,#FFFDF8 0%,${T.paper} 55%,#F1E8D8 100%)"></div>`+
      sprig(T,{x:0,y:1700,w:460,h:300,angle:-12,z:6});
    default:throw new Error(`Unknown environment ${kind}`);
  }
}
/** AI background (environment only), or the coded fallback. */
export function backdrop(sceneUri,fallback,T,{blur=0,dim=0,props=true}={}){
  if(!sceneUri)return environment(fallback,T,{props});
  return `<img class="lx-bg" alt="" src="${sceneUri}" style="${blur?`filter:blur(${blur}px) brightness(${1-dim})`:dim?`filter:brightness(${1-dim})`:''}">`;
}
export const scrim=(dir,strength=.8)=>({
  top:`<div class="lx-scrim" style="height:1000px;background:linear-gradient(180deg,rgba(16,10,6,${strength}) 0%,rgba(16,10,6,${strength*.62}) 42%,rgba(16,10,6,0) 100%)"></div>`,
  topleft:`<div class="lx-scrim" style="height:2000px;background:radial-gradient(90% 60% at 0% 0%,rgba(16,10,6,${strength}) 0%,rgba(16,10,6,${strength*.5}) 45%,rgba(16,10,6,0) 80%)"></div>`,
  bottom:`<div class="lx-scrim" style="top:1300px;height:700px;background:linear-gradient(0deg,rgba(16,10,6,${strength}) 0%,rgba(16,10,6,0) 100%)"></div>`,
  left:`<div class="lx-scrim" style="height:2000px;background:linear-gradient(90deg,rgba(16,10,6,${strength}) 0%,rgba(16,10,6,${strength*.7}) 30%,rgba(16,10,6,0) 58%)"></div>`})[dir];

// ------------------------------------------------------------- badges ---
export const pill=(html,{bg,color,x,y,center=false,size=30})=>
  `<div class="lx-pill" style="${center?'left:0;right:0;margin:auto;width:max-content':`left:${px(x)}`};top:${px(y)};background:${bg};color:${color};font-size:${px(size)}">${html}</div>`;
/** One row of short benefits separated by small gold diamonds. */
export const benefitRow=(items,{y,T})=>
  `<div class="lx-row" style="top:${px(y)};border-color:${T.gold}66">${items.map(h=>`<span>${h}</span>`).join(`<i style="background:${T.gold}"></i>`)}</div>`;
/** The same benefits stacked in a narrow text column (gold diamond bullets). */
export const benefitList=(items,{x,y,w,T})=>
  `<div class="lx-sub" style="left:${px(x)};top:${px(y)};width:${px(w)};color:${T.cream};font-size:30px;line-height:1.9">${items.map(h=>`<div><i style="display:inline-block;width:12px;height:12px;margin:0 24px 4px 2px;transform:rotate(45deg);background:${T.gold}"></i>${h}</div>`).join('')}</div>`;
/** Stationery tag used for labels on product (design name, paper size). */
export const tag=({x,y,w,kicker,title,T,align='center',z=30,dark=false})=>
  `<div class="lx-tag" style="left:${px(x)};top:${px(y)};width:${px(w)};text-align:${align};z-index:${z};background:${dark?T.forest:T.paper};border-color:${T.gold}">`+
  `<div class="k" style="color:${dark?T.goldLight:T.berry}">${kicker}</div><div class="t" style="color:${dark?T.cream:T.ink}">${title}</div></div>`;

const ICON={
  instant:'<path d="M58 8 22 64h26l-6 48 36-58H52z"/>',
  printer:'<rect x="26" y="10" width="68" height="30" rx="4"/><rect x="10" y="40" width="100" height="44" rx="10"/><rect x="28" y="70" width="64" height="40" rx="3"/><path d="M40 84h40M40 96h28"/>',
  files:'<path d="M30 14h40l22 22v70H30z"/><path d="M70 14v22h22"/><path d="M18 28v88h60"/>',
  guide:'<path d="M60 26c-14-10-32-12-48-8v80c16-4 34-2 48 8 14-10 32-12 48-8V18c-16-4-34-2-48 8z"/><path d="M60 26v80"/>',
  skein:'<circle cx="60" cy="60" r="38"/><path d="M30 38c22 6 42 26 50 52M26 58c18 2 36 16 44 36M40 26c18 10 36 30 44 56"/><path d="M16 104 104 16"/>',
  frame:'<rect x="18" y="18" width="84" height="84" rx="4"/><rect x="32" y="32" width="56" height="56" rx="2"/><path d="M40 78l14-18 10 12 8-8 10 14"/>'};
export const icon=(name,{size=150,T})=>`<img class="lx-icon" alt="" src="${svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 160 160" width="${size}" height="${size}"><circle cx="60" cy="60" r="78" fill="${T.forest}"/><g fill="none" stroke="${T.goldLight}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">${ICON[name]}</g></svg>`)}" style="width:${px(size)};height:${px(size)}">`;

// ------------------------------------------------------------------ css ---
export const css=T=>`
#canvas{background:${T.walnutDeep}}
.lx-bg{position:absolute;left:0;top:0;width:2000px;height:2000px;object-fit:cover;z-index:0}
.lx-env{position:absolute;left:0;top:0;width:2000px;height:2000px;z-index:0}
.lx-scrim{position:absolute;left:0;top:0;width:2000px;z-index:2}
.lx-bokeh{position:absolute;border-radius:50%;z-index:1}
.lx-prop{position:absolute;display:block;filter:drop-shadow(0 18px 20px rgba(0,0,0,.35))}
.lx-obj{position:absolute;display:block}
.lx-art{display:block;border-radius:5px}
.lx-frame{position:absolute;display:block;overflow:hidden}
.lx-crop{position:absolute;max-width:none;border-radius:0}
.lx-bleed{position:absolute;left:0;top:0;width:2000px;height:2000px;overflow:hidden}
.sh-table{box-shadow:0 1px 2px rgba(0,0,0,.35),0 16px 26px -6px rgba(14,7,2,.5),0 46px 90px -8px rgba(14,7,2,.55)}
.sh-lift{box-shadow:0 2px 4px rgba(0,0,0,.35),0 30px 50px -10px rgba(0,0,0,.55),0 80px 140px -20px rgba(0,0,0,.6)}
.sh-soft{box-shadow:0 1px 2px rgba(60,40,20,.2),0 18px 40px -8px rgba(60,40,20,.28),0 40px 80px -20px rgba(60,40,20,.25)}
.lx-open{position:absolute;display:block;transform:rotate(-2deg)}
.lx-leaf{position:absolute;left:0;top:0;border-radius:5px;transform-origin:100% 50%;transform:perspective(2600px) rotateY(26deg);
  box-shadow:inset -40px 0 60px -30px rgba(80,55,30,.35),0 30px 60px -10px rgba(14,7,2,.5)}
.lx-h{position:absolute;margin:0;z-index:20;font-family:Spectral,Georgia,serif;font-weight:600;line-height:1.0;letter-spacing:.012em;text-transform:uppercase}
.lx-name{text-transform:none;font-style:italic;font-weight:400;letter-spacing:0;line-height:1.02}
.lx-micro{position:absolute;z-index:20;font:600 30px Inter,sans-serif;letter-spacing:.3em;text-transform:uppercase}
.lx-sub{position:absolute;z-index:20;font:600 34px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;line-height:1.35}
.lx-lede{position:absolute;z-index:20;font-family:Spectral,Georgia,serif;font-style:italic;font-weight:400;font-size:50px;line-height:1.2}
.lx-pill{position:absolute;z-index:25;padding:20px 44px;border-radius:999px;font-family:Inter,sans-serif;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.lx-row{position:absolute;left:0;right:0;margin:auto;width:max-content;z-index:25;display:flex;align-items:center;gap:30px;padding:24px 50px;border-radius:999px;
  background:rgba(16,10,6,.74);border:1.5px solid;font:600 29px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${T.cream}}
.lx-row i{width:12px;height:12px;transform:rotate(45deg);display:block}
.lx-tag{position:absolute;padding:26px 30px 30px;border:2px solid;border-radius:14px;box-shadow:0 18px 40px -12px rgba(0,0,0,.45)}
.lx-tag .k{font:600 26px Inter,sans-serif;letter-spacing:.26em;text-transform:uppercase}
.lx-tag .t{font-family:Spectral,Georgia,serif;font-style:italic;font-size:52px;line-height:1.1;margin-top:8px}
.lx-tile{position:absolute;z-index:5;border:1.5px solid ${T.gold}73;border-radius:28px;background:rgba(255,255,255,.045)}
.lx-tile-label{position:absolute;z-index:20;text-align:center;font:600 34px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;line-height:1.25}
.lx-steps{position:absolute;left:110px;right:110px;z-index:25;display:flex;justify-content:space-between;align-items:center;padding:34px 60px;border-radius:32px;background:rgba(16,10,6,.76);border:1.5px solid ${T.gold}66}
.lx-step{display:flex;align-items:center;gap:22px;font:600 32px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${T.cream}}
.lx-step b{width:84px;height:84px;border-radius:50%;border:2.5px solid ${T.gold};display:flex;align-items:center;justify-content:center;font:600 48px Spectral,Georgia,serif;color:${T.goldLight};letter-spacing:0}
.lx-step-sep{width:70px;height:2px;background:${T.gold};opacity:.6}
.lx-benefit{position:absolute;z-index:20;display:flex;align-items:center;gap:40px}
.lx-benefit .tx{font:600 42px Inter,sans-serif;line-height:1.22;color:${T.ink}}
.lx-icon{display:block;flex:none}
.lx-tray{position:absolute;z-index:3;border-radius:36px;background:#F2E8D6;border:1.5px solid #E2D2B4;box-shadow:inset 0 2px 20px rgba(120,90,50,.12)}
.brandfoot{left:auto;right:56px;bottom:38px;z-index:40;font-size:20px;gap:14px;opacity:.75}
.brandfoot .mark{font-size:24px}
#canvas.dark .brandfoot{color:${T.cream}}
`;
export const footer=name=>brandingFooter(null,{tagline:name});
