// Stage 3 adapter registry (ADR-037): the contract every format meets, the
// colouring-book planner and claim rules (generic, never theme-specific), and
// that greeting cards behave exactly as before. Pure: no rendering, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE3_ADAPTERS, stage3AdapterFor, adapterOf, planSlides, claimProblems, listingProblems, modelFacts, modelRules, campaignFor, deriveStrategy, REGION_TEMPLATES, usesEnvironment, Stage3Error } from '../src/stage3/index.mjs';

/** Colouring-book facts as the adapter derives them (only what the planner, claims and campaign read). */
function bookFacts({pages=12,cover=true,season='Autumn',type='Adult harvest colouring book',png=true}={}){
  const list=Array.from({length:pages},(_,i)=>({page_number:i+1,title:i===0&&cover?'Cover':`Page title ${i+1}`,role:i===0&&cover?'cover':'page',asset:`P${i+1}`,
    file:`book/pages/P${i+1}.png`,sha256:'a'.repeat(64),width:1024,height:1536}));
  const colouring=list.filter(p=>p.role!=='cover'), pick=k=>[...new Set(Array.from({length:Math.min(k,colouring.length)},(_,i)=>colouring[Math.round(i*(colouring.length-1)/Math.max(1,Math.min(k,colouring.length)-1))].page_number))];
  const showcase=pick(3);
  const f={product_id:'999',product_name:'Test Book',product_type:type,product_format:'colouring-book',season,target_customer:'adults',
    book:{page_count:pages,colouring_pages:colouring.length,cover,orientation:'portrait',page_px:[1024,1536],
      non_colouring_pages:list.filter(p=>p.role==='cover').map(p=>({page_number:p.page_number,kind:'cover',title:p.title}))},pages:list,
    selection:{cover:cover?1:null,lead:(cover?list[0]:colouring[0]).page_number,showcase,collage:pick(9),example:showcase[0]},
    formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'},...(png?[{key:'Colouring-Pages-PNG',label:'PNG pages'}]:[])],png_pages:png,printing_guide:true,line_art:true,
    page_quantity:{total_pages:pages,content_pages:colouring.length,content:'colouring'},style:{subject:null,palette:null,mood:null},
    package:{parts:1},creative:null};
  f.claims=stage3AdapterFor('colouring-book').claimIndex(f);
  return f;
}
const cardFacts=()=>({product_name:'Robin Card',product_type:'Christmas greetings card',product_format:'greeting-card',season:'Christmas',
  designs:[{id:'A',name:'Merry Christmas',text:[]},{id:'B',name:'Christmas Wishes',text:[]}],insides:[{text:['Wishing you joy'],shared_by:['A','B']}],
  formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'}],style:{subject:'robin',palette:null,mood:null},card_size_mm:{A4:[99,140]}});

test('registry: greeting-card, colouring-book and crochet-pattern-bundle adapters meet the Stage 3 contract',()=>{
  assert.deepEqual(Object.keys(STAGE3_ADAPTERS),['greeting-card','colouring-book','crochet-pattern-bundle']);
  for(const [format,a] of Object.entries(STAGE3_ADAPTERS)){
    assert.equal(a.format,format);assert.ok(Number.isInteger(a.version));
    for(const fn of ['facts','claimIndex','planSlides','composeSlide','prepareArt','modelFacts','sceneExclusions'])assert.equal(typeof a[fn],'function',`${format}.${fn}`);
    assert.ok(a.engines.regionTemplates.length);
    for(const fn of ['slideArtwork','heroBenefits','representative'])assert.equal(typeof a.engines[fn],'function',`${format}.engines.${fn}`);
    for(const t of a.engines.regionTemplates)assert.ok(REGION_TEMPLATES.includes(t)&&a.engines.minShare[t]>0,`${format} ${t}`);
    assert.ok(Object.isFrozen(a));
  }
  assert.equal(typeof STAGE3_ADAPTERS['colouring-book'].examplePrompt,'function');
});

test('registry: an unknown format fails clearly; facts without a format are greeting cards (pre-registry facts)',()=>{
  assert.throws(()=>stage3AdapterFor('party-kit'),e=>e instanceof Stage3Error&&e.retryable===false&&/No Stage 3 marketing support for "party-kit" yet \(available: greeting-card, colouring-book, crochet-pattern-bundle\)\.$/.test(e.message));
  assert.throws(()=>stage3AdapterFor('party-kit',{recorded:true}),/Stage 2 recorded its marketing metadata \(build record: stage3_handoff\)/);
  assert.equal(adapterOf({}),STAGE3_ADAPTERS['greeting-card']);
  assert.equal(adapterOf({product_format:'colouring-book'}),STAGE3_ADAPTERS['colouring-book']);
});

test('colouring book: 10-image campaign (hero, interior, collage, coloured, before/after, included, printable, features, lifestyle, bundle)',()=>{
  const f=bookFacts(), plan=planSlides(f,{maxScenes:4,strategy:deriveStrategy(f)});
  assert.equal(plan.format,'colouring-book');
  assert.deepEqual(plan.slides.map(s=>s.id),['01-hero','02-interior','03-collage','04-coloured','05-before-after','06-included','07-printable','08-features','09-lifestyle','10-bundle']);
  assert.deepEqual(plan.scenes.map(s=>s.id),['desk','cosy']);
  // One AI coloured example of the selected real page, shared by the two slides that show it.
  assert.deepEqual(plan.examples.map(e=>({id:e.id,page:e.page_number,file:e.file,used_by:e.used_by,sha256:e.sha256})),
    [{id:`example-p${f.selection.example}`,page:f.selection.example,file:`marketing/examples/example-p${f.selection.example}.png`,used_by:['04-coloured','05-before-after'],sha256:null}]);
  assert.equal(plan.examples[0].source.file,`book/pages/P${f.selection.example}.png`);
  // Every factual headline is allowed by the claims; the interior slide names the real page.
  for(const s of plan.slides)assert.deepEqual(claimProblems(s.copy.headline?.text??'',f),[],s.id);
  assert.equal(plan.slides[1].copy.headline.text,`Page title ${f.selection.showcase[0]}`);
  assert.deepEqual(plan.slides[2].pages,f.selection.collage);
  // No scenes allowed: nothing references one.
  assert.ok(planSlides(f,{maxScenes:0}).slides.every(s=>!s.scene));
  // Region templates for the engines.
  assert.deepEqual(plan.slides.filter(usesEnvironment).map(s=>s.template),['hero','interior','lifestyle']);
});

test('colouring book: generic for any theme, audience and size (nothing product-specific)',()=>{
  const themes={Halloween:'halloween_cute',Christmas:'christmas',Autumn:'autumn','':'none'};
  const accents=new Set();
  for(const [season,id] of Object.entries(themes)){
    const f=bookFacts({season,type:season?`${season} colouring book for kids`:'Animal colouring book'});
    const c=campaignFor(f);
    assert.equal(c.strategy.theme,id);accents.add(c.tokens.berry);
    const hero=planSlides(f,{strategy:deriveStrategy(f)}).slides[0];
    assert.equal(hero.copy.headline.text,`${season?`${season}\n`:''}Colouring\nPages`);
  }
  assert.equal(accents.size,4,'the accent follows the theme');
  // A short book without a cover: no collage below 3 colouring pages, the lead is page 1, counts follow the book.
  const small=bookFacts({pages:2,cover:false,png:false}), plan=planSlides(small,{});
  assert.ok(!plan.slides.some(s=>s.template==='collage'));
  assert.equal(small.selection.lead,1);
  assert.deepEqual(claimProblems('2 pages to colour',small),[]);
  assert.ok(!small.claims.cover&&!small.claims.format.includes('PNG pages'));
});

test('claims: colouring-book counts use its rules; greeting-card counts are unchanged',()=>{
  const f=bookFacts();
  assert.deepEqual(claimProblems('12 pages, 11 colouring pages, one design per page, eleven designs',f),[]);
  assert.deepEqual(claimProblems('Includes 14 pages',f),['text: "14 pages" (production has 12 pages (11 colouring pages))']);
  assert.deepEqual(claimProblems('three designs',f),['text: "three designs" (production has 12 pages (11 colouring pages))']);
  assert.ok(f.claims.example.includes('Coloured example')&&f.claims['line-art'].includes('Black-and-white line art'));
  const c=cardFacts();
  assert.deepEqual(claimProblems('2 card designs',c),[]);
  assert.deepEqual(claimProblems('three robin designs',c),['text: "three robin designs" (production has 2 card designs)']);
  // "per" is not a rate exception for greeting cards (unchanged behaviour).
  assert.deepEqual(claimProblems('one card per sheet',c),['text: "one card" (production has 2 card designs)']);
});

test('greeting cards are unaffected: same planner, same campaign, no coloured examples',()=>{
  const c=cardFacts(), plan=planSlides(c,{strategy:deriveStrategy(c)});
  assert.equal(plan.format,'greeting-card');
  assert.equal(plan.examples,undefined);
  assert.equal(plan.slides[0].template,'hero');assert.equal(plan.slides[0].scene,'tabletop');
  assert.equal(campaignFor(c).name,'cozy-premium-christmas');
  assert.deepEqual(STAGE3_ADAPTERS['greeting-card'].engines.regionTemplates,['hero','design','gift','print','inside']);
});

// ---------- page quantity (the #014 "one page" rejection) ----------
const Q=(t,f=bookFacts())=>claimProblems(t,f);
test('page quantity: product-quantity claims must match the Stage 2 counts (12 total / 11 colouring)',()=>{
  const bad={'one page':'"one page"','This printable is a single page.':'"single page"','Includes 1 colouring page':'"1 colouring page"',
    '12 colouring pages':'"12 colouring pages"','12 designs to colour':'"12 designs"','12 pages to colour':'"12 pages"','Includes 14 pages':'"14 pages"',
    'You get one page to colour':'"one page"','Includes bonus pages':'"bonus pages"','Plus 3 extra designs':'"extra designs"'};
  for(const [t,hit] of Object.entries(bad)){const p=Q(t);assert.equal(p.length>0,true,t);assert.ok(p.some(x=>x.includes(hit)),`${t}: ${p}`);}
  for(const t of ['Includes 11 colouring pages','11 printable colouring pages','12 pages including the cover','A 12-page colouring book with 11 colouring pages',
    'eleven illustrations','11 pages to colour','11 colouring pages + cover'])assert.deepEqual(Q(t),[],t);
});
test('page quantity: printing and layout wording is not a quantity claim (no false rejections)',()=>{
  for(const t of ['Print one page at a time.','colour one page at a time','Each design fits on one page.','One design per page.','Print two pages per sheet if you prefer.',
    'Start with a single page and see how your pencils behave.','A one-page printing guide is included.','No extra files are needed.'])assert.deepEqual(Q(t),[],t);
});
test('page quantity: a genuinely one-page product may say so; counts follow any book size',()=>{
  assert.deepEqual(Q('A single page to colour',bookFacts({pages:1,cover:false})),[]);
  const big=bookFacts({pages:30,cover:false});
  assert.deepEqual(Q('30 colouring pages',big),[]);assert.equal(Q('one page',big).length,1);assert.equal(Q('31 pages',big).length,1);
});
test('model facts and contract: 12 total / 11 colouring, the cover named from Stage 2, reference artwork is not a quantity',()=>{
  const f=bookFacts(), m=modelFacts(f), r=modelRules(f).join(' ');
  assert.deepEqual(m.product_quantity,{note:m.product_quantity.note,colouring_pages:11,total_document_pages:12,non_colouring_pages:[{page:1,kind:'cover',title:'Cover'}]});
  assert.equal(m.book.pages,undefined);assert.equal(m.book.one_design_per_page,undefined);
  assert.match(m.reference_images,/ONE page from this book.*not the whole product and not a page count/);
  for(const re of [/ONE multi-page printable colouring book: 11 colouring pages plus 1 non-colouring page \(page 1 is the cover/,/12 pages in total/,
    /State the quantity as "11 colouring pages"/,/Never write "12 colouring pages"/,/Never describe the product.*"one page", "a single page", "1 page"/,
    /ONE page FROM the book.*Never infer a quantity by counting images, page titles or files/,/Never invent additional, bonus or extra pages/])assert.match(r,re);
  // No cover: no non-colouring pages; one colouring page: no "never one page" rule.
  assert.doesNotMatch(modelRules(bookFacts({pages:20,cover:false})).join(' '),/non-colouring|including the/);
  assert.doesNotMatch(modelRules(bookFacts({pages:1,cover:false})).join(' '),/Never describe the product/);
  // Greeting cards have no format contract (their prompts are unchanged).
  assert.deepEqual(modelRules(cardFacts()),[]);
});
