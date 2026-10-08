// Stage 3 marketing for colouring books: the campaign planner and the
// compositions it combines. Generic for any colouring book (theme, audience
// and page count come from the Stage 2 facts; nothing product-specific here).
//
// Ownership (ADR-037):
//   - OpenAI provides the visual treatment: the environment photographs
//     (scenes) and the COLOURED EXAMPLES of real pages (an image edit of an
//     approved page), plus the tone lines and, with an engine, the art
//     direction. Those are AI marketing assets, never product artwork.
//   - Code places the REAL Stage 2 pages whole, at their own aspect ratio
//     (<img data-art>, traced by SHA-256), and renders every word; factual
//     phrases carry a claim key. A coloured example is always labelled as an
//     example and always sits beside the real line-art page it came from.
import { CANVAS, css, placeArt, artHeight, headline, textBlock, copyHtml, fact, pill, benefitList, benefitRow, icon, footer, scrim } from './primitives.mjs';
import { Stage3Error } from './errors.mjs';

export { CANVAS };
const MAX_SLIDES=10;
const SCENE_PRIORITY=['desk','cosy'];
const px=v=>`${Math.round(v)}px`;
const NUM=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
const T_=(text,claim)=>claim?{text,claim}:{text};

// ------------------------------------------------------------ campaign ---
// Restrained stationery palette; only the accent follows the strategy theme.
const BASE={paper:'#FBF8F2',linen:'#F1EBDF',cream:'#FFFDF8',ink:'#24211D',gold:'#B08A4E',goldLight:'#E9D9B8',forest:'#2F3B33',forestDeep:'#1B221E',
  berry:'#8C4A3A',berryDeep:'#3E1F17',walnut:'#5A4030',walnutDeep:'#241A13',needle:'#2F5A3A',needleDark:'#1C3B26',berryFruit:'#A5553F'};
const ACCENT={christmas:{berry:'#8E2B35',forest:'#1E3A2C',forestDeep:'#10231A'},halloween_dark:{berry:'#B5652A',forest:'#2B2238',forestDeep:'#17121F'},
  halloween_cute:{berry:'#C0712F',forest:'#2E2A3A',forestDeep:'#1A1722'},autumn:{berry:'#A4532A',forest:'#3A3024',forestDeep:'#211A13'},
  wedding:{berry:'#8A6F5A',forest:'#3B3A36',forestDeep:'#22211F'},none:{berry:'#6F7F5C',forest:'#2F3B33',forestDeep:'#1B221E'}};
// Environments only; the real pages are composited on top by code.
const SCENES={
  desk:{purpose:'Hero: a creative colouring desk.',allow:[],
    // Factory route contract (routes.mjs, ADR-064): a clean catalogue flat lay, not a styled lifestyle desk.
    direction:'Clean catalogue flat lay photographed from directly above: a plain, pale stone surface, even soft studio light with very light shadows, one coloured pencil lying at one edge and nothing else. Keep the right-hand two thirds of the surface clear, even and softly lit, reserved for products added later.'},
  cosy:{purpose:'Lifestyle: a relaxing colouring moment.',allow:[],
    direction:'Cosy, relaxing corner at home for a quiet creative hour: a knitted throw, a warm drink, coloured pencils in a jar, a candle and soft warm lamp light, seasonal details at the edges, shallow depth of field. Keep the centre and right of the surface clear and calm, reserved for a product added later.'}};

export function colouringCampaign(facts,strategy){
  const id=strategy?.theme?.id??'none';
  return {name:`colouring-${id}`,tokens:{...BASE,...(ACCENT[id]??ACCENT.none)},scenes:SCENES,mood:strategy?.visual_marketing_mood??'premium warm lifestyle',
    strategy:{family:strategy?.product_family??'colouring_book',theme:id}};
}

/** Art-directed copy per template (title case; `\n` is a deliberate break). Factual phrases carry a claim. */
export function campaignCopy(f){
  const N=f.book.page_count, C=f.book.colouring_pages, season=f.season?`${f.season}\n`:'';
  const both=f.formats.some(x=>x.key==='A4')&&f.formats.some(x=>x.key==='US-Letter');
  return {
    hero:{headline:T_(`${season}Colouring\nPages`),subline:T_(`${C} pages to print and colour`,['page-count',`${C} colouring pages`])},
    interior:{},   // per slide: the page title
    collage:{headline:T_(`${C} pages\nto colour`,['page-count',`${C} colouring pages`])},
    coloured:{headline:T_('Colour it\nyour way')},
    'before-after':{headline:T_('Print it.\nColour it.')},
    included:{headline:T_('What’s included')},
    printable:{headline:T_('Instant digital\ndownload',['digital','Instant digital download'])},
    features:{headline:T_('Made for\nrelaxed colouring')},
    lifestyle:{headline:T_('Your quiet\ncreative hour')},
    cozy:{headline:T_('Relax,\nthen colour')},   // creative plan: the second lifestyle card
    bundle:{headline:T_('Download,\nprint & colour'),subline:T_(both?'A4 + US Letter':f.formats[0]?.label??'',both?['format','A4 + US Letter']:['format',f.formats[0]?.label??''])}};
}

// -------------------------------------------------------------- planner ---
/**
 * Campaign plan from the production facts: which composition answers which
 * buyer question, which real pages it shows, which AI environment scene and
 * which AI coloured example it uses. Capped at 10, never padded.
 */
export function planSlides(facts,{maxScenes=2,strategy}={}){
  const C=campaignCopy(facts), camp=colouringCampaign(facts,strategy), sel=facts.selection, s=[];
  const add=(template,prio,extra)=>s.push({template,prio,...extra});
  const ex=sel.example;
  add('hero',10,{scene:'desk',density:'rich lifestyle',purpose:'Stop the scroll: the real cover and pages on a creative desk.',min_product_share:.35});
  add('interior',8,{page:sel.showcase[0],name_headline:true,density:'artwork hero',purpose:'Inside the book: one real page at near full size.',min_product_share:.4});
  if(sel.collage.length>=3)add('collage',8,{pages:sel.collage,density:'product grid',purpose:'Many real pages at once: the size of the collection.',min_product_share:.3});
  if(ex){
    add('coloured',7,{page:ex,example:`example-p${ex}`,density:'inspiration',purpose:'A coloured example of a real page (AI example, labelled), beside the real page.',min_product_share:.08});
    add('before-after',7,{page:ex,example:`example-p${ex}`,density:'process',purpose:'Before and after: the real line art and a coloured example of it.',min_product_share:.2});
  }
  add('included',9,{density:'structured information',purpose:'Everything in the download, as real files.',min_product_share:.12});
  add('printable',9,{density:'clean information',purpose:'Printable and download information: what you get, nothing shipped.',min_product_share:.08});
  add('features',6,{page:sel.showcase[1]??sel.showcase[0],density:'benefits',purpose:'Features and benefits, beside a real page.',min_product_share:.3});
  add('lifestyle',6,{scene:'cosy',page:sel.showcase.at(-1),tone:true,density:'emotional lifestyle',purpose:'A real page in a relaxing colouring moment.',min_product_share:.28});
  add('bundle',5,{pages:sel.collage.slice(0,5),tone:true,density:'summary',purpose:'Final summary and call to action: the collection at a glance.',min_product_share:.3});
  while(s.length>MAX_SLIDES){let k=0;s.forEach((x,i)=>{if(x.prio<=s[k].prio)k=i;});s.splice(k,1);}
  const title=n=>facts.pages.find(p=>p.page_number===n)?.title??`Page ${n}`;
  const slides=s.map(({prio,...x},i)=>{
    const copy=x.template==='interior'?{headline:T_(title(x.page),['page-title',title(x.page)]),kicker:T_(`Page ${x.page} of ${facts.book.page_count}`,['page-number',`Page ${x.page} of ${facts.book.page_count}`])}:{...C[x.template]};
    return {...x,id:`${String(i+1).padStart(2,'0')}-${x.template}`,copy};
  });
  const used=SCENE_PRIORITY.filter(id=>slides.some(x=>x.scene===id)).slice(0,Math.max(0,maxScenes));
  for(const x of slides)if(x.scene&&!used.includes(x.scene))delete x.scene;
  const examples=examplesFor(slides,facts);
  return {format:'colouring-book',campaign:camp.name,strategy:{...camp.strategy,visual_marketing_mood:camp.mood},slides,
    scenes:used.map(id=>({id,purpose:camp.scenes[id].purpose,used_by:slides.filter(x=>x.scene===id).map(x=>x.id)})),examples};
}

/** The AI coloured examples a plan's slides use (one per real page, shared by the slides that show it). */
export function examplesFor(slides,facts){
  return [...new Set(slides.map(x=>x.example).filter(Boolean))].map(id=>{
    const pg=facts.pages.find(p=>p.page_number===Number(id.slice(9)));
    return {id,page_number:pg.page_number,asset:pg.asset,source:{file:pg.file,sha256:pg.sha256,width:pg.width,height:pg.height},
      purpose:'Coloured example of a real page (marketing illustration only; the product is black-and-white line art).',
      used_by:slides.filter(x=>x.example===id).map(x=>x.id),file:`marketing/examples/${id}.png`,prompt:null,sha256:null,model:null,size:null};
  });
}

// ------------------------------------------------------------- helpers ---
/** Largest size of artwork `a` inside maxW x maxH (own aspect ratio). */
export const fit=(a,maxW,maxH)=>{const w=Math.min(maxW,maxH*a.width/a.height);return {w,h:w*a.height/a.width};};
// The portrait layouts below cap pages by height (e.g. 500 x 760), which leaves a LANDSCAPE page a small
// width-limited thumbnail. Landscape books get their own sizes so the real page stays the hero (same QC floors).
export const wide=a=>a.width>a.height;
function background(T,kind,sceneUri){
  if(sceneUri)return `<img class="lx-bg" alt="" src="${sceneUri}">`;
  return kind==='dark'?`<div class="lx-env" style="background:radial-gradient(90% 75% at 55% 40%,${T.forest} 0%,${T.forestDeep} 70%,#0E110F 100%)"></div>`
    :`<div class="lx-env" style="background:radial-gradient(100% 85% at 50% 25%,${T.cream} 0%,${T.paper} 55%,${T.linen} 100%)"></div>`;
}
/** A coloured example (AI marketing image, NOT product art: no data-art), always labelled. */
export function example(uri,{x,y,w,h,rz=0,z=12,T,label}){
  if(!uri)throw new Stage3Error('A coloured example is missing for this slide (it is generated before rendering).');
  return `<div class="lx-obj" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};z-index:${z};transform:rotate(${rz}deg)">`+
    `<img class="lx-example sh-lift" data-example="1" alt="Coloured example" src="${uri}" style="width:${px(w)};height:${px(h)}"></div>`+
    pill(label,{bg:T.berry,color:T.cream,x:x+30,y:y+30,size:26});
}
const arrow=(x,y,T,rz=0)=>`<img class="lx-prop" alt="" src="data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><path d="M6 40h96M78 14l26 26-26 26" fill="none" stroke="${T.gold}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`).toString('base64')}" style="left:${px(x)};top:${px(y)};width:120px;height:80px;z-index:20${rz?`;transform:rotate(${rz}deg)`:''}">`;
export const colW=(text,w)=>{const words=String(text??'').split(/\s+/).filter(Boolean);return Math.max(96,Math.min(128,Math.floor(w/(0.72*Math.max(...words.map(s=>s.length),1)))));};
/** Rendered line count of a headline at `size` in a column `w` wide (~.72 em per capital). */
export const wrapped=(t,size,w)=>String(t?.text??'').split('\n').reduce((n,l)=>n+l.trim().split(/\s+/).reduce((a,wd)=>{const x=a.cur?`${a.cur} ${wd}`:wd;return a.cur&&x.length*0.72*size>w?{n:a.n+1,cur:wd}:{...a,cur:x};},{n:1,cur:''}).n,0);
const both=f=>f.formats.some(x=>x.key==='A4')&&f.formats.some(x=>x.key==='US-Letter');
const paperFact=f=>both(f)?fact('format','A4 + US Letter'):fact('format',f.formats.find(x=>x.key!=='Colouring-Pages-PNG')?.label??'PDF');

// -------------------------------------------------------- compositions ---
// ctx = {facts, slide, copy, A (real art), T (tokens), sceneUri, exampleUri}

function hero({facts,copy,A,T,sceneUri}){
  const lead=A.lead, second=A.pages[facts.selection.showcase[0]];
  let b=background(T,'dark',sceneUri)+scrim('left',.86);
  const cw=640, size=colW(copy.headline?.text,cw);
  b+=textBlock(fact('product-title',facts.product_name),{x:100,y:260,w:cw,cls:'lx-micro',color:T.goldLight});
  b+=headline(copy.headline,{x:100,y:420,w:cw,size,color:T.cream});
  let y=420+wrapped(copy.headline,size,cw)*size+70;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:100,y,w:cw,cls:'lx-lede',color:T.goldLight});y+=170;}
  b+=benefitList(heroBenefits(facts),{x:100,y,w:cw,T});
  const L=fit(lead,960,1480);
  if(second&&second!==lead){const S=fit(second,860,1320);b+=placeArt(second,{x:790,y:230,w:S.w,rz:-5,shadow:'lift',z:11});}
  b+=placeArt(lead,{x:1900-L.w,y:(CANVAS-L.h)/2+40,w:L.w,rz:2,shadow:'lift',z:12});
  return {body:b,dark:true};
}
export function heroBenefits(facts){
  return [fact('page-count',`${facts.book.colouring_pages} colouring pages`),paperFact(facts),fact('digital','Instant digital download')];
}

function interior({facts,slide,copy,A,T}){
  const a=A.pages[slide.page], L=fit(a,1120,1760);
  let b=background(T,'light');
  b+=placeArt(a,{x:110,y:(CANVAS-L.h)/2,w:L.w,shadow:'soft',z:10});
  const x=110+L.w+90, w=CANVAS-x-100, size=Math.min(116,colW(copy.headline?.text,w));
  b+=textBlock(copyHtml(copy.kicker),{x,y:640,w,cls:'lx-micro',color:T.berry});
  b+=`<div style="position:absolute;left:${px(x)};top:710px;width:110px;height:3px;background:${T.gold};z-index:20"></div>`;
  b+=headline(copy.headline,{x,y:752,w,size,color:T.ink,cls:'lx-name'});
  b+=textBlock(fact('process','One design per page'),{x,y:752+wrapped(copy.headline,size,w)*size*1.05+60,w,cls:'lx-sub',color:T.walnut});
  return {body:b,dark:false};
}

function collage({facts,slide,copy,A,T}){
  const pages=slide.pages.map(n=>A.pages[n]).filter(Boolean), n=pages.length, a0=pages[0], aspect=a0.width/a0.height;
  const W=1800, H=1420, g=34;
  let best=null;
  for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols), w=Math.min((W-(cols-1)*g)/cols,((H-(rows-1)*g)/rows)*aspect);if(!best||w>best.w)best={cols,rows,w};}
  const {cols,rows,w}=best, h=w/aspect, y0=440+(H-(rows*h+(rows-1)*g))/2;
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:120,color:T.ink,align:'center'});
  pages.forEach((a,i)=>{const r=Math.floor(i/cols), inRow=Math.min(cols,n-r*cols), x0=(CANVAS-(inRow*w+(inRow-1)*g))/2;
    b+=placeArt(a,{x:x0+(i-r*cols)*(w+g),y:y0+r*(h+g),w,rz:i%2?1.2:-1.2,shadow:'soft',z:10+i});});
  return {body:b,dark:false};
}

function coloured({facts,slide,copy,A,T,exampleUri}){
  const a=A.pages[slide.page];
  if(wide(a))return colouredWide({facts,slide,copy,a,T,exampleUri});
  const big=!!slide.big, E=big?fit(a,860,1300):fit(a,1020,1480), R=big?fit(a,740,1100):fit(a,500,760);   // big: the creative plan's larger portrait layout
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:100,w:1100,size:118,color:T.ink});
  b+=example(exampleUri,{x:100,y:400,w:E.w,h:E.h,T,label:fact('example','Coloured example')});
  const x=big?1100:1280, y=560;
  b+=textBlock('The page you print',{x,y:y-90,w:R.w+100,cls:'lx-micro',color:T.berry});
  b+=placeArt(a,{x,y,w:R.w,rz:2,shadow:'soft',z:14});
  b+=textBlock(facts.line_art?fact('line-art','Black-and-white line art'):fact('example','Colours shown are an example only'),{x:x-40,y:y+R.h+70,w:R.w+120,cls:'lx-sub',color:T.walnut});
  return {body:b,dark:false};
}

/** Landscape page: the coloured example top-left, the real page as large as the frame allows bottom-right (a cascade). */
function colouredWide({facts,copy,a,T,exampleUri}){
  const E=fit(a,960,1480), R=fit(a,1000,1000), x=CANVAS-100-R.w, y=1060;
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:100,w:1100,size:118,color:T.ink});
  b+=example(exampleUri,{x:100,y:400,w:E.w,h:E.h,T,label:fact('example','Coloured example')});
  b+=textBlock('The page you print',{x:100,y:y+R.h/2-70,w:x-160,cls:'lx-micro',color:T.berry});
  b+=placeArt(a,{x,y,w:R.w,rz:2,shadow:'soft',z:14});
  b+=textBlock(facts.line_art?fact('line-art','Black-and-white line art'):fact('example','Colours shown are an example only'),{x:100,y:y+R.h/2,w:x-160,cls:'lx-sub',color:T.walnut});
  return {body:b,dark:false};
}

/** Landscape pages: the real page large top-left, the smaller coloured example cascading below-right (they barely touch). */
function beforeAfterWide({facts,copy,a,T,exampleUri,square=false}){
  // square: the creative plan's square pages (smaller pair so the two never overlap)
  const S=square?fit(a,1000,1000):fit(a,1200,1200), E=square?fit(a,760,760):fit(a,980,980), y=400, ex=CANVAS-100-E.w, ey=CANVAS-170-E.h;
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:118,color:T.ink,align:'center'});
  b+=placeArt(a,{x:100,y,w:S.w,shadow:'soft',z:10});
  b+=arrow(1480,y+330,T,90);
  b+=example(exampleUri,{x:ex,y:ey,w:E.w,h:E.h,T,label:fact('example','Coloured example')});
  b+=textBlock(facts.line_art?fact('line-art','Black-and-white line art'):'The page you print',{x:100,y:y+S.h+50,w:S.w,cls:'lx-sub',color:T.walnut});
  b+=textBlock(fact('example','Coloured example for inspiration'),{x:100,y:Math.max(ey+E.h/2-30,y+S.h+130),w:ex-160,cls:'lx-sub',color:T.walnut,align:'right'});
  return {body:b,dark:false};
}

function beforeAfter({facts,slide,copy,A,T,exampleUri}){
  const a=A.pages[slide.page];
  if(wide(a))return beforeAfterWide({facts,copy,a,T,exampleUri});
  if(slide.big&&a.width===a.height)return beforeAfterWide({facts,copy,a,T,exampleUri,square:true});   // creative plan, square pages
  const big=!!slide.big, S=big?fit(a,830,1250):fit(a,780,1160), y=big?430:500, lx=big?100:170, rx=CANVAS-lx-S.w;
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:118,color:T.ink,align:'center'});
  b+=placeArt(a,{x:lx,y,w:S.w,shadow:'soft',z:10});
  b+=arrow(CANVAS/2-60,y+S.h/2-40,T);
  b+=example(exampleUri,{x:rx,y,w:S.w,h:S.h,T,label:fact('example','Coloured example')});
  b+=textBlock(facts.line_art?fact('line-art','Black-and-white line art'):'The page you print',{x:lx-40,y:y+S.h+60,w:S.w+80,cls:'lx-sub',color:T.walnut,align:'center'});
  b+=textBlock(fact('example','Coloured example for inspiration'),{x:rx-40,y:y+S.h+60,w:S.w+80,cls:'lx-sub',color:T.walnut,align:'center'});
  return {body:b,dark:false};
}

function included({facts,copy,A,T}){
  const tiles=[], C=facts.book.colouring_pages;
  const fan=[A.lead,...facts.selection.showcase.map(n=>A.pages[n])].filter((x,i,arr)=>x&&arr.indexOf(x)===i).slice(0,3);
  const W=wide(A.lead);   // landscape book: bigger previews that fill their tiles (portrait sizes unchanged)
  tiles.push({label:fact('page-count',`${C} colouring pages${facts.book.cover?' + cover':''}`),draw:(cx,cy)=>fan.map((a,i)=>{const w=W?500:250;return placeArt(a,{x:cx-w/2+(i-(fan.length-1)/2)*(W?130:120),y:cy-artHeight(a,w)/2,w,rz:(i-(fan.length-1)/2)*7,shadow:'soft',z:10+i});}).join('')});
  if(A.sheet)tiles.push({label:paperFact(facts),draw:(cx,cy)=>{const w=W?Math.min(700,520*A.sheet.width/A.sheet.height):Math.min(330,440*A.sheet.width/A.sheet.height);return placeArt(A.sheet,{x:cx-w/2,y:cy-artHeight(A.sheet,w)/2,w,rz:-3,shadow:'soft'});}});
  if(facts.png_pages){const st=fan.slice(0,2);tiles.push({label:fact('format','Every page as a PNG'),draw:(cx,cy)=>st.map((a,i)=>{const w=W?560:240;return placeArt(a,{x:cx-w/2+(i?70:-70)*(W?1.2:1),y:cy-artHeight(a,w)/2+(i?20:-20)*(W?2:1),w,rz:i?5:-5,shadow:'soft',z:10+i});}).join('')});}
  if(A.guide)tiles.push({label:fact('printing-guide','Printing guide'),draw:(cx,cy)=>{const w=W?Math.min(420,540*A.guide.width/A.guide.height):Math.min(300,430*A.guide.width/A.guide.height);return placeArt(A.guide,{x:cx-w/2,y:cy-artHeight(A.guide,w)/2,w,rz:2,shadow:'soft'});}});
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:100,w:1800,size:124,color:T.ink,align:'center'});
  const cols=2, tw=820, th=740, gx=60, gy=50, x0=(CANVAS-(cols*tw+gx))/2, y0=300;
  tiles.slice(0,4).forEach((t,i)=>{const x=x0+(i%cols)*(tw+gx), y=y0+Math.floor(i/cols)*(th+gy);
    b+=`<div class="lx-tile" style="left:${px(x)};top:${px(y)};width:${px(tw)};height:${px(th)};background:rgba(255,255,255,.55);border-color:${T.gold}66"></div>`;
    b+=t.draw(x+tw/2,y+300);
    b+=textBlock(t.label,{x:x+30,y:y+th-120,w:tw-60,cls:'lx-tile-label',color:T.ink,align:'center'});});
  return {body:b,dark:false};
}

function printable({facts,slide,copy,A,T}){
  let b=background(T,'light');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:118,color:T.ink,align:'center'});
  b+=pill(fact('digital','No physical item will be shipped'),{bg:T.berry,color:T.cream,y:380,center:true,size:30});
  const items=[['instant',fact('digital','Instant access after purchase','Instant access<br>after purchase')],
    ['printer',fact('process','Print at home or use a print shop','Print at home<br>or use a print shop')],
    ['files',both(facts)?fact('format','A4 + US Letter','A4 + US Letter<br>PDFs'):paperFact(facts)],
    ...(facts.printing_guide?[['guide',fact('printing-guide','Step-by-step printing guide','Step-by-step<br>printing guide')]]:[])];
  items.forEach(([ic,html],i)=>{const x=i%2?1030:150, y=520+Math.floor(i/2)*230;
    b+=`<div class="lx-benefit" style="left:${px(x)};top:${px(y)};width:840px">${icon(ic,{T})}<div class="tx">${html.replaceAll('&lt;br&gt;','<br>')}</div></div>`;});
  b+=`<div class="lx-tray" style="left:120px;top:1040px;width:1760px;height:820px"></div>`;
  const steps=[['1','Download'],['2','Print'],['3','Colour']];
  b+=`<div class="lx-steps" style="top:1090px;left:260px;right:260px">${steps.map(([k,t],i)=>`${i?'<span class="lx-step-sep"></span>':''}<span class="lx-step"><b>${k}</b>${fact('process',t)}</span>`).join('')}</div>`;
  const big=!!slide?.big&&!wide(A.pages[facts.selection.showcase[0]]);   // the creative plan's larger portrait layout
  const row=[A.sheet,A.pages[facts.selection.showcase[0]]].filter(Boolean), H=big?640:520, ws=row.map(a=>H*a.width/a.height), gap=60, total=ws.reduce((s,v)=>s+v,0)+gap*(row.length-1);
  let x=(CANVAS-total)/2;
  row.forEach((a,i)=>{b+=placeArt(a,{x,y:big?1215:1280,w:ws[i],shadow:'soft'});x+=ws[i]+gap;});
  return {body:b,dark:false};
}

function features({facts,slide,copy,A,T}){
  const a=A.pages[slide.page], sq=!!slide.big&&a.width===a.height, port=!wide(a)&&!sq, L=sq?fit(a,1180,1180):port?(slide.big?fit(a,1050,1700):fit(a,900,1700)):fit(a,1560,1560);   // sq: creative plan, square pages -> text band + large page
  let b=background(T,'dark');
  // Landscape: text band on top, the real page large beneath it (side-by-side would leave it a thumbnail).
  const cw=port?CANVAS-L.w-100-100-100:1800, size=colW(copy.headline?.text,cw);
  const top=port?330:100;
  b+=headline(copy.headline,{x:100,y:top,w:cw,size,color:T.cream});
  const list=[fact('process','One design per page'),...(facts.line_art?[fact('line-art','Black-and-white line art')]:[]),fact('process','Print single-sided'),
    fact('process','Print as many copies as you need for personal use','Print as many copies as you need'),...(facts.printing_guide?[fact('printing-guide','Printing guide included')]:[])];
  b+=`<div class="lx-sub" style="left:100px;top:${px(top+wrapped(copy.headline,size,cw)*size+(port?90:50))};width:${px(cw)};color:${T.cream};font-size:34px;line-height:${port?2.1:1.9};letter-spacing:.08em">${list.map(h=>`<div><i style="display:inline-block;width:12px;height:12px;margin:0 26px 4px 2px;transform:rotate(45deg);background:${T.gold}"></i>${h}</div>`).join('')}</div>`;
  b+=placeArt(a,port?{x:CANVAS-100-L.w,y:(CANVAS-L.h)/2,w:L.w,rz:1.5,shadow:'lift',z:12}:{x:(CANVAS-L.w)/2,y:CANVAS-90-L.h,w:L.w,rz:1,shadow:'lift',z:12});
  return {body:b,dark:true};
}

function lifestyle({facts,slide,copy,A,T,sceneUri}){
  const a=A.pages[slide.page], L=fit(a,900,1340);
  let b=background(T,'dark',sceneUri)+scrim('top',.84)+scrim('topleft',.5);
  b+=headline(copy.headline,{x:110,y:110,w:1100,size:116,color:T.cream});
  if(copy.subline)b+=textBlock(copyHtml(copy.subline),{x:114,y:110+wrapped(copy.headline,116,1100)*116+50,w:760,cls:'lx-lede',color:T.goldLight,size:46});
  b+=placeArt(a,{x:CANVAS-150-L.w,y:CANVAS-160-L.h,w:L.w,rx:6,rz:4,shadow:'lift',origin:'50% 100%',z:12});
  return {body:b,dark:true};
}

/** Landscape pages: a diagonal cascade of large pages (each peeks out from under the next) instead of a row of thumbnails. */
function bundleWide({facts,copy,pages,T}){
  const n=pages.length, w=pages[0].width===pages[0].height?1000:1100, h=artHeight(pages[0],w), mid=(n-1)/2;
  let b=background(T,'dark');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:120,color:T.cream,align:'center'});
  let y=110+wrapped(copy.headline,120,1800)*120+40;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:200,y,w:1600,cls:'lx-lede',color:T.goldLight,align:'center',size:46});y+=90;}
  const top=y+30, dx=n>1?(CANVAS-200-w)/(n-1):0, dy=n>1?Math.max(0,(1760-top-h)/(n-1)):0;
  pages.forEach((a,i)=>{b+=placeArt(a,{x:100+i*dx,y:top+i*dy,w,rz:(i-mid)*1.2,shadow:'lift',z:10+i});});
  const items=[fact('page-count',`${facts.book.colouring_pages} colouring pages`),paperFact(facts),...(facts.png_pages?[fact('format','PNG pages')]:[]),...(facts.printing_guide?[fact('printing-guide','Printing guide')]:[])];
  b+=benefitRow(items,{y:1790,T});
  return {body:b,dark:true};
}

function bundle({facts,slide,copy,A,T}){
  const pages=slide.pages.map(n=>A.pages[n]).filter(Boolean), n=pages.length;
  if(pages.length&&(wide(pages[0])||(slide.big&&pages[0].width===pages[0].height)))return bundleWide({facts,slide,copy,pages,T});   // square: creative plan only
  const w=slide.big?(n>3?560:620):(n>3?440:520), step=n>1?Math.min(330,(1700-w)/(n-1)):0;
  let b=background(T,'dark');
  b+=headline(copy.headline,{x:100,y:110,w:1800,size:120,color:T.cream,align:'center'});
  let y=110+wrapped(copy.headline,120,1800)*120+40;
  if(copy.subline){b+=textBlock(copyHtml(copy.subline),{x:200,y,w:1600,cls:'lx-lede',color:T.goldLight,align:'center',size:46});y+=90;}
  const x0=(CANVAS-(w+step*(n-1)))/2, top=Math.max(y+60,700);
  pages.forEach((a,i)=>{const mid=(n-1)/2;b+=placeArt(a,{x:x0+i*step,y:top+Math.abs(i-mid)*30,w,rz:(i-mid)*5,shadow:'lift',z:10+(n-Math.round(Math.abs(i-mid)))});});
  const items=[fact('page-count',`${facts.book.colouring_pages} colouring pages`),paperFact(facts),...(facts.png_pages?[fact('format','PNG pages')]:[]),...(facts.printing_guide?[fact('printing-guide','Printing guide')]:[])];
  b+=benefitRow(items,{y:1790,T});
  return {body:b,dark:true};
}

export const PRIMITIVES={hero,interior,collage,coloured,'before-after':beforeAfter,included,printable,features,lifestyle,bundle};

/**
 * @param slide  one planSlides() slide (with .copy)
 * @param ctx    { facts, art:{pages,lead,sheet,guide}, sceneUri, exampleUri }
 */
export function composeSlide(slide,{facts,art:A,sceneUri,exampleUri,campaign}){
  const f=PRIMITIVES[slide.template];
  if(!f)throw new Error(`Unknown colouring-book slide template ${slide.template}`);
  const T=campaign.tokens;
  const {body,dark}=f({facts,slide,copy:slide.copy??{},A,T,sceneUri:slide.scene?sceneUri:null,exampleUri:slide.example?exampleUri:null});
  return {bodyHtml:`<div id="canvas" class="${dark?'dark':'light'}">${body}${footer(facts.product_name)}</div>`,
    extraCss:css(T)+`.lx-example{display:block;border-radius:5px}\n#canvas.light .lx-tile-label{color:${T.ink}}\n`};
}
