// Stage 3 marketing for crochet pattern bundles (ADR-041): the campaign
// planner and the compositions it combines. Generic for any crochet bundle
// (flowers, animals, décor): counts, names and files come from the Stage 2
// facts. The smallest set of slides that answers the buyer's questions: what
// it is, what a pattern looks like, how many, what's included, how it works.
//
// Ownership:
//   - OpenAI provides only environment photographs (never flowers or any
//     crocheted item, so nothing reads as a photo of a finished piece) and
//     the tone lines. The listing copy is OpenAI's too (automation/src/stage3).
//   - Code places the REAL product: true renders of the customer PDFs and the
//     approved Stage 1 artwork (a rendered visualisation, never a photograph;
//     its look comes from crochet-visual-direction.mjs, ADR-043),
//     and renders every word; factual phrases carry a claim key.
import { CANVAS, css, placeArt, artHeight, headline, textBlock, copyHtml, fact, pill, benefitList, benefitRow, icon, footer, scrim } from './primitives.mjs';

export { CANVAS };
const MAX_SLIDES=8;
const SCENE_PRIORITY=['craft','cosy'];
const px=v=>`${Math.round(v)}px`;
const pad=n=>String(n).padStart(2,'0');
const T_=(text,claim)=>claim?{text,claim}:{text};

// ------------------------------------------------------------ campaign ---
// Warm cream, blush, muted rose, sage, lavender, a touch of powder blue; warm brown / charcoal type.
const TOKENS={paper:'#FBF6EE',linen:'#F3E9DD',cream:'#FFFDF8',ink:'#3A3230',gold:'#B7836F',goldLight:'#F1DCD3',forest:'#46524A',forestDeep:'#2B332D',
  berry:'#A8605F',berryDeep:'#5E3433',walnut:'#6B5A4E',walnutDeep:'#3A2E27',needle:'#7E9A7A',needleDark:'#4E6450',berryFruit:'#9A8DBB',powder:'#AFC4D6',
  // Creative cards (ADR-058): the Moonlit Meadow document palette.
  ivory:'#FAF5EC',rose:'#9E5A57',inkSoft:'#6B5A52',duskIcon:'#4A4458'};
// Environments only; the real product is composited on top by code. No flowers and no crocheted item may appear.
const SCENES={
  craft:{purpose:'Hero: a calm crochet crafting table.',allow:[],
    direction:'Premium overhead-angled photograph of a calm crafting table: a few skeins of soft yarn in blush pink, sage green, lavender and cream, a wooden crochet hook, small scissors and a linen cloth on pale oak, soft natural window light and gentle shadows, shallow depth of field. Keep the right-hand two thirds of the table clear, even and softly lit, reserved for products added later.'},
  cosy:{purpose:'Lifestyle: a quiet crochet moment at home.',allow:[],
    direction:'Cosy, bright corner at home for a quiet crafting hour: a woven basket of yarn skeins, a knitted throw, a cup of tea and soft warm daylight, gentle shadows, shallow depth of field. Keep the centre and right of the surface clear and calm, reserved for a product added later.'}};

export function crochetCampaign(facts,strategy){
  return {name:'crochet-botanical',tokens:TOKENS,scenes:SCENES,mood:strategy?.visual_marketing_mood??'premium warm botanical crafting',
    strategy:{family:strategy?.product_family??'crochet_pattern',theme:strategy?.theme?.id??'none'}};
}

const both=f=>f.formats.some(x=>x.key==='A4')&&f.formats.some(x=>x.key==='US-Letter');
const paperFact=f=>both(f)?fact('format','A4 + US Letter'):fact('format',f.formats[0]?.label??'PDF');
const countText=f=>`${f.patterns.count} crochet patterns`;

/** Art-directed copy per template. Factual phrases carry a claim. */
function campaignCopy(f){
  const N=f.patterns.count;
  return {
    hero:{headline:T_(`${N} Crochet\nPatterns`,['pattern-count',countText(f)]),subline:T_(f.theme?`${f.theme[0].toUpperCase()}${f.theme.slice(1)}`:'Printable pattern collection')},
    collage:{headline:T_(`${N} patterns\nto make`,['pattern-count',`${N} patterns`])},
    index:{headline:T_('Every pattern\nat a glance')},
    included:{headline:T_('What’s included')},
    printable:{headline:T_('Instant digital\ndownload',['digital','Instant digital download'])},
    lifestyle:{headline:T_('Your quiet\ncrafting hour')},
    bundle:{headline:T_('Download,\nprint & crochet'),subline:T_(both(f)?'A4 + US Letter':f.formats[0]?.label??'',['format',both(f)?'A4 + US Letter':f.formats[0]?.label??''])}};
}

// -------------------------------------------------------------- planner ---
/** Campaign plan from the production facts. Capped at 8, never padded. No AI examples (never a "finished item"). */
export function planSlides(facts,{maxScenes=2,strategy}={}){
  const C=campaignCopy(facts), camp=crochetCampaign(facts,strategy), sel=facts.selection, s=[];
  const add=(template,prio,extra)=>s.push({template,prio,...extra});
  add('hero',10,{scene:'craft',density:'rich lifestyle',purpose:'Stop the scroll: the real collection cover and a pattern page on a crafting table.',min_product_share:.3});
  add('interior',9,{pattern:sel.inside,name_headline:true,density:'artwork hero',purpose:'Inside the collection: one real pattern page at near full size.',min_product_share:.4});
  if(sel.collage.length>=3)add('collage',8,{patterns:sel.collage,density:'product grid',purpose:'Many real pattern pages at once: the size of the collection.',min_product_share:.3});
  add('index',7,{density:'information',purpose:'The real pattern index: every pattern at a glance.',min_product_share:.3});
  add('included',9,{density:'structured information',purpose:'Everything in the download, as real files.',min_product_share:.12});
  add('printable',8,{density:'clean information',purpose:'Download and printing information: what you get, nothing shipped.',min_product_share:.08});
  add('lifestyle',6,{scene:'cosy',tone:true,density:'emotional lifestyle',purpose:'The real collection in a quiet crafting moment.',min_product_share:.25});
  add('bundle',5,{patterns:sel.collage.slice(0,5),tone:true,density:'summary',purpose:'Final summary: the collection at a glance.',min_product_share:.3});
  while(s.length>MAX_SLIDES){let k=0;s.forEach((x,i)=>{if(x.prio<=s[k].prio)k=i;});s.splice(k,1);}
  const P=id=>facts.patterns.list.find(p=>p.pattern_id===id);
  const slides=s.map(({prio,...x},i)=>{
    const copy=x.template==='interior'?{headline:T_(P(x.pattern).name,['pattern-name',P(x.pattern).name]),
      kicker:T_(`Pattern ${pad(P(x.pattern).number)} of ${facts.patterns.count}`,['pattern-number',`Pattern ${pad(P(x.pattern).number)} of ${facts.patterns.count}`])}:{...C[x.template]};
    return {...x,id:`${pad(i+1)}-${x.template}`,copy};
  });
  const used=SCENE_PRIORITY.filter(id=>slides.some(x=>x.scene===id)).slice(0,Math.max(0,maxScenes));
  for(const x of slides)if(x.scene&&!used.includes(x.scene))delete x.scene;
  return {format:'crochet-pattern-bundle',campaign:camp.name,strategy:{...camp.strategy,visual_marketing_mood:camp.mood},slides,
    scenes:used.map(id=>({id,purpose:camp.scenes[id].purpose,used_by:slides.filter(x=>x.scene===id).map(x=>x.id)}))};
}

// ------------------------------------------------- creative plan (ADR-058) ---
/** "bouquet" when the collection is one (product name, type or theme); the cover descriptor uses the same word (ADR-056). */
export const collectionNoun=f=>/\bbouquets?\b/i.test(`${f.product_name} ${f.product_type} ${f.theme}`)?'bouquet':null;
const cap=w=>w[0].toUpperCase()+w.slice(1);
// Props an AI environment may show: plain materials only, never flowers or any crocheted item.
const CROCHET_PROPS=['yarn skeins','wooden crochet hook','small scissors','tea cup','linen cloth','oak table','window light'];
const JOB_LABEL={'stop-scroll':'Stop the scroll','what-you-get':'What am I getting?','quality':'Show me the quality','variety':'Show me the variety',
  'useful':'Why is this useful?','how-it-works':'How does it work?','desire':'Make me want it','doubts':'Remove my doubts'};

/** The crochet niche's creative direction: given to the art-direction call and followed by the code baseline. */
export function crochetCreativeDirection(){
  return {niche:'crochet pattern bundle',buyer_thought:'I want to make these.',
    identity:'Premium, editorial, tactile and romantic. The Moonlit Meadow palette (ivory, blush, sage, dusk), linen and paper textures, serif headlines, generous space.',
    preferred_compositions:['editorial-hero','macro-detail','collection','feature-focus','lifestyle'],
    allowed_props:CROCHET_PROPS,
    truth:['Every crochet piece shown is an approved render from the asset catalogue, tied to approved pattern IDs. It is an illustration: never imply a photograph, a made or tested sample, or an exact result.',
      'A render is shown only through a crop below its baked-in lettering (code enforces it).',
      'AI environments never contain flowers, crochet, knitted items or yarn objects other than plain skeins, and never paper, text or people.',
      'Numbers, pattern names, sizes and formats come only from the facts.'],
    avoid:['documents floating on a plain cream background on every card','cluttered collages','text over the crochet','photographic or tested claims','fake urgency']};
}

/**
 * The code baseline creative plan (ADR-058): eight cards, one buyer job each, built on
 * the approved renders and the real documents. The art-direction call may refine each
 * direction within the same validated vocabulary; without it this plan is used as is
 * (zero AI calls). Generic for any crochet bundle: names, counts and assets come from
 * the facts, and a card whose render is missing falls back to real pages.
 */
export function planCreative(facts,{strategy}={}){
  const N=facts.patterns.count, sel=facts.selection, camp=crochetCampaign(facts,strategy), noun=collectionNoun(facts);
  const R=Object.fromEntries((facts.renders??[]).map(r=>[r.role,`render-${r.role}`]));
  const P=id=>facts.patterns.list.find(p=>p.pattern_id===id), page=id=>`page-${id}`;
  const fmt=both(facts)?T_('A4 + US Letter',['format','A4 + US Letter']):T_(facts.formats[0]?.label??'PDF',['format',facts.formats[0]?.label??'PDF']);
  const terms=T_(`${facts.terminology} crochet terms`,['terms',`${facts.terminology} crochet terms`]);
  const title=T_(facts.product_name,['product-title',facts.product_name]);
  const detail=sel.detail&&R.detail?sel.detail:null, inside=sel.inside, others=sel.collage.filter(id=>id!==inside&&id!==detail);
  const spot=R.detail??R.bouquet??null, printed=detail??inside;
  const cards=[];
  const add=(job,o)=>cards.push({job,o});
  add('stop-scroll',{purpose:'desire and premium quality at thumbnail size.',buyer_message:`A generous collection of ${noun??'crochet'} patterns I would love to make.`,emotional_goal:'desire, premium',
    copy:{kicker:title,headline:T_(`${N} Crochet\n${noun?`${cap(noun)} `:''}Patterns`,['pattern-count',noun?`${N} crochet ${noun} patterns`:`${N} crochet patterns`]),meta:[fmt,terms]},
    focal:R.bouquet??'doc-cover',supporting:[...new Set(['doc-cover',page(inside),page(others[0]??inside)])],composition:'editorial-hero',
    background:R.bouquet?'render':'sage',crop:R.bouquet?{asset:R.bouquet,focus:[.5,.45],zoom:1}:null,zone:'top-left',min:.5,
    hierarchy:{primary:'the approved bouquet render, full-bleed',secondary:'the headline',tertiary:'the real booklet entering the frame and the format line'},
    claims:['product-title','pattern-count','format','terms','render'],avoid:['text over the crochet','a photographic claim']});
  add('what-you-get',{purpose:'generosity: every real file in the download.',buyer_message:'I get the complete collection, every pattern on its own, and the references.',emotional_goal:'generosity, trust',
    copy:{headline:T_('Everything in\nYour Download')},focal:'doc-cover',supporting:['doc-index',page(inside),page(others[1]??inside),'doc-materials','doc-abbreviations','doc-guide'],
    composition:'included-spread',background:'linen',zone:'top-centre',min:.3,
    labels:[{asset:'doc-cover',...T_('Complete pattern collection PDF',['included','Complete pattern collection PDF']),dx:30,dy:-62},
      {asset:page(inside),...T_('Each pattern as its own PDF',['individual','Each pattern as its own PDF']),dx:-140,dy:-110},
      {asset:'doc-guide',...T_('Printing guide',['printing-guide','Printing guide']),dx:30,dy:-50}],
    hierarchy:{primary:'the real collection cover',secondary:'the other files fanned around it',tertiary:'three short labels'},claims:['included','individual','printing-guide'],
    avoid:['labels on every item','a grid of identical tiles']});
  if(detail)add('quality',{purpose:'craft and trust: one pattern up close.',buyer_message:'The patterns are detailed and the pieces look beautiful.',emotional_goal:'craft, trust',
    copy:{kicker:T_(`Pattern ${pad(P(detail).number)} of ${N}`,['pattern-number',`Pattern ${pad(P(detail).number)} of ${N}`]),headline:T_(`Inside the\n${P(detail).name}`),
      meta:[T_(P(detail).level,['skill',P(detail).level]),terms]},
    focal:R.detail,supporting:[page(detail)],composition:'macro-detail',background:'sage',crop:{asset:R.detail,focus:[.5,.53],zoom:1.1},zone:'right-column',min:.3,
    hierarchy:{primary:`the ${P(detail).name} render, a macro crop in an arch`,secondary:'its real pattern page',tertiary:'pattern number and level'},
    claims:['pattern-number','skill','terms','render'],avoid:['a photographic claim','a count the pattern does not state']});
  else add('quality',{purpose:'craft and trust: a real pattern page up close.',buyer_message:'The patterns are clear and detailed.',emotional_goal:'craft, trust',
    copy:{headline:T_(`Inside ${P(inside).name}`),meta:[terms]},focal:page(inside),supporting:[page(inside)],composition:'feature-focus',background:'ivory',
    crop:{asset:page(inside),focus:[.5,.5],zoom:1.3},zone:'right-column',min:.3,
    hierarchy:{primary:'the real pattern page, cropped',secondary:'the headline',tertiary:'the whole page'},claims:['terms']});
  add('variety',{purpose:'abundance: how many different pieces there are to make.',buyer_message:`${N} different patterns: plenty to choose from.`,emotional_goal:'abundance, delight',
    copy:{headline:T_(`${N} Patterns\nto Make`,['pattern-count',`${N} patterns`])},
    focal:R.overview??page(inside),supporting:others.slice(0,4).map(page),composition:'collection',background:'blush',crop:R.overview?{asset:R.overview,focus:[.5,.56],zoom:1.04}:null,zone:'top-centre',min:.3,
    names:R.overview?facts.renders.find(r=>r.role==='overview').depicts.map(d=>T_(d.pattern_name,['pattern-name',d.pattern_name])):[],
    hierarchy:{primary:'the approved overview render in an arch',secondary:'real pattern pages fanned behind',tertiary:'the pictured pattern names'},
    claims:['pattern-count','pattern-name','render'],avoid:['an open-ended count','pattern names that are not in the render']});
  add('useful',{purpose:'confidence: what every pattern gives you.',buyer_message:'Clear written patterns for my level, with everything listed.',emotional_goal:'confidence',
    copy:{headline:facts.skill_levels.length>1?T_(facts.skill_text.replace(' to ',' to\n'),['skill',facts.skill_text]):T_('Clear Written\nPatterns')},
    focal:page(sel.feature),supporting:[page(sel.feature)],composition:'feature-focus',background:'paper',crop:{asset:page(sel.feature),focus:[.5,.7],zoom:1.15},zone:'left-column',min:.3,
    list:[T_('Skill level on every pattern',['features','Skill level on every pattern']),terms,T_('Materials listed for every pattern',['features','Materials listed for every pattern']),
      ...(facts.deliverables?.step_by_step_instructions?[T_('Step-by-step instructions',['instructions','Step-by-step instructions'])]:[]),
      ...(facts.stitch_counts?[T_('Stitch counts',['features','Stitch counts'])]:[])],
    hierarchy:{primary:'real written instructions, cropped close',secondary:'the skill range',tertiary:'short features'},claims:['skill','features','terms','instructions'],
    avoid:['a feature the patterns do not all have']});
  add('how-it-works',{purpose:'ease: from download to the hook in three steps.',buyer_message:'I download, print and start crocheting the same day.',emotional_goal:'ease',
    copy:{headline:T_('Download · Print · Crochet'),meta:[T_('Instant digital download',['digital','Instant digital download']),T_('Print at home',['digital','Print at home'])]},
    focal:'doc-cover',supporting:[...new Set([page(inside),'doc-index',page(printed),...(spot?[spot]:[])])],composition:'process',background:'ivory',zone:'bottom-band',min:.12,
    steps:[{label:T_('Download',['process','Download']),assets:['doc-cover',page(inside),'doc-index']},{label:T_('Print',['process','Print']),assets:[page(printed)]},
      ...(spot?[{label:T_('Crochet',['process','Crochet']),assets:[spot],note:T_('Illustrated example',['render','Illustrated example'])}]:[])],
    hierarchy:{primary:'the three steps with real files',secondary:'the headline',tertiary:'the delivery line'},claims:['process','digital','render']});
  add('desire',{purpose:'calm and aspiration: the collection in a quiet crafting moment.',buyer_message:'This is how my evenings could feel.',emotional_goal:'calm, aspiration',
    copy:{headline:T_('Your Quiet\nCrafting Hour'),subline:T_('Print a pattern, pour a cup of tea, begin.')},
    focal:spot??page(inside),supporting:['doc-index',page(printed)],composition:'lifestyle',background:'environment',crop:spot?{asset:spot,focus:[.5,.52],zoom:1.1}:null,zone:'top-right',min:.2,
    props:['yarn skeins','wooden crochet hook','tea cup','linen cloth','window light'],
    scene_brief:'A warm oak crafting table by a window with a neutral linen cloth: a few plain skeins of yarn in blush, sage and cream, a wooden crochet hook and a cup of tea, soft window light, shallow depth of field, a quiet premium crafting mood. Keep the centre and lower half of the table clear and evenly lit.',
    hierarchy:{primary:'the open booklet on a crafting table',secondary:'the headline',tertiary:'the framed illustration card'},claims:['render'],
    avoid:['flowers or crochet in the AI scene','a framed render that reads as a photograph']});
  add('doubts',{purpose:'clarity: exactly what the buyer receives, and what they do not.',buyer_message:'It is a digital PDF; I know what I get.',emotional_goal:'clarity, reassurance',
    copy:{kicker:title,headline:T_('Digital PDF\nPattern Download',['digital','Digital PDF pattern download'])},focal:'doc-cover',supporting:['doc-guide'],composition:'fact-sheet',background:'dusk',zone:'top-left',min:.08,
    facts:[{icon:'instant',item:T_('Instant download',['digital','Instant download'])},{icon:'files',item:both(facts)?T_('A4 + US Letter PDFs',['format','A4 + US Letter PDFs']):fmt},
      {icon:'skein',item:T_('No yarn or hook included',['delivery','No yarn or hook included'])},
      ...(facts.artwork?.hero?.photographic_evidence===true?[]:[{icon:'frame',item:T_('Illustrations, not photos',['render','Illustrations, not photos'])}])],
    hierarchy:{primary:'four large facts',secondary:'the headline',tertiary:'the real cover and guide'},claims:['product-title','digital','format','delivery','render']});
  const slides=cards.map(({job,o},i)=>{const id=`${pad(i+1)}-${job}`;
    return {id,template:'creative',job,purpose:`${JOB_LABEL[job]}: ${o.purpose}`,density:o.composition,copy:o.copy,min_product_share:o.min,
      extras:{...(o.labels?{labels:o.labels}:{}),...(o.names?{names:o.names}:{}),...(o.list?{list:o.list}:{}),...(o.steps?{steps:o.steps}:{}),...(o.facts?{facts:o.facts}:{})},
      ...(job==='desire'?{tone:true}:{}),
      creative:{id,job,purpose:`${JOB_LABEL[job]}: ${o.purpose}`,buyer_message:o.buyer_message,emotional_goal:o.emotional_goal,headline:o.copy.headline.text,supporting_copy:o.copy.subline?.text??null,
        focal_asset:o.focal,supporting_assets:o.supporting??[],composition:o.composition,hierarchy:o.hierarchy,background:o.background,props:o.props??[],crop:o.crop??null,
        text_zone:o.zone,scene_brief:o.scene_brief??'',claims_used:o.claims??[],avoid:o.avoid??[],allowed_props:CROCHET_PROPS}};});
  return {format:'crochet-pattern-bundle',campaign:camp.name,strategy:{...camp.strategy,visual_marketing_mood:camp.mood},creative:{version:1,source:'baseline'},slides,scenes:[]};
}

// ------------------------------------------------------------- helpers ---
const fit=(a,maxW,maxH)=>{const w=Math.min(maxW,maxH*a.width/a.height);return {w,h:w*a.height/a.width};};
function background(T,kind,sceneUri){
  if(sceneUri)return `<img class="lx-bg" alt="" src="${sceneUri}">`;
  return kind==='dark'?`<div class="lx-env" style="background:radial-gradient(90% 75% at 55% 40%,${T.forest} 0%,${T.forestDeep} 72%,#1D231F 100%)"></div>`
    :`<div class="lx-env" style="background:radial-gradient(100% 85% at 50% 25%,${T.cream} 0%,${T.paper} 55%,${T.linen} 100%)"></div>`;
}
const colW=(text,w)=>{const words=String(text??'').split(/\s+/).filter(Boolean);return Math.max(96,Math.min(128,Math.floor(w/(0.72*Math.max(...words.map(s=>s.length),1)))));};
const wrapped=(t,size,w)=>String(t?.text??'').split('\n').reduce((n,l)=>n+l.trim().split(/\s+/).reduce((a,wd)=>{const x=a.cur?`${a.cur} ${wd}`:wd;return a.cur&&x.length*0.72*size>w?{n:a.n+1,cur:wd}:{...a,cur:x};},{n:1,cur:''}).n,0);
const rule=(x,y,T)=>`<div style="position:absolute;left:${px(x)};top:${px(y)};width:110px;height:3px;background:${T.gold};z-index:20"></div>`;

// -------------------------------------------------------- compositions ---
// ctx = {facts, slide, copy, A (real art), T (tokens), sceneUri}
export function heroBenefits(facts){
  return [fact('pattern-count',countText(facts)),paperFact(facts),fact('digital','Instant digital download')];
}

function hero({facts,copy,A,T,sceneUri}){
  const lead=A.cover, second=A.pages[facts.selection.inside];
  let b=background(T,'dark',sceneUri)+scrim('left',.86);
  const cw=660, size=colW(copy.headline?.text,cw);
  b+=textBlock(fact('product-title',facts.product_name),{x:100,y:250,w:cw,cls:'lx-micro',color:T.goldLight});
  b+=headline(copy.headline,{x:100,y:400,w:cw,size,color:T.cream});
  let y=400+wrapped(copy.headline,size,cw)*size+60;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:100,y,w:cw,cls:'lx-lede',color:T.goldLight});y+=150;}
  b+=benefitList(heroBenefits(facts),{x:100,y,w:cw,T});
  const L=fit(lead,940,1480);
  if(second){const S=fit(second,820,1300);b+=placeArt(second,{x:820,y:260,w:S.w,rz:-4,shadow:'lift',z:11});}
  b+=placeArt(lead,{x:1900-L.w,y:(CANVAS-L.h)/2+30,w:L.w,rz:2,shadow:'lift',z:12});
  return {body:b,dark:true};
}

function interior({facts,slide,copy,A,T}){
  const a=A.pages[slide.pattern], L=fit(a,1120,1760), p=facts.patterns.list.find(x=>x.pattern_id===slide.pattern);
  let b=background(T,'light');
  b+=placeArt(a,{x:110,y:(CANVAS-L.h)/2,w:L.w,shadow:'soft',z:10});
  const x=110+L.w+90, w=CANVAS-x-100, size=Math.min(110,colW(copy.headline?.text,w));
  b+=textBlock(copyHtml(copy.kicker),{x,y:600,w,cls:'lx-micro',color:T.berry});
  b+=rule(x,670,T);
  b+=headline(copy.headline,{x,y:712,w,size,color:T.ink,cls:'lx-name'});
  const list=[fact('skill',p.level),...(facts.deliverables.step_by_step_instructions?[fact('instructions','Step-by-step instructions')]:[]),fact('terms',`${facts.terminology} crochet terms`)];
  b+=`<div class="lx-sub" style="left:${px(x)};top:${px(712+wrapped(copy.headline,size,w)*size*1.05+60)};width:${px(w)};color:${T.walnut};line-height:1.9">${list.map(h=>`<div>${h}</div>`).join('')}</div>`;
  return {body:b,dark:false};
}

function collage({slide,copy,A,T}){
  const pages=slide.patterns.map(id=>A.pages[id]).filter(Boolean), n=pages.length, aspect=pages[0].width/pages[0].height;
  const W=1800, H=1420, g=34;
  let best=null;
  for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols), w=Math.min((W-(cols-1)*g)/cols,((H-(rows-1)*g)/rows)*aspect);if(!best||w>best.w)best={cols,rows,w};}
  const {cols,rows,w}=best, h=w/aspect, y0=440+(H-(rows*h+(rows-1)*g))/2;
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:120,color:T.ink,align:'center'});
  pages.forEach((a,i)=>{const r=Math.floor(i/cols), inRow=Math.min(cols,n-r*cols), x0=(CANVAS-(inRow*w+(inRow-1)*g))/2;
    b+=placeArt(a,{x:x0+(i-r*cols)*(w+g),y:y0+r*(h+g),w,rz:i%2?1:-1,shadow:'soft',z:10+i});});
  return {body:b,dark:false};
}

function index({facts,copy,A,T}){
  const a=A.index, L=fit(a,1020,1760);
  let b=background(T,'light');
  b+=placeArt(a,{x:CANVAS-110-L.w,y:(CANVAS-L.h)/2,w:L.w,rz:1.2,shadow:'soft',z:10});
  const w=CANVAS-L.w-110-100-90, size=Math.min(112,colW(copy.headline?.text,w));
  b+=headline(copy.headline,{x:100,y:560,w,size,color:T.ink});
  const items=[fact('pattern-index','Pattern index'),fact('skill',facts.skill_text),fact('terms',`${facts.terminology} crochet terms`),...(facts.combinations?[fact('combinations',facts.combinations)]:[])];
  b+=`<div class="lx-sub" style="left:100px;top:${px(560+wrapped(copy.headline,size,w)*size+80)};width:${px(w)};color:${T.walnut};line-height:2">${items.map(h=>`<div><i style="display:inline-block;width:12px;height:12px;margin:0 24px 4px 2px;transform:rotate(45deg);background:${T.gold}"></i>${h}</div>`).join('')}</div>`;
  return {body:b,dark:false};
}

function included({facts,copy,A,T}){
  const fan=facts.selection.collage.slice(0,3).map(id=>A.pages[id]).filter(Boolean);
  const tiles=[
    {label:fact('included','Complete pattern collection PDF'),draw:(cx,cy)=>{const w=Math.min(330,430*A.cover.width/A.cover.height);return placeArt(A.cover,{x:cx-w/2,y:cy-artHeight(A.cover,w)/2,w,rz:-3,shadow:'soft'});}},
    {label:fact('individual',`Each pattern as its own PDF`),draw:(cx,cy)=>fan.map((a,i)=>{const w=240;return placeArt(a,{x:cx-w/2+(i-(fan.length-1)/2)*120,y:cy-artHeight(a,w)/2,w,rz:(i-(fan.length-1)/2)*7,shadow:'soft',z:10+i});}).join('')},
    {label:fact('references','Materials and abbreviations reference'),draw:(cx,cy)=>[A.materials,A.abbreviations].filter(Boolean).map((a,i)=>{const w=250;return placeArt(a,{x:cx-w/2+(i?80:-80),y:cy-artHeight(a,w)/2+(i?20:-20),w,rz:i?4:-4,shadow:'soft',z:10+i});}).join('')},
    ...(A.guide?[{label:fact('printing-guide','Printing guide'),draw:(cx,cy)=>{const w=Math.min(300,430*A.guide.width/A.guide.height);return placeArt(A.guide,{x:cx-w/2,y:cy-artHeight(A.guide,w)/2,w,rz:2,shadow:'soft'});}}]:[])];
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:100,w:1800,size:124,color:T.ink,align:'center'});
  const cols=2, tw=820, th=740, gx=60, gy=50, x0=(CANVAS-(cols*tw+gx))/2, y0=300;
  tiles.slice(0,4).forEach((t,i)=>{const x=x0+(i%cols)*(tw+gx), y=y0+Math.floor(i/cols)*(th+gy);
    b+=`<div class="lx-tile" style="left:${px(x)};top:${px(y)};width:${px(tw)};height:${px(th)};background:rgba(255,255,255,.55);border-color:${T.gold}66"></div>`;
    b+=t.draw(x+tw/2,y+300);
    b+=textBlock(t.label,{x:x+30,y:y+th-120,w:tw-60,cls:'lx-tile-label',color:T.ink,align:'center'});});
  return {body:b,dark:false};
}

function printable({facts,copy,A,T}){
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:118,color:T.ink,align:'center'});
  b+=pill(fact('digital','No physical item will be shipped'),{bg:T.berry,color:T.cream,y:380,center:true,size:30});
  const items=[['instant',fact('digital','Instant access after purchase','Instant access<br>after purchase')],
    ['printer',fact('process','Print at home','Print at home<br>on A4 or US Letter')],
    ['files',both(facts)?fact('format','A4 + US Letter','A4 + US Letter<br>PDFs'):paperFact(facts)],
    ...(facts.printing_guide?[['guide',fact('printing-guide','Printing guide included','Printing guide<br>included')]]:[])];
  items.forEach(([ic,html],i)=>{const x=i%2?1030:150, y=520+Math.floor(i/2)*230;
    b+=`<div class="lx-benefit" style="left:${px(x)};top:${px(y)};width:840px">${icon(ic,{T})}<div class="tx">${html.replaceAll('&lt;br&gt;','<br>')}</div></div>`;});
  b+=`<div class="lx-tray" style="left:120px;top:1040px;width:1760px;height:820px"></div>`;
  const steps=[['1','Download'],['2','Print'],['3','Crochet']];
  b+=`<div class="lx-steps" style="top:1090px;left:260px;right:260px">${steps.map(([k,t],i)=>`${i?'<span class="lx-step-sep"></span>':''}<span class="lx-step"><b>${k}</b>${fact('process',t)}</span>`).join('')}</div>`;
  const row=[A.materials,A.pages[facts.selection.inside]].filter(Boolean), H=520, ws=row.map(a=>H*a.width/a.height), gap=60, total=ws.reduce((s,v)=>s+v,0)+gap*(row.length-1);
  let x=(CANVAS-total)/2;
  row.forEach((a,i)=>{b+=placeArt(a,{x,y:1280,w:ws[i],shadow:'soft'});x+=ws[i]+gap;});
  return {body:b,dark:false};
}

function lifestyle({copy,A,T,sceneUri}){
  const a=A.cover, L=fit(a,900,1340);
  let b=background(T,'dark',sceneUri)+scrim('top',.84)+scrim('topleft',.5);
  b+=headline(copy.headline,{x:110,y:110,w:1100,size:116,color:T.cream});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:114,y:110+wrapped(copy.headline,116,1100)*116+50,w:760,cls:'lx-lede',color:T.goldLight,size:46});
  b+=placeArt(a,{x:CANVAS-150-L.w,y:CANVAS-160-L.h,w:L.w,rx:6,rz:4,shadow:'lift',origin:'50% 100%',z:12});
  return {body:b,dark:true};
}

function bundle({facts,slide,copy,A,T}){
  const pages=slide.patterns.map(id=>A.pages[id]).filter(Boolean), n=pages.length, w=n>3?520:600, step=n>1?Math.min(330,(1760-w)/(n-1)):0;
  let b=background(T,'dark');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:120,color:T.cream,align:'center'});
  let y=110+wrapped(copy.headline,120,1800)*120+40;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:200,y,w:1600,cls:'lx-lede',color:T.goldLight,align:'center',size:46});y+=90;}
  const x0=(CANVAS-(w+step*(n-1)))/2, top=Math.max(y+60,700);
  pages.forEach((a,i)=>{const mid=(n-1)/2;b+=placeArt(a,{x:x0+i*step,y:top+Math.abs(i-mid)*30,w,rz:(i-mid)*5,shadow:'lift',z:10+(n-Math.round(Math.abs(i-mid)))});});
  b+=benefitRow([fact('pattern-count',countText(facts)),paperFact(facts),...(facts.printing_guide?[fact('printing-guide','Printing guide')]:[])],{y:1790,T});
  return {body:b,dark:true};
}

export const PRIMITIVES={hero,interior,collage,index,included,printable,lifestyle,bundle};

/**
 * @param slide  one planSlides() slide (with .copy)
 * @param ctx    { facts, art:{cover,pages,index,materials,abbreviations,guide,illustration}, sceneUri, campaign }
 */
export function composeSlide(slide,{facts,art:A,sceneUri,campaign}){
  const f=PRIMITIVES[slide.template];
  if(!f)throw new Error(`Unknown crochet slide template ${slide.template}`);
  const T=campaign.tokens;
  const {body,dark}=f({facts,slide,copy:slide.copy??{},A,T,sceneUri:slide.scene?sceneUri:null});
  return {bodyHtml:`<div id="canvas" class="${dark?'dark':'light'}">${body}${footer(facts.product_name)}</div>`,
    extraCss:css(T)+`\n#canvas.light .lx-tile-label{color:${T.ink}}\n`};
}
