// Stage 1 full-book artwork for colouring books (ADR-030): style approval ->
// full generation plan (no spend before confirmation) -> page-by-page
// generation with proof reuse, persistent progress and resume -> creative QC ->
// contact-sheet review -> page regeneration / change direction -> APPROVE FULL
// BOOK -> Stage 2. Fake OpenAI and Telegram; the QC and production are real.
// ZERO real OpenAI calls, ZERO Etsy calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { loadPricing, CostLedger } from '../src/costs/index.mjs';
import { menuData } from '../src/telegram/ui.mjs';
import { FULL_ARTWORK_FORMATS, BOOK_MANIFEST, BOOK_QC } from '../src/orchestrator/book-state.mjs';
import { fakeTelegram, msg, press, lastKeyboard, button, concept, bookDirection, CHAT, USER, pressRetry } from './helpers.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { ADAPTERS, BOOK_MANIFEST as P_MANIFEST, BOOK_QC as P_QC, bookArtworkQc, inspectArtwork, effectiveBookQc, overflowOverride, overflowReview, OVERFLOW_RULE } from '../../production/src/index.mjs';
import { OpenAIError } from '../src/openai/client.mjs';

const IMAGE_USAGE={input_tokens:909,input_tokens_details:{image_tokens:0,text_tokens:909},output_tokens:343,output_tokens_details:{image_tokens:343,text_tokens:0},total_tokens:1252};
const TEXT_USAGE={input_tokens:1406,output_tokens:2460,total_tokens:3866};
const TABLE={schema_version:1,version:'test-v1',provider:'openai',currency:'USD',models:{
  'fake-text':{unit:'per_1m_tokens',text:{input:2,cached_input:0.2,cache_write:2.5,output:12}},
  'fake-image':{unit:'per_1m_tokens',image:{text_input:5,image_input:8,image_output:30}}},fx:{pair:'USD_GBP',rate:0.8,as_of:'2026-09-26',source:'test'}};
const N=10;
const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);

/** Distinct, printable black line art on white (inside the margins), 1024x1536 like the real image model. */
export async function lineArt(seed,{width=1024,height=1536,blank=false,colour=false,clip=false}={}){
  let s=seed*7919+17;const r=()=>{s=(s*9301+49297)%233280;return s/233280;};
  const shapes=[];
  for(let i=0;i<14;i++){
    const cx=180+r()*(width-360), cy=220+r()*(height-440), rr=30+r()*110;
    shapes.push(i%2?`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="${colour?'#d02020':'none'}" stroke="#111" stroke-width="6"/>`
      :`<rect x="${(cx-rr).toFixed(1)}" y="${(cy-rr).toFixed(1)}" width="${(rr*1.6).toFixed(1)}" height="${(rr*1.2).toFixed(1)}" fill="none" stroke="#111" stroke-width="5"/>`);
  }
  const art=blank?'':`<rect x="70" y="70" width="${width-140}" height="${height-140}" fill="none" stroke="#111" stroke-width="8"/>${shapes.join('')}`+
    (clip?`<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#000" stroke-width="40"/>`:'');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${art}</svg>`)).png().toBuffer();
}

const bookConcept=id=>concept(id,{proposed_name:`Winter Windows ${id}`,product_type:'Christmas colouring book',product_format:'colouring-book',page_count:N,orientation:'portrait'});
const bookSpec=()=>({name:'Winter Windows Colouring Book',slug:'winter-windows-colouring-book',season:'Christmas',product_type:'Christmas colouring book',target_customer:'adults',page_count:N,
  canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'A window frame inset from the edges.'},
  pages:Array.from({length:N},(_,i)=>({page_number:i+1,page_type:i?'colouring':'cover',title:i?`Window ${i+1}`:'Winter Windows',concept:`scene ${i+1}`,instructions:null,
    artwork_description:`A detailed window scene number ${i+1}.`,generation_prompt:i?`Window scene ${i+1} with snow.`:'Cover with exact title text “Winter Windows”.',production_notes:i?'Keep open shapes.':'Verify the title.'}))});

/**
 * Fake OpenAI: text returns the colouring-book fixtures; images return distinct line art.
 * @param imageBytes (n, {step,prompt}) -> bytes (n counts all image calls)
 * @param fail (n, {step}) -> Error|undefined
 */
function bookAi({imageBytes,fail}={}){
  const calls=[];
  const client={
    async json({schemaName}){
      calls.push({kind:'json',schemaName});
      const data={concepts:{concepts:['A','B','C'].map(bookConcept)},specification:bookSpec(),'creative-direction':bookDirection()}[schemaName];
      return {data:structuredClone(data),usage:TEXT_USAGE,model:'fake-text'};
    },
    async image({step,prompt,size,quality}){
      calls.push({kind:'image',step,prompt,size,quality});
      const n=calls.filter(c=>c.kind==='image').length, err=fail?.(n,{step,prompt});
      if(err)throw err;
      return {bytes:await (imageBytes??((k)=>lineArt(k)))(n,{step,prompt}),usage:IMAGE_USAGE,model:'fake-image',revisedPrompt:null};
    }
  };
  return {ai:{client,textModel:'fake-text',imageModel:'gpt-image-test',imageQuality:'medium',previewQuality:'low'},calls};
}
async function harness(opts={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-book-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=bookAi(opts), pricing=loadPricing({table:TABLE,env:{}});
  const costs={ledger:new CostLedger({dir:join(root,'state','costs'),pricing}),pricing}, logs=[];
  const wf=new Workflow({store,registry,telegram,ai,costs,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:l=>logs.push(l)});
  return {root,store,telegram,calls,wf,costs,logs,cleanup:()=>rm(root,{recursive:true,force:true})};
}
const bookCalls=h=>h.calls.filter(c=>c.kind==='image'&&c.step==='book-page');
const texts=h=>h.telegram.sent.filter(s=>s.type==='message'||s.type==='edited').map(s=>s.text);
const lastScreen=h=>h.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=h=>lastScreen(h).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const tap=(h,label)=>{const b=lastScreen(h).replyMarkup.inline_keyboard.flat().find(x=>x.text===label);if(!b)throw new Error(`no "${label}" in ${labels(h).join(' | ')}`);return h.wf.handleUpdate(press(b.callback_data));};
const nav=(h,screen,a='',b='')=>h.wf.handleUpdate(press(menuData(screen,a,b)));
const ws=async h=>h.store.dirOf(await h.store.load('001'));

/** Through the real Stage 1 flow to an approved style (proofs of pages 2, 3 and 10, as #012's 2, 3 and 24). */
async function styleApproved(h){
  await h.wf.handleUpdate(msg('/newproduct christmas colouring book'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  const p=await h.store.load('001');
  assert.deepEqual(p.proofs.selected_pages.map(s=>s.page_number),[2,3,10]);
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  return h.store.load('001');
}
/** Confirm the full generation from the product screen: Generate button -> FULL BOOK GENERATION -> Generate N Pages. */
async function generate(h){
  await nav(h,'prod','001');
  const gen=labels(h).find(l=>/^🎨 Generate|^📖 Check/.test(l));
  await tap(h,gen);
  return tap(h,labels(h)[0]);
}
async function reviewed(opts){
  const h=await harness(opts);await styleApproved(h);
  const r=await generate(h);
  return {h,r};
}

test('style approval offers the full book; nothing is generated or written before the owner confirms the cost',async()=>{
  const h=await harness();
  try{
    const p=await styleApproved(h), before=h.calls.length;
    assert.equal(p.status,'CREATIVE_APPROVED');assert.ok(!('book' in p),'no book state yet');
    assert.match(texts(h).at(-1),/✅ Style approved for #001\. Next: the full colouring book \(10 pages\)/);
    assert.deepEqual(labels(h),['🎨 Generate Full Colouring Book','📦 Product','🏠 Home']);
    // Product screen: the owner sees what is available and what the button will do.
    await nav(h,'prod','001');
    assert.match(lastScreen(h).text,/Stage: 🎨 Creative — style approved — full artwork needed\nStyle approved\n📖 Full artwork: 3\/10 available/);
    assert.ok(labels(h).includes('🎨 Generate Remaining 7 Pages'));assert.ok(!labels(h).some(l=>/Build Production/.test(l)),'no production before the full book');
    // The confirmation: pages, reuse, image calls, cost. Still nothing generated.
    await tap(h,'🎨 Generate Remaining 7 Pages');
    const t=lastScreen(h).text;
    for(const line of ['📖 FULL BOOK GENERATION','10 pages required','3 approved style pages reusable','7 pages need generation','Estimated new image calls: 7','1024×1536 px'])assert.ok(t.includes(line),line);
    assert.match(t,/Estimated API cost: £\d+\.\d\d/,'priced from the ledger\'s recent image calls');
    assert.deepEqual(labels(h),['🎨 Generate 7 Pages','Cancel']);
    assert.equal(h.calls.length,before,'no OpenAI call before confirmation');
    assert.ok(!await exists(join(await ws(h),'book')),'nothing written before confirmation');
    // Stage 2 is refused before the full artwork is approved (no production files).
    const r=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(r.outcome,'book_not_approved');
    assert.match(texts(h).at(-1),/full artwork not approved yet[\s\S]*Full artwork: 3\/10 available \(missing 1, 4-9\)/);
    assert.ok(!await exists(join(await ws(h),'production')));
    assert.equal((await h.store.load('001')).status,'CREATIVE_APPROVED');
  }finally{await h.cleanup();}
});

test('generation: manifest persisted first, approved proofs reused (copied, untouched), only missing pages generated, per-page progress, cost ledger',async()=>{
  const {h,r}=await reviewed();
  try{
    assert.equal(r.outcome,'awaiting_book_approval');assert.equal(r.qcPassed,true);
    const p=await h.store.load('001'), dir=await ws(h);
    assert.equal(p.status,'AWAITING_BOOK_APPROVAL');
    assert.deepEqual(p.status_history.slice(-2).map(x=>x.event),['book_started','book_ready']);
    // Manifest: ordered, authoritative, with each page's creative direction.
    const m=JSON.parse(await readFile(join(dir,BOOK_MANIFEST)));
    assert.equal(sha(await readFile(join(dir,BOOK_MANIFEST))),p.book.manifest.sha256);
    assert.deepEqual(m.pages.map(x=>x.page_id),Array.from({length:N},(_,i)=>`P${String(i+1).padStart(3,'0')}`));
    for(const k of ['page_id','page_number','title','scene','composition','subject','complexity','style_reference','negative_constraints'])assert.ok(k in m.pages[4],k);
    assert.deepEqual(m.pages[0].required_text,['Winter Windows']);assert.deepEqual(m.style_reference.proof_pages,[2,3,10]);
    assert.equal(m.generation.size,'1024x1536');assert.match(m.generation.note,/No DPI claim/);
    // Reuse: pages 2, 3, 10 are byte copies of the approved proofs; the proofs are unchanged.
    const attempt=p.proofs.attempts[0];
    for(const [i,n] of [2,3,10].entries()){
      const e=p.book.pages[n-1];
      assert.equal(e.status,'reused');assert.equal(e.proof_file,attempt.images[i].file);
      assert.equal(sha(await readFile(join(dir,e.file))),sha(await readFile(join(dir,attempt.images[i].file))));
    }
    assert.deepEqual(p.book.reuse.map(x=>[x.page_number,x.reused]),[[2,true],[3,true],[10,true]]);
    // Exactly the 7 missing pages were generated, one call each, in page order, at the largest portrait size.
    const calls=bookCalls(h);
    assert.equal(calls.length,7);
    assert.deepEqual(calls.map(c=>/PAGE (\d+) of/.exec(c.prompt)[1]).map(Number),[1,4,5,6,7,8,9]);
    assert.ok(calls.every(c=>c.size==='1024x1536'&&c.quality==='medium'));
    // Style consistency: the approved proofs' exact style block + the manifest's page detail + book consistency.
    const proofPrompt=attempt.images[0].prompt, stylePart=proofPrompt.split('\n\nPAGE ')[0];
    for(const c of calls){assert.ok(c.prompt.startsWith(stylePart),'same shared style + style parameters as the approved proofs');
      assert.match(c.prompt,/BOOK CONSISTENCY: This is page \d+ of 10 in one colouring book whose style the owner approved from pages 2, 3, 10\./);
      assert.match(c.prompt,/PAGE DETAIL: A detailed window scene/);assert.match(c.prompt,/CANVAS: A single portrait design with a plain white background/);}
    // Per-page record: artwork, checksum, dimensions, status.
    for(const e of p.book.pages){assert.ok(['generated','reused'].includes(e.status));assert.equal(sha(await readFile(join(dir,e.file))),e.sha256);assert.deepEqual([e.width,e.height],[1024,1536]);}
    assert.equal(p.book.generation.status,'complete');
    // Every paid page call is in product.json api_usage and in the cost ledger (stage Artwork, operation book).
    assert.equal(p.api_usage.filter(u=>u.step==='book-page').length,7);
    const ev=h.costs.ledger.events().events.filter(e=>e.step==='book-page');
    assert.equal(ev.length,7);assert.ok(ev.every(e=>e.stage==='artwork'&&e.operation==='book'&&e.product_id==='001'&&e.priced));
    // Progress was saved after every page (the store saved a new product.json per page).
    assert.ok(h.logs.some(l=>/full book: 7 page image call\(s\) to make; 3 page\(s\) already have artwork/.test(l)));
  }finally{await h.cleanup();}
});

test('contact-sheet review: two batches for a 10-page book, QC PASS, review buttons, cost lines; no 10 separate photos',async()=>{
  const {h}=await reviewed();
  try{
    const albums=h.telegram.sent.filter(s=>s.type==='album'&&s.items.some(i=>/pages-/.test(i.fileName)));
    assert.equal(albums.length,1);assert.deepEqual(albums[0].items.map(i=>i.caption),['#001 · pages 1–8 of 10','#001 · pages 9–10 of 10']);
    const m=await sharp(albums[0].items[0].bytes).metadata();assert.ok(m.width>=1400&&m.width<=1700,`sheet ${m.width}px wide: readable on a phone`);
    assert.ok(!h.telegram.sent.some(s=>s.type==='photo'&&/P0\d\d/.test(s.fileName??'')),'no per-page photos by default');
    const t=lastScreen(h).text;
    for(const line of ['📖 PRODUCT #001 — FULL BOOK REVIEW','10/10 pages generated (3 reused style proofs)','Creative QC: PASS'])assert.ok(t.includes(line),line);
    assert.match(t,/Estimated generation cost: £\d+\.\d\d\nProduct total: £\d+\.\d\d/);
    assert.deepEqual(labels(h),['👀 View Pages 1–8','👀 View Pages 9–10','🔎 Inspect Individual Page','✏️ Regenerate Page','✅ Approve Full Book','❌ Reject / Change Direction','❓ What can I do here?','🏠 Home']);
    // Viewing a batch re-sends that sheet (read-only) with the buttons below it.
    const before=h.calls.length;
    await tap(h,'👀 View Pages 9–10');
    assert.equal(h.telegram.sent.filter(s=>s.type==='photo').at(-1).caption,'#001 · pages 9–10 of 10');
    assert.ok(labels(h).includes('✅ Approve Full Book'));assert.equal(h.calls.length,before);
    const qc=JSON.parse(await readFile(join(await ws(h),BOOK_QC)));
    for(const name of ['page manifest complete','page sequence P001..P010','all page files present','valid PNG files','expected dimensions and orientation','no blank pages','no exact duplicates',
      'black-and-white colouring-page characteristics','safe margins: no clipping at the page edges'])assert.ok(qc.checks.find(c=>c.name===name)?.ok,name);
  }finally{await h.cleanup();}
});

test('interrupted generation resumes at the failed page: finished pages are never regenerated or paid twice',async()=>{
  // Image calls: 3 previews + 3 proofs, then book pages. Fail the 4th book page (page 6) once.
  let failed=false;
  const {h,r}=await reviewed({fail:(n,{step})=>step==='book-page'&&n===10&&!failed?(failed=true,new OpenAIError('OpenAI /images failed (HTTP 500): upstream',{status:500,retryable:true})):undefined});
  try{
    assert.equal(r.outcome,'failed');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'CREATIVE_APPROVED');assert.equal(p.last_error.step,'book');
    assert.deepEqual(p.book.pages.map(e=>e.status),['generated','reused','reused','generated','generated','failed','missing','missing','missing','reused']);
    assert.match(p.book.pages[5].error,/HTTP 500/);assert.equal(p.book.generation.status,'failed');
    const done=Object.fromEntries(p.book.pages.filter(e=>e.status==='generated').map(e=>[e.page_id,e.sha256]));
    assert.equal(h.costs.ledger.events().events.filter(e=>e.step==='book-page').length,4,'3 successful + 1 failed attempt recorded');
    // The failure offers a paid retry (confirmation first) and a stop that keeps the pages.
    assert.ok(labels(h).includes('🔄 Retry (API cost)'));
    await tap(h,'🔄 Retry (API cost)');
    assert.match(lastScreen(h).text,/Estimated: 4 image calls/,'only the pages still without artwork');
    const before=bookCalls(h).length;
    const out=await tap(h,'Confirm');
    assert.equal(out.outcome,'awaiting_book_approval');
    assert.deepEqual(bookCalls(h).slice(before).map(c=>Number(/PAGE (\d+) of/.exec(c.prompt)[1])),[6,7,8,9]);
    p=await h.store.load('001');
    for(const [id,s] of Object.entries(done))assert.equal(p.book.pages.find(e=>e.page_id===id).sha256,s,`${id} kept`);
    assert.equal(p.status,'AWAITING_BOOK_APPROVAL');
  }finally{await h.cleanup();}
});

test('restart during generation: recovery parks it safely; a page written but never recorded is adopted without a new call',async()=>{
  let crash=true;
  const {h}=await reviewed({fail:(n,{step})=>step==='book-page'&&n===9&&crash?(crash=false,new Error('simulated crash')):undefined});
  try{
    const dir=await ws(h);
    // Simulate: page 5's image had been written to disk just before the process died, but not recorded.
    await writeFile(join(dir,'book/pages/P005.png'),await lineArt(99));
    let p=await h.store.load('001');
    assert.equal(p.book.pages[4].status,'failed');
    const before=bookCalls(h).length;
    await pressRetry(h);
    p=await h.store.load('001');
    assert.equal(p.book.pages[4].adopted_after_restart,true);assert.equal(p.book.pages[4].sha256,sha(await lineArt(99)));
    assert.deepEqual(bookCalls(h).slice(before).map(c=>Number(/PAGE (\d+) of/.exec(c.prompt)[1])),[6,7,8,9],'page 5 was not paid for again');
    // A bot restart while BOOK_GENERATING: recovery marks it interrupted and offers the retry.
    const stuck={...p,status:'BOOK_GENERATING',lock:{op:'book',id:'x',at:new Date().toISOString()},book:{...p.book,generation:{...p.book.generation,status:'generating'}}};
    await h.store.save(stuck);
    assert.deepEqual(await h.wf.recover(),['001']);
    p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.last_error.step,'book');assert.equal(p.book.generation.status,'interrupted');
    // /cancel stops the book (every page kept) instead of cancelling production or rejecting the product.
    assert.equal((await h.wf.handleUpdate(msg('/cancel'))).outcome,'book_stopped');
    const stopped=await h.store.load('001');
    assert.equal(stopped.status,'CREATIVE_APPROVED');assert.deepEqual(stopped.book.pages.map(e=>e.sha256),p.book.pages.map(e=>e.sha256));
    assert.match(texts(h).at(-1),/Every page made so far is kept \(10\/10\)/);assert.equal(p.resume_state,'CREATIVE_APPROVED','resumes from where that generation run started');
  }finally{await h.cleanup();}
});

test('stale or repeated confirmation presses never start a duplicate paid generation',async()=>{
  const h=await harness();
  try{
    await styleApproved(h);
    await nav(h,'prod','001');await tap(h,'🎨 Generate Remaining 7 Pages');
    const confirm=lastScreen(h).replyMarkup.inline_keyboard.flat()[0].callback_data;
    assert.equal((await h.wf.handleUpdate(press(confirm))).outcome,'awaiting_book_approval');
    const calls=bookCalls(h).length;
    assert.equal((await h.wf.handleUpdate(press(confirm))).outcome,'stale');
    // An old "ask" screen is re-validated against the current state: no paid confirmation is offered.
    await nav(h,'ask','001','bgen');assert.match(lastScreen(h).text,/That action is no longer available/);
    assert.equal(bookCalls(h).length,calls);
  }finally{await h.cleanup();}
});

test('creative QC catches missing, duplicate, blank, coloured and clipped pages; approval is refused until fixed',async()=>{
  // Book pages (image calls 7..13 = pages 1,4,5,6,7,8,9): page 4 blank, page 6 a duplicate of page 5, page 8 coloured, page 9 clipped.
  const bad={8:'blank',10:'dup',12:'colour',13:'clip'};
  const {h,r}=await reviewed({imageBytes:(n)=>bad[n]==='blank'?lineArt(n,{blank:true}):bad[n]==='dup'?lineArt(9):bad[n]==='colour'?lineArt(n,{colour:true}):bad[n]==='clip'?lineArt(n,{clip:true}):lineArt(n)});
  try{
    assert.equal(r.qcPassed,false);
    const p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_BOOK_APPROVAL');assert.equal(p.book.qc.passed,false);
    assert.deepEqual(p.book.qc.failed_pages,['P004','P006','P008','P009']);
    const t=lastScreen(h).text;
    assert.match(t,/Creative QC: FAIL/);assert.match(t,/❌ P004 is blank/);assert.match(t,/❌ P006 duplicates P005/);
    assert.match(t,/❌ P008 contains colour/);assert.match(t,/❌ P009 artwork runs off the page edge \(top, right, bottom, left\)/);
    assert.ok(!labels(h).includes('✅ Approve Full Book'),'no approve button while QC fails');
    // A hand-crafted approve press is refused too.
    const {encode}=await import('../src/telegram/approvals.mjs');
    const out=await h.wf.handleUpdate(press(encode('bapprove','001',p.review.nonce)));
    assert.equal(out.outcome,'book_not_approvable');assert.match(out.problem,/Creative QC failed \(P004, P006, P008, P009\)/);
    assert.equal((await h.store.load('001')).book.approval,null);
    // The page picker marks the failures.
    await nav(h,'bpages','001');
    assert.ok(labels(h).includes('❌ P004')&&labels(h).includes('✅ P002'));
    // Missing page: QC over a book with a page file gone.
    const manifest={pages:Array.from({length:3},(_,i)=>({page_id:`P00${i+1}`,page_number:i+1}))};
    const pages=await Promise.all([1,2].map(async n=>{const b=await lineArt(n);return {page_id:`P00${n}`,page_number:n,bytes:b,sha256:sha(b)};}));
    const q=await bookArtworkQc({manifest,pages,expected:{count:3,width:1024,height:1536,orientation:'portrait'}});
    assert.equal(q.passed,false);assert.equal(q.checks.find(c=>c.name==='all page files present').detail,'missing P003');
  }finally{await h.cleanup();}
});

test('individual page: view, regenerate (1 paid call, archived, never deleted), QC re-run, only that page changes',async()=>{
  const {h}=await reviewed();
  try{
    let p=await h.store.load('001');const dir=await ws(h), old=p.book.pages[4], others=p.book.pages.filter(e=>e.page_number!==5).map(e=>e.sha256);
    await tap(h,'🔎 Inspect Individual Page');await tap(h,'✅ P005');
    assert.match(lastScreen(h).text,/🖼 #001 · P005\n\nWindow 5[\s\S]*Source\s+Generated\nSize\s+1024×1536 px\nQC\s+✅ passed/);
    assert.deepEqual(labels(h),['👀 View Full Size','✨ Regenerate','✏️ Change Direction','⬅️ Book Review','🏠 Home']);
    await tap(h,'👀 View Full Size');
    assert.equal(h.telegram.sent.filter(s=>s.type==='photo').at(-1).fileName,'001-P005.png');
    await tap(h,'✨ Regenerate');
    assert.match(lastScreen(h).text,/Regenerate this page \(same specification and style\) \(P005\)\?\n⚠️ This will incur OpenAI API cost\.\nEstimated: 1 image call ≈ £\d+\.\d\d/);
    const before=bookCalls(h).length;
    const r=await tap(h,labels(h)[0]);
    assert.equal(r.outcome,'awaiting_book_approval');
    assert.equal(bookCalls(h).length,before+1);assert.match(bookCalls(h).at(-1).prompt,/PAGE 5 of "Winter Windows Colouring Book"/);
    p=await h.store.load('001');
    const e=p.book.pages[4];
    assert.equal(e.revision,1);assert.notEqual(e.sha256,old.sha256);assert.equal(p.book.pending_op,null);
    assert.equal(sha(await readFile(join(dir,'book/history/P005-r00.png'))),old.sha256,'replaced artwork archived');
    assert.deepEqual(p.book.pages.filter(x=>x.page_number!==5).map(x=>x.sha256),others);
    assert.equal(p.book.qc.fingerprint,JSON.parse(await readFile(join(dir,BOOK_QC))).fingerprint);
    // The review shows the new page, not all the sheets again.
    assert.equal(h.telegram.sent.filter(s=>s.type==='photo').at(-1).fileName,'001-P005.png');
    assert.ok(await exists(join(dir,'book/prompts/P005-r01.json')));
  }finally{await h.cleanup();}
});

test('change direction for one page: owner instruction in that page\'s prompt, approved style kept, 1 paid call; stale buttons refused',async()=>{
  const {h}=await reviewed();
  try{
    await nav(h,'bpage','001','007');await tap(h,'✏️ Change Direction');
    assert.match(lastScreen(h).text,/Change the direction for this page \(P007\)\?/);
    await tap(h,labels(h)[0]);
    assert.match(texts(h).at(-1),/Reply with what to change on P007 \(Window 7\)/);
    assert.equal((await h.store.load('001')).pending_input,'book_page_direction');
    const before=bookCalls(h).length;
    const r=await h.wf.handleUpdate(msg('make the moon larger and simplify the curtains'));
    assert.equal(r.outcome,'awaiting_book_approval');
    const c=bookCalls(h).slice(before);
    assert.equal(c.length,1);
    assert.match(c[0].prompt,/OWNER CHANGE FOR THIS PAGE: make the moon larger and simplify the curtains Keep the approved book style\./);
    assert.match(c[0].prompt,/BOOK CONSISTENCY/);assert.match(c[0].prompt,/PAGE 7 of/);
    const p=await h.store.load('001');
    assert.equal(p.book.pages[6].instruction,'make the moon larger and simplify the curtains');assert.equal(p.book.pages[6].revision,1);assert.equal(p.pending_input,null);
    // A later plain regenerate of that page keeps its direction.
    await nav(h,'bpage','001','007');await tap(h,'✨ Regenerate');await tap(h,labels(h)[0]);
    assert.match(bookCalls(h).at(-1).prompt,/OWNER CHANGE FOR THIS PAGE: make the moon larger/);
    // After approval, an old page button no longer offers a paid confirmation.
    await nav(h,'book','001');await tap(h,'✅ Approve Full Book');
    await nav(h,'ask','001','bpr007');assert.match(lastScreen(h).text,/That action is no longer available/);
  }finally{await h.cleanup();}
});

test('change the whole book direction: generated pages archived and marked for regeneration; nothing paid until confirmed',async()=>{
  const {h}=await reviewed();
  try{
    const dir=await ws(h), before=bookCalls(h).length;
    await tap(h,'❌ Reject / Change Direction');
    assert.deepEqual(labels(h),['✏️ Change Book Direction','✖️ Reject Product','⬅️ Book Review','🏠 Home']);
    await tap(h,'✏️ Change Book Direction');assert.match(lastScreen(h).text,/archived \(kept in book\/history\/\)/);
    await tap(h,'Confirm');
    const r=await h.wf.handleUpdate(msg('simpler backgrounds and bolder outlines'));
    assert.equal(r.outcome,'book_direction_changed');assert.equal(r.archived.length,7);
    const p=await h.store.load('001');
    assert.equal(p.status,'CREATIVE_APPROVED');assert.equal(p.book.approval,null);
    assert.deepEqual(p.book.pages.map(e=>e.status),['missing','reused','reused','missing','missing','missing','missing','missing','missing','reused']);
    assert.equal((await readdir(join(dir,'book/history'))).length,7);
    assert.match(lastScreen(h).text,/7 pages need generation\n[\s\S]*Estimated new image calls: 7/);
    assert.equal(bookCalls(h).length,before,'nothing generated yet');
    await tap(h,'🎨 Generate 7 Pages');
    assert.ok(bookCalls(h).slice(before).every(c=>/OWNER DIRECTION FOR THE WHOLE BOOK: simpler backgrounds and bolder outlines/.test(c.prompt)));
    assert.equal((await h.store.load('001')).status,'AWAITING_BOOK_APPROVAL');
  }finally{await h.cleanup();}
});

test('APPROVE FULL BOOK records the approval; Stage 2 then accepts the book (zero OpenAI calls) and takes every page from it',{timeout:300_000},async()=>{
  const {h}=await reviewed();
  try{
    // Stage 2 is still refused during the review.
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'book_not_approved');
    await nav(h,'book','001');
    const r=await tap(h,'✅ Approve Full Book');
    assert.equal(r.outcome,'book_approved');
    const p=await h.store.load('001'), dir=await ws(h);
    assert.equal(p.status,'CREATIVE_APPROVED');
    assert.deepEqual(Object.keys(p.book.approval).sort(),['approved_at','by','manifest_sha256','pages_sha256','qc_sha256']);
    assert.equal(p.book.approval.by,'@owner');assert.equal(p.book.approval.pages_sha256,p.book.qc.fingerprint);
    assert.equal(p.book.approval.qc_sha256,sha(await readFile(join(dir,BOOK_QC))));
    assert.match(texts(h).at(-1),/✅ Full artwork approved for #001: 10\/10 pages/);
    assert.deepEqual(labels(h),['🏭 Build Production Files','📦 Product','🏠 Home']);
    // Stage 2 (real deterministic production): no model call at all.
    const before=h.calls.length;
    h.wf.ai={client:{json:()=>{throw new Error('OpenAI called in Stage 2');},image:()=>{throw new Error('OpenAI called in Stage 2');}}};
    const out=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(out.outcome,'awaiting_production_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.equal(h.calls.length,before);
    const handoff=JSON.parse(await readFile(join(dir,'production/handoff.json')));
    assert.equal(handoff.adapter.format,'colouring-book');
    assert.deepEqual(handoff.book.pages.map(x=>x.asset),p.book.pages.map(e=>e.page_id));
    assert.ok(handoff.assets.every(a=>a.source==='full-book'&&a.sha256===p.book.pages.find(e=>e.page_id===a.id).sha256));
    assert.equal(handoff.approved.full_artwork.pages_sha256,p.book.approval.pages_sha256);
    assert.equal(handoff.sources.book_manifest.sha256,p.book.manifest.sha256);
  }finally{await h.cleanup();}
});

test('approval is bound to the exact pages: a page changed after the QC is refused',async()=>{
  const {h}=await reviewed();
  try{
    const dir=await ws(h);
    await writeFile(join(dir,'book/pages/P004.png'),await lineArt(77));
    await nav(h,'book','001');
    const r=await tap(h,'✅ Approve Full Book');
    assert.equal(r.outcome,'book_not_approvable');assert.match(r.problem,/book\/pages\/P004\.png changed since the review/);
    assert.equal((await h.store.load('001')).book.approval,null);
  }finally{await h.cleanup();}
});

test('proofs that are not genuinely pages of the book are not reused (variation, other direction, wrong size, failing checks)',async()=>{
  // Proof images are image calls 4..6 (pages 2, 3, 10). Make proof 2 (page 3) coloured and proof 3 (page 10) the wrong size.
  const h=await harness({imageBytes:(n)=>n===5?lineArt(n,{colour:true}):n===6?lineArt(n,{width:1024,height:1024}):lineArt(n)});
  try{
    await styleApproved(h);
    await nav(h,'prod','001');
    assert.match(lastScreen(h).text,/Full artwork: 1\/10 available/);
    await tap(h,'🎨 Generate Remaining 9 Pages');
    const t=lastScreen(h).text;
    assert.match(t,/1 approved style page reusable/);assert.match(t,/9 pages need generation/);
    assert.match(t,/Not reused: page 3 proof \(page check: contains colour/);assert.match(t,/Not reused: page 10 proof \(1024x1024 px; the book is 1024x1536\)/);
  }finally{await h.cleanup();}
});

test('greeting cards are unchanged: style approval leads straight to production, no book',async()=>{
  const {harness:cardHarness}=await import('./helpers.mjs');
  const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
  const spec={name:'Robin Card',slug:'robin-card',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
    canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Card panels.'},
    pages:['card-front','card-inside','card-back'].map((t,i)=>({page_number:i+1,page_type:t,title:t,concept:'c',instructions:null,artwork_description:'a',generation_prompt:`${t} art`,production_notes:'n'}))};
  const h=await cardHarness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:()=>spec,'creative-direction':()=>bookDirection()}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas card'));await h.wf.handleUpdate(msg('/go'));await h.wf.handleUpdate(press(button(h.telegram,'A')));
    await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/✅ Creative approved for #001\. Build the customer files/);
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['🏭 Build Production Files','📦 Product','🏠 Home']);
    const p=await h.store.load('001');
    assert.ok(!('book' in p));assert.equal(h.calls.filter(c=>c.kind==='image').length,6,'3 previews + 3 proofs, nothing more');
  }finally{await h.cleanup();}
});

test('contract: full-book formats and file names match the Stage 2 adapters and handoff',()=>{
  assert.deepEqual([...FULL_ARTWORK_FORMATS],Object.values(ADAPTERS).filter(a=>a.artwork==='full-book').map(a=>a.format));
  assert.equal(BOOK_MANIFEST,P_MANIFEST);assert.equal(BOOK_QC,P_QC);
});

test('page inspection: thresholds on real-looking line art',async()=>{
  const ok=await inspectArtwork(await lineArt(1));
  assert.equal(ok.coloured,0);assert.ok(ok.white>0.8&&ok.ink>0.005);assert.deepEqual(Object.values(ok.edge),[0,0,0,0]);
  const clip=await inspectArtwork(await lineArt(1,{clip:true}));assert.ok(Object.values(clip.edge).every(v=>v>0.9));
  assert.ok((await inspectArtwork(await lineArt(1,{colour:true}))).coloured>0.02);
  assert.ok((await inspectArtwork(await lineArt(1,{blank:true}))).stdev<2);
});

// ---------------------------------------------------------------- ADR-067: owner override for decorative artwork overflow ---
// Image calls 12 and 13 are pages 8 and 9 (see the creative QC test above): their artwork runs off the page edge.
const OVERFLOW={12:'clip',13:'clip'};
const overflowArt=(extra={})=>({imageBytes:(n)=>{const k={...OVERFLOW,...extra}[n];return k==='clip'?lineArt(n,{clip:true}):k==='blank'?lineArt(n,{blank:true}):lineArt(n);}});

test('ADR-067 overflow only -> OWNER REVIEW REQUIRED: product, pages, reasons, page renders; ACCEPT / FIX / CANCEL; no approval yet',async()=>{
  const {h,r}=await reviewed(overflowArt());
  try{
    assert.equal(r.qcPassed,false);
    const p=await h.store.load('001'), t=lastScreen(h).text;
    assert.equal(p.status,'AWAITING_BOOK_APPROVAL');assert.deepEqual(p.book.qc.failed_pages,['P008','P009']);
    assert.match(t,/Creative QC: OWNER REVIEW REQUIRED/);assert.match(t,/Product #001: decorative artwork reaches past the page edge on 2 pages/);
    assert.match(t,/• P008: artwork runs off the page edge/);assert.match(t,/• P009: artwork runs off the page edge/);
    for(const l of ['✅ ACCEPT OVERFLOW','🔁 FIX / REGENERATE','❌ CANCEL','🔎 P008','🔎 P009'])assert.ok(labels(h).includes(l),l);
    assert.ok(!labels(h).includes('✅ Approve Full Book'));
    const {encode}=await import('../src/telegram/approvals.mjs');
    const out=await h.wf.handleUpdate(press(encode('bapprove','001',p.review.nonce)));
    assert.equal(out.outcome,'book_not_approvable');assert.match(out.problem,/ACCEPT OVERFLOW/);
    // 🔎 opens the page with its render (the existing page view).
    await nav(h,'book','001');await tap(h,'🔎 P008');assert.match(lastScreen(h).text,/P008/);
    // ❌ CANCEL changes nothing: back to the review, no override.
    await nav(h,'book','001');await tap(h,'❌ CANCEL');
    assert.equal((await h.store.load('001')).book.qc.override,undefined);assert.ok(labels(h).includes('✅ ACCEPT OVERFLOW'));
    // 🔁 FIX / REGENERATE is the existing page picker in regenerate mode.
    await tap(h,'🔁 FIX / REGENERATE');assert.match(lastScreen(h).text,/Choose the page to regenerate/);
  }finally{await h.cleanup();}
});

test('ADR-067 ACCEPT OVERFLOW -> recorded exception -> approval -> Stage 2 continues; the QC report says PASS WITH OWNER OVERRIDE',{timeout:300_000},async()=>{
  const {h}=await reviewed(overflowArt());
  try{
    await nav(h,'book','001');
    await tap(h,'✅ ACCEPT OVERFLOW');
    let p=await h.store.load('001');
    const o=p.book.qc.override;
    assert.equal(o.kind,'owner-approved exception');assert.equal(o.rule,OVERFLOW_RULE);assert.deepEqual(o.pages,['P008','P009']);
    assert.equal(o.accepted_by,'@owner');assert.ok(Date.parse(o.accepted_at));assert.equal(o.qc_sha256,p.book.qc.sha256);
    assert.equal(o.statement,'PASS WITH OWNER OVERRIDE — decorative artwork overflow accepted on pages P008, P009.');
    assert.equal(p.book.override_history.length,1);assert.equal(p.book.qc.passed,false,'the raw QC result is never rewritten');
    assert.match(texts(h).join('\n'),/✅ #001: PASS WITH OWNER OVERRIDE — decorative artwork overflow accepted on pages P008, P009\./);
    assert.match(lastScreen(h).text,/Creative QC: PASS WITH OWNER OVERRIDE/);
    assert.equal((await tap(h,'✅ Approve Full Book')).outcome,'book_approved');
    p=await h.store.load('001');assert.deepEqual(p.book.approval.override,o);
    const before=h.calls.length;
    h.wf.ai={client:{json:()=>{throw new Error('OpenAI called in Stage 2');},image:()=>{throw new Error('OpenAI called in Stage 2');}}};
    const out=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(out.outcome,'awaiting_production_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.equal(h.calls.length,before,'no OpenAI call');
    const dir=await ws(h), handoff=JSON.parse(await readFile(join(dir,'production/handoff.json'))), report=JSON.parse(await readFile(join(dir,'production/qc-report.json')));
    assert.deepEqual(handoff.approved.full_artwork.override.pages,['P008','P009']);
    assert.equal(report.passed,true);assert.equal(report.status,'PASS WITH OWNER OVERRIDE — decorative artwork overflow accepted on pages P008, P009.');
    assert.deepEqual(report.owner_overrides.map(x=>[x.kind,x.rule,x.pages.join()]),[['owner-approved exception',OVERFLOW_RULE,'P008,P009']]);
  }finally{await h.cleanup();}
});

test('ADR-067 ACCEPT OVERFLOW never bypasses another QC failure (a blank page stays blocking)',async()=>{
  const {h}=await reviewed(overflowArt({8:'blank'}));   // image call 8 = page 4
  try{
    const p=await h.store.load('001');
    assert.deepEqual(p.book.qc.failed_pages,['P004','P008','P009']);
    assert.match(lastScreen(h).text,/Creative QC: FAIL/);assert.ok(!labels(h).includes('✅ ACCEPT OVERFLOW'),'no accept while another check fails');
    const {encode}=await import('../src/telegram/approvals.mjs');
    const out=await h.wf.handleUpdate(press(encode('bovr','001',p.review.nonce)));
    assert.equal(out.outcome,'overflow_not_acceptable');assert.match(out.problem,/other creative QC failures must be fixed first: no blank pages/);
    assert.equal((await h.store.load('001')).book.qc.override,undefined);
    const qc=JSON.parse(await readFile(join(await ws(h),BOOK_QC)));
    // Even a forged override cannot clear it.
    const forged={rule:OVERFLOW_RULE,pages:['P004','P008','P009'],qc_sha256:p.book.qc.sha256,fingerprint:qc.fingerprint};
    const eff=effectiveBookQc(qc,p.book.qc.sha256,forged);assert.equal(eff.passed,false);assert.match(eff.problem,/cannot clear other creative QC failures \(no blank pages\)/);
  }finally{await h.cleanup();}
});

test('ADR-067 text clipping (or any other rule) can never use the artwork override',()=>{
  const fp='a'.repeat(64), sha='b'.repeat(64);
  const textClip={passed:false,fingerprint:fp,pages:{P002:{status:'fail',fails:['artwork runs off the page edge (top)'],warns:[]}},
    checks:[{name:'safe margins: no clipping at the page edges',ok:false,detail:'P002 artwork runs off the page edge (top)'},{name:'no page overflow or text clipping',ok:false,detail:'title clipped'}]};
  assert.equal(overflowReview(textClip).reviewable,false);
  assert.throws(()=>overflowOverride(textClip,{qcSha256:sha,by:'@o',at:'2026-10-07T00:00:00Z'}),/no page overflow or text clipping/);
  assert.equal(effectiveBookQc(textClip,sha,{rule:OVERFLOW_RULE,pages:['P002'],qc_sha256:sha,fingerprint:fp}).passed,false);
  // A different rule name, another report or an unaccepted page never passes.
  const only={...textClip,checks:[textClip.checks[0]]};
  assert.equal(effectiveBookQc(only,sha,{rule:'text-clipping',pages:['P002'],qc_sha256:sha,fingerprint:fp}).passed,false);
  assert.equal(effectiveBookQc(only,'c'.repeat(64),{rule:OVERFLOW_RULE,pages:['P002'],qc_sha256:sha,fingerprint:fp}).passed,false);
  assert.equal(effectiveBookQc(only,sha,{rule:OVERFLOW_RULE,pages:[],qc_sha256:sha,fingerprint:fp}).passed,false);
  assert.equal(effectiveBookQc(only,sha,{rule:OVERFLOW_RULE,pages:['P002'],qc_sha256:sha,fingerprint:fp}).passed,true);
});

test('ADR-067 the override is product- and report-specific: a regenerated page voids it; another product still gets the review',async()=>{
  const {h}=await reviewed({imageBytes:(n)=>[12,13,14].includes(n)?lineArt(n,{clip:true}):lineArt(n)});   // the regenerated page 8 (call 14) still overflows
  try{
    await nav(h,'book','001');await tap(h,'✅ ACCEPT OVERFLOW');
    assert.ok((await h.store.load('001')).book.qc.override);
    assert.equal((await h.wf.runBookPage('001','@owner',{page_number:8,op:'regenerate'})).outcome,'awaiting_book_approval');
    const p=await h.store.load('001');
    assert.equal(p.book.qc.override,undefined,'a new QC report needs a new owner decision');assert.equal(p.book.override_history.length,1,'the audit history is kept');
    assert.match(lastScreen(h).text,/OWNER REVIEW REQUIRED/);assert.ok(!labels(h).includes('✅ Approve Full Book'));
  }finally{await h.cleanup();}
  const b=await reviewed(overflowArt());   // a different product: nothing carried over
  try{
    const p=await b.h.store.load('001');
    assert.equal(p.book.qc.override,undefined);assert.equal(p.book.override_history,undefined);
    assert.match(lastScreen(b.h).text,/OWNER REVIEW REQUIRED/);
  }finally{await b.h.cleanup();}
});
