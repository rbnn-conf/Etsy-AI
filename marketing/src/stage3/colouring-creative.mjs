// Stage 3 CREATIVE PLAN for colouring books (ADR-058 slot, ADR-060). Colouring books opt into the same
// Creative Director architecture crochet uses: a deterministic 10-card baseline campaign the model refines,
// an asset catalogue (real pages only), and the compositions that build each card.
//
//   AI Creative Director → campaign concept + one direction per card (validated, falls back to this baseline)
//   AI backplates / one AI coloured example  +  REAL pages  →  deterministic compositor  →  QC
//
// Truth rules: the real Stage 2 pages are always placed by code, whole or cropped, never regenerated; a
// backplate is an environment only (no pages, no text); a coloured example is labelled and never product
// art; all copy is rendered by code. Generic for any colouring book: theme, page count and orientation
// come from the facts. Nothing here knows a product.
import { CANVAS, scrim, tableScene, fact, bleed } from './primitives.mjs';
import { PRIMITIVES, campaignCopy, colouringCampaign, examplesFor, fit, wide, example } from './colouring-book.mjs';
import { deriveStrategy } from './strategy.mjs';
import { routeContract, routeOf, TRANSFORMATION_DEMO } from './routes.mjs';

/** Bump when a colouring creative composition or the baseline changes: only the deterministic renders are redone (free). */
export const COLOURING_CREATIVE_VERSION=4;   // 3: hero = coloured example anchor + two layered real pages; 4: the hero follows its engine's route contract (ADR-064)
/** Paid backplates per campaign (slides 01+02 share the first). */
export const COLOURING_MAX_ENVIRONMENTS=3;

const T_=(text,claim)=>claim?{text,claim}:{text};
const px=v=>`${Math.round(v)}px`;
const pageNo=id=>Number(String(id).slice(5));
const isPage=id=>/^page-\d+$/.test(String(id));
const uniq=a=>[...new Set(a)];

// Props an AI backplate may show: plain materials only; never paper, pages, books or anything printed.
const PROPS=['coloured pencils','fine-liner pens','mug of tea','knitted throw','wooden desk','warm lamp','window light','candle','linen cloth','plant sprig','scattered leaves','string lights'];

// ------------------------------------------------------------ niche ---
/** The colouring-book niche's creative direction: given to the Creative Director call and followed by the baseline. */
export function colouringCreativeDirection(){
  return {niche:'printable colouring book',buyer_thought:'I want to colour these.',
    identity:'Premium Etsy lifestyle photography: a warm, quiet creative moment. The real page is large and is the hero; a coloured example shows what it can become; the room around them is calm, tactile and seasonal.',
    preferred_compositions:['cb-lifestyle-hero','cb-lifestyle-page','cb-coloured','cb-before-after'],
    allowed_props:PROPS,
    truth:['Pages are black line art: a coloured example is always labelled "Example" and never claimed as included.',
      'The coloured example must keep the page exactly: same composition, crop, lines and objects, colour only.',
      'AI backplates are environments only: no pages, paper, books, screens, text, people or hands. The real page is composited by code.',
      'Page counts and formats come only from the facts.'],
    avoid:['corporate brochure layouts','tiny page previews','large unused cream areas','generic printable imagery','excessive bullet points']};
}

/** What the Creative Director must also return for this niche (appended to the user prompt; the schema makes it required). */
export const CONCEPT_BRIEF=['CAMPAIGN CONCEPT (required: campaign.concept). You are the marketing creative director: decide WHY each image exists and what the buyer should feel.',
  '- campaign_concept: a short campaign title. emotional_hook: one sentence. buyer_feeling: 2-5 feelings.',
  '- visual_world: palette, materials (plain real-world materials only: wood, linen, tea, knit; never paper, pages or books), lighting, photography_style. It styles every backplate and the coloured example.',
  '- hero_subject: what the hero is about, from the approved pages only. strongest_pages: catalogue ids (page-N) of the most appealing real pages.',
  '- transformation_story: how the black-and-white page becomes a coloured picture. marketing_priority: what leads the campaign. avoid: what to keep out.',
  'The concept is descriptive: it is never a claim, a quantity or a promise. Numbers come from the facts only.',
  'scene_brief describes ONLY the environment: surface, light, props, depth, mood. Good: "warm walnut desk under amber lamp light", "knitted rust blanket beside a ceramic mug", "candlelit reading nook with autumn leaves", "dusk window with a softly glowing view".',
  'Never mention in scene_brief: page, paper, book, printable, worksheet, colouring sheet, card, product, mockup or print (not even as empty space for one). The real product is added later by code; a brief that names one is discarded.',
  'Hero (01): sell the FEELING first. An elegant serif headline of at most 5 words and one short supporting line. The hero follows its ROUTE CONTRACT (given below; code-owned): the composition, camera, environment, lighting and prop strategy come from the route, and its scene_brief describes that route\'s environment, never another route\'s. Never a flat, sterile or template look.',
  'Per card also return `support`: one short supporting line (at most 12 words). Numbers in it must be the facts\' page counts.'].join('\n');

/** The hero line of the concept brief for one engine's route (ADR-064). */
const HERO_ROUTE_BRIEF={
  'hybrid':'HERO ROUTE (Hybrid): a transformation demonstration. The code places ONE real black-and-white page beside a LABELLED coloured example made from the same page (what I receive / what I could create), on a styled home surface seen from an overhead three-quarter view. Its scene_brief is a tasteful lifestyle surface with warm directional light and a few lifestyle props.',
  'ai-creative':'HERO ROUTE (AI Creative): an editorial, cinematic reveal of ONE large real page, seen from a low eye-level camera with strong foreground-to-background depth. Its scene_brief is a narrative editorial set (a deep-toned backdrop, one or two story objects, a single dramatic pool of light), NOT a home desk: never combine a wooden desk, a knitted throw, a mug or string lights (two or more of these together is rejected and replaced by code).'};
/** The concept brief for an engine (Factory has no Creative Director call). */
export const conceptBriefFor=engine=>[CONCEPT_BRIEF,HERO_ROUTE_BRIEF[engine]].filter(Boolean).join('\n');

/** The deterministic baseline concept (used when the model's concept is missing or invalid). Generic for any book. */
export function baselineConcept(facts,strategy){
  const st=strategy??deriveStrategy(facts), season=facts.season?String(facts.season).toLowerCase():null;
  const showcase=facts.selection?.showcase??[];
  return {campaign_concept:facts.product_name,
    emotional_hook:`A calm, creative hour spent colouring ${season?`${season} `:''}pages.`,
    buyer_feeling:(st.tone??['relaxed','creative']).slice(0,4),
    visual_world:{palette:facts.style?.palette||st.visual_marketing_mood||'warm natural tones',materials:['wood','linen','knit','tea'],
      lighting:'soft warm natural light',photography_style:'premium Etsy lifestyle photography, shallow depth of field'},
    hero_subject:facts.style?.subject||'the colouring pages',
    strongest_pages:showcase.map(n=>`page-${n}`),
    transformation_story:'A black-and-white page becomes a finished, coloured picture.',
    marketing_priority:'transformation',
    avoid:['corporate brochure layouts','tiny page previews','large unused cream areas','generic printable imagery','excessive bullet points'],
    source:'baseline',fallbacks:[]};
}

// ------------------------------------------------------------ catalogue ---
/** The assets a direction may use, by id: the real pages and documents. A coloured example is placed by composition, never by id. */
export function colouringCatalogue(facts,A){
  const c={};
  for(const [n,a] of Object.entries(A.pages??{})){const p=facts.pages.find(x=>x.page_number===Number(n));
    c[`page-${n}`]={art:a,kind:'page',page_number:Number(n),shows:`Page ${n}${p?.title?` "${p.title}"`:''}: black-and-white line art${p?.role==='cover'?' (the cover)':''}`};}
  if(A.sheet)c.sheet={art:A.sheet,kind:'document',shows:'The printable sheet as the customer prints it'};
  if(A.guide)c.guide={art:A.guide,kind:'document',shows:'The printing guide, first page'};
  return c;
}
const factoryArt=(catalogue,facts)=>({pages:Object.fromEntries(Object.values(catalogue).filter(a=>a.kind==='page').map(a=>[a.page_number,a.art])),
  lead:catalogue[`page-${facts.selection.lead}`]?.art,sheet:catalogue.sheet?.art??null,guide:catalogue.guide?.art??null});

// ----------------------------------------------------------- compositions ---
/** Wraps an existing colouring-book primitive (collage, coloured, before-after, features, printable, bundle) as a creative composition. */
const wrap=name=>({d,catalogue,productFacts:facts,copy,T,exampleUri})=>{
  const pages=uniq([d.focal_asset,...d.supporting_assets].filter(isPage).map(pageNo));
  return PRIMITIVES[name]({facts,slide:{page:pageNo(d.focal_asset),pages,big:true},copy,A:factoryArt(catalogue,facts),T,sceneUri:null,exampleUri});
};

function backplate(sceneUri,view){
  if(!sceneUri)return tableScene()+`<div class="cd-placeholder">Placeholder scene · AI environment not generated</div>`;
  // A shared backplate can be framed differently by a second card (zoom + focus), so two cards never look alike.
  const st=view?`transform-origin:${(view.focus[0]*100).toFixed(1)}% ${(view.focus[1]*100).toFixed(1)}%;transform:scale(${view.zoom})`:'';
  const img=`<img class="lx-bg" alt="" src="${sceneUri}"${st?` style="${st}"`:''}>`;
  return st?bleed(img,{z:0}):img;   // a zoomed backplate is clipped at the canvas, never measured as overflow
}
const textScrim=right=>right?`<div class="lx-scrim" style="height:2000px;background:radial-gradient(75% 42% at 100% 0%,rgba(34,24,18,.72) 0%,rgba(34,24,18,.4) 50%,rgba(34,24,18,0) 85%)"></div>`:scrim('topleft',.75);
/** x for an object `w` wide, mirrored when the copy is on the right. */
const mx=(right,x,w)=>right?CANVAS-x-w:x;

/**
 * Hero geometry (canvas px), an editorial styled-photo spread: the COLOURED EXAMPLE is the warm front anchor
 * (lower, on the copy's side); the REAL page it was made from lies just beside it, slightly angled; a second
 * real page (the cover when there is one) sits behind, higher and further out. Overlapping paper edges, no grid.
 * Kept by test, for every orientation and copy side: real pages ≥ the hero floor (33%), the example covers ≤ 8%
 * of the real page it came from and none of its central half, everything on canvas, the copy column clear.
 * `b` = the second page's art (its own ratio); without one the layout keeps its slot empty.
 */
export function heroPlacement(a,right=false,b=a){
  const L=a.width>a.height*1.05, Q=!L&&a.width>=a.height*0.95;   // landscape / square / portrait
  const E=L?fit(a,760,760):Q?fit(a,760,760):fit(a,800,1200);
  const P=L?fit(a,1160,1160):Q?fit(a,1000,1000):fit(a,860,1290);
  const S=L?fit(b,1000,667):Q?fit(b,840,840):fit(b,760,1140);
  const at=(x,y,s)=>({x:mx(right,x,s.w),y,w:s.w,h:s.h});
  return L?{example:at(40,1180,E),page:at(800,820,P),second:at(880,330,S),copyW:700}
    :Q?{example:at(60,1130,E),page:at(820,720,P),second:at(1110,300,S),copyW:680}
    :{example:at(110,700,E),page:at(860,560,P),second:at(1170,330,S),copyW:680};
}

/** Lifestyle hero: backplate, the coloured example as the warm anchor, the real page and a second real page layered beside it. */
function lifestyleHero({copy,d,A,T,sceneUri,layout,exampleUri,copyBlock}){
  const right=d.text_zone==='top-right', a=A.get(d.focal_asset).art;
  const second=d.supporting_assets.find(id=>/^page-\d+$/.test(id)&&id!==d.focal_asset), sb=second?A.get(second).art:a;
  const G=heroPlacement(a,right,sb), tilt=k=>right?-k:k;
  let b=backplate(sceneUri,d.scene_view)+textScrim(right);
  const c=copyBlock(copy,right?'top-right':'top-left',{ink:T.cream,accent:T.goldLight,soft:T.goldLight,style:'serif',max:140,top:110,w:G.copyW});
  b+=c.html;
  if(second)b+=A.whole(second,{x:G.second.x,y:G.second.y,w:G.second.w,rz:tilt(6),shadow:'lift',z:10});
  b+=A.whole(d.focal_asset,{x:G.page.x,y:G.page.y,w:G.page.w,rz:tilt(2),shadow:'lift',z:12});
  if(exampleUri)b+=example(exampleUri,{x:G.example.x,y:G.example.y,w:G.example.w,h:G.example.h,rz:tilt(-4),z:14,T,label:fact('example','Coloured example')});
  const R=[G.page,G.example,...(second?[G.second]:[])], x0=Math.min(...R.map(r=>r.x)), y0=Math.min(...R.map(r=>r.y));
  layout.region={x:x0,y:y0,w:Math.max(...R.map(r=>r.x+r.w))-x0,h:Math.max(...R.map(r=>r.y+r.h))-y0};
  layout.copy=c.box;
  return {body:b,dark:true};
}

/**
 * Editorial reveal geometry (AI Creative route, ADR-064): ONE real page, large and slightly angled, in the sharp
 * middle ground of a deep editorial set; no coloured example and no second page, so it can never read as the
 * Hybrid transformation spread. Kept by test: the page ≥ the hero floor (33%), on canvas, the copy column clear.
 */
export function editorialPlacement(a,right=false){
  const L=a.width>a.height*1.05, Q=!L&&a.width>=a.height*0.95;
  const P=L?fit(a,1640,1100):Q?fit(a,1240,1240):fit(a,1060,1590);
  const x=L?(CANVAS-P.w)/2:mx(right,Q?680:860,P.w), y=CANVAS-P.h-(L?90:Q?80:70);
  return {page:{x,y,w:P.w,h:P.h},copyW:L?1300:Q?560:700};
}
function editorialHero({copy,d,A,T,sceneUri,layout,copyBlock}){
  const right=d.text_zone==='top-right', a=A.get(d.focal_asset).art, G=editorialPlacement(a,right);
  let b=backplate(sceneUri,d.scene_view)+textScrim(right);
  const c=copyBlock(copy,right?'top-right':'top-left',{ink:T.cream,accent:T.goldLight,soft:T.goldLight,style:'serif',max:140,top:110,w:G.copyW});
  b+=c.html+A.whole(d.focal_asset,{x:G.page.x,y:G.page.y,w:G.page.w,rz:right?-3:3,shadow:'lift',z:12});
  layout.region={x:G.page.x-20,y:G.page.y-20,w:G.page.w+40,h:G.page.h+40};layout.copy=c.box;
  return {body:b,dark:true};
}

/** Lifestyle page: backplate and one large REAL page (whole, or a close crop when the direction asks), copy by code. */
function lifestylePage({copy,d,A,T,sceneUri,layout,copyBlock}){
  const right=d.text_zone==='top-right', a=A.get(d.focal_asset).art, W=a.width>=a.height;   // square pages: the landscape layout
  let b=backplate(sceneUri,d.scene_view)+textScrim(right);
  const c=copyBlock(copy,right?'top-right':'top-left',{ink:T.cream,accent:T.goldLight,soft:T.goldLight,style:'serif',max:130,top:110,w:W?1300:700});
  b+=c.html;
  const P=W?fit(a,1500,1300):fit(a,1040,1560), x=mx(!right,100,P.w), y=W?1850-P.h:290;
  if(d.crop?.asset===d.focal_asset&&d.crop.zoom>1){
    // A close crop of the real page (same pixels, never regenerated), within the resolution floor.
    b+=A.framed(d.focal_asset,{x,y,w:P.w,h:P.h,focus:d.crop.focus,zoom:d.crop.zoom,shape:'soft',shadow:'lift',z:11});
  }else b+=A.whole(d.focal_asset,{x,y,w:P.w,rz:right?-2:2,shadow:'lift',z:11});
  layout.region={x:x-20,y:y-20,w:P.w+40,h:P.h+40};layout.copy=c.box;
  return {body:b,dark:true};
}

/** Where each lifestyle composition leaves room for the real page (a hint for the backplate prompt; code places the page). */
const reservedFor=text=>d=>`the ${d.text_zone==='top-right'?'left':'right'} two thirds of the lower frame, ${text}`;

/** The colouring-book compositions (registered into the creative vocabulary; usable only by this adapter's baseline). */
export const COLOURING_COMPOSITIONS=Object.freeze({
  'cb-lifestyle-hero':{zones:['top-left','top-right'],grounds:['environment'],min_share:.33,emotional:true,lifestyle:true,reserved:reservedFor('one large empty stretch of bare surface with a smaller empty stretch at its lower corner'),compose:lifestyleHero},
  'cb-editorial-hero':{zones:['top-left','top-right'],grounds:['environment'],min_share:.33,emotional:true,lifestyle:true,reserved:reservedFor('one large empty, softly lit stretch of surface in the sharp middle ground'),compose:editorialHero},
  'cb-lifestyle-page':{zones:['top-right','top-left'],grounds:['environment'],min_share:.35,emotional:true,lifestyle:true,reserved:reservedFor('one large empty stretch of bare surface'),compose:lifestylePage},
  'cb-collage':{zones:['top-centre'],grounds:['linen'],min_share:.3,compose:wrap('collage')},
  'cb-coloured':{zones:['top-left'],grounds:['linen'],min_share:.08,compose:wrap('coloured')},
  'cb-before-after':{zones:['top-centre'],grounds:['linen'],min_share:.2,compose:wrap('before-after')},
  'cb-features':{zones:['top-left'],grounds:['dusk'],min_share:.3,compose:wrap('features')},
  'cb-printable':{zones:['top-centre'],grounds:['linen'],min_share:.08,compose:wrap('printable')},
  'cb-bundle':{zones:['top-centre'],grounds:['dusk'],min_share:.3,compose:wrap('bundle')}});
for(const c of Object.values(COLOURING_COMPOSITIONS))c.adapter='colouring-book';

/** The hero's baseline headline: the first season word, title-cased ("Halloween / autumn" -> "Halloween"), then "Colouring Pages". No digits. */
export function heroHeadline(facts){
  const w=String(facts.season??'').split(/[/,&]|\band\b/)[0].trim(), cap=w?w.split(/\s+/).map(x=>x[0].toUpperCase()+x.slice(1).toLowerCase()).join(' '):'';
  return T_(cap?`${cap}\nColouring Pages`:'Colouring\nPages');
}

// ------------------------------------------------------------ baseline plan ---
/**
 * The deterministic baseline campaign: ten cards, one buyer job each, built on the real pages. The Creative
 * Director may refine each direction within the validated vocabulary; without it this plan is used as is
 * (zero AI calls). Cards 01 and 02 share backplate A (02 frames it differently); 06 and 09 have their own.
 */
export function planColouringCreative(facts,{strategy,engine='hybrid'}={}){
  const st=strategy??deriveStrategy(facts), camp=colouringCampaign(facts,st), C=campaignCopy(facts), sel=facts.selection, N=facts.book.page_count;
  const ex=sel.example, show=sel.showcase, col=sel.collage;
  const pick=(list,i)=>list.length?list[((i%list.length)+list.length)%list.length]:null;
  const pg=n=>`page-${n}`, title=n=>facts.pages.find(p=>p.page_number===n)?.title??`Page ${n}`;
  const heroPage=ex??show[0], previewPage=pick(col,2)===heroPage?pick(col,3):pick(col,2), lifePage=show.at(-1)??heroPage, cosyPage=pick(show,1)===lifePage?pick(col,4):pick(show,1);
  const cards=[], add=(o)=>cards.push(o);
  const scene=(text)=>`${text} Keep the lower two thirds of the surface clear, even and softly lit, where objects will be placed later; keep the top area calm and uncluttered.`;
  const seasonal=facts.season?` with a few ${String(facts.season).toLowerCase()} touches`:'';
  // The hero follows its engine's ROUTE CONTRACT (routes.mjs, ADR-064): Hybrid demonstrates the transformation (real line
  // art + labelled coloured example); AI Creative reveals ONE real page in an editorial set. Different structure, not adjectives.
  const route=routeContract(engine==='ai-creative'?'ai-creative':'hybrid',facts), demo=route.transformation_demo===TRANSFORMATION_DEMO;
  add({job:'stop-scroll',key:'hero',comp:demo?'cb-lifestyle-hero':'cb-editorial-hero',bg:'environment',zone:'top-left',min:.33,example:demo&&ex?`example-p${ex}`:null,route:routeOf(route),
    purpose:demo?'Stop the scroll: what I receive and what I could create. The labelled coloured example beside its real black-and-white page, and a second real page, on a styled table.'
      :'Stop the scroll: an editorial reveal of one real page, large, in a cinematic set that tells the campaign story.',buyer_message:'I can colour this, and it will look wonderful.',emotional_goal:'desire, cosiness, giftable',
    // The kicker carries the product title (a claim key): the campaign states what the product is, by code.
    copy:{...C.hero,headline:heroHeadline(facts),kicker:T_(facts.product_name,['product-title',facts.product_name])},focal:pg(heroPage),
    supporting:demo?[pg(sel.cover&&sel.cover!==heroPage?sel.cover:(pick(show,1)===heroPage?pick(col,1):pick(show,1)))]:[],
    props:demo?['linen cloth','coloured pencils','wooden desk','window light']:['candle','linen cloth'],
    scene_brief:scene(route.brief),
    hierarchy:demo?{primary:'the real black-and-white page and its labelled coloured example, side by side',secondary:'a second real page, angled behind',tertiary:'an elegant serif headline and one short line'}
      :{primary:'one real page, large, in the sharp middle ground',secondary:'the editorial set and its pool of light',tertiary:'an elegant serif headline and one short line'},
    claims:demo?['product-title','page-count','example']:['product-title','page-count'],avoid:['a fake page in the scene','text in the scene',...(demo?[]:['the default cosy desk (wooden desk, knitted throw, mug, string lights)'])]});
  add({job:'quality',key:'preview',comp:'cb-lifestyle-page',bg:'environment',zone:'top-right',min:.35,scene_of:'01-hero',scene_view:{zoom:1.3,focus:[.28,.3]},
    purpose:'Show me the quality: one real page up close.',buyer_message:'The pages are detailed and a pleasure to colour.',emotional_goal:'trust, anticipation',
    copy:{headline:T_(title(previewPage),['page-title',title(previewPage)]),kicker:T_(`Page ${previewPage} of ${N}`,['page-number',`Page ${previewPage} of ${N}`])},
    focal:pg(previewPage),supporting:[],crop:{asset:pg(previewPage),focus:[.5,.5],zoom:1.25},props:[],scene_brief:'',
    hierarchy:{primary:'one real page, cropped close',secondary:'the page title',tertiary:'the page number'},claims:['page-title','page-number'],avoid:['a different backplate: it shares the hero backplate']});
  if(col.length>=3)add({job:'variety',key:'contents',comp:'cb-collage',bg:'linen',zone:'top-centre',min:.3,
    purpose:'Show me the variety: many real pages at once.',buyer_message:'There is plenty to colour.',emotional_goal:'abundance',copy:C.collage,
    focal:pg(col[0]),supporting:col.slice(1).map(pg),props:[],scene_brief:'',hierarchy:{primary:'the grid of real pages',secondary:'the headline',tertiary:'none'},claims:['page-count'],avoid:['tiny thumbnails']});
  if(ex){
    add({job:'desire',key:'coloured',comp:'cb-coloured',bg:'linen',zone:'top-left',min:.08,example:`example-p${ex}`,
      purpose:'Make me want it: a coloured example beside the real page.',buyer_message:'This is what my page could look like.',emotional_goal:'inspiration',copy:C.coloured,
      focal:pg(ex),supporting:[],props:[],scene_brief:'',hierarchy:{primary:'the coloured example',secondary:'the real page',tertiary:'the label'},claims:['example','line-art'],avoid:['presenting the coloured example as the product']});
    add({job:'how-it-works',key:'before-after',comp:'cb-before-after',bg:'linen',zone:'top-centre',min:.2,example:`example-p${ex}`,
      purpose:'How does it work? The real page and its coloured result.',buyer_message:'I print the page and colour it in.',emotional_goal:'ease',copy:C['before-after'],
      focal:pg(ex),supporting:[],props:[],scene_brief:'',hierarchy:{primary:'the real page',secondary:'the coloured example',tertiary:'the captions'},claims:['example','line-art'],avoid:['colour on the real page']});
  }
  add({job:'useful',key:'lifestyle',comp:'cb-lifestyle-page',bg:'environment',zone:'top-right',min:.35,
    purpose:'Why is this useful? A quiet, screen-free hour of colouring.',buyer_message:'This is how I could unwind.',emotional_goal:'relaxation',copy:C.lifestyle,
    focal:pg(lifePage),supporting:[],props:['coloured pencils','knitted throw','mug of tea','window light'],
    scene_brief:scene(`A cosy corner at home${seasonal}: a knitted throw, a warm drink and coloured pencils in a jar, soft window light, shallow depth of field.`),
    hierarchy:{primary:'one real page',secondary:'the headline',tertiary:'none'},claims:[],avoid:['a fake page in the scene']});
  add({job:'what-you-get',key:'showcase',comp:'cb-features',bg:'dusk',zone:'top-left',min:.3,
    purpose:'What am I getting? A real page, large, with the essentials.',buyer_message:'Every page is a full, printable design.',emotional_goal:'confidence',copy:C.features,
    focal:pg(show[1]??show[0]),supporting:[],props:[],scene_brief:'',hierarchy:{primary:'one large real page',secondary:'the headline',tertiary:'short facts'},claims:['process','line-art','printing-guide'],avoid:['a long list']});
  add({job:'doubts',key:'download',comp:'cb-printable',bg:'linen',zone:'top-centre',min:.08,
    purpose:'Remove my doubts: a digital download, nothing shipped.',buyer_message:'It is a printable file; I know what I get.',emotional_goal:'clarity',copy:C.printable,
    focal:facts.sheet_preview?'sheet':pg(show[0]),supporting:[pg(show[0])],props:[],scene_brief:'',
    hierarchy:{primary:'the printable sheet and a page',secondary:'the three steps',tertiary:'the facts'},claims:['digital','process','format'],avoid:['claims beyond the facts']});
  add({job:'desire',key:'cozy',comp:'cb-lifestyle-page',bg:'environment',zone:'top-left',min:.35,
    purpose:'Make me want it: the evening you could have with it.',buyer_message:'I picture myself colouring this tonight.',emotional_goal:'cosy, nostalgic',copy:C.cozy,
    focal:pg(cosyPage),supporting:[],props:['candle','knitted throw','mug of tea','warm lamp'],
    scene_brief:scene(`An evening reading nook${seasonal}: a lamp glowing, a candle, a mug of tea and a soft throw, golden evening light, shallow depth of field.`),
    hierarchy:{primary:'one real page',secondary:'the headline',tertiary:'none'},claims:[],avoid:['a fake page in the scene']});
  add({job:'what-you-get',key:'bundle',comp:'cb-bundle',bg:'dusk',zone:'top-centre',min:.3,
    purpose:'Everything at a glance, and the way to get it.',buyer_message:'The whole collection, ready to download and print.',emotional_goal:'closure, confidence',copy:C.bundle,
    focal:pg(col[0]??heroPage),supporting:col.slice(1,5).map(pg),props:[],scene_brief:'',hierarchy:{primary:'the pages fanned large',secondary:'the headline',tertiary:'the format row'},
    claims:['page-count','format'],avoid:['tiny pages']});
  // Slide ids and the shared backplate (a card's scene_of names the card that owns the backplate).
  const ids=cards.map((c,i)=>`${String(i+1).padStart(2,'0')}-${c.key}`), idOf=key=>ids[cards.findIndex(c=>c.key===key)];
  const slides=cards.map((o,i)=>{
    const id=ids[i], owner=o.scene_of?idOf('hero'):null;
    return {id,template:'creative',job:o.job,purpose:o.purpose,density:o.comp,copy:o.copy,min_product_share:o.min,extras:{},
      ...(o.example?{example:o.example}:{}),
      creative:{id,job:o.job,purpose:o.purpose,buyer_message:o.buyer_message,emotional_goal:o.emotional_goal,headline:o.copy.headline?.text??'',supporting_copy:o.copy.subline?.text??null,
        focal_asset:o.focal,supporting_assets:o.supporting,composition:o.comp,hierarchy:o.hierarchy,background:o.bg,props:o.props,crop:o.crop??null,
        text_zone:o.zone,scene_brief:o.scene_brief,claims_used:o.claims,avoid:o.avoid,allowed_props:PROPS,allowed_compositions:[o.comp],...(o.route?{route:o.route}:{}),
        ...(owner?{scene_of:owner,scene_view:o.scene_view}:{})}};});
  const examples=examplesFor(slides,facts);
  return {format:'colouring-book',campaign:camp.name,strategy:{...camp.strategy,visual_marketing_mood:camp.mood},
    creative:{version:1,composer:COLOURING_CREATIVE_VERSION,source:'baseline',max_environments:COLOURING_MAX_ENVIRONMENTS},concept:baselineConcept(facts,st),
    slides,scenes:[],examples};
}

// ------------------------------------------------------------------- QC ---
export const HERO_MAX_COPY_SHARE=0.35;
/**
 * Colouring-book creative QC (added to the engine QC, never replacing the coverage floors): the hero is not mostly
 * copy; every card actually shows its directed focal asset; cards that share a backplate are composed differently;
 * and the backplates are checked for product-like shapes (warnings, as for every AI environment).
 * `shapes` = {slideId: [boxes]} from productLikeShapes on the card's backplate.
 */
export function colouringCreativeQc({plan,renderResults,shapes={}}){
  const checks=[], warnings=[], add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail:String(detail)});
  const cards=renderResults.map((r,i)=>({r,s:plan.slides[i],d:plan.directions?.[plan.slides[i]?.id]})).filter(x=>x.s?.template==='creative'&&x.r.layout?.creative);
  const heavy=cards.filter(({r,s})=>s.job==='stop-scroll'&&r.layout.copy&&(r.layout.copy.w*r.layout.copy.h)/(r.width*r.width)>HERO_MAX_COPY_SHARE).map(x=>x.r.slide);
  add('hero is not mostly copy',!heavy.length,heavy.join(', ')||`copy covers ≤ ${HERO_MAX_COPY_SHARE*100}% of the hero`);
  const missing=cards.filter(({r,d})=>d?.focal_asset&&!(r.layout.assets??[]).includes(d.focal_asset)).map(x=>`${x.r.slide} ${x.d.focal_asset}`);
  add('every card shows its focal asset',!missing.length,missing.join(', ')||'each directed focal page is rendered on its card');
  const dup=cards.filter(({s,d})=>(d?.scene_of??s.creative?.scene_of)).filter(({s,d,r})=>{const own=cards.find(x=>x.s.id===(d?.scene_of??s.creative.scene_of));return own&&own.r.layout.composition===r.layout.composition;}).map(x=>x.r.slide);
  add('cards sharing a backplate are composed differently',!dup.length,dup.join(', ')||'shared-backplate cards use different compositions');
  for(const {r,s} of cards)if(shapes[s.id]?.length)warnings.push(`${r.slide}: the AI backplate contains ${shapes[s.id].length} flat paper-like shape(s) outside the product area; check it is not a fake page (✨ Regenerate Scene replaces it).`);
  return {checks,warnings};
}

// ------------------------------------------------------------- finalise ---
/** Lifestyle cards whose pages should differ (01 hero, 06 lifestyle, 09 cozy). 02 shares the hero backplate and shows its own page crop. */
const LIFESTYLE=new Set(['cb-lifestyle-hero','cb-editorial-hero','cb-lifestyle-page']);
/** Hero compositions: the transformation spread (Hybrid) and the editorial reveal (AI Creative). */
const HERO=new Set(['cb-lifestyle-hero','cb-editorial-hero']);
/**
 * Deterministic last step of a colouring creative plan (after the Creative Director's directions are validated),
 * with no model call:
 *  1. the coloured example is made from the SAME real page the hero shows (the hero's validated focal page; a
 *     non-page hero focal falls back to the baseline hero page), and the cards that show the example (coloured,
 *     before/after) show that page too;
 *  2. the main lifestyle cards prefer different pages: a later card repeating a page takes the next unused strong
 *     page (concept.strongest_pages, then the baseline's showcase and collage order); a small book reuses a page
 *     only when no unused one is left. Every change is recorded in the card's `fallbacks`.
 * Returns {slides, directions, examples}.
 */
export function finaliseColouringPlan({slides,directions,concept=null},facts){
  const D=Object.fromEntries(Object.entries(directions).map(([k,v])=>[k,{...v,fallbacks:[...(v.fallbacks??[])]}]));
  const isPage=id=>/^page-\d+$/.test(String(id))&&facts.selection.pages_used.includes(pageNo(id))&&pageNo(id)!==facts.selection.cover;
  const hero=slides.find(s=>HERO.has(D[s.id]?.composition));
  if(hero&&!isPage(D[hero.id].focal_asset)){D[hero.id].focal_asset=hero.creative.focal_asset;D[hero.id].fallbacks.push('focal_asset (the hero must show a real colouring page)');}
  // 2. Unique lifestyle pages, in card order (the hero keeps its choice).
  const pool=uniq([...(concept?.strongest_pages??[]),...facts.selection.showcase.map(n=>`page-${n}`),...facts.selection.collage.map(n=>`page-${n}`)]).filter(isPage);
  const used=new Set();
  for(const s of slides){const d=D[s.id];if(!d||!LIFESTYLE.has(d.composition)||d.scene_of)continue;
    if(used.has(d.focal_asset)){const next=pool.find(id=>!used.has(id));
      if(next){d.focal_asset=next;if(d.crop?.asset)d.crop=null;d.fallbacks.push('focal_asset (page already on another lifestyle card)');}
      else d.fallbacks.push('focal_asset (reused: the book has no unused page left)');}
    used.add(d.focal_asset);}
  // The hero's second real page (layered beside the example): a real page other than its focal page; the cover is welcome here.
  if(hero&&D[hero.id].composition==='cb-lifestyle-hero'){const d=D[hero.id], ok=id=>/^page-\d+$/.test(String(id))&&facts.selection.pages_used.includes(pageNo(id))&&id!==d.focal_asset;
    if(!ok(d.supporting_assets?.[0])){
      const next=[...(d.supporting_assets??[]),...hero.creative.supporting_assets,...(facts.selection.cover?[`page-${facts.selection.cover}`]:[]),...pool].find(ok);
      if(next){d.supporting_assets=[next];d.fallbacks.push('supporting_assets (the hero needs a second real page)');}}
    else d.supporting_assets=[d.supporting_assets[0]];}
  // 1. The example follows the hero's page; the cards showing the example show the same page.
  const heroPage=hero?pageNo(D[hero.id].focal_asset):null;
  const out=slides.map(s=>{
    if(!s.example||!heroPage)return s;
    const d=D[s.id];
    if(d&&s.id!==hero.id&&d.focal_asset!==`page-${heroPage}`){d.focal_asset=`page-${heroPage}`;d.fallbacks.push('focal_asset (aligned to the coloured example page)');}
    return {...s,example:`example-p${heroPage}`};});
  return {slides:out,directions:D,examples:examplesFor(out,facts)};
}

/** Words a colouring backplate brief must not contain (on top of the shared product-substitute list). */
export const BRIEF_BANNED_EXTRA=/\b(printables?|worksheets?|colou?ring sheets?|products?|mock-?ups?|print(s|ed|ing)?)\b/i;
