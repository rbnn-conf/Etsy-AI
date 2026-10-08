// Stage 3 marketing for greeting cards: deterministic campaign planner and the
// named composition primitives it combines.
//
// Every product visual is the REAL Stage 2 artwork or a true render of a
// customer PDF (primitives.placeArt / openCard: whole, own aspect ratio,
// traced by SHA-256). AI images are only ever environments behind it. All
// text is rendered by code: art-directed campaign copy (campaign.mjs) plus,
// on "tone" slides, one model-written supporting line that is claim-linted.
import { campaignFor, campaignCopy } from './campaign.mjs';
import { CANVAS, css, placeArt, artHeight, openCard, backdrop, environment, scrim, headline, textBlock, copyHtml, fact, pill, benefitRow, benefitList, tag, icon, footer, bokeh } from './primitives.mjs';

export { CANVAS };
const MAX_SLIDES=10;
// Scenes in priority order when fewer backgrounds are allowed (0 = all coded environments).
const SCENE_PRIORITY=['tabletop','gift','print','inside'];

/**
 * Campaign plan from production facts: which composition answers which buyer
 * question, which environment scene each uses (scenes are reused across
 * slides), and the art-directed copy. Adapts to one or several designs and
 * shared or separate insides; capped at 10 by priority, never padded.
 */
export function planSlides(facts,{maxScenes=4,strategy}={}){
  const C=campaignCopy(facts), camp=campaignFor(facts,strategy), multi=facts.designs.length>1, s=[];
  const add=(template,prio,extra)=>s.push({template,prio,...extra});
  add('hero',10,{scene:'tabletop',density:'rich lifestyle',purpose:'Stop the scroll: both real card fronts on a festive tabletop.',min_product_share:.4});
  if(multi)add('designs',8,{scene:'tabletop',density:'lifestyle / product',purpose:'Every design in the set, large and labelled.',min_product_share:.3});
  facts.insides.forEach((ins,i)=>add('inside',i?3:7,{inside:i,scene:'inside',density:'lifestyle / detail',purpose:'The real inside, shown as an open card.',min_product_share:.18}));
  add('included',9,{density:'structured information',purpose:'Everything in the download, as real miniatures.',min_product_share:.12});
  facts.designs.forEach((d,i)=>add('design',i<2?6:3,{design:d.id,side:i%2?'right':'left',env:i%2?'berry':'forest',density:'artwork hero',purpose:`Design ${d.id} (${d.name}) at near full size.`,min_product_share:.45}));
  add('print',7,{scene:'print',density:'lifestyle / process',purpose:'Print at home: the real sheet and the four steps.',min_product_share:.18});
  if(facts.formats.length)add('sizes',5,{density:'stationery / information',purpose:'Paper sizes produced, shown as real renders.',min_product_share:.28});
  add('gift',5,{scene:'gift',tone:true,density:'emotional lifestyle',purpose:'A finished card in a warm gifting moment.',min_product_share:.2});
  add('digital',9,{density:'clean information',purpose:'Digital download: what you get, nothing shipped.',min_product_share:.12});
  // Trim lowest priority first (latest first on ties), keeping campaign order.
  while(s.length>MAX_SLIDES){let k=0;s.forEach((x,i)=>{if(x.prio<=s[k].prio)k=i;});s.splice(k,1);}
  const slides=s.map(({prio,...x},i)=>{
    const d=x.design&&facts.designs.find(y=>y.id===x.design);
    const copy=x.template==='design'?{headline:{text:d.name.split(' ').join('\n'),claim:['design-name',d.name]},kicker:{text:`Design ${d.id}`,claim:['design-name',`Design ${d.id}`]}}:{...C[x.template]};
    return {...x,id:`${String(i+1).padStart(2,'0')}-${x.template}${x.design?`-${x.design.toLowerCase()}`:''}`,copy};
  });
  const used=SCENE_PRIORITY.filter(id=>slides.some(x=>x.scene===id)).slice(0,Math.max(0,maxScenes));
  for(const x of slides)if(x.scene&&!used.includes(x.scene))delete x.scene;
  return {format:'greeting-card',campaign:camp.name,strategy:{...camp.strategy,visual_marketing_mood:camp.mood},slides,scenes:used.map(id=>({id,purpose:camp.scenes[id].purpose,used_by:slides.filter(x=>x.scene===id).map(x=>x.id)}))};
}

// ------------------------------------------------------- compositions ---
// Each answers ONE buyer question. ctx = {facts, slide, copy, A (real art), T (tokens), sceneUri}.

// One design: the card is sized from its own aspect ratio to cover about this
// share of the canvas (a fixed width left a 2:3 portrait card at ~32%, under
// the hero's 40% QC floor). Of the two layouts -- card under the centred header,
// or card on the right with the copy in a column beside it -- the one giving
// the larger card wins: wide and square cards centre, portrait cards go right.
const HERO_SINGLE_SHARE=.48;
function singleHeroFit(a){
  const r=a.width/a.height, ideal=Math.sqrt(HERO_SINGLE_SHARE*CANVAS*CANVAS/r);
  let sh=Math.min(1700,ideal), sw=sh*r; if(sw>1200){sw=1200;sh=sw/r;}
  const ch=Math.min(ideal,1300,1800/r), cw=ch*r;
  return sw*sh>cw*ch?{split:true,w:sw,x:CANVAS-90-sw,y:(CANVAS-sh)/2-20}:{split:false,w:cw,x:(CANVAS-cw)/2,y:540+Math.max(0,(1250-ch)/2)};
}
function heroSingle({facts,copy,a,T,sceneUri,benefits}){
  const fit=singleHeroFit(a);
  if(!fit.split)return null;   // centred: the shared header layout
  const {x,w}=fit, colW=x-60-100;
  // Headline sized so its longest word fits the column (~.72 em per capital), never below thumbnail legibility.
  const EM=.72, text=String(copy.headline?.text??''), words=text.split(/\s+/).filter(Boolean);
  const size=Math.max(88,Math.min(128,Math.floor(colW/(EM*Math.max(...words.map(s=>s.length),1)))));
  const lines=text.split('\n').reduce((n,l)=>n+l.trim().split(/\s+/).reduce((a,wd)=>{const t=a.cur?`${a.cur} ${wd}`:wd;return a.cur&&t.length*EM*size>colW?{n:a.n+1,cur:wd}:{...a,cur:t};},{n:1,cur:''}).n,0);
  let b=backdrop(sceneUri,'table',T)+scrim('left',.86)+scrim('top',.5);
  b+=textBlock(fact('product-title',facts.product_name),{x:100,y:520,w:colW,cls:'lx-micro',color:T.gold});
  b+=headline(copy.headline,{x:100,y:640,w:colW,size,color:T.cream});
  let y=640+lines*size+60;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:100,y,w:colW,cls:'lx-sub',color:T.goldLight});y+=200;}
  b+=benefitList(benefits,{x:100,y,w:colW,T});
  b+=placeArt(a,{x,y:fit.y,w,rz:-2,shadow:'lift',z:12});
  return b;
}

function heroLifestyle({facts,copy,A,T,sceneUri}){
  const fronts=facts.designs.slice(0,3).map(d=>A.fronts[d.id]);
  const F=new Set(facts.formats.map(f=>f.key));
  const benefits=[fact('digital','Digital download'),...(F.has('A4')&&F.has('US-Letter')?[fact('format','A4 + US Letter')]:[...F].filter(k=>k!=='Card-Panels-4x6in').map(k=>fact('format',facts.formats.find(f=>f.key===k).label))),
    ...(F.has('Card-Panels-4x6in')?[fact('format','4×6 in','4×6')]:[]),fact('digital','Print at home')];
  const single=fronts.length===1&&heroSingle({facts,copy,a:fronts[0],T,sceneUri,benefits});
  if(single)return {body:single,dark:true};
  let b=backdrop(sceneUri,'table',T)+scrim('top',.84);
  b+=textBlock(fact('product-title',facts.product_name),{x:100,y:112,w:1800,cls:'lx-micro',color:T.gold,align:'center'});
  b+=headline(copy.headline,{x:100,y:168,w:1800,size:128,color:T.cream,align:'center'});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:100,y:462,w:1800,cls:'lx-sub',color:T.goldLight,align:'center'});
  // One wide or square card fills the space under the header at its own aspect ratio.
  const one=fronts.length===1&&(({x,y,w})=>[x,y,w,-2,0])(singleHeroFit(fronts[0]));
  const lay=one?[one]:fronts.length===2?[[260,600,760,-5,7],[980,630,760,4,-7]]:[[150,660,600,-7,6],[700,600,600,0,0],[1250,660,600,7,-6]];
  fronts.forEach((a,i)=>{const [x,y,w,rz,ry]=lay[i];b+=placeArt(a,{x,y,w,rz,ry,shadow:'lift',z:fronts.length===2?12-i:10+(i===1?5:0)});});
  b+=benefitRow(benefits,{y:1812,T});
  return {body:b,dark:true};
}

function dualProductLifestyle({facts,copy,A,T,sceneUri}){
  const ds=facts.designs.slice(0,3), n=ds.length, w=n===2?700:540, gap=n===2?180:90, x0=(CANVAS-(n*w+(n-1)*gap))/2;
  let b=backdrop(sceneUri,'table',T,{blur:sceneUri?9:0,dim:sceneUri?.3:0})+scrim('top',.7);
  b+=headline(copy.headline,{x:120,y:112,w:1760,size:120,color:T.cream,align:'center'});
  ds.forEach((d,i)=>{const x=x0+i*(w+gap), y=500, a=A.fronts[d.id], h=artHeight(a,w);
    b+=placeArt(a,{x,y,w,rz:i%2?1.5:-1.5,shadow:'lift'});
    b+=tag({x:x+w/2-230,y:y+h-60,w:460,kicker:fact('design-name',`Design ${d.id}`),title:fact('design-name',d.name),T});});
  return {body:b,dark:true};
}

function openCardLifestyle({facts,slide,copy,A,T,sceneUri}){
  const inside=A.insides[slide.inside??0];
  let b=backdrop(sceneUri,'table',T)+scrim('top',.88)+scrim('topleft',.5);
  b+=headline(copy.headline,{x:120,y:112,w:1300,size:118,color:T.cream});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:124,y:376,w:1100,cls:'lx-lede',color:T.goldLight});
  b+=openCard(inside,{x:1120,y:690,w:740,T});
  return {body:b,dark:true};
}

function contentsGrid({facts,copy,A,T}){
  const n=facts.designs.length, F=new Set(facts.formats.map(f=>f.key)), fr=facts.designs.slice(0,2).map(d=>A.fronts[d.id]);
  const shared=facts.insides.length===1&&facts.insides[0].shared_by.length>1;
  const tiles=[];
  // Visual first: each tile shows the real file(s), then a short label.
  tiles.push({label:fact('design-count',`${n} card design${n>1?'s':''}`),draw:(cx,cy)=>fr.map((a,i)=>placeArt(a,{x:cx-135+(fr.length>1?(i?90:-90):0),y:cy-205,w:270,rz:fr.length>1?(i?6:-6):0,shadow:'lift',z:10+i})).join('')});
  if(A.insides[0])tiles.push({label:shared?fact('inside','1 shared inside'):fact('inside','Inside message'),draw:(cx,cy)=>placeArt(A.insides[0],{x:cx-143,y:cy-215,w:286,shadow:'lift'})});
  const sheet=Object.values(A.sheets)[0];
  if(sheet)tiles.push({label:F.has('A4')&&F.has('US-Letter')?fact('format','A4 + US Letter'):fact('format',facts.formats[0].label),
    draw:(cx,cy)=>placeArt(sheet,{x:cx-230,y:cy-190,w:420,rz:-4,shadow:'lift'})+(A.letter?placeArt(A.letter,{x:cx-170,y:cy-80,w:400,rz:3,shadow:'lift',z:12}):'')});
  const panels=Object.values(A.panels??{});
  if(panels.length)tiles.push({label:fact('format','4×6 in card panels','4×6 card panels'),draw:(cx,cy)=>panels.slice(0,2).map((a,i)=>placeArt(a,{x:cx-140+(panels.length>1?(i?80:-80):0),y:cy-210,w:280,rz:panels.length>1?(i?5:-5):0,shadow:'lift',z:10+i})).join('')});
  if(facts.original_artwork_files){const orig=[...fr,...A.insides].slice(0,3);
    tiles.push({label:fact('artwork-files',`${facts.original_artwork_files} original artwork files`),draw:(cx,cy)=>orig.map((a,i)=>placeArt(a,{x:cx-120+(i-1)*140,y:cy-180,w:240,rz:(i-1)*7,shadow:'lift',z:10+(i===1?5:i)})).join('')});}
  if(A.guide)tiles.push({label:fact('printing-guide','Printing guide'),draw:(cx,cy)=>{const w=Math.min(300,430*A.guide.width/A.guide.height);return placeArt(A.guide,{x:cx-w/2,y:cy-artHeight(A.guide,w)/2,w,rz:-2,shadow:'lift'});}});
  let b=environment('forest',T);
  b+=headline(copy.headline,{x:120,y:96,w:1760,size:124,color:T.cream,align:'center'});
  const cols=3, tw=560, th=680, gx=40, gy=40, y0=300, x0=(CANVAS-(cols*tw+(cols-1)*gx))/2;
  tiles.slice(0,6).forEach((t,i)=>{const x=x0+(i%cols)*(tw+gx), y=y0+Math.floor(i/cols)*(th+gy);
    b+=`<div class="lx-tile" style="left:${x}px;top:${y}px;width:${tw}px;height:${th}px"></div>`;
    b+=t.draw(x+tw/2,y+270);
    b+=textBlock(t.label,{x:x+30,y:y+th-128,w:tw-60,cls:'lx-tile-label',color:T.cream,align:'center'});});
  return {body:b,dark:true};
}

function artworkHero({facts,slide,copy,A,T}){
  const a=A.fronts[slide.design], h=1740, w=h*a.width/a.height, left=slide.side!=='right';
  const x=left?120:CANVAS-120-w, colX=left?x+w+80:110, colW=left?CANVAS-colX-90:x-80-110;
  let b=environment(slide.env??'forest',T)+bokeh('#F2C27C',{alpha:.25,only:left?[5,6,10]:[0,1,11]});
  b+=placeArt(a,{x,y:(CANVAS-h)/2,w,shadow:'lift',z:10});
  b+=textBlock(copyHtml(copy.kicker),{x:colX,y:760,w:colW,cls:'lx-micro',color:T.gold});
  b+=`<div style="position:absolute;left:${colX}px;top:830px;width:110px;height:3px;background:${T.gold};z-index:20"></div>`;
  b+=headline(copy.headline,{x:colX,y:872,w:colW,size:112,color:T.cream,cls:'lx-name'});
  return {body:b,dark:true};
}

function printProcess({facts,copy,A,T,sceneUri}){
  const sheet=Object.values(A.sheets)[0], front=A.fronts[facts.designs[0].id];
  let b=backdrop(sceneUri,'table',T,{props:false})+scrim('top',.88)+scrim('topleft',.5)+scrim('bottom',.55);
  b+=headline(copy.headline,{x:120,y:112,w:1500,size:136,color:T.cream});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:124,y:276,w:1000,cls:'lx-lede',color:T.goldLight});
  if(sheet)b+=placeArt(sheet,{x:480,y:600,w:1240,rx:30,rz:-6,shadow:'table',origin:'50% 100%'});
  b+=placeArt(front,{x:1400,y:880,w:440,rx:-4,rz:5,shadow:'lift',z:14});
  const steps=[['1','Download'],['2','Print'],['3','Trim & fold'],['4','Give']];
  b+=`<div class="lx-steps" style="top:1700px">${steps.map(([k,t],i)=>`${i?'<span class="lx-step-sep"></span>':''}<span class="lx-step"><b>${k}</b>${fact('process',t)}</span>`).join('')}</div>`;
  return {body:b,dark:true};
}

function sizeComparison({facts,copy,A,T}){
  const F=new Set(facts.formats.map(f=>f.key)), sheet=Object.values(A.sheets)[0], panel=Object.values(A.panels??{})[0];
  const PAPER={'A4':'210 × 297 mm','US-Letter':'8.5 × 11 in'};
  let b=environment('linen',T);
  b+=headline(copy.headline,{x:120,y:110,w:1400,size:112,color:T.ink});
  if(sheet&&F.has('A4')){b+=placeArt(sheet,{x:120,y:560,w:1080,rz:-3,shadow:'soft'});
    b+=tag({x:190,y:680,w:440,kicker:fact('format','A4'),title:fact('paper-size',PAPER.A4),T,dark:true});}
  if(A.letter&&F.has('US-Letter')){b+=placeArt(A.letter,{x:330,y:1030,w:1020,rz:2.5,shadow:'soft',z:12});
    b+=tag({x:420,y:1150,w:380,kicker:fact('format','US Letter'),title:fact('paper-size',PAPER['US-Letter']),T,dark:true});}
  if(panel&&F.has('Card-Panels-4x6in')){b+=placeArt(panel,{x:1450,y:600,w:430,rz:3,shadow:'soft',z:14});
    b+=tag({x:1420,y:1300,w:480,kicker:fact('format','4×6 in card panels','4×6 card panels'),title:fact('paper-size','4 × 6 in'),T,dark:true});}
  return {body:b,dark:false};
}

function giftLifestyle({facts,copy,A,T,sceneUri}){
  const d=facts.designs[1]??facts.designs[0], a=A.fronts[d.id];
  let b=backdrop(sceneUri,'table',T)+scrim('top',.88)+scrim('topleft',.5);
  b+=headline(copy.headline,{x:120,y:112,w:1400,size:116,color:T.cream});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:124,y:372,w:900,cls:'lx-lede',color:T.goldLight,size:46});
  b+=placeArt(a,{x:1000,y:620,w:800,rx:5,rz:4,shadow:'lift',origin:'50% 100%',z:12});
  return {body:b,dark:true};
}

function digitalInfo({facts,copy,A,T}){
  let b=environment('paper',T);
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:136,color:T.ink,align:'center'});
  b+=pill(fact('digital','No physical item will be shipped'),{bg:T.berry,color:T.cream,y:292,center:true,size:32});
  const items=[['instant',fact('digital','Instant access after purchase','Instant access<br>after purchase')],['printer',fact('process','Print at home or use a print shop','Print at home<br>or use a print shop')],
    ...(facts.original_artwork_files?[['files',fact('artwork-files','PDF and original artwork PNG files','PDF and original<br>artwork PNG files')]]:[]),
    ...(facts.printing_guide?[['guide',fact('printing-guide','Step-by-step printing guide','Step-by-step<br>printing guide')]]:[])];
  items.forEach(([ic,html],i)=>{const x=i%2?1030:150, y=470+Math.floor(i/2)*270;
    b+=`<div class="lx-benefit" style="left:${x}px;top:${y}px;width:840px">${icon(ic,{T})}<div class="tx">${html.replaceAll('&lt;br&gt;','<br>')}</div></div>`;});
  // The real files, as the customer receives them.
  b+=`<div class="lx-tray" style="left:120px;top:1010px;width:1760px;height:810px"></div>`;
  b+=textBlock('In your download',{x:120,y:1060,w:1760,cls:'lx-micro',color:T.berry,align:'center'});
  const row=[...facts.designs.slice(0,2).map(d=>A.fronts[d.id]),...A.insides.slice(0,1)], sheet=Object.values(A.sheets)[0];
  const H=520, ws=row.map(a=>H*a.width/a.height), sw=sheet?520:0, gap=46, total=ws.reduce((s,v)=>s+v,0)+sw+gap*(row.length+(sheet?1:0)-1);
  let x=(CANVAS-total)/2;
  row.forEach((a,i)=>{b+=placeArt(a,{x,y:1170,w:ws[i],shadow:'soft'});x+=ws[i]+gap;});
  if(sheet)b+=placeArt(sheet,{x,y:1170+(H-artHeight(sheet,sw))/2,w:sw,shadow:'soft'});
  return {body:b,dark:false};
}

export const PRIMITIVES={hero:heroLifestyle,designs:dualProductLifestyle,inside:openCardLifestyle,included:contentsGrid,design:artworkHero,
  print:printProcess,sizes:sizeComparison,gift:giftLifestyle,digital:digitalInfo};
export const PRIMITIVE_NAMES={hero:'heroLifestyle',designs:'dualProductLifestyle',inside:'openCardLifestyle',included:'contentsGrid',design:'artworkHero',
  print:'printProcess',sizes:'sizeComparison',gift:'giftLifestyle',digital:'digitalInfo'};

/**
 * @param slide  one planSlides() slide (with .copy)
 * @param ctx    { facts, art:{fronts,insides,sheets,letter,panels,guide}, sceneUri }
 */
export function composeSlide(slide,{facts,art:A,sceneUri}){
  const f=PRIMITIVES[slide.template];
  if(!f)throw new Error(`Unknown slide template ${slide.template}`);
  const T=campaignFor(facts).tokens;
  const {body,dark}=f({facts,slide,copy:slide.copy??{},A,T,sceneUri:slide.scene?sceneUri:null});
  return {bodyHtml:`<div id="canvas" class="${dark?'dark':'light'}">${body}${footer(facts.product_name)}</div>`,extraCss:css(T)};
}
