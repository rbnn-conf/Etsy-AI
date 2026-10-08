// Stage 3 CREATIVE DIRECTION (ADR-058). Every card of a Hybrid / AI Creative
// campaign has ONE buyer job and a direction recorded in plan.json
// (directions[slide]): purpose, buyer message, emotional goal, focal and
// supporting assets, composition, hierarchy, background, crop, text zone,
// claims used, avoid. The direction comes from the format's code baseline or
// from the art-direction model call; either way it is validated here and code
// builds the image. Deterministic: no model call, no network.
//
// Truth rules, unchanged by this module:
//   - every product visual is a real Stage 2 file or an approved render, by id
//     from the adapter's catalogue; nothing else can be placed;
//   - an approved render carries baked-in lettering, so it is only shown
//     through a crop below that lettering (text_free), within MAX_UPSCALE;
//   - all text is rendered by code; factual phrases carry a claim key.
import { CANVAS, css, placeArt, cropArt, fitCrop, bleed, stack, ground, tableScene, TEXT_ZONES, MAX_UPSCALE, copyHtml, fact, scrim, icon, footer } from './primitives.mjs';
import { createHash } from 'node:crypto';
import { claimProblems } from './claims.mjs';
import { COLOURING_COMPOSITIONS } from './colouring-creative.mjs';

export const CREATIVE_VERSION=1;
const px=v=>`${Math.round(v)}px`;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);

/** The eight buyer questions a campaign answers (one per card). */
export const BUYER_JOBS=Object.freeze({
  'stop-scroll':'Stop the scroll','what-you-get':'What am I getting?','quality':'Show me the quality','variety':'Show me the variety',
  'useful':'Why is this useful?','how-it-works':'How does it work?','desire':'Make me want it','doubts':'Remove my doubts'});

/** Grounds a direction may choose. "render": the focal render itself, full-bleed. "environment": the AI scene (one paid image). */
export const BACKGROUNDS=Object.freeze(['render','environment','linen','paper','ivory','sage','blush','dusk']);
const DARK=new Set(['sage','dusk','environment']);

// ------------------------------------------------------------ catalogue ---
/** One asset by id; a render (baked lettering) can never be placed whole. */
function assets(catalogue,record){
  const get=id=>{const a=catalogue[id];if(!a)throw new Error(`Creative direction names an unknown asset "${id}"`);return a;};
  return {
    get,
    whole:(id,o)=>{const a=get(id);if(a.baked_text)throw new Error(`${id} carries baked-in lettering: it is shown only through a crop below it`);record.used.push(id);return placeArt(a.art,o);},
    stack:(ids,o)=>{for(const id of ids)if(get(id).baked_text)throw new Error(`${id} carries baked-in lettering: it is shown only through a crop below it`);record.used.push(...ids);return stack(ids.map(id=>get(id).art),o);},
    framed:(id,{x,y,w,h,focus,zoom=1,...o})=>{
      const a=get(id), bounds=a.text_free??{x:0,y:0,w:1,h:1};
      let f=fitCrop(a.art,{frameW:w,frameH:h,bounds,focus,zoom});
      // Resolution floor: zoom out before a crop would soften.
      if(f.upscale>MAX_UPSCALE&&zoom>1)f=fitCrop(a.art,{frameW:w,frameH:h,bounds,focus,zoom:Math.max(1,zoom*MAX_UPSCALE/f.upscale)});
      record.used.push(id);
      record.crops.push({asset:id,crop:Object.fromEntries(Object.entries(f.crop).map(([k,v])=>[k,+v.toFixed(4)])),bounds,upscale:+f.upscale.toFixed(3)});
      return cropArt(a.art,{x,y,w,h,crop:f.crop,...o});
    }};
}

// ------------------------------------------------------------------ copy ---
const CHAR={caps:0.76,serif:0.5};
// Tracked Inter capitals (kicker, meta, list): about 0.86 em per character.
const trackedLines=(n,size,w)=>Math.max(1,Math.ceil(n*size*0.86/w));
const linesOf=(text,size,w,k)=>String(text??'').split('\n').reduce((n,l)=>n+l.trim().split(/\s+/).reduce((a,wd)=>{const t=a.cur?`${a.cur} ${wd}`:wd;return a.cur&&t.length*k*size>w?{n:a.n+1,cur:wd}:{...a,cur:t};},{n:1,cur:''}).n,0);
/** Largest headline size (88-150 px) whose longest explicit line fits the column. */
const sizeFor=(text,w,style,max=150)=>{const longest=Math.max(...String(text??'').split('\n').map(l=>l.trim().length),1);return Math.max(88,Math.min(max,Math.floor(w/(CHAR[style]*longest))));};
/**
 * The copy block in a text zone: kicker, headline (caps or serif italic), subline, and an optional list.
 * Anchored top (y from `top`), bottom (ends at `bottom`) or middle (centred on `middle`).
 */
function copyBlock(copy,zone,{ink,accent,soft,style='caps',max=150,top=110,bottom=1840,middle=1000,list=[],w:wOverride}){
  const Z=TEXT_ZONES[zone], w=wOverride??Z.w, X=wOverride!==undefined&&Z.align==='right'?Z.x+Z.w-w:Z.x, size=sizeFor(copy.headline?.text,w,style,max);
  const len=it=>String(it?.text??'').length;
  const hl=linesOf(copy.headline?.text,size,w,CHAR[style]), kh=copy.kicker?trackedLines(len(copy.kicker),28,w)*38+26:0;
  const mh=copy.meta?.length?trackedLines(copy.meta.reduce((n,m)=>n+len(m)+3,0),26,w)*38+30:0, sh=copy.subline?Math.ceil(len(copy.subline)*0.42*44/w)*58+24:0;
  const lh=list.length?list.reduce((n,x)=>n+trackedLines(String(x).replace(/<[^>]+>/g,'').length,28,w-50)*40+22,0)+40:0;
  const H=kh+hl*size*1.04+mh+sh+lh;
  let y=Z.anchor==='bottom'?bottom-H:Z.anchor==='middle'?middle-H/2:top;
  const box={x:X,y,w,h:H}, al=`text-align:${Z.align}`;
  let h='';
  if(copy.kicker){h+=`<div class="cd-kicker" style="left:${px(X)};top:${px(y)};width:${px(w)};color:${accent};${al}">${copyHtml(copy.kicker)}</div>`;y+=kh;}
  h+=`<h1 class="lx-h cd-h ${style==='serif'?'cd-serif':''}" data-role="headline" style="left:${px(X)};top:${px(y)};width:${px(w)};font-size:${px(size)};color:${ink};${al}">${copyHtml(copy.headline)}</h1>`;
  y+=hl*size*1.04;
  if(mh){h+=`<div class="cd-meta" style="left:${px(X)};top:${px(y+16)};width:${px(w)};color:${soft};${al}">${copy.meta.map(copyHtml).join(' <i>·</i> ')}</div>`;y+=mh;}
  if(copy.subline){h+=`<div class="cd-sub" style="left:${px(X)};top:${px(y+18)};width:${px(w)};color:${soft};${al}">${copyHtml(copy.subline)}</div>`;y+=sh;}
  if(list.length)h+=`<div class="cd-list" style="left:${px(X)};top:${px(y+40)};width:${px(w)};color:${ink}">${list.map(x=>`<div><i style="background:${accent}"></i><span>${x}</span></div>`).join('')}</div>`;
  return {html:h,box};
}
const caption=(html,{x,y,w,color,align='left',bg=null,z=30})=>`<div class="cd-caption" style="left:${px(x)};top:${px(y)};width:${px(w)};color:${color};text-align:${align};z-index:${z}">${bg?`<span style="background:${bg}">${html}</span>`:html}</div>`;
const tagAt=(html,{x,y,T,z=40})=>`<div class="cd-tag" style="left:${px(x)};top:${px(y)};z-index:${z};background:${T.ivory};color:${T.ink};border-color:${T.gold}">${html}</div>`;
const illustrated=()=>fact('render','Illustrated example');

// ----------------------------------------------------------- compositions ---
/** The hero render's display scale (display px per artwork px): crisp, while still dominant. */
export const HERO_UPSCALE=1.5;
// ctx: {copy, d (direction), A (assets), T, g (ground colours), facts, sceneUri, layout}
function editorialHero({copy,d,A,T,g}){
  const focal=A.get(d.focal_asset), top=d.text_zone==='top-centre'?'top-centre':'top-left';
  const c=copyBlock(copy,top,{...g,style:'caps',max:132,top:100,w:top==='top-left'?1300:undefined});
  const y0=Math.round(c.box.y+c.box.h+40);
  let b=focal.kind==='render'&&d.background==='render'?ground('solid',{colour:focal.art.ground}):ground(d.background);
  b+=c.html;
  if(focal.kind==='render'){
    // Shown at HERO_UPSCALE (crisper than a full-width 1.95×): the render fills the right of the frame and its own
    // background colour continues to the left edge, where the real booklet enters.
    const W=Math.min(CANVAS,Math.round(focal.art.width*(focal.text_free?.w??1)*HERO_UPSCALE)), fx=CANVAS-W, g0=focal.art.ground;
    b+=A.framed(d.focal_asset,{x:fx,y:y0,w:W,h:CANVAS-y0,focus:d.crop?.focus??[.5,.45],zoom:d.crop?.zoom??1,shape:'none',shadow:'none',z:5});
    // Soft seams from the copy band and the left ground into the artwork (the render's own background colour).
    b+=`<div class="lx-scrim" style="top:${px(y0-2)};height:70px;background:linear-gradient(180deg,${g0} 0%,${g0}00 100%);z-index:6"></div>`;
    if(fx>0)b+=`<div class="lx-scrim" style="left:${px(fx-2)};top:${px(y0)};width:170px;height:${px(CANVAS-y0)};background:linear-gradient(90deg,${g0} 0%,${g0}00 100%);z-index:6"></div>`;
    b+=caption(illustrated(),{x:1290,y:1790,w:600,color:T.ink,align:'right',bg:`${T.ivory}D9`});
  }else b+=A.whole(d.focal_asset,{x:1050,y:y0,w:820,rz:3,shadow:'lift',z:10});
  const sup=d.supporting_assets.filter(id=>A.get(id).kind!=='render').slice(0,3);
  // The real booklet enters from the lower left (the brand footer keeps the lower right).
  if(sup.length)b+=bleed(A.stack(sup,{x:-30,y:1130,w:740,dx:84,dy:-36,rz:7,fan:4}),{z:12});
  return {body:b,dark:false};
}

function includedSpread({copy,d,A,T,g,labels}){
  const zone=d.text_zone==='bottom-band'?'bottom-band':'top-centre';
  const c=copyBlock(copy,zone,{...g,style:'caps',max:124,top:100,bottom:1830});
  const off=zone==='top-centre'?0:-330;   // the spread moves up when the copy sits below it
  const P=(id,o)=>A.whole(id,{...o,y:o.y+off,shadow:'soft'});
  const ids=[d.focal_asset,...d.supporting_assets];
  const slots=[{x:700,y:520,w:620,rz:-2,z:20},{x:1270,y:500,w:500,rz:5,z:15},{x:250,y:560,w:500,rz:-6,z:14},{x:130,y:700,w:480,rz:-12,z:13},
    {x:1330,y:1170,w:430,rz:8,z:16},{x:1160,y:1290,w:430,rz:-3,z:17},{x:330,y:1300,w:440,rz:3,z:16}];
  let b=ground(d.background)+c.html;
  ids.slice(0,slots.length).forEach((id,i)=>{b+=P(id,slots[i]);});
  for(const l of labels??[]){const i=ids.indexOf(l.asset);if(i<0)continue;const s=slots[i];b+=tagAt(l.html,{x:s.x+(l.dx??0),y:s.y+off+(l.dy??0),T});}
  return {body:b,dark:false};
}

function macroDetail({copy,d,A,T,g}){
  const right=d.text_zone!=='left-column', ax=right?110:990, tx=right?'right-column':'left-column';
  let b=ground(d.background);
  b+=A.framed(d.focal_asset,{x:ax,y:200,w:900,h:1570,focus:d.crop?.focus??[.5,.5],zoom:d.crop?.zoom??1.2,shape:'arch',shadow:'lift',z:10,frame:`border:10px solid ${T.ivory}`});
  b+=caption(illustrated(),{x:ax,y:1806,w:900,color:g.soft,align:'center'});
  const c=copyBlock(copy,tx,{...g,style:'serif',max:128,middle:520});
  b+=c.html;
  const page=d.supporting_assets[0];
  if(page)b+=A.whole(page,{x:right?960:300,y:Math.max(860,c.box.y+c.box.h+70),w:720,rz:right?4:-4,shadow:'lift',z:12});
  return {body:b,dark:DARK.has(d.background)};
}

function collection({copy,d,A,T,g,names=[]}){
  const zone=d.text_zone==='bottom-band'?'bottom-band':'top-centre';
  const c=copyBlock(copy,zone,{...g,style:'caps',max:128,top:90,bottom:1880});
  const ay=zone==='top-centre'?c.box.y+c.box.h+50:140, ah=Math.min(1220,(zone==='top-centre'?1745:c.box.y-120)-ay), aw=Math.round(ah*0.84);
  let b=ground(d.background)+c.html;
  const side=d.supporting_assets.slice(0,4);
  side.forEach((id,i)=>{const left=i%2===0, k=Math.floor(i/2), w=500;
    b+=A.whole(id,{x:left?120+k*120:CANVAS-120-w-k*120,y:ay+140+k*90,w,rz:(left?-1:1)*(10-k*4),shadow:'soft',z:8+k});});
  b+=A.framed(d.focal_asset,{x:(CANVAS-aw)/2,y:ay,w:aw,h:ah,focus:d.crop?.focus??[.5,.56],zoom:d.crop?.zoom??1.04,shape:'arch',shadow:'soft',z:20,frame:`border:12px solid ${T.ivory}`});
  if(names.length)b+=caption([illustrated(),...names].map(n=>`<span class="nb">${n}</span>`).join(' · '),{x:150,y:ay+ah+30,w:1700,color:g.soft,align:'center'});
  return {body:b,dark:DARK.has(d.background)};
}

function featureFocus({copy,d,A,T,g,list=[]}){
  const left=d.text_zone!=='right-column', fx=left?860:110;
  let b=ground(d.background);
  b+=A.framed(d.focal_asset,{x:fx,y:160,w:1030,h:1120,focus:d.crop?.focus??[.5,.7],zoom:d.crop?.zoom??1.15,shape:'soft',shadow:'soft',z:10});
  const page=d.supporting_assets[0];
  if(page)b+=A.whole(page,{x:left?1400:200,y:1150,w:440,rz:left?6:-6,shadow:'lift',z:12});
  b+=copyBlock(copy,left?'left-column':'right-column',{...g,style:'serif',max:132,middle:820,list,w:690}).html;
  return {body:b,dark:false};
}

function processJourney({copy,d,A,T,g,steps=[]}){
  const zone=d.text_zone==='top-centre'?'top-centre':'bottom-band';
  const c=copyBlock(copy,zone,{...g,style:'caps',max:124,top:100,bottom:1850});
  const top=zone==='top-centre'?c.box.y+c.box.h+60:230, cy=top+620, X=[340,1000,1660];
  let b=ground(d.background)+c.html;
  b+=`<svg class="cd-path" width="2000" height="2000" viewBox="0 0 2000 2000"><path d="M360 ${cy+80} C 620 ${cy+260}, 760 ${cy-200}, 1000 ${cy+40} S 1400 ${cy+280}, 1640 ${cy+60}" fill="none" stroke="${T.gold}" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/></svg>`;
  const [s1,s2,s3]=steps;
  if(s1)b+=A.stack(s1.assets,{x:X[0]-250,y:cy-420,w:470,dx:30,dy:26,rz:-5,fan:4,shadow:'soft'});
  if(s2)b+=A.whole(s2.assets[0],{x:X[1]-270,y:cy-430,w:540,rz:2,shadow:'soft',z:12});
  if(s3)b+=A.framed(s3.assets[0],{x:X[2]-300,y:cy-330,w:600,h:600,focus:[.5,.52],zoom:1.45,shape:'round',shadow:'soft',z:12,frame:`border:12px solid ${T.ivory}`});
  [s1,s2,s3].forEach((s,i)=>{if(!s)return;const y=cy+390;
    b+=`<div class="cd-step" style="left:${px(X[i]-220)};top:${px(y)};color:${T.ink}"><b style="border-color:${T.gold};color:${T.rose}">${i+1}</b>${s.label}</div>`;
    if(s.note)b+=caption(s.note,{x:X[i]-220,y:y+170,w:440,color:g.soft,align:'center'});});
  return {body:b,dark:false};
}

function lifestyle({copy,d,A,T,g,sceneUri,layout}){
  const right=d.text_zone==='top-right';
  let b=sceneUri?`<img class="lx-bg" alt="" src="${sceneUri}">`:tableScene()+`<div class="cd-placeholder">Placeholder scene · AI environment not generated</div>`;
  b+=right?`<div class="lx-scrim" style="height:2000px;background:radial-gradient(75% 42% at 100% 0%,rgba(34,24,18,.72) 0%,rgba(34,24,18,.4) 50%,rgba(34,24,18,0) 85%)"></div>`:scrim('topleft',.75);
  b+=copyBlock(copy,right?'top-right':'top-left',{ink:T.cream,accent:T.goldLight,soft:T.goldLight,style:'serif',max:130,top:110}).html;
  // The open booklet: two real pages lying on the table, a soft fold shadow between them.
  const [l,r]=d.supporting_assets.filter(id=>A.get(id).kind!=='render'), w=560, h=w*A.get(l).art.height/A.get(l).art.width, x=right?560:700, y=880;
  b+=`<div class="cd-spread" style="left:${px(x)};top:${px(y)};width:${px(2*w)};height:${px(h)}">`+A.whole(l,{x:0,y:0,w,shadow:'table',z:10})+A.whole(r,{x:w,y:0,w,shadow:'table',z:10})+
    `<div class="cd-fold" style="left:${px(w-40)};height:${px(h)}"></div></div>`;
  layout.region={x:x,y:y-60,w:2*w,h:h+120};
  // The approved render as a small framed illustration card, labelled on its mat.
  const fx=right?150:1460;
  if(A.get(d.focal_asset).kind==='render')b+=`<div class="cd-mat" style="left:${px(fx)};top:1280px;width:420px;height:560px;transform:rotate(${right?-5:5}deg)">`+
    A.framed(d.focal_asset,{x:30,y:30,w:360,h:430,focus:d.crop?.focus??[.5,.52],zoom:1.5,shape:'rect',shadow:'none',z:2})+
    `<div class="cd-mat-label" style="color:${T.ink}">${fact('render','Illustration')}</div></div>`;
  return {body:b,dark:true};
}

function factSheet({copy,d,A,T,g,facts:items=[]}){
  const zone=d.text_zone==='top-centre'?'top-centre':'top-left';
  const c=copyBlock(copy,zone,{...g,style:'caps',max:124,top:110});
  let b=ground(d.background)+c.html;
  const y0=Math.max(c.box.y+c.box.h+120,640), step=Math.min(270,(1800-y0)/Math.max(1,items.length));
  items.slice(0,4).forEach((it,i)=>{
    b+=`<div class="cd-fact" style="left:120px;top:${px(y0+i*step)};width:880px;color:${g.ink}">${icon(it.icon,{size:132,T:{...T,forest:T.duskIcon??T.forest}})}<div>${it.html}</div></div>`;});
  const docs=[d.focal_asset,...d.supporting_assets].slice(0,2);
  b+=bleed(docs.map((id,i)=>A.whole(id,{x:i?1360:1080,y:i?560:700,w:i?600:700,rz:i?-6:5,shadow:'lift',z:10+(1-i)})).join(''),{z:12});
  return {body:b,dark:DARK.has(d.background)};
}

/** The composition vocabulary: allowed text zones and grounds (first = default), floor and storytelling role. */
export const COMPOSITIONS=Object.freeze({
  'editorial-hero':{zones:['top-left','top-centre'],grounds:['render','linen','sage','dusk'],min_share:.5,emotional:true,compose:editorialHero},
  'included-spread':{zones:['top-centre','bottom-band'],grounds:['linen','paper','ivory','blush'],min_share:.3,floating:true,compose:includedSpread},
  'macro-detail':{zones:['right-column','left-column'],grounds:['sage','blush','dusk','ivory'],min_share:.3,compose:macroDetail},
  'collection':{zones:['top-centre','bottom-band'],grounds:['blush','ivory','linen','sage'],min_share:.3,compose:collection},
  'feature-focus':{zones:['left-column','right-column'],grounds:['paper','ivory','linen'],min_share:.3,compose:featureFocus},
  'process':{zones:['bottom-band','top-centre'],grounds:['ivory','paper','linen'],min_share:.12,compose:processJourney},
  'lifestyle':{zones:['top-right','top-left'],grounds:['environment'],min_share:.2,emotional:true,lifestyle:true,compose:lifestyle},
  'fact-sheet':{zones:['top-left','top-centre'],grounds:['dusk','sage','ivory'],min_share:.08,floating:true,compose:factSheet},
  // Colouring books (ADR-060): usable only by that adapter's baseline (a card lists its allowed_compositions).
  ...COLOURING_COMPOSITIONS});
export const usesCreativeEnvironment=(slide,direction)=>(direction??slide.creative)?.background==='environment';

// ------------------------------------------------------------ validation ---
const str=(v,n=240)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,n):'';
const words=s=>String(s??'').trim().split(/\s+/).filter(Boolean).length;
/**
 * Validate a direction (model or baseline) against the composition vocabulary and the
 * asset catalogue. Anything invalid falls back to the slide's code baseline; every
 * fallback is recorded. Text from the model is accepted only when it passes the claim
 * checks, has at most 7 words and states no number (numbers come from facts only).
 */
export function normaliseCreative(raw,slide,{catalogue,facts}){
  const base=slide.creative, fallbacks=[], r=raw??{};
  const pick=(key,ok,v=r[key])=>{if(v===undefined||v===null||v==='')return base[key];if(ok(v))return v;fallbacks.push(key);return base[key];};
  // An adapter's own compositions (colouring books) are allowed only where the baseline lists them; the shared ones stay as before.
  const composition=pick('composition',v=>!!COMPOSITIONS[v]&&(base.allowed_compositions?base.allowed_compositions.includes(v):!COMPOSITIONS[v].adapter)), C=COMPOSITIONS[composition];
  const has=id=>!!catalogue[id];
  const out={id:slide.id,job:base.job,
    purpose:str(r.purpose)||base.purpose,buyer_message:str(r.buyer_message)||base.buyer_message,emotional_goal:str(r.emotional_goal,120)||base.emotional_goal,
    headline:base.headline,supporting_copy:base.supporting_copy??null,
    composition,
    focal_asset:pick('focal_asset',has),
    supporting_assets:Array.isArray(r.supporting_assets)&&r.supporting_assets.length?(r.supporting_assets.every(has)?r.supporting_assets.slice(0,7):(fallbacks.push('supporting_assets'),base.supporting_assets)):base.supporting_assets,
    hierarchy:r.hierarchy&&['primary','secondary','tertiary'].every(k=>str(r.hierarchy[k]))?{primary:str(r.hierarchy.primary,120),secondary:str(r.hierarchy.secondary,120),tertiary:str(r.hierarchy.tertiary,120)}:base.hierarchy,
    background:pick('background',v=>C.grounds.includes(v)),
    props:Array.isArray(r.props)?r.props.map(p=>str(p,40)).filter(p=>(base.allowed_props??[]).includes(p)).slice(0,6):base.props??[],
    crop:!r.crop||!r.crop.asset?base.crop??null:has(r.crop.asset)&&Array.isArray(r.crop.focus)&&r.crop.focus.length===2&&r.crop.focus.every(v=>Number.isFinite(v)&&v>=0&&v<=1)
      ?{asset:r.crop.asset,focus:r.crop.focus.map(v=>+v.toFixed(3)),zoom:Math.min(3,Math.max(1,Number(r.crop.zoom)||1))}:(fallbacks.push('crop'),base.crop??null),
    text_zone:pick('text_zone',v=>C.zones.includes(v)),
    scene_brief:str(r.scene_brief,400)||base.scene_brief||'',
    claims_used:base.claims_used??[],
    avoid:[...new Set([...(base.avoid??[]),...(Array.isArray(r.avoid)?r.avoid.map(a=>str(a,80)).filter(Boolean):[])])].slice(0,10),
    allowed_props:base.allowed_props??[],
    // Colouring books: allowed compositions, a shared backplate (scene_of) framed by scene_view, and a validated support line.
    ...(base.allowed_compositions?{allowed_compositions:base.allowed_compositions,support:base.support??null}:{}),
    ...(base.scene_of?{scene_of:base.scene_of,scene_view:base.scene_view??null}:{})};
  // The ground must suit the (possibly changed) composition; a missing text zone takes its default.
  if(!C.grounds.includes(out.background)){fallbacks.push('background');out.background=C.grounds[0];}
  if(!C.zones.includes(out.text_zone)){fallbacks.push('text_zone');out.text_zone=C.zones[0];}
  if(r.headline!==undefined&&r.headline!==null&&r.headline!==''){
    const h=str(r.headline,80), problems=claimProblems(h,facts,{where:`${slide.id} headline`});
    if(h&&words(h)<=7&&!/\d/.test(h)&&!problems.length)out.headline=h;else fallbacks.push('headline');
  }
  if(base.allowed_compositions&&r.support!==undefined&&r.support!==null&&r.support!==''){
    // A support line: at most 12 words, supported by the facts, and any number in it must be one of the facts' page counts.
    const t=str(r.support,120), nums=t.match(/\d+/g)??[], known=new Set([facts?.book?.colouring_pages,facts?.book?.page_count].filter(Number.isFinite).map(String));
    if(t&&words(t)<=12&&!claimProblems(t,facts,{where:`${slide.id} support`}).length&&nums.every(n=>known.has(n)))out.support=t;else fallbacks.push('support');
  }
  return {...out,source:raw?'model':'baseline',fallbacks};
}

// ---------------------------------------------------------------- concept ---
/** Words that name a product substitute, text or people: never allowed inside an environment brief or the visual world. */
export const SCENE_BANNED=/\b(cards?|greeting|paper|pages?|sheets?|books?|booklets?|prints?|posters?|frames?|screens?|text|letters?|lettering|words?|logos?|watermarks?|people|person|hands?|animals?|birds?)\b/i;
/**
 * The campaign concept (colouring books; optional elsewhere): descriptive only, never a claim. Every field is
 * validated; an invalid or missing one falls back to the deterministic baseline and is recorded in `fallbacks`
 * (the same convention as the card directions). strongest_pages must be catalogue page ids. Materials that name a
 * product substitute (paper, pages, books ...) are dropped: they style an environment, which never shows one.
 */
export function normaliseConcept(raw,base,{catalogue={}}={}){
  const r=raw&&typeof raw==='object'?raw:{}, fb=[], given=!!raw&&typeof raw==='object';
  const text=(src,key,n,path)=>{const v=str(src?.[key],n);if(v)return v;if(given)fb.push(path);return null;};
  const list=(src,key,n,max,path)=>{const v=Array.isArray(src?.[key])?src[key].map(x=>str(x,max)).filter(Boolean).slice(0,n):[];if(v.length)return v;if(given)fb.push(path);return null;};
  const vw=r.visual_world&&typeof r.visual_world==='object'?r.visual_world:{};
  const materials=list(vw,'materials',8,40,'concept.visual_world.materials')?.filter(m=>!SCENE_BANNED.test(m));
  const strongest=(Array.isArray(r.strongest_pages)?r.strongest_pages:[]).filter(id=>/^page-\d+$/.test(id)&&catalogue[id]);
  if(given&&!strongest.length)fb.push('concept.strongest_pages');
  const out={
    campaign_concept:text(r,'campaign_concept',80,'concept.campaign_concept')??base.campaign_concept,
    emotional_hook:text(r,'emotional_hook',240,'concept.emotional_hook')??base.emotional_hook,
    buyer_feeling:list(r,'buyer_feeling',6,40,'concept.buyer_feeling')??base.buyer_feeling,
    visual_world:{palette:text(vw,'palette',200,'concept.visual_world.palette')??base.visual_world.palette,
      materials:materials?.length?materials:base.visual_world.materials,
      lighting:text(vw,'lighting',160,'concept.visual_world.lighting')??base.visual_world.lighting,
      photography_style:text(vw,'photography_style',160,'concept.visual_world.photography_style')??base.visual_world.photography_style},
    hero_subject:text(r,'hero_subject',160,'concept.hero_subject')??base.hero_subject,
    strongest_pages:[...new Set(strongest)].slice(0,6).length?[...new Set(strongest)].slice(0,6):base.strongest_pages.filter(id=>catalogue[id]),
    transformation_story:text(r,'transformation_story',240,'concept.transformation_story')??base.transformation_story,
    marketing_priority:text(r,'marketing_priority',120,'concept.marketing_priority')??base.marketing_priority,
    avoid:list(r,'avoid',8,80,'concept.avoid')??base.avoid};
  return {...out,source:given?'model':'baseline',fallbacks:fb};
}
/** What the concept contributes to an image prompt (and to the coloured example's identity): changes only when the concept does. */
export const conceptDigest=c=>createHash('sha256').update(JSON.stringify([c?.campaign_concept,c?.visual_world,c?.transformation_story,c?.buyer_feeling])).digest('hex').slice(0,16);

/**
 * Paid environment photographs per campaign (one image call each): never more than the code baseline plans
 * (the model may move a scene to another card, never add one), and never more than MAX_ENVIRONMENTS.
 * Extra environment cards keep their baseline.
 */
export const MAX_ENVIRONMENTS=2;
// A card with scene_of shares another card's backplate (one image): it never counts as a paid environment of its own.
const ownsScene=s=>s.creative?.background==='environment'&&!s.creative?.scene_of;
export const environmentCap=(slides,max=MAX_ENVIRONMENTS)=>Math.min(max,slides.filter(ownsScene).length);
export function limitEnvironments(directions,slides,cap=environmentCap(slides)){
  // Cards whose baseline already asks for an environment keep it first, so a reverted card never adds one.
  const order=[...slides.filter(s=>s.creative.background==='environment'),...slides.filter(s=>s.creative.background!=='environment')];
  let n=0;
  for(const s of order){const d=directions[s.id];if(d?.background!=='environment'||s.creative.scene_of)continue;
    if(++n>cap){const b=s.creative;directions[s.id]={...d,composition:b.composition,background:b.background,text_zone:b.text_zone,focal_asset:b.focal_asset,supporting_assets:b.supporting_assets,crop:b.crop,fallbacks:[...d.fallbacks,'background (environment limit)']};}}
  return directions;
}
/** Slides with the directions applied: a validated model headline replaces the code headline; a tone line becomes the subline. */
export function creativeSlides(slides,directions,lines=[]){
  return slides.map(s=>{const d=directions[s.id], l=lines.find(x=>x.id===s.id);let copy=s.copy;
    if(d&&d.headline!==s.creative.headline)copy={...copy,headline:{text:d.headline,by:'model'}};
    if(l)copy={...copy,subline:{text:l.text,by:'model'}};
    if(d?.support)copy={...copy,subline:{text:d.support,by:'model'}};   // colouring books: the validated support line
    return copy===s.copy?s:{...s,copy};});
}
/** What the art director sees of the catalogue: ids and what each shows (never files or hashes). */
export const catalogueForModel=catalogue=>Object.entries(catalogue).map(([id,a])=>`- ${id}: ${a.shows}${a.baked_text?' [render: illustration with baked-in lettering above its usable area; shown only through a crop]':''}`).join('\n');
export const compositionsForModel=(allowed=null)=>Object.entries(COMPOSITIONS).filter(([k,c])=>allowed?allowed.includes(k):!c.adapter).map(([k,c])=>`- ${k}: text zones ${c.zones.join(', ')}; backgrounds ${c.grounds.join(', ')}`).join('\n');
/** The baseline as the model sees it (no internal fields). */
export const baselineForModel=b=>({...(b.allowed_compositions?{allowed_compositions:b.allowed_compositions}:{}),purpose:b.purpose,buyer_message:b.buyer_message,emotional_goal:b.emotional_goal,headline:b.headline,focal_asset:b.focal_asset,
  supporting_assets:b.supporting_assets,composition:b.composition,hierarchy:b.hierarchy,background:b.background,props:b.props,crop:b.crop,text_zone:b.text_zone,scene_brief:b.scene_brief,avoid:b.avoid});

// --------------------------------------------------------------- compose ---
/**
 * One creative card. `slide.copy` holds the code-rendered copy (claim-tagged);
 * `direction` is the validated direction (normaliseCreative or the baseline).
 * @returns {bodyHtml, extraCss, layout}
 */
export function composeCreative(slide,{facts,catalogue,direction,sceneUri=null,exampleUri=null,tokens:T}){
  const d=direction??slide.creative, C=COMPOSITIONS[d.composition];
  if(!C)throw new Error(`Unknown creative composition ${d.composition}`);
  const record={used:[],crops:[]}, A=assets(catalogue,record);
  const dark=DARK.has(d.background);
  const g={ink:dark?T.cream:T.ink,accent:dark?T.goldLight:T.rose,soft:dark?T.goldLight:T.inkSoft};
  const copy=slide.model_headline&&d.headline!==slide.creative.headline?{...slide.copy,headline:{text:d.headline}}:slide.copy??{};
  const layout={creative:true,composition:d.composition,text_zone:d.text_zone,background:d.background,min_share:slide.min_product_share};
  // Extras are copy items too (claim-tagged), rendered here.
  const ex=slide.extras??{};
  const extras={labels:(ex.labels??[]).map(l=>({...l,html:copyHtml(l)})),names:(ex.names??[]).map(copyHtml),list:(ex.list??[]).map(copyHtml),
    steps:(ex.steps??[]).map(x=>({...x,label:copyHtml(x.label),note:x.note?copyHtml(x.note):null})),facts:(ex.facts??[]).map(x=>({icon:x.icon,html:copyHtml(x.item)}))};
  const r=C.compose({copy,d,A,T,g,facts,productFacts:facts,sceneUri,exampleUri,catalogue,copyBlock,layout,...extras})   // extras.facts (fact-sheet items) shadows `facts`: adapters read productFacts;
  const used=[...new Set(record.used)];
  // Adapter compositions (colouring books) may place pages through the shared primitives: what was RENDERED is read back
  // from the markup (data-art = the asset's sha), so "the focal asset is on the card" is checked, not assumed.
  if(C.adapter)for(const [id,a] of Object.entries(catalogue))if(a.art?.sha256&&r.body.includes(`data-art="${a.art.sha256}"`))used.push(id);
  layout.assets=[...new Set(used)];layout.crops=record.crops;
  layout.renders=layout.assets.filter(id=>catalogue[id].kind==='render').map(id=>({asset:id,depicts:catalogue[id].depicts.map(x=>x.pattern_id)}));
  return {bodyHtml:`<div id="canvas" class="${r.dark?'dark':'light'}">${r.body}${footer(facts.product_name)}</div>`,extraCss:css(T)+creativeCss(T),layout};
}

const creativeCss=T=>`
.cd-h{letter-spacing:.02em;line-height:1.04}
.cd-serif{text-transform:none;font-style:italic;font-weight:400;letter-spacing:0}
.cd-kicker{position:absolute;z-index:20;font:600 28px Inter,sans-serif;letter-spacing:.24em;text-transform:uppercase}
.cd-meta{position:absolute;z-index:20;font:600 26px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;line-height:38px}
.cd-meta i{font-style:normal;margin:0 10px;opacity:.7}
.cd-sub{position:absolute;z-index:20;font-family:Spectral,Georgia,serif;font-style:italic;font-size:44px;line-height:1.3}
.cd-list{position:absolute;z-index:20;font:600 28px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;line-height:1.4}
.cd-list div{display:flex;align-items:baseline;margin-bottom:22px}
.cd-list i{flex:none;display:inline-block;width:12px;height:12px;margin:0 26px 3px 2px;transform:rotate(45deg)}
.cd-caption .nb{white-space:nowrap;padding:0;background:none}
.cd-caption{position:absolute;font:400 26px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;line-height:1.5}
.cd-caption span{padding:10px 22px;border-radius:999px}
.cd-tag{position:absolute;padding:14px 26px;border:1.5px solid;border-radius:999px;font:600 24px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;box-shadow:0 10px 24px -10px rgba(60,40,20,.35)}
.cd-step{position:absolute;width:440px;z-index:20;display:flex;flex-direction:column;align-items:center;gap:18px;font:600 36px Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase}
.cd-step b{width:86px;height:86px;border-radius:50%;border:2.5px solid;display:flex;align-items:center;justify-content:center;font:600 46px Spectral,Georgia,serif;letter-spacing:0}
.cd-path{position:absolute;left:0;top:0;z-index:4}
.cd-spread{position:absolute;z-index:10;transform-origin:50% 100%;transform:perspective(2400px) rotateX(24deg) rotate(-3deg)}
.cd-fold{position:absolute;top:0;width:80px;z-index:15;background:linear-gradient(90deg,rgba(60,40,20,0) 0%,rgba(60,40,20,.22) 50%,rgba(60,40,20,0) 100%)}
.cd-mat{position:absolute;z-index:14;background:#FBF8F2;border-radius:6px;box-shadow:0 2px 4px rgba(0,0,0,.3),0 30px 60px -16px rgba(20,10,4,.6)}
.cd-mat-label{position:absolute;left:0;right:0;bottom:30px;text-align:center;font:600 22px Inter,sans-serif;letter-spacing:.26em;text-transform:uppercase}
.cd-placeholder{position:absolute;left:40px;bottom:40px;z-index:45;padding:12px 22px;border-radius:10px;background:rgba(255,255,255,.82);color:#5A3B2A;font:600 22px Inter,sans-serif;letter-spacing:.08em;border:2px dashed #B7836F}
.cd-fact{position:absolute;z-index:20;display:flex;align-items:center;gap:34px;font:600 40px Inter,sans-serif;line-height:1.2}
`;

// --------------------------------------------------------------- variety ---
/**
 * Campaign-level creative variety (ADR-058). From the directions (and, when given,
 * the renders' product share). Fails: one composition on more than a third of the
 * cards (min 2), one ground everywhere, floating pages everywhere, one headline
 * placement everywhere, no emotional/lifestyle card, a small product across the
 * campaign (mean share < 35%). Warnings: a ground or zone on more than half the cards,
 * floating-page cards on more than half.
 */
export function creativeVariety(directions,{shares=null}={}){
  const D=Object.values(directions).filter(d=>d?.composition), n=D.length, checks=[], warnings=[], add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail:String(detail)});
  if(!n)return {checks,warnings,summary:null};
  const count=key=>D.reduce((m,d)=>(m[d[key]]=(m[d[key]]??0)+1,m),{}), top=m=>Object.entries(m).sort((a,b)=>b[1]-a[1])[0];
  const comp=count('composition'), bg=count('background'), zone=count('text_zone');
  const capC=Math.max(2,Math.ceil(n/3)), [tc,tcn]=top(comp);
  add('creative variety: compositions',tcn<=capC,`${Object.keys(comp).length} compositions; most used "${tc}" ${tcn}× (max ${capC})`);
  add('creative variety: backgrounds',n<2||Object.keys(bg).length>1,`${Object.keys(bg).length} backgrounds: ${Object.entries(bg).map(([k,v])=>`${k} ${v}`).join(', ')}`);
  const floating=D.filter(d=>COMPOSITIONS[d.composition]?.floating).length;
  add('creative variety: not only floating pages',floating<n,`${floating} of ${n} cards are pages only`);
  add('creative variety: headline placement',n<2||Object.keys(zone).length>1,`${Object.keys(zone).length} text zones: ${Object.entries(zone).map(([k,v])=>`${k} ${v}`).join(', ')}`);
  const emotional=D.filter(d=>COMPOSITIONS[d.composition]?.lifestyle||d.job==='desire');
  add('creative variety: lifestyle / emotional storytelling',emotional.length>0,emotional.map(d=>d.id).join(', ')||'no lifestyle or desire card');
  if(shares){const v=Object.values(shares), mean=v.reduce((s,x)=>s+x,0)/Math.max(1,v.length);
    add('creative variety: product presence across the campaign',mean>=0.35,`mean product share ${(mean*100).toFixed(0)}% (min 35%)`);}
  const half=Math.ceil(n/2);
  for(const [k,v] of Object.entries(bg))if(v>half)warnings.push(`Background "${k}" is used on ${v} of ${n} cards.`);
  for(const [k,v] of Object.entries(zone))if(v>half)warnings.push(`Headline placement "${k}" is used on ${v} of ${n} cards.`);
  if(floating>half)warnings.push(`${floating} of ${n} cards show floating pages only.`);
  return {checks,warnings,summary:{cards:n,compositions:comp,backgrounds:bg,text_zones:zone,floating,emotional:emotional.map(d=>d.id),renders:D.filter(d=>/^render-/.test(d.focal_asset)).length}};
}

/** Truth checks on rendered creative cards: renders cropped below their lettering, within the resolution floor, tied to approved pattern IDs. */
export function creativeTruth(renderResults,facts){
  const checks=[], add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail:String(detail)});
  const lay=renderResults.filter(r=>r.layout?.creative), bad=[], soft=[], untied=[];
  const ids=new Set(facts.patterns?.list?.map(p=>p.pattern_id)??[]);
  for(const r of lay){
    for(const c of r.layout.crops??[]){const k=c.crop, b=c.bounds, e=1e-3;
      if(k.x<b.x-e||k.y<b.y-e||k.x+k.w>b.x+b.w+e||k.y+k.h>b.y+b.h+e)bad.push(`${r.slide} ${c.asset}`);
      if(c.upscale>MAX_UPSCALE+1e-6)soft.push(`${r.slide} ${c.asset} ${c.upscale}×`);}
    for(const x of r.layout.renders??[])if(!x.depicts.length||x.depicts.some(id=>!ids.has(id)))untied.push(`${r.slide} ${x.asset}`);
  }
  add('approved renders shown only below their lettering',!bad.length,bad.join(', ')||`${lay.reduce((s,r)=>s+(r.layout.crops?.length??0),0)} crops inside their text-free region`);
  add(`crops within the resolution floor (≤ ${MAX_UPSCALE}×)`,!soft.length,soft.join(', ')||'every crop within the floor');
  add('every pictured render tied to approved pattern IDs',!untied.length,untied.join(', ')||`${lay.reduce((s,r)=>s+(r.layout.renders?.length??0),0)} render placements`);
  return checks;
}
