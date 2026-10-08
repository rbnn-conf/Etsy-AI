// Stage 3 (ADR-025): Etsy listing + marketing images from the approved Stage 2
// package. OpenAI and Telegram are mocked; the deterministic core, real
// rendering and QC run for real. No Etsy call exists anywhere in this path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { harness, msg, press, button, lastKeyboard, concept, bookDirection, apiFailure, pressRetry } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { transition } from '../src/orchestrator/state.mjs';
import { scenePrompt } from '../src/stage3/openai.mjs';
import { deriveFacts, listingProblems, claimProblems, LISTING_LIMITS, runStage3Qc } from '../../marketing/src/stage3/index.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify.'],['card-inside','Inside','Exact message: “Wishing you a joyful Christmas”.','Verify.'],
    ['card-back','Back','Motif. No text.','No printed text.']].map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});
export const LISTING=(over={})=>({title:'Robin Christmas Card Printable, 2 Designs, Merry Christmas and Christmas Wishes',
  description:'🎄 Two cosy robin Christmas cards to print at home.\n\nWhat is included:\n- 2 card designs\n- A4 and US Letter folded cards\n- 4×6 in card panels\n- Printing guide\n\nPrint on card stock at 100%, then trim and fold.\n\nThis is a digital download for personal use. No physical item is shipped.',
  tags:['robin christmas card','printable card','christmas card','holiday card','winter robin','xmas card print','card to print','diy christmas card','cottage christmas','bird greeting card','instant download','a4 christmas card','us letter card'],
  materials:['Digital PDF','PNG artwork files'],suggested_price_gbp:3.95,pricing_rationale:'In line with two-design printable Christmas cards.',
  category_suggestion:'Paper & Party Supplies > Paper > Greeting Cards',occasion:'Christmas',primary_colour:'Red',secondary_colour:'Green',
  hook:'A cosy robin for your Christmas post',customer_summary:'Two storybook robin designs to print, trim and fold at home.',
  what_you_receive:['2 card designs','A4 and US Letter folded card PDFs','4×6 in card panels','Printing guide'],printing_summary:'Print at 100% on card stock, trim and fold.',
  digital_download_disclaimer:'Digital download only. No physical item is shipped.',
  listing_claims:[{key:'design-count',text:'2 card designs'},{key:'format',text:'A4 and US Letter'},{key:'printing-guide',text:'Printing guide'},{key:'digital',text:'Digital download'}],...over});
/** What the model returns: a pool of tag candidates instead of the final tags. */
export const MODEL_LISTING=(over={})=>{const {tags,...l}=LISTING();return {...l,tag_candidates:[...tags,'robin xmas card','festive bird card','winter card print','rustic xmas card','cosy card print'],...over};};
/** Echo the tone-line and scene ids the model was given (as a well-behaved model would). */
export const COPY=(_,{user})=>{
  const ids=section=>[...((user.split(`${section} `)[1]??'').split('\n\n')[0]).matchAll(/^- ([\w-]+):/gm)].map(m=>m[1]);
  return {lines:ids('LINES').map(id=>({id,text:'For family, friends and neighbours near and far.'})),
    scenes:ids('SCENES').map(id=>({id,brief:'A pine tabletop with ribbon and soft window light.'}))};
};

/** PRODUCTION_APPROVED two-design card via the real Stage 1 + Stage 2 flow. */
async function productionApproved(plan={}){
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection(),
    listing:()=>MODEL_LISTING(),'marketing-copy':COPY,...plan}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
  let p=await h.store.load('001');const ws=h.store.dirOf(p);
  for(const im of p.proofs.attempts[0].images)await h.store.writeBytes(p,im.file,await artwork(im.page_number));
  await writeFile(join(ws,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'001',card_variants:[
    {id:'A',name:'Merry Christmas',front_source:'proof-01',inside_source:'proof-02',back_type:'minimal'},
    {id:'B',name:'Christmas Wishes',front_source:'proof-03',inside_source:'proof-02',back_type:'minimal'}]}));
  await h.wf.handleUpdate(msg('/produce 001'));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
  return {h,ws};
}
const texts=h=>h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text);
const count=(h,f)=>h.calls.filter(f).length;
const listingCalls=h=>count(h,c=>c.schemaName==='listing'), copyCalls=h=>count(h,c=>c.schemaName==='marketing-copy');
const sceneCalls=h=>count(h,c=>c.kind==='image'&&/background photograph for a premium Etsy product listing image/i.test(c.prompt));
async function snapshot(dir){const out={};const walk=async(d,rel='')=>{for(const e of await readdir(d,{withFileTypes:true})){const r=rel?`${rel}/${e.name}`:e.name;
  if(e.isDirectory())await walk(join(d,e.name),r);else out[r]=sha(await readFile(join(d,e.name)));}};await walk(dir);return out;}

test('Stage 3 end to end: /market -> listing from production facts -> real-artwork images -> QC -> review -> APPROVE MARKETING (no Etsy, nothing published)',async()=>{
  const {h,ws}=await productionApproved();
  try{
    const production=await snapshot(join(ws,'production')), plan2=await readFile(join(ws,'production-plan.json'));
    const before=h.calls.length;
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify(r));
    let p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_MARKETING_APPROVAL');
    assert.deepEqual(p.status_history.slice(-4).map(s=>s.to),['MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL']);
    // Exactly 2 text calls + 2 background images, nothing else.
    assert.deepEqual([listingCalls(h),copyCalls(h),sceneCalls(h),h.calls.length-before],[1,1,4,6]);
    // 2: the listing call saw production facts only.
    const u=h.calls.find(c=>c.schemaName==='listing').user;
    for(const x of ['"Merry Christmas"','"Christmas Wishes"','Wishing you a joyful Christmas','US Letter','4×6 in card panels','No physical item is shipped'])assert.ok(u.includes(x),x);
    assert.doesNotMatch(u,/proofs\/|production\/|sha256|\.png/,'no file paths or hashes to the model');
    // 4 + 7: every image shows real Stage 2 artwork; factual text rendered deterministically.
    const render=JSON.parse(await readFile(join(ws,'marketing/images/render.json'),'utf8'));
    const manifest=JSON.parse(await readFile(join(ws,'marketing/work/art-manifest.json'),'utf8'));
    const rec=JSON.parse(await readFile(join(ws,'production/build-record.json'),'utf8'));
    const stage2=new Set(Object.values(rec.outputs).map(o=>o.sha256));
    assert.equal(render.length,10);
    for(const x of render){assert.ok(x.artwork.length>0,x.file);for(const a of x.artwork)assert.ok(manifest.some(m=>m.sha256===a.sha256),`${x.file} artwork traced`);}
    for(const m of manifest)assert.ok(stage2.has(m.source.sha256),`${m.key} comes from a Stage 2 deliverable`);
    const claims=render.flatMap(x=>x.claimTokens.map(t=>t.text));
    const values=render.flatMap(x=>x.claimTokens.map(t=>t.value));
    for(const c of ['2 card designs','Design A','Merry Christmas','Design B','Christmas Wishes','Shared inside message','1 shared inside','A4 + US Letter','210 × 297 mm','8.5 × 11 in','No physical item will be shipped','Step-by-step printing guide'])assert.ok(values.includes(c),c);
    const qc=JSON.parse(await readFile(join(ws,'marketing/qc.json'),'utf8'));
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    // 5: production untouched.
    assert.deepEqual(await snapshot(join(ws,'production')),production);assert.ok((await readFile(join(ws,'production-plan.json'))).equals(plan2));
    // 11: review only after QC, PNG images, cost on the buttons.
    const review=texts(h).find(t=>t.startsWith('🛍 PRODUCT #001 — ETSY LISTING READY'));
    assert.match(review,/Suggested price: £3\.95 \(advisory, not set on Etsy\)/);assert.match(review,/10 listing images · QC PASS/);assert.match(review,/Nothing is published\. Stage 4/);
    assert.ok(texts(h).some(t=>t.startsWith('Description:\n\n🎄 Two cosy robin')));
    const album=h.telegram.sent.filter(s=>s.type==='album').at(-1);
    assert.equal(album.items.length,10);assert.ok(album.items.every(i=>/\.png$/.test(i.fileName)));
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['APPROVE MARKETING','REGENERATE LISTING COPY (1 AI call)','REGENERATE MARKETING (1 AI call + 4 AI images)','REGENERATE ALL (2 AI calls + 4 AI images)','CANCEL','🧩 Edit Individual Images','❓ What can I do here?','🏠 Home']);
    // 15: every attempt accounted.
    p=await h.store.load('001');
    assert.deepEqual(p.api_usage.filter(x=>['listing','marketing-copy','marketing-scene'].includes(x.step)).map(x=>[x.step,x.outcome]),
      [['listing','ok'],['marketing-copy','ok'],['marketing-scene','ok'],['marketing-scene','ok'],['marketing-scene','ok'],['marketing-scene','ok']]);
    // Approve: final, nothing published.
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')))).outcome,'marketing_approved');
    p=await h.store.load('001');assert.equal(p.status,'MARKETING_APPROVED');assert.ok(p.marketing.approved_at);
    assert.match(texts(h).at(-1),/Nothing has been published; Stage 4 \(Etsy\) has not started/);
    assert.throws(()=>transition(p,'rejected'),/Cannot apply/);
    // 16: only Telegram messages/photos/albums went out; no Etsy client exists in this path.
    assert.deepEqual([...new Set(h.telegram.sent.map(s=>s.type))].sort(),['album','answer','edit','message','photo']);
  }finally{await h.cleanup();}
});

test('1: only PRODUCTION_APPROVED enters Stage 3',async()=>{
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
    await h.wf.handleUpdate(press(button(h.telegram,'A')));await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'not_approved');assert.match(texts(h).at(-1),/Stage 3 needs an approved production package\. #001 is CREATIVE_APPROVED/);
    await assert.rejects(deriveFacts(h.store.dirOf(await h.store.load('001'))),/Stage 3 needs a PRODUCTION_APPROVED product/);
    assert.equal(count(h,c=>['listing','marketing-copy'].includes(c.schemaName)),0);
  }finally{await h.cleanup();}
});

test('3 + 15: a listing with unsupported claims is rejected before any image; the billed attempt is still recorded',async()=>{
  const {h,ws}=await productionApproved({listing:()=>MODEL_LISTING({title:'Editable Canva Robin Christmas Card Template, 300 DPI'})});
  try{
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'marketing');
    const p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'PRODUCTION_APPROVED');
    assert.match(p.last_error.message,/listing: rejected: .*"Editable".*"Canva"/);
    assert.deepEqual(p.api_usage.filter(x=>x.step==='listing').map(x=>x.outcome),['rejected']);
    assert.equal(sceneCalls(h),0);assert.equal(copyCalls(h),0);
    assert.ok(!texts(h).some(t=>t.includes('ETSY LISTING READY')));
    assert.ok(!(await readdir(join(ws,'marketing'))).includes('listing.json'),'rejected output is not stored');
  }finally{await h.cleanup();}
});

test('10: a QC failure blocks the review and approval',async()=>{
  const {h,ws}=await productionApproved();
  try{
    // A listing already on disk that breaks the rules (e.g. edited by hand): generation is skipped, QC must catch it.
    const {mkdir}=await import('node:fs/promises');await mkdir(join(ws,'marketing'),{recursive:true});
    await writeFile(join(ws,'marketing','listing.json'),JSON.stringify(LISTING({description:'Editable Canva file. A physical card will be shipped.'})));
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'failed');
    const p=await h.store.load('001');
    assert.equal(p.marketing.qc.passed,false);assert.match(p.last_error.message,/^MarketingQcError: marketing QC failed: listing meets Etsy constraints and claims/);
    assert.ok(!texts(h).some(t=>t.includes('ETSY LISTING READY')),'no review');
    assert.equal((await h.wf.handleUpdate(press(encode('mapprove','001',p.review.nonce)))).outcome,'invalid_state','cannot approve');
    assert.equal(listingCalls(h),0,'the existing listing was reused, not regenerated');
    // CANCEL returns to PRODUCTION_APPROVED; nothing deleted.
    assert.equal((await h.wf.handleUpdate(press(encode('mcancel','001',(await h.store.load('001')).review.nonce)))).outcome,'marketing_cancelled');
    assert.equal((await h.store.load('001')).status,'PRODUCTION_APPROVED');
  }finally{await h.cleanup();}
});

test('12 + 13: scoped regeneration: copy only, marketing only, all; old versions archived',async()=>{
  const {h,ws}=await productionApproved({listing:n=>MODEL_LISTING({hook:`A cosy robin for your Christmas post ${n}`})});
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    const img=async()=>Object.fromEntries(await Promise.all((await readdir(join(ws,'marketing/images'))).filter(f=>f.endsWith('.png')).map(async f=>[f,sha(await readFile(join(ws,'marketing/images',f)))])));
    const images1=await img(), plan1=await readFile(join(ws,'marketing/plan.json'),'utf8');
    // 12: copy only -> 1 listing call, no copy/scene calls, images unchanged.
    let base=[listingCalls(h),copyCalls(h),sceneCalls(h)];
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE LISTING COPY (1 AI call)')))).outcome,'awaiting_marketing_approval');
    assert.deepEqual([listingCalls(h),copyCalls(h),sceneCalls(h)],[base[0]+1,base[1],base[2]]);
    assert.deepEqual(await img(),images1,'images untouched');assert.equal(await readFile(join(ws,'marketing/plan.json'),'utf8'),plan1);
    assert.match(JSON.parse(await readFile(join(ws,'marketing/listing.json'),'utf8')).hook,/ 2$/);
    assert.match(JSON.parse(await readFile(join(ws,'marketing/history/v01/listing.json'),'utf8')).hook,/ 1$/,'old listing archived');
    // 13: marketing only -> 1 copy call + 4 scenes, listing unchanged.
    const listing2=await readFile(join(ws,'marketing/listing.json'),'utf8');
    base=[listingCalls(h),copyCalls(h),sceneCalls(h)];
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE MARKETING (1 AI call + 4 AI images)')))).outcome,'awaiting_marketing_approval');
    assert.deepEqual([listingCalls(h),copyCalls(h),sceneCalls(h)],[base[0],base[1]+1,base[2]+4]);
    assert.equal(await readFile(join(ws,'marketing/listing.json'),'utf8'),listing2,'listing untouched');
    assert.ok((await readdir(join(ws,'marketing/history/v02'))).includes('images'));
    // ALL -> both.
    base=[listingCalls(h),copyCalls(h),sceneCalls(h)];
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE ALL (2 AI calls + 4 AI images)')))).outcome,'awaiting_marketing_approval');
    assert.deepEqual([listingCalls(h),copyCalls(h),sceneCalls(h)],[base[0]+1,base[1]+1,base[2]+4]);
  }finally{await h.cleanup();}
});

test('14: restart and failures resume paid work without repeating it',async()=>{
  let fail=true;
  const {h,ws}=await productionApproved();
  try{
    const n0=count(h,c=>c.kind==='image');
    h.ai.client.image=(orig=>async args=>{if(fail&&/background photograph/i.test(args.prompt)&&count(h,c=>c.kind==='image')===n0+1){fail=false;h.calls.push({kind:'image',prompt:args.prompt});throw apiFailure();}return orig(args);})(h.ai.client.image);
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'failed');
    let p=await h.store.load('001');
    assert.equal(p.resume_state,'PRODUCTION_APPROVED');
    assert.deepEqual(p.api_usage.filter(x=>x.step==='marketing-scene').map(x=>x.outcome),['ok','api_error'],'failed image attempt recorded');
    // A crash later: recovery never spends.
    const before=h.calls.length;
    assert.deepEqual(await h.wf.recover(),[]);
    assert.equal((await pressRetry(h)).outcome,'awaiting_marketing_approval');
    assert.deepEqual([listingCalls(h),copyCalls(h)],[1,1],'text calls not repeated');
    assert.equal(h.calls.length-before,3,'only the three missing backgrounds (the first one is kept)');
    // Simulated crash mid-render: state MARKETING_GENERATING + lock; recovery -> FAILED; RETRY re-renders for free.
    p=await h.store.load('001');
    p=transition(transition(p,'marketing_started'),'marketing_planned');
    await h.store.save({...p,lock:{op:'marketing',id:'x',at:new Date().toISOString()}});
    assert.deepEqual(await h.wf.recover(),['001']);
    const b2=h.calls.length;
    assert.equal((await pressRetry(h)).outcome,'awaiting_marketing_approval');
    assert.equal(h.calls.length,b2,'no paid call after restart');
  }finally{await h.cleanup();}
});

test('6: background prompts forbid product art; QC rejects untraced or scene-sourced product art',async()=>{
  const facts={season:'Christmas',product_type:'Christmas greetings card',style:{subject:'European robin',mood:'cosy'}};
  const prompt=scenePrompt({scene:{id:'tabletop'},brief:'Draw a robin Christmas card on a table',facts});
  assert.match(prompt,/^Environment-only background photograph/);
  assert.match(prompt,/Do NOT include: cards, greeting cards, postcards, paper artwork, printed artwork, sheets of paper, books, posters, frames, screens, text, letters, numbers, words, logos, watermarks, birds, robins, any other animal, people, hands\./);
  assert.match(scenePrompt({scene:{id:'gift'},brief:'',facts}),/only paper item allowed is the one blank, unmarked kraft envelope/);
  assert.match(scenePrompt({scene:{id:'print'},brief:'',facts}),/printer must be empty: no paper/);
  assert.match(scenePrompt({scene:{id:'inside'},brief:'',facts:{...facts,style:{subject:'fox',mood:null}}}),/birds, robins, fox, any other animal/);
  const {h,ws}=await productionApproved();
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    const dir=ws, rd=async f=>JSON.parse(await readFile(join(dir,f),'utf8'));
    const [facts2,plan,listing,render,manifest]=await Promise.all(['marketing/facts.json','marketing/plan.json','marketing/listing.json','marketing/images/render.json','marketing/work/art-manifest.json'].map(rd));
    const results=render.map(x=>({...x,outPath:join(dir,'marketing/images',x.file)}));
    const sceneSha=plan.scenes[0].sha256;
    // A render whose "product" is actually an AI scene, and one with unknown artwork.
    const bad=results.map((x,i)=>i===0?{...x,artwork:[{...x.artwork[0],sha256:sceneSha}]}:i===1?{...x,artwork:[{...x.artwork[0],sha256:'f'.repeat(64)}]}:x);
    const qc=await runStage3Qc({productDir:dir,facts:facts2,plan,listing,renderResults:bad,artManifest:manifest,sceneShas:plan.scenes.map(s=>s.sha256)});
    const fail=Object.fromEntries(qc.checks.map(c=>[c.name,c.ok]));
    assert.equal(fail['AI backgrounds never used as product artwork'],false);assert.equal(fail['product artwork traceable to Stage 2'],false);
    // Stretched artwork is caught too.
    const stretched=results.map((x,i)=>i===2?{...x,artwork:[{...x.artwork[0],boxW:x.artwork[0].boxW*1.2}]}:x);
    assert.equal((await runStage3Qc({productDir:dir,facts:facts2,plan,listing,renderResults:stretched,artManifest:manifest,sceneShas:[]})).checks.find(c=>c.name==='product artwork not stretched').ok,false);
  }finally{await h.cleanup();}
});

test('8 + 9: Etsy title/tag limits (kept in step with services/src/etsy/reviewed-product.ts) and GBP price rules',async()=>{
  const repo=await readFile(new URL('../../services/src/etsy/reviewed-product.ts',import.meta.url),'utf8');
  assert.match(repo,new RegExp(`title\\.length<=${LISTING_LIMITS.titleMax}`));assert.match(repo,new RegExp(`tags\\.length<=${LISTING_LIMITS.tagsMax}`));
  assert.match(repo,new RegExp(`t\\.length<=${LISTING_LIMITS.tagMax}`));assert.ok(repo.includes(String(LISTING_LIMITS.tagPattern)),'same tag pattern');
  const facts={designs:[{},{}],card_size_mm:{A4:[124,186]},claims:{'design-count':[],'format':[],'printing-guide':[],'digital':[]}};
  assert.deepEqual(listingProblems(LISTING(),facts),[]);
  const cases=[[{title:'x'.repeat(141)},/title: 1-140/],[{tags:[...LISTING().tags,'extra tag']},/tags: 1-13 \(has 14\)/],[{tags:['a tag that is far too long']},/over 20 characters/],
    [{tags:['robin','Robin']},/tags: must be unique/],[{tags:['robin!']},/letters, numbers/],[{title:'ROBIN CARD'},/not all capitals/],
    [{suggested_price_gbp:3.957},/2 decimals/],[{suggested_price_gbp:150},/suggested_price_gbp: got 150; must be from £0\.50 to £100\.00/],[{listing_claims:[{key:'frame',text:'Frame included'}]},/"frame" is not a production fact/],
    [{description:'One — two — three — four.'},/3 em dashes/],[{tags:['robin christmas','christmas card','robin card','printable card','card christmas','printable robin','christmas robin']},/only repeat title words/]];
  for(const [over,re] of cases)assert.match(listingProblems(LISTING(over),facts).join('\n'),re,JSON.stringify(over));
  assert.deepEqual(claimProblems('Includes 2 card designs, A4 and 4x6 in. No physical item is shipped.',facts),[]);
});

test('15 (Stage 1 fix): billed ideation output that fails validation, and failed API calls, appear in api_usage',async()=>{
  let n=0;
  const h=await harness({plan:{concepts:()=>++n===1?apiFailure():{concepts:['A','B','C'].map(id=>concept(id,{product_format:'activity-book',page_count:3}))}}});
  try{
    await h.wf.handleUpdate(msg('/newproduct kids activity book'));
    await h.wf.handleUpdate(msg('/go'));                                  // HTTP 500
    await pressRetry(h);           // 3 pages: rejected locally
    const p=await h.store.load('001');
    assert.deepEqual(p.api_usage.filter(x=>x.step==='ideas').map(x=>x.outcome),['api_error','rejected']);
    assert.match(p.api_usage.find(x=>x.outcome==='rejected').error,/page_count: 3 is below 10/);
    assert.ok(p.api_usage.every(x=>!/sk-|Bearer/.test(x.error??'')),'no secrets');
  }finally{await h.cleanup();}
});

// ---- Listing output contract (first live #009 run: "$.listing_claims: more than 12 items") ----
const claims=n=>Array.from({length:n},(_,i)=>({key:['design-count','format','printing-guide','digital'][i%4],text:`Claim ${i+1}`}));

test('contract 1 + 2 + 6: 12 listing claims accepted, 13 rejected, never truncated',async()=>{
  const {loadSchema,validate}=await import('../src/orchestrator/schema.mjs');
  const s=await loadSchema('listing');
  assert.deepEqual(validate(s,MODEL_LISTING({listing_claims:claims(12)})),[]);
  assert.deepEqual(validate(s,MODEL_LISTING({listing_claims:claims(13)})),['$.listing_claims: more than 12 items']);
  // structured() rejects the whole output; it never slices the array to fit.
  const {structured}=await import('../src/openai/prompts.mjs');
  const data=MODEL_LISTING({listing_claims:claims(13)});
  const ai={textModel:'t',client:{json:async()=>({data,usage:{},model:'t'})}};
  await assert.rejects(structured(ai,{step:'listing',prompt:'listing',user:'u',schemaName:'listing'}),/listing: model output rejected: \$\.listing_claims: more than 12 items/);
  assert.equal(data.listing_claims.length,13,'response left intact');
});

test('contract 3 + 5: every listing limit enforced locally is stated in the model-facing schema',async()=>{
  const {loadSchema,strictSchema}=await import('../src/orchestrator/schema.mjs');
  const full=await loadSchema('listing'), P=strictSchema(full).properties, L=LISTING_LIMITS, F=full.properties;
  // The schema and the local validator agree on every number.
  assert.deepEqual([F.title.maxLength,F.description.maxLength,F.tag_candidates.minItems,F.tag_candidates.maxItems,F.materials.maxItems,F.suggested_price_gbp.minimum,F.suggested_price_gbp.maximum],
    [L.titleMax,L.descriptionMax,L.tagCandidatesMin,L.tagCandidatesMax,L.materialsMax,L.priceMinGbp,L.priceMaxGbp]);
  assert.equal(F.tags,undefined,'final tags are chosen by code, not the model');
  const expect={
    listing_claims:[/Maximum 12 items; more is rejected\./,/At least 1 item\./,/Target 6-10/,/never more than 12/,/Do not add claims just to fill capacity/],
    title:[/Maximum 140 characters\./,/Not all capitals/],
    description:[/Maximum 5000 characters\./,/em dashes beyond two/],
    tag_candidates:[/At least 13 items\./,/Maximum 30 items; more is rejected\./,/18-20/,/final 13 Etsy tags/,/over 20 characters/,/duplicated \(ignoring case\)/,/beyond 6 that use only title words/],
    materials:[/Maximum 13 items; more is rejected\./],
    suggested_price_gbp:[/Minimum value 0\.5\./,/Maximum value 100\./,/at most 2 decimals/],
    pricing_rationale:[/Maximum 300 characters\./],category_suggestion:[/Maximum 120 characters\./],occasion:[/Maximum 40 characters\./],
    hook:[/Maximum 120 characters\./],customer_summary:[/Maximum 400 characters\./],what_you_receive:[/Maximum 10 items; more is rejected\./],
    printing_summary:[/Maximum 500 characters\./],digital_download_disclaimer:[/Maximum 300 characters\./]};
  for(const [k,res] of Object.entries(expect))for(const re of res)assert.match(P[k].description??'',re,k);
  assert.match(P.tag_candidates.items.description,/20 characters or fewer.*letters, numbers, spaces, apostrophes and hyphens only/i);
  assert.match(P.materials.items.description,/45 characters or fewer; letters, numbers, spaces, apostrophes and hyphens only/);
  assert.match(P.what_you_receive.items.description,/Maximum 120 characters\./);
  assert.match(P.listing_claims.items.properties.key.description,/allowed listing_claims keys.*Maximum 40 characters\./);
  assert.match(P.listing_claims.items.properties.text.description,/Maximum 120 characters\./);
  // Strict mode still receives no range keywords.
  assert.doesNotMatch(JSON.stringify(strictSchema(full)),/"(minItems|maxItems|minLength|maxLength|minimum|maximum|pattern)"/);
});

test('contract 5 (generic): strictSchema states every stripped limit, in every model-facing schema',async()=>{
  const {loadSchema,strictSchema}=await import('../src/orchestrator/schema.mjs');
  for(const name of ['reference-analysis','creative-direction','concepts','specification','listing','marketing-copy']){
    const walk=(s,o,path)=>{
      const d=o.description??'', at=`${name} ${path}`;
      if(s.maxLength!==undefined)assert.match(d,new RegExp(`Maximum ${s.maxLength} characters?\\.`),at);
      if(s.minLength>1)assert.match(d,new RegExp(`At least ${s.minLength} characters\\.`),at);
      if(s.maxItems!==undefined&&s.maxItems!==s.minItems)assert.match(d,new RegExp(`Maximum ${s.maxItems} items?; more is rejected\\.`),at);
      if(s.minItems>0&&s.maxItems!==s.minItems)assert.match(d,new RegExp(`At least ${s.minItems} items?\\.`),at);
      if(s.minItems!==undefined&&s.minItems===s.maxItems)assert.match(d,new RegExp(`Exactly ${s.minItems} items?\\.`),at);
      if(s.minimum!==undefined)assert.ok(d.includes(`Minimum value ${s.minimum}.`),at);
      if(s.maximum!==undefined)assert.ok(d.includes(`Maximum value ${s.maximum}.`),at);
      if(s.pattern!==undefined)assert.ok(d.includes(s.pattern),at);
      for(const [k,v] of Object.entries(s.properties??{}))walk(v,o.properties[k],`${path}.${k}`);
      if(s.items)walk(s.items,o.items,`${path}[]`);
    };
    const full=await loadSchema(name);walk(full,strictSchema(full),'$');
  }
});

test('contract 4: the listing prompt states the output contract with the repository limits',async()=>{
  const {loadPrompt}=await import('../src/openai/prompts.mjs');
  const t=(await loadPrompt('listing')).replace(/\s+/g,' '), L=LISTING_LIMITS;
  assert.match(t,/OUTPUT CONTRACT/);
  assert.match(t,/listing_claims: MAXIMUM 12 items; target 6-10\./);
  assert.match(t,/Do not add claims merely to fill capacity/);
  assert.match(t,/Every key must be one of the allowed claim keys/);
  for(const x of [`title: maximum ${L.titleMax} characters`,`description: maximum ${L.descriptionMax} characters`,'tag_candidates: 18-20 phrases',`Prefer phrases of ${L.tagMax} characters or fewer`,`keeps ${L.tagsTarget} unique tags of at most ${L.tagMax} characters, at most ${L.tagTitleEchoMax} of them`,
    'Code, not you, makes the final Etsy tags compliant',`materials: maximum ${L.materialsMax} entries, each ${L.materialMax} characters or fewer`,`between ${L.priceMinGbp} and ${L.priceMaxGbp}, at most 2 decimals`,'Obey every limit stated in the supplied schema'])assert.ok(t.includes(x),x);
});

test('contract 7 + 8 + 9: 13 claims -> rejected and recorded, no images; after a bot restart RETRY runs only the missing Stage 3 calls',async()=>{
  const {h,ws}=await productionApproved({listing:n=>n===1?MODEL_LISTING({listing_claims:claims(13)}):MODEL_LISTING()});
  try{
    const production=await snapshot(join(ws,'production')), before=h.calls.length;
    const r=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(r.outcome,'failed');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'PRODUCTION_APPROVED');assert.equal(p.last_error.retryable,true);
    assert.match(p.last_error.message,/listing: model output rejected: \$\.listing_claims: more than 12 items/);
    const rej=p.api_usage.filter(x=>x.step==='listing');
    assert.deepEqual(rej.map(x=>[x.kind,x.outcome]),[['text','rejected']]);assert.match(rej[0].error,/more than 12 items/);
    assert.deepEqual(h.calls.slice(before).map(c=>c.schemaName??c.kind),['listing'],'no copy call and no image before the listing passes');
    assert.ok(!(await readdir(join(ws,'marketing'))).includes('listing.json'),'nothing truncated or stored');
    // Bot restart: a fresh Workflow over the same store.
    const {Workflow}=await import('../src/orchestrator/workflow.mjs');
    h.wf=new Workflow({store:h.store,registry:h.registry,telegram:h.telegram,ai:h.ai,auth:()=>true,log:()=>{}});
    assert.deepEqual(await h.wf.recover(),[]);
    const hist=p.status_history.length, mid=h.calls.length;
    assert.equal((await pressRetry(h)).outcome,'awaiting_marketing_approval');
    // Exactly: listing -> image copy -> 2 backgrounds. No Stage 1 call, no Stage 2 rebuild.
    assert.deepEqual(h.calls.slice(mid).map(c=>c.schemaName??(/background photograph/i.test(c.prompt)?'scene':'other-image')),['listing','marketing-copy','scene','scene','scene','scene']);
    p=await h.store.load('001');
    assert.deepEqual(p.status_history.slice(hist).map(s=>s.to),['PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL']);
    assert.deepEqual(await snapshot(join(ws,'production')),production,'production package untouched');
    assert.deepEqual(p.api_usage.filter(x=>x.step==='listing').map(x=>x.outcome),['rejected','ok']);
  }finally{await h.cleanup();}
});

// ---- Deterministic Etsy tag selection (second live #009 run: "$.tags[3]: longer than 20") ----
const POOL=['robin christmas card','printable christmas card','christmas greetings cards','watercolour robin redbreast card','Robin’s Card',
  'robin & holly','robin, holly','xmas card 🎄','ROBIN CHRISTMAS CARD','winter robin','diy xmas card','cottage christmas','bird greeting card',
  'instant download','a4 christmas card','us letter card','card to print','festive bird card','rustic xmas card'];

test('tags 1-4 + 6: kept unchanged, safely repaired, discarded but never sliced; characters normalised',async()=>{
  const {normaliseTag}=await import('../../marketing/src/stage3/index.mjs');
  assert.deepEqual(normaliseTag('robin christmas card'),{ok:true,tag:'robin christmas card',repairs:[]},'20 characters passes unchanged');
  assert.deepEqual(normaliseTag('  Winter   Robin '),{ok:true,tag:'winter robin',repairs:[]});
  assert.deepEqual(normaliseTag('printable christmas card'),{ok:true,tag:'printable xmas card',repairs:['christmas -> xmas']});
  assert.deepEqual(normaliseTag('christmas greetings cards'),{ok:true,tag:'xmas greetings cards',repairs:['christmas -> xmas']},'stops once it fits');
  assert.deepEqual(normaliseTag('robin colouring pages'),{ok:true,tag:'robin coloring pages',repairs:['colouring -> coloring']});
  const long=normaliseTag('watercolour robin redbreast card');
  assert.equal(long.ok,false);assert.match(long.reason,/over 20 characters with no safe repair/);
  // Never a sliced prefix: every kept word is a whole word of the input or a listed substitute.
  for(const c of POOL){const n=normaliseTag(c);if(!n.ok)continue;
    assert.ok(n.tag.length<=20,c);
    const src=new Set([...c.toLowerCase().normalize('NFC').replace(/[’]/g,"'").replace(/&/g,' and ').match(/[\p{L}\p{N}']+/gu),'xmas','greeting','coloring','and']);
    for(const w of n.tag.match(/[\p{L}\p{N}']+/gu))assert.ok(src.has(w),`${c} -> ${n.tag}: "${w}" is a whole word`);}
  assert.equal(normaliseTag('christmas').tag,'christmas','no substitution when it already fits');
  assert.equal(normaliseTag('christmastime greeting cards').ok,false,'whole words only: christmastime is not christmas');
  // Characters.
  assert.equal(normaliseTag('Robin’s Card').tag,"robin's card");
  assert.equal(normaliseTag('robin & holly').tag,'robin and holly');
  assert.equal(normaliseTag('Robin – Card').tag,'robin - card');
  for(const bad of ['robin, holly','xmas card 🎄','robin/holly','','   '])assert.equal(normaliseTag(bad).ok,false,bad);
});

test('tags 5 + 7 + 8: pool -> 13 valid unique tags despite invalid candidates; duplicates and extra title-only tags skipped',async()=>{
  const {selectTags,LISTING_LIMITS}=await import('../../marketing/src/stage3/index.mjs');
  const r=selectTags(POOL,{title:'Robin Christmas Card Printable'});
  assert.deepEqual(r.problems,[]);
  assert.equal(r.tags.length,13);
  assert.equal(new Set(r.tags).size,13);
  const ok=t=>t.length<=LISTING_LIMITS.tagMax&&LISTING_LIMITS.tagPattern.test(t)&&t.trim()===t&&t.length>0;
  assert.ok(r.tags.every(ok),JSON.stringify(r.tags));
  const why=c=>r.decisions.find(d=>d.candidate===c);
  assert.equal(why('ROBIN CHRISTMAS CARD').reason,'duplicate (ignoring case)');
  assert.equal(why('printable christmas card').result,'repaired');assert.ok(r.tags.includes('printable xmas card'));
  assert.equal(why('watercolour robin redbreast card').result,'discarded');
  assert.equal(why('robin, holly').result,'discarded');assert.equal(why('xmas card 🎄').result,'discarded');
  // Title-only tags capped at 6.
  const t=selectTags(['robin','card','christmas','robin card','christmas card','card robin','robin christmas','printable card',
    'winter robin','diy xmas card','cottage christmas','bird greeting card','instant download','a4 christmas card','us letter card','card to print'],{title:'Robin Christmas Card Printable'});
  assert.deepEqual(t.problems,[]);
  const echoes=t.tags.filter(x=>x.split(' ').every(w=>['robin','christmas','card','printable'].includes(w)));
  assert.equal(echoes.length,6);assert.match(t.decisions.find(d=>d.candidate==='robin christmas').reason,/only repeats title words/);
});

test('tags 9: too few valid candidates fails validation; nothing is invented or padded',async()=>{
  const {selectTags}=await import('../../marketing/src/stage3/index.mjs');
  const pool=['robin christmas card','winter robin','watercolour robin redbreast card','robin, holly','Winter Robin','diy xmas card'];
  const r=selectTags(pool,{title:'Robin Card'});
  assert.deepEqual(r.tags,['robin christmas card','winter robin','diy xmas card']);
  assert.match(r.problems[0],/tags: only 3 valid Etsy tags from 6 candidates \(13 needed\)/);
  assert.match(r.problems[0],/"watercolour robin redbreast card" \(over 20 characters with no safe repair\)/);
});

test('tags 11: an unsupported claim in any tag candidate or material rejects the listing; it is never repaired or silently dropped',async()=>{
  const {h,ws}=await productionApproved();
  try{
  const facts=await deriveFacts(ws);
  const {generateListing}=await import('../src/stage3/openai.mjs');
  const ai=data=>({textModel:'t',client:{json:async()=>({data:structuredClone(data),usage:{},model:'t'})}});
  // A 30-character candidate would be discarded for length, but its claim is still caught.
  for(const [over,re] of [[{tag_candidates:[...MODEL_LISTING().tag_candidates,'editable canva christmas card']},/tag candidates: "editable"/],
    [{tag_candidates:[...MODEL_LISTING().tag_candidates,'5x7 card']},/tag candidates: "5x7"/],
    [{materials:['Digital PDF','Printed card stock and envelope included']},/materials: .*envelope/],
    [{title:'Robin Christmas Card, 3 Designs'},/production has 2 card designs/]])
    await assert.rejects(generateListing(ai(MODEL_LISTING(over)),{facts}),re,JSON.stringify(over));
  const ok=await generateListing(ai(MODEL_LISTING()),{facts});
  assert.equal(ok.data.tags.length,13);assert.equal(ok.data.tag_candidates,undefined);
  }finally{await h.cleanup();}
});

test('tags 10 + 12 + 13 + 14: too few valid tags -> rejected, metered, no images; after restart RETRY (Stage 3 only) repairs long tags and completes',async()=>{
  // First attempt: #009's live failure shape (long tags), and too few survive. Second: long tags, enough survive.
  const short=['robin christmas card','watercolour robin redbreast card','traditional christmas greetings','robin, holly','xmas card 🎄','Robin Christmas Card',
    'winter robin holly berries','vintage victorian robin card','christmas card for grandparents','snowy garden bird card','storybook robin illustration','illustrated winter card','traditional robin card'];
  const {h,ws}=await productionApproved({listing:n=>n===1?MODEL_LISTING({tag_candidates:short}):MODEL_LISTING({tag_candidates:POOL})});
  try{
    const production=await snapshot(join(ws,'production')), before=h.calls.length;
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'failed');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'PRODUCTION_APPROVED');
    assert.match(p.last_error.message,/listing: rejected: tags: only 1 valid Etsy tags from 13 candidates/);
    const u=p.api_usage.filter(x=>x.step==='listing');
    assert.deepEqual(u.map(x=>[x.kind,x.outcome]),[['text','rejected']]);assert.match(u[0].error,/only 1 valid Etsy tags/);
    assert.deepEqual(h.calls.slice(before).map(c=>c.schemaName??c.kind),['listing'],'no copy or image call before the listing passes');
    // ADR-064: the paid, rejected answer is kept (never used as a listing) so a later run can re-check it for free.
    assert.deepEqual((await readdir(join(ws,'marketing'))).sort(),['facts.json','listing.rejected.json','strategy.json'],'only free, deterministic files and the saved rejected answer');
    const rej=JSON.parse(await readFile(join(ws,'marketing/listing.rejected.json'),'utf8'));
    assert.match(rej.problems,/only 1 valid Etsy tags/);assert.deepEqual(rej.draft.data.tag_candidates,short);assert.match(rej.input_sha256,/^[a-f0-9]{64}$/);
    // Bot restart, then RETRY.
    const {Workflow}=await import('../src/orchestrator/workflow.mjs');
    h.wf=new Workflow({store:h.store,registry:h.registry,telegram:h.telegram,ai:h.ai,auth:()=>true,log:()=>{}});
    assert.deepEqual(await h.wf.recover(),[]);
    const hist=p.status_history.length, mid=h.calls.length;
    assert.equal((await pressRetry(h)).outcome,'awaiting_marketing_approval');
    assert.deepEqual(h.calls.slice(mid).map(c=>c.schemaName??(/background photograph/i.test(c.prompt)?'scene':'other-image')),['listing','marketing-copy','scene','scene','scene','scene']);
    p=await h.store.load('001');
    assert.deepEqual(p.status_history.slice(hist).map(s=>s.to),['PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL']);
    assert.deepEqual(await snapshot(join(ws,'production')),production,'no Stage 2 rebuild');
    assert.deepEqual(p.api_usage.filter(x=>x.step==='listing').map(x=>x.outcome),['rejected','ok']);
    // 10: listing.json holds only the final Etsy-safe tags; the pool is audit-only.
    const listing=JSON.parse(await readFile(join(ws,'marketing/listing.json'),'utf8'));
    assert.equal(listing.tag_candidates,undefined);assert.equal(listing.tags.length,13);
    assert.ok(listing.tags.every(t=>t.length<=LISTING_LIMITS.tagMax&&LISTING_LIMITS.tagPattern.test(t)),JSON.stringify(listing.tags));
    assert.ok(listing.tags.includes('printable xmas card'));assert.ok(!listing.tags.some(t=>/watercolour/.test(t)));
    assert.deepEqual(listingProblems(listing,await deriveFacts(ws)),[]);
    const audit=JSON.parse(await readFile(join(ws,'marketing/tag-selection.json'),'utf8'));
    assert.deepEqual(audit.tag_candidates,POOL);assert.match(audit.note,/final Etsy tags are listing\.json tags/);
    assert.match(texts(h).find(t=>t.includes('ETSY LISTING READY')),/printable xmas card/);
  }finally{await h.cleanup();}
});

test('materials: characters cleaned, invalid or over-long entries dropped (never sliced), duplicates removed',async()=>{
  const {selectMaterials}=await import('../../marketing/src/stage3/index.mjs');
  const r=selectMaterials(['Digital PDF',' PNG  artwork files ','Robin’s artwork','PDF (A4 & US Letter)','Instructions and a printing guide for home printers','digital pdf']);
  assert.deepEqual(r.materials,['Digital PDF','PNG artwork files',"Robin's artwork"]);
  assert.deepEqual(r.decisions.filter(d=>d.result==='discarded').map(d=>d.reason),["characters other than letters, numbers, spaces, ' and -",'over 45 characters','duplicate (ignoring case)']);
});

// ---- Visual campaign (art-directed compositions, environment scenes, thumbnails) ----
async function withScenes(h,n){
  const {Workflow}=await import('../src/orchestrator/workflow.mjs');
  h.wf=new Workflow({store:h.store,registry:h.registry,telegram:h.telegram,ai:h.ai,auth:()=>true,log:()=>{},marketingScenes:n});
}
const rj=async(ws,f)=>JSON.parse(await readFile(join(ws,f),'utf8'));

test('visual 1: 4-scene mode: nine composition primitives, four environments reused across five slides, real art only, thumbnails, QC pass',async()=>{
  const {PRIMITIVES,PRIMITIVE_NAMES,productShare,THUMB,campaignCopy}=await import('../../marketing/src/stage3/index.mjs');
  const {h,ws}=await productionApproved();
  try{
    const production=await snapshot(join(ws,'production')), before=h.calls.length;
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    const plan=await rj(ws,'marketing/plan.json'), render=await rj(ws,'marketing/images/render.json'), qc=await rj(ws,'marketing/qc.json');
    const manifest=await rj(ws,'marketing/work/art-manifest.json'), facts=await rj(ws,'marketing/facts.json');
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    // Every composition primitive is used; slides are not one template.
    assert.deepEqual(plan.slides.map(s=>s.id),['01-hero','02-designs','03-inside','04-included','05-design-a','06-design-b','07-print','08-sizes','09-gift','10-digital']);
    assert.deepEqual([...new Set(plan.slides.map(s=>PRIMITIVE_NAMES[s.template]))].sort(),Object.values(PRIMITIVE_NAMES).sort());
    assert.equal(Object.keys(PRIMITIVES).length,9);
    // Four environments, the tabletop reused by hero + two-design slide; 5 scene-backed slides for 4 paid images.
    assert.deepEqual(plan.scenes.map(s=>[s.id,s.used_by]),[['tabletop',['01-hero','02-designs']],['gift',['09-gift']],['print',['07-print']],['inside',['03-inside']]]);
    assert.deepEqual(render.map(r=>r.scene),['tabletop','tabletop','inside',null,null,null,'print',null,'gift',null]);
    assert.equal(sceneCalls(h),4);assert.equal(h.calls.length-before,6);
    // Backgrounds are never product art: every data-art is a Stage 2 file, never a scene.
    const scenes=new Set(plan.scenes.map(s=>s.sha256)), allowed=new Set(manifest.map(m=>m.sha256));
    for(const r of render)for(const a of r.artwork){assert.ok(allowed.has(a.sha256),`${r.file} traced`);assert.ok(!scenes.has(a.sha256),`${r.file} not a scene`);
      assert.ok(Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)<=0.005,`${r.file} aspect kept`);}
    // Product prominence vs the old layouts (measured from their fixed geometry: hero ≈30%, design close-up ≈28%, mean ≈24%).
    const share=Object.fromEntries(render.map(r=>[r.slide,productShare(r.artwork)]));
    assert.ok(share['01-hero']>=0.40,`hero ${share['01-hero']}`);
    assert.ok(share['05-design-a']>=0.45&&share['06-design-b']>=0.45,JSON.stringify(share));
    const mean=Object.values(share).reduce((a,b)=>a+b,0)/10;
    assert.ok(mean>=0.30,`mean product share ${mean.toFixed(3)} vs old ≈0.24`);
    for(const [i,s] of plan.slides.entries())assert.ok(share[s.id]>=s.min_product_share,`${s.id} ${share[s.id]} >= ${s.min_product_share}`);
    // Text is deterministic: headlines are the art-directed copy, rendered by code; the model wrote only the tone line.
    const C=campaignCopy(facts);
    for(const s of plan.slides.filter(x=>x.template!=='design'))assert.deepEqual(s.copy.headline,C[s.template].headline,s.id);
    assert.deepEqual(plan.slides.filter(s=>s.copy.subline?.by==='model').map(s=>s.id),['09-gift']);
    const norm=t=>t.toLowerCase().replace(/\s+/g,'');
    for(const [i,r] of render.entries())assert.ok(r.headlines.some(x=>norm(x.text)===norm(plan.slides[i].copy.headline.text)),r.file);
    for(const c of h.calls.filter(c=>c.kind==='image'&&/background photograph/i.test(c.prompt)))
      for(const s of plan.slides)assert.ok(!c.prompt.includes(s.copy.headline.text.replace(/\n/g,' ')),'no headline text sent to the image model');
    // Thumbnails: 300x300 per image + a contact sheet, sent for review.
    const {sharp}=await import('../../production/src/lib.mjs');
    for(const r of render){const m=await sharp(join(ws,'marketing/images',r.thumb)).metadata();assert.deepEqual([m.width,m.height],[THUMB,THUMB]);}
    assert.ok((await readdir(join(ws,'marketing/images/thumbs'))).includes('contact-sheet.png'));
    assert.ok(h.telegram.sent.some(s=>s.type==='photo'&&/Etsy thumbnail check \(300 px\)/.test(s.caption)));
    assert.ok(['product artwork dominates each image','headline legible at 300 px thumbnail','headline text rendered by code from the plan','300x300 thumbnails generated'].every(n=>qc.checks.find(c=>c.name===n)?.ok));
    assert.deepEqual(await snapshot(join(ws,'production')),production,'production package unchanged');
  }finally{await h.cleanup();}
});

test('visual 2: zero-scene mode renders every composition with coded environments and no image call; 2-scene mode keeps the highest-priority scenes',async()=>{
  const {h,ws}=await productionApproved();
  try{
    await withScenes(h,0);
    const before=h.calls.length;
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    let plan=await rj(ws,'marketing/plan.json'), render=await rj(ws,'marketing/images/render.json');
    assert.deepEqual(plan.scenes,[]);assert.ok(plan.slides.every(s=>!s.scene));
    assert.equal(render.length,10);assert.ok(render.every(r=>r.scene===null&&r.artwork.length>0));
    assert.deepEqual(h.calls.slice(before).map(c=>c.schemaName??c.kind),['listing','marketing-copy'],'no image call');
    assert.equal((await rj(ws,'marketing/qc.json')).passed,true);
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text).slice(2,4),['REGENERATE MARKETING (1 AI call)','REGENERATE ALL (2 AI calls)']);
    // 2 scenes: tabletop (hero + designs) and gift; print and inside fall back to coded environments.
    await withScenes(h,2);
    const b2=h.calls.length;
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE MARKETING (1 AI call)')))).outcome,'awaiting_marketing_approval');
    plan=await rj(ws,'marketing/plan.json');render=await rj(ws,'marketing/images/render.json');
    assert.deepEqual(plan.scenes.map(s=>s.id),['tabletop','gift']);
    assert.deepEqual(render.map(r=>r.scene),['tabletop','tabletop',null,null,null,null,null,null,'gift',null]);
    assert.equal(h.calls.slice(b2).filter(c=>c.kind==='image').length,2);
    assert.equal((await rj(ws,'marketing/qc.json')).passed,true);
  }finally{await h.cleanup();}
});

test('visual 3: art direction adapts to the product (one design) and never pads or invents slides',async()=>{
  const {planSlides,campaignCopy}=await import('../../marketing/src/stage3/index.mjs');
  const one={product_name:'Robin',product_type:'Christmas greetings card',season:'Christmas',designs:[{id:'A',name:'Merry Christmas'}],
    insides:[{text:['Hi'],shared_by:['A']}],formats:[{key:'A4',label:'A4'}],original_artwork_files:2,printing_guide:true};
  const p=planSlides(one,{maxScenes:4});
  assert.deepEqual(p.slides.map(s=>s.template),['hero','inside','included','design','print','sizes','gift','digital']);
  assert.equal(campaignCopy(one).sizes.headline.text,'Ready to print','one format: no "multiple sizes" claim');
  assert.deepEqual(campaignCopy(one).inside.subline.claim,['inside','Illustrated inside message'],'not "both designs"');
  // Five designs: capped at 10 by priority; hero, contents and digital always stay.
  const five={...one,designs:['A','B','C','D','E'].map(id=>({id,name:`Card ${id}`})),insides:[{text:['Hi'],shared_by:['A','B','C','D','E']}]};
  const q=planSlides(five,{maxScenes:4});
  assert.equal(q.slides.length,10);
  for(const t of ['hero','included','digital','designs'])assert.ok(q.slides.some(s=>s.template===t),t);
});

test('visual 4: one-design hero sizes the card from its aspect ratio (portrait, square, landscape) above the 40% floor',async()=>{
  const {planSlides,composeSlide}=await import('../../marketing/src/stage3/index.mjs');
  const one={product_name:'Robin',product_type:'Christmas greetings card',season:'Christmas',designs:[{id:'A',name:'Merry Christmas'}],
    insides:[{text:['Hi'],shared_by:['A']}],formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'}],original_artwork_files:2,printing_guide:true};
  const hero=planSlides(one,{maxScenes:4}).slides.find(s=>s.template==='hero');
  // Unrotated card box from the composed geometry; the QC footprint (rotated bounding box) is never smaller.
  for(const [w,h] of [[1024,1536],[1000,1400],[1000,1000],[1400,1000]]){   // 2:3, 5x7, square, 7x5
    const a={sha256:'x',uri:'data:,',width:w,height:h};
    const {bodyHtml}=composeSlide(hero,{facts:one,art:{fronts:{A:a},insides:[],sheets:{}},sceneUri:null});
    const [,bw,bh]=bodyHtml.match(/class="lx-obj" style="left:[^;]+;top:[^;]+;width:([\d.]+)px;height:([\d.]+)px/).map(Number);
    const share=bw*bh/4e6;
    assert.ok(share>=0.42&&share<=0.6,`${w}x${h}: ${share.toFixed(3)}`);
    assert.ok(Math.abs(bw/bh-w/h)<0.005,'aspect kept');
  }
});

// ---- Marketing strategy + sales-led listing copy ----
// #009's metadata as Stage 3 derives it (the product folder itself is not a test dependency).
const P009={product_name:'Robin at the Frosted Gate',product_type:'Christmas greetings card',product_format:'greeting-card',season:'Christmas',
  target_customer:'Customers seeking a warm, traditional Christmas card for friends, family or neighbours',
  designs:[{id:'A',name:'Merry Christmas'},{id:'B',name:'Christmas Wishes'}],insides:[{text:['Wishing you a joyful Christmas and a happy New Year'],shared_by:['A','B']}],
  formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'},{key:'Card-Panels-4x6in',label:'4×6 in card panels'}],original_artwork_files:3,printing_guide:true,
  style:{subject:'European robin',palette:'Muted traditional Christmas hues',mood:'Cosy, nostalgic, tender and quietly magical, with a refined handmade feel suited to seasonal gifting.'}};

test('strategy 1-3 + 6: #009 resolves to a warm, festive, gifting-led greeting-card strategy with zero model calls',async()=>{
  const {deriveStrategy}=await import('../../marketing/src/stage3/index.mjs');
  const s=deriveStrategy(P009);
  assert.equal(s.product_family,'greeting_card');
  assert.deepEqual(s.theme,{id:'christmas',label:'Christmas'});
  assert.equal(s.primary_customer_intent,'send a thoughtful Christmas greeting');
  assert.equal(s.emotional_angle,'cosy traditional Christmas warmth');
  assert.deepEqual(s.tone,['warm','nostalgic','festive','thoughtful']);
  assert.equal(s.positioning,'two coordinated printable Christmas card designs with a shared illustrated inside');
  assert.equal(s.opening_strategy,'emotion / Christmas sentiment before technical details');
  assert.deepEqual(s.description_emphasis,['artwork and gifting first','technical formats second']);
  assert.equal(s.cta_style,'soft festive');
  assert.deepEqual(s.seo_focus,['printable christmas cards','robin christmas card','traditional christmas card','christmas card set','instant digital download']);
  assert.deepEqual(s.emoji_level,{level:'light',min:2,max:5});
  assert.equal(s.visual_marketing_mood,'premium cosy traditional Christmas');
  assert.deepEqual(s.description_structure.map(x=>x.section),['emotional hook','product experience','options / designs','what you receive','how it works','emotional use case','digital product disclosure']);
  // Presentation only: no fact-like fields (files, sizes, counts beyond the positioning phrase) and deterministic.
  assert.deepEqual(deriveStrategy(P009),s);
  for(const k of Object.keys(s))assert.ok(!/file|dpi|price|size/i.test(k),k);
});

test('strategy 4-5: other families and themes resolve differently, and nothing is hard-coded to Christmas',async()=>{
  const {deriveStrategy}=await import('../../marketing/src/stage3/index.mjs');
  const cute=deriveStrategy({product_name:'Cute Ghost Activity Book',product_type:'activity book',product_format:'activity-book',season:'Halloween',style:{mood:'cozy playful'}});
  assert.equal(cute.product_family,'activity_book');assert.equal(cute.theme.id,'halloween_cute');
  assert.ok(cute.tone.includes('playful')&&cute.tone.includes('cosy-spooky'));assert.equal(cute.emoji_level.level,'playful');
  const dark=deriveStrategy({product_name:'Midnight Seance',product_type:'party game kit',product_format:'party-kit',season:'Halloween',style:{mood:'dark, gothic and mysterious'}});
  assert.equal(dark.product_family,'party_kit');assert.equal(dark.theme.id,'halloween_dark');assert.match(dark.visual_marketing_mood,/atmospheric/);
  const planner=deriveStrategy({product_name:'Weekly Planner',product_type:'weekly planner',product_format:'planner'});
  const sheet=deriveStrategy({product_name:'Budget & Goals',product_type:'budget spreadsheet',product_format:'xlsx'});
  assert.equal(planner.product_family,'planner');assert.equal(sheet.product_family,'spreadsheet');
  assert.deepEqual([planner.theme.id,sheet.theme.id],['none','none']);
  assert.ok(sheet.emoji_level.max<=2);assert.ok(sheet.tone.includes('trustworthy'));
  assert.equal(deriveStrategy({product_type:'wall art print',product_format:'printable'}).product_family,'general_printable');
  assert.equal(deriveStrategy({product_type:'colouring book',product_format:'coloring-book',season:'Autumn'}).theme.id,'autumn');
  assert.ok(deriveStrategy({product_type:'wedding invitation card',product_format:'greeting-card'}).emoji_level.max<=2);
  for(const s of [cute,dark,planner,sheet])assert.doesNotMatch(JSON.stringify(s),/christmas/i,s.product_family);
});

test('strategy 7-9: the listing prompt separates truth from presentation, leads with emotion, puts search intent first in the title and asks for a customer-facing summary',async()=>{
  const {loadPrompt}=await import('../src/openai/prompts.mjs');
  const t=(await loadPrompt('listing')).replace(/\s+/g,' ');
  assert.ok(t.includes('The production facts define what you may say. They do not define the tone, order or emotional presentation of the listing.'));
  assert.ok(t.includes('Write like an experienced Etsy seller presenting a desirable product to a customer, not like an engineer documenting a production package.'));
  const order=['1. Emotional hook','2. Product experience','3. Options / designs','4. What you receive','5. How it works','6. Emotional use case','7. Digital product disclosure'].map(x=>t.indexOf(x));
  assert.ok(order.every((v,i)=>v>0&&(i===0||v>order[i-1])),JSON.stringify(order));
  assert.match(t,/Never open with file types, formats, paper sizes, ZIP or file counts/);
  assert.match(t,/TITLE: search intent first\. Structure: primary search phrase, then product type \/ subject, then the key differentiator, then a secondary search intent/);
  assert.match(t,/the internal product name \(product_name\) is a collection name, not a search phrase/);
  assert.match(t,/SHORT SUMMARY \(customer_summary\).*what it is, why it is appealing, the main differentiator, and how it is delivered\. Do not compress the file list/);
  for(const x of ['Elevate your','Transform your',"Whether you're",'Designed to','Crafted to','Seamlessly','buy now','limited time'])assert.ok(t.toLowerCase().includes(x.toLowerCase()),x);
  assert.doesNotMatch(t,/christmas/i,'generic prompt: the season comes from the strategy');
  const {loadSchema,strictSchema}=await import('../src/orchestrator/schema.mjs');
  const P=strictSchema(await loadSchema('listing')).properties;
  assert.match(P.title.description,/search intent first/);assert.match(P.customer_summary.description,/Not a compressed file list/);
  assert.match(P.description.description,/emotional hook \(never file types first\)/);
});

test('strategy 10-13: facts stay authoritative; unsupported claims, fake urgency, a file-inventory opening and a missing digital disclosure are rejected, never repaired',async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws), {generateListing}=await import('../src/stage3/openai.mjs');
    const ai=data=>{const o={textModel:'t',client:{json:async({user})=>{o.last=user;return {data:structuredClone(data),usage:{},model:'t'};}}};return o;};
    const warm='Bring a little winter warmth to your Christmas wishes. ';
    for(const [over,re] of [
      [{description:`${warm}Each card is fully editable in Canva. This is a digital download. No physical item is shipped.`},/"editable".*|"Canva"/],
      [{description:`${warm}Hurry, limited time only! This is a digital download. No physical item is shipped.`},/fake urgency/],
      [{description:'PDF and PNG files for A4 and US Letter. This is a digital download. No physical item is shipped.'},/opens with the file inventory \("PDF"\)/],
      [{description:`${warm}Print at home and give it to someone special.`},/description: must say it is a digital download and that no physical item is shipped/],
      [{digital_download_disclaimer:'Instant access after purchase.'},/digital_download_disclaimer: must say/],
      [{what_you_receive:['2 card designs','5x7 card version']},/"5x7"/],
      [{customer_summary:'Three robin designs to print at home, shipped next day.'},/production has 2 card designs/]]){
      const m=ai(MODEL_LISTING(over));
      await assert.rejects(generateListing(m,{facts}),re,JSON.stringify(over));
    }
    // A sales-led, factual description passes; the model saw the strategy as presentation guidance.
    const good=MODEL_LISTING({description:`${warm}🎄 Two cosy robin designs, ready to print at home.\n\nWhat you receive\n• 2 card designs\n• A4 and US Letter PDFs\n\nThis is a digital download. No physical item is shipped.`});
    const m=ai(good);const ok=await generateListing(m,{facts});
    assert.equal(ok.data.description,good.description,'accepted text is stored exactly as written');
    assert.match(m.last,/MARKETING STRATEGY \(how to present these facts; never a source of facts\)/);
    assert.match(m.last,/"seo_focus"/);assert.match(m.last,/PRODUCTION FACTS \(the only claims you may make\)/);
  }finally{await h.cleanup();}
});

test('strategy 14-16 + 19: REGENERATE LISTING COPY makes one text call, reuses the strategy, keeps backgrounds and renders; tags still come from the deterministic selector',async()=>{
  const {h,ws}=await productionApproved({listing:n=>MODEL_LISTING({hook:`A cosy robin ${n}`})});
  try{
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    assert.ok(texts(h).some(t=>/OpenAI cost: 2 text calls \+ 4 image calls\./.test(t)));
    const production=await snapshot(join(ws,'production'));
    const keep=['marketing/strategy.json','marketing/plan.json','marketing/images/render.json',...(await readdir(join(ws,'marketing/scenes'))).map(f=>`marketing/scenes/${f}`)];
    const before=Object.fromEntries(await Promise.all(keep.map(async f=>[f,sha(await readFile(join(ws,f)))])));
    const imgs=async()=>Object.fromEntries(await Promise.all((await readdir(join(ws,'marketing/images'))).filter(f=>f.endsWith('.png')).map(async f=>[f,(await import('node:fs/promises')).stat(join(ws,'marketing/images',f)).then(s=>s.mtimeMs)])));
    const mt=await Promise.all(Object.values(await imgs()));
    const c0=h.calls.length;
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE LISTING COPY (1 AI call)')))).outcome,'awaiting_marketing_approval');
    assert.deepEqual(h.calls.slice(c0).map(c=>c.schemaName??c.kind),['listing'],'exactly one text call');
    assert.ok(texts(h).some(t=>t==='This regeneration will use approximately: 1 text call, no image calls.'));
    for(const f of keep)assert.equal(sha(await readFile(join(ws,f))),before[f],`${f} reused`);
    assert.deepEqual(await Promise.all(Object.values(await imgs())),mt,'images not re-rendered');
    assert.deepEqual((await readdir(join(ws,'marketing/history/v01'))).sort(),['listing.json','tag-selection.json']);
    const listing=await rj(ws,'marketing/listing.json');
    assert.equal(listing.tags.length,13);assert.equal(listing.tag_candidates,undefined);
    assert.deepEqual((await rj(ws,'marketing/tag-selection.json')).tag_candidates,MODEL_LISTING().tag_candidates);
    assert.deepEqual(await snapshot(join(ws,'production')),production);
  }finally{await h.cleanup();}
});

test('strategy 17: the visual campaign consumes the same strategy (plan, scene prompts, tokens)',async()=>{
  const {deriveStrategy,campaignFor,planSlides}=await import('../../marketing/src/stage3/index.mjs');
  const {h,ws}=await productionApproved();
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    const st=await rj(ws,'marketing/strategy.json'), plan=await rj(ws,'marketing/plan.json');
    assert.deepEqual(plan.strategy,{family:st.product_family,theme:st.theme.id,visual_marketing_mood:st.visual_marketing_mood});
    for(const sc of plan.scenes)assert.ok(sc.prompt.includes(`Campaign mood: ${st.visual_marketing_mood}.`),sc.id);
    assert.ok(h.calls.find(c=>c.schemaName==='marketing-copy').user.includes(`CAMPAIGN (shared with the listing copy): ${st.visual_marketing_mood}`));
  }finally{await h.cleanup();}
  // Change the strategy and the campaign changes with it.
  const halloween=deriveStrategy({...P009,season:'Halloween',product_type:'Halloween greetings card',product_name:'Ghost Card',target_customer:'',style:{mood:'cute'}});
  const c=campaignFor(P009,halloween), x=campaignFor(P009,deriveStrategy(P009));
  assert.equal(c.mood,'playful cosy-spooky Halloween');assert.notEqual(c.name,x.name);
  assert.equal(planSlides(P009,{maxScenes:4,strategy:halloween}).strategy.theme,'halloween_cute');
});

test('strategy 18: cost messages and labels follow the configured scene count; a listing-only regeneration on a legacy image set is refused for free',async()=>{
  const {h,ws}=await productionApproved();
  try{
    await withScenes(h,2);
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    assert.ok(texts(h).some(t=>/OpenAI cost: 2 text calls \+ 2 image calls\./.test(t)));
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text).slice(1,4),['REGENERATE LISTING COPY (1 AI call)','REGENERATE MARKETING (1 AI call + 2 AI images)','REGENERATE ALL (2 AI calls + 2 AI images)']);
    await withScenes(h,4);
    const c0=h.calls.length;
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE MARKETING (1 AI call + 2 AI images)')))).outcome,'awaiting_marketing_approval');
    assert.ok(texts(h).some(t=>t==='This regeneration will use approximately: 1 text call, 4 image calls.'),'announces what it will really spend');
    assert.equal(h.calls.slice(c0).filter(c=>c.kind==='image').length,4);
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text).slice(2,4),['REGENERATE MARKETING (1 AI call + 4 AI images)','REGENERATE ALL (2 AI calls + 4 AI images)']);
    // Legacy plan (made before the campaign system): listing-only would need a re-render, so it is refused.
    const plan=await rj(ws,'marketing/plan.json');delete plan.campaign;
    await writeFile(join(ws,'marketing/plan.json'),JSON.stringify(plan));
    const c1=h.calls.length;
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE LISTING COPY (1 AI call)')))).outcome,'needs_marketing_regeneration');
    assert.equal(h.calls.length,c1,'nothing spent');assert.equal((await h.store.load('001')).status,'AWAITING_MARKETING_APPROVAL');
    assert.match(texts(h).at(-1),/previous visual system.*REGENERATE MARKETING.*REGENERATE ALL.*Nothing was spent/);
  }finally{await h.cleanup();}
});

test('reference baseline: the first accepted Stage 3 campaign (#009, 2026-09-27) keeps its structure',async()=>{
  const base=JSON.parse(await readFile(new URL('./fixtures/stage3-visual-baseline.json',import.meta.url),'utf8'));
  const {productShare,PRIMITIVE_NAMES}=await import('../../marketing/src/stage3/index.mjs');
  const {sharp}=await import('../../production/src/lib.mjs');
  const {h,ws}=await productionApproved();
  try{
    await withScenes(h,0);   // coded environments: deterministic, no fake scene pixels
    assert.equal((await h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    const plan=await rj(ws,'marketing/plan.json'), render=await rj(ws,'marketing/images/render.json');
    assert.deepEqual(plan.slides.map(s=>s.template),base.templates,'campaign order');
    assert.equal(new Set(plan.slides.map(s=>PRIMITIVE_NAMES[s.template])).size,base.distinct_primitives,'not one repeated template');
    plan.slides.forEach((s,i)=>{if(i)assert.ok(s.template!==plan.slides[i-1].template||s.template==='design',`${s.id} repeats the previous layout`);});
    for(const [i,r] of render.entries()){
      const floor=base.product_share[plan.slides[i].template]-base.tolerance;
      assert.ok(productShare(r.artwork)>=floor,`${r.slide} product ${productShare(r.artwork).toFixed(2)} < baseline ${floor.toFixed(2)} (tiny product)`);
      assert.ok(Math.max(...r.headlines.map(x=>x.fontPx))>=base.min_headline_px,`${r.slide} headline too small`);
    }
    // Large empty ivory layouts: count slides whose thumbnail is mostly pale, low-saturation pixels.
    let pale=0;
    for(const r of render){const {data,info}=await sharp(join(ws,'marketing/images',r.thumb)).removeAlpha().raw().toBuffer({resolveWithObject:true});
      let n=0;for(let k=0;k<data.length;k+=3){const [R,G,B]=[data[k],data[k+1],data[k+2]];if(Math.min(R,G,B)>215&&Math.max(R,G,B)-Math.min(R,G,B)<30)n++;}
      if(n/(info.width*info.height)>base.pale_pixel_share)pale++;}
    assert.ok(pale<=base.max_pale_slides,`${pale} ivory-dominated slides (max ${base.max_pale_slides})`);
  }finally{await h.cleanup();}
});

// ---- Listing copy: no authorship claims, descriptive designs from verified metadata, search-first titles ----
test('copy 1: authorship/process words are never passed to the model and are rejected unless production proves them',async()=>{
  const {scrubProcess,claimProblems}=await import('../../marketing/src/stage3/index.mjs');
  assert.equal(scrubProcess('Cosy, nostalgic, tender and quietly magical, with a refined handmade feel suited to seasonal gifting.'),
    'Cosy, nostalgic, tender and quietly magical, with a refined feel suited to seasonal gifting.');
  assert.equal(scrubProcess('Original hand-painted storybook watercolour for a premium card'),'Original storybook watercolour-style for a premium card');
  const f={designs:[{},{}]};
  for(const t of ['with a refined handmade feel','Hand-painted robin artwork','hand drawn details','Handcrafted with love','an artisan card','made by hand','an original watercolour painting','hand-lettered greeting'])
    assert.match(claimProblems(t,f).join(),/authorship or making process not proven/,t);
  for(const t of ['a storybook feel','a traditional illustrated feel with nostalgic character','space for a handwritten note','watercolour-style illustration'])
    assert.deepEqual(claimProblems(t,f),[],t);
  assert.deepEqual(claimProblems('Handmade by our studio',{...f,process_claims:['handmade']}),[],'allowed only when production metadata proves it');
  // generateListing rejects it; nothing is edited out.
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws), {generateListing,factsForModel}=await import('../src/stage3/openai.mjs');
    const d=MODEL_LISTING({description:'Bring a little winter warmth to your Christmas wishes. A refined handmade feel. This is a digital download. No physical item is shipped.'});
    await assert.rejects(generateListing({textModel:'t',client:{json:async()=>({data:structuredClone(d),usage:{},model:'t'})}},{facts}),/"handmade" \(authorship or making process not proven\)/);
    // The model input carries no process wording even when the creative direction does.
    const f2={...facts,style:{...facts.style,mood:'Cosy with a refined handmade feel'},creative:{...facts.creative,collection:{...facts.creative.collection,illustration_style:scrubProcess('hand-painted storybook watercolour')}}};
    assert.doesNotMatch(JSON.stringify(factsForModel(f2)),/hand[- ]?(made|painted|drawn)/i);
  }finally{await h.cleanup();}
});

test('copy 2: design descriptions come from verified metadata only (role-matched briefs or owner notes); a repurposed page is not described',async()=>{
  const {h,ws}=await productionApproved();
  try{
    let facts=await deriveFacts(ws);
    // Fixture mirrors #009: A's front was briefed as a card front; B's front was briefed as the card BACK (repurposed).
    assert.equal(facts.creative.designs.A.source,'approved card-front brief (page 1)');
    assert.equal(facts.creative.designs.A.description,'a');
    assert.equal(facts.creative.designs.B.description,null);
    assert.match(facts.creative.designs.B.source,/page 3 was briefed as card-back; its brief does not describe this use/);
    assert.equal(facts.creative.inside.description,null,'the inside is described by its facts, not by a brief');
    const {generateListing,visualForModel}=await import('../src/stage3/openai.mjs');
    let v=visualForModel(facts);
    assert.equal(v.designs.find(d=>d.id==='B').visible_design,null);
    assert.match(v.designs.find(d=>d.id==='B').guidance,/introduce it by name and the shared collection look only/);
    // The owner's own notes are verified: they describe B (and override briefs), scrubbed of process words.
    await (await import('node:fs/promises')).mkdir(join(ws,'marketing'),{recursive:true});
    await writeFile(join(ws,'marketing/creative-notes.json'),JSON.stringify({designs:{B:'A robin on a snowy gate post beside a glowing hand-painted lantern, with a snowy village behind.'}}));
    facts=await deriveFacts(ws);v=visualForModel(facts);
    assert.equal(facts.creative.designs.B.source,'owner notes (marketing/creative-notes.json)');
    assert.equal(v.designs.find(d=>d.id==='B').visible_design,'A robin on a snowy gate post beside a glowing lantern, with a snowy village behind.');
    // It reaches the listing call.
    let seen;
    await generateListing({textModel:'t',client:{json:async({user})=>{seen=user;return {data:MODEL_LISTING(),usage:{},model:'t'};}}},{facts});
    assert.match(seen,/"visible_design": "A robin on a snowy gate post beside a glowing lantern/);
    assert.match(seen,/"collection_look"/);assert.match(seen,/never invent scenery, objects or colours/);
    const {loadPrompt}=await import('../src/openai/prompts.mjs');
    const t=(await loadPrompt('listing')).replace(/\s+/g,' ');
    assert.match(t,/introduce each design by name and describe what it actually shows, naturally and appealingly, using only that design's visible_design text and the collection look/);
    assert.match(t,/Never write flat lines such as "X features the front text X" or "Y offers a second design option"/);
    assert.match(t,/If a design has no verified description, introduce it by name and the shared collection look without inventing its scene/);
  }finally{await h.cleanup();}
});

test('copy 3: titles lead with search intent; the internal product name is rejected at generation (not retroactively in QC)',async()=>{
  const {titleProblems,listingProblems}=await import('../../marketing/src/stage3/index.mjs');
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws);
    const named='Printable Christmas Cards, Robin at the Frosted Gate, Two Designs, Traditional Card Set, Instant Download';
    assert.match(titleProblems({title:named},facts).join(),/uses the internal product name "Robin at the Frosted Gate"/);
    assert.deepEqual(titleProblems({title:'Printable Christmas Cards Set | Robin Christmas Card | 2 Traditional Xmas Cards | Instant Download'},facts),[]);
    assert.ok(!listingProblems(LISTING({title:named}),facts).some(p=>/internal product name/.test(p)),'an existing listing is not failed by QC for SEO style');
    const {generateListing}=await import('../src/stage3/openai.mjs');
    await assert.rejects(generateListing({textModel:'t',client:{json:async()=>({data:MODEL_LISTING({title:named}),usage:{},model:'t'})}},{facts}),/internal product name/);
    const {loadPrompt}=await import('../src/openai/prompts.mjs');
    const t=(await loadPrompt('listing')).replace(/\s+/g,' ');
    assert.match(t,/leading with the strongest one\. Spend title space only on what buyers search for: the internal product name \(product_name\) is a collection name, not a search phrase, so it never goes in the title \(code rejects it\); it can appear in the description/);
    assert.match(t,/title: maximum 140 characters, not all capitals, never the internal product name/);
  }finally{await h.cleanup();}
});
