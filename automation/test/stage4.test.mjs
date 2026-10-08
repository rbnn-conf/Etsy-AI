// Stage 4 (ADR-026): Etsy draft creation, uploads, verification and the
// separate owner-confirmed publish. Etsy is a fake (or the built-in dry run);
// OpenAI and Telegram are mocked. No network call is possible from here.
import test,{ before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdtemp, cp, rm, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harness, msg, press, button, lastKeyboard, concept, bookDirection, fakeTelegram, fakeAi, pressRetry } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { transition, canApply } from '../src/orchestrator/state.mjs';
import { stage4Config } from '../src/config.mjs';
import { resolveTaxonomy, makeSanitizer, unzip } from './stage4-support.mjs';
import { FakeEtsy, SECRET_TOKEN, SECRET_KEY } from './etsy-fake.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const SELLER={whoMade:'i_did',whenMade:'made_to_order',quantity:999};
const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify.'],['card-inside','Inside','Exact message: “Wishing you a joyful Christmas”.','Verify.'],
    ['card-back','Back','Motif. No text.','No printed text.']].map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});
const TAGS=['robin christmas card','printable card','christmas card','holiday card','winter robin','xmas card print','card to print','diy christmas card','cottage christmas','bird greeting card','instant download','a4 christmas card','us letter card'];
const LISTING={title:'Printable Christmas Cards | Robin Card Set, 2 Traditional Xmas Cards, Instant Download',
  // The apostrophe matters: Etsy reads it back as "&#39;" (Product #019's VERIFY_FAILED).
  description:'Bring a little winter warmth to your family\'s Christmas wishes.\n\nWhat you receive\n• 2 card designs\n• A4 and US Letter PDFs\n\nThis is a digital download. No physical item is shipped.',
  tag_candidates:[...TAGS,'robin xmas card','festive bird card','winter card print','rustic xmas card','cosy card print'],
  materials:['Digital PDF','PNG artwork files'],suggested_price_gbp:4.25,pricing_rationale:'In line with two-design printable Christmas cards.',
  category_suggestion:'Paper & Party Supplies > Paper > Greeting Cards',occasion:'Christmas',primary_colour:'Red',secondary_colour:'Green',
  hook:'A cosy robin for your Christmas post',customer_summary:'Two storybook robin designs to print, trim and fold at home, delivered as a digital download.',
  what_you_receive:['2 card designs','A4 and US Letter folded card PDFs','4×6 in card panels','Printing guide'],printing_summary:'Print at 100% on card stock, trim and fold.',
  digital_download_disclaimer:'Digital download only. No physical item is shipped.',
  listing_claims:[{key:'design-count',text:'2 card designs'},{key:'format',text:'A4 and US Letter'},{key:'printing-guide',text:'Printing guide'},{key:'digital',text:'Digital download'}]};
const COPY=(_,{user})=>{const ids=s=>[...((user.split(`${s} `)[1]??'').split('\n\n')[0]).matchAll(/^- ([\w-]+):/gm)].map(m=>m[1]);
  return {lines:ids('LINES').map(id=>({id,text:'For family, friends and neighbours near and far.'})),scenes:ids('SCENES').map(id=>({id,brief:'A pine tabletop with soft window light.'}))};};

// One MARKETING_APPROVED product, built once through the real Stage 1-3 flow; each test works on a copy.
let BASE;
before(async()=>{
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection(),listing:()=>LISTING,'marketing-copy':COPY}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
  const p=await h.store.load('001'), ws=h.store.dirOf(p);
  for(const im of p.proofs.attempts[0].images)await h.store.writeBytes(p,im.file,await artwork(im.page_number));
  await writeFile(join(ws,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'001',card_variants:[
    {id:'A',name:'Merry Christmas',front_source:'proof-01',inside_source:'proof-02',back_type:'minimal'},
    {id:'B',name:'Christmas Wishes',front_source:'proof-03',inside_source:'proof-02',back_type:'minimal'}]}));
  await h.wf.handleUpdate(msg('/produce 001'));await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')));
  await h.wf.handleUpdate(msg('/market 001'));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')))).outcome,'marketing_approved');
  BASE=h;
});
after(async()=>{await BASE?.cleanup();});

async function fresh({mode='live',publishEnabled=false,fake=new FakeEtsy(),seller=SELLER,shopId}={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-stage4-'));
  await cp(join(BASE.root,'products'),join(root,'products'),{recursive:true});
  await cp(join(BASE.root,'state'),join(root,'state'),{recursive:true});
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=fakeAi();
  let factory=0;
  const make=()=>new Workflow({store,registry,telegram,ai,auth:()=>true,log:()=>{},
    stage4:{config:{mode,publishEnabled,shopId:shopId??fake.shopId,seller},liveClient:async()=>{factory++;return fake;}}});
  const t={root,store,registry,telegram,calls,fake,wf:make(),restart(){t.wf=make();return t.wf;},factoryCalls:()=>factory,
    ws:store.dirOf(await store.load('001')),load:()=>store.load('001'),cleanup:()=>rm(root,{recursive:true,force:true})};
  t.usage0=(await t.load()).api_usage.length;
  return t;
}
const texts=t=>t.telegram.sent.filter(s=>s.type==='message').map(s=>s.text);
const labels=t=>{const k=t.telegram.sent.filter(s=>s.type==='message'&&s.replyMarkup).at(-1);return k?k.replyMarkup.inline_keyboard.flat().map(b=>b.text):[];};
const pressLabel=(t,label)=>t.wf.handleUpdate(press(button(t.telegram,label)));
const rj=async(t,f)=>JSON.parse(await readFile(join(t.ws,f),'utf8'));
async function snapshot(dir){const out={};const walk=async(d,rel='')=>{for(const e of await readdir(d,{withFileTypes:true})){const r=rel?`${rel}/${e.name}`:e.name;
  if(e.isDirectory())await walk(join(d,e.name),r);else out[r]=sha(await readFile(join(d,e.name)));}};await walk(dir);return out;}
const ready=async t=>{const r=await t.wf.handleUpdate(msg('/etsy 001'));assert.equal(r.outcome,'awaiting_etsy_publish_approval',JSON.stringify(r));return r;};

// ---------------------------------------------------------------------------
test('1 + 2 + 36: only MARKETING_APPROVED starts Stage 4; the dry run simulates everything with zero Etsy requests and zero OpenAI calls',async()=>{
  const t=await fresh({mode:'dry-run'});
  try{
    // Not approved yet -> refused, nothing created.
    const p=await t.load();
    await t.store.save({...p,status:'AWAITING_MARKETING_APPROVAL'});
    assert.equal((await t.wf.handleUpdate(msg('/etsy 001'))).outcome,'not_approved');
    await t.store.save(p);
    const calls0=t.calls.length;
    await ready(t);
    const after=await t.load();
    assert.equal(after.status,'AWAITING_ETSY_PUBLISH_APPROVAL');assert.equal(after.etsy.mode,'dry-run');
    assert.equal(t.factoryCalls(),0,'the live Etsy client is never created in a dry run');
    assert.equal(t.fake.calls.length,0,'no Etsy client call at all');
    assert.equal(t.calls.length,calls0,'zero OpenAI calls');assert.equal(after.api_usage.length,t.usage0,'no OpenAI usage entries');
    const review=texts(t).find(x=>x.startsWith('🏪 PRODUCT #001 — ETSY DRAFT READY'));
    assert.match(review,/DRY RUN — SIMULATED, NOTHING SENT TO ETSY/);assert.match(review,/simulated/);
    assert.deepEqual(labels(t),['REFRESH DRAFT','LEAVE AS DRAFT','💰 Product Cost','🧾 Product Summary','❓ What can I do here?','🏠 Home'],'a dry run never offers PUBLISH');
    const activity=await rj(t,'etsy/dry-run/api-activity.json');
    assert.ok(activity.some(a=>a.operation==='createListing'),'simulated operations are logged');
    assert.ok(!(await readdir(t.ws)).includes('etsy')||!(await readdir(join(t.ws,'etsy'))).some(f=>f!=='dry-run'),'dry-run artefacts never mix with live ones');
  }finally{await t.cleanup();}
});

test('3 + 4 + 5-14: deterministic payload from the approved Stage 3 data; only approved customer files and images, in order; Stage 2 and Stage 3 untouched',async()=>{
  const t=await fresh();
  try{
    const prod=await snapshot(join(t.ws,'production')), mkt=await snapshot(join(t.ws,'marketing'));
    await ready(t);
    const payload=await rj(t,'etsy/payload.json'), listing=await rj(t,'marketing/listing.json'), render=await rj(t,'marketing/images/render.json');
    assert.equal(payload.listing.title,listing.title);assert.equal(payload.listing.description,listing.description);
    assert.deepEqual(payload.listing.price,{amount:4.25,currency:'GBP',source:'approved Stage 3 suggested_price_gbp'});
    assert.deepEqual(payload.listing.tags,listing.tags);assert.equal(payload.listing.type,'download');
    assert.deepEqual([payload.listing.who_made,payload.listing.when_made,payload.listing.quantity,payload.listing.should_auto_renew,payload.listing.is_supply],['i_did','made_to_order',999,false,false]);
    assert.deepEqual(payload.listing.taxonomy,{id:1296,path:'Paper & Party Supplies > Paper > Greeting Cards',source:'Etsy seller taxonomy: exact path match of the approved category',approved_category:listing.category_suggestion});
    assert.deepEqual(payload.properties.apply.map(p=>[p.property_name,p.values[0]]),[['Occasion','Christmas'],['Primary color','Red'],['Secondary color','Green']]);
    // Images: exactly the approved ten, rank order preserved, PNG as approved (no conversion).
    assert.deepEqual(payload.images.map(i=>i.file),render.map(r=>`marketing/images/${r.file}`));
    for(const i of payload.images)assert.equal(i.sha256,sha(await readFile(join(t.ws,i.file))));
    assert.ok(payload.images.every(i=>i.conversion.startsWith('none')));
    const uploads=await rj(t,'etsy/uploads.json');
    assert.deepEqual(uploads.images.map(i=>i.rank),[1,2,3,4,5,6,7,8,9,10]);
    assert.deepEqual(t.fake.images.get([...t.fake.listings.keys()][0]).map(x=>x.rank),[1,2,3,4,5,6,7,8,9,10]);
    // Customer delivery: one verified ZIP with exactly the Stage 2 build-record outputs.
    const record=await rj(t,'production/build-record.json'), dm=await rj(t,'etsy/delivery/delivery-manifest.json');
    assert.equal(payload.files.length,1);assert.equal(payload.files[0].name,`${record.package}.zip`);
    assert.equal(dm.verification.passed,true);
    const zip=unzip(await readFile(join(t.ws,dm.zip.file)));
    assert.deepEqual(Object.keys(zip).sort(),Object.keys(record.outputs).map(r=>`${record.package}/${r}`).sort());
    for(const [rel,o] of Object.entries(record.outputs))assert.equal(sha(Buffer.from(zip[`${record.package}/${rel}`])),o.sha256);
    assert.ok(!Object.keys(zip).some(n=>/\.json$|qc|marketing|proof|prompt|reference|\/\./i.test(n)),'no internal files');
    // Deterministic: preparing again gives the same payload hash and reuses the ZIP.
    const {Stage4}=await import('../src/stage4/index.mjs');
    const again=await new Stage4({productDir:t.ws,product:await t.load(),client:t.fake,mode:'live',config:{shopId:t.fake.shopId,seller:SELLER}}).prepare();
    assert.equal(again.payloadSha,payload.payload_sha256);
    // Stage 2 and Stage 3 untouched.
    assert.deepEqual(await snapshot(join(t.ws,'production')),prod);assert.deepEqual(await snapshot(join(t.ws,'marketing')),mkt);
    assert.equal((await t.load()).api_usage.length,t.usage0,'zero OpenAI usage');
  }finally{await t.cleanup();}
});

test('11: taxonomy is verified against Etsy, never guessed; an unresolved category stops before any write',async()=>{
  const nodes=[{id:1,name:'Paper & Party Supplies'},{id:2,name:'Paper',parentId:1},{id:3,name:'Greeting Cards',parentId:2},{id:9,name:'Greeting Cards',parentId:undefined}];
  assert.equal(resolveTaxonomy({categoryPath:'Paper & Party Supplies > Paper > Greeting Cards',nodes}).id,3);
  assert.throws(()=>resolveTaxonomy({categoryPath:'Paper > Greeting Cards',nodes}),/not an exact Etsy seller-taxonomy path.*Candidates: 3: Paper & Party Supplies > Paper > Greeting Cards \| 9: Greeting Cards/);
  assert.throws(()=>resolveTaxonomy({categoryPath:'x',nodes,overrideId:77}),/Owner taxonomy_id 77 .* is not in Etsy's seller taxonomy/);
  assert.equal(resolveTaxonomy({categoryPath:'x',nodes,overrideId:9}).id,9);
  const t=await fresh({fake:new FakeEtsy({nodes:[{id:5,name:'Stationery'}]})});
  try{
    const r=await t.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(r.outcome,'failed');assert.match(r.detail,/TAXONOMY_UNRESOLVED/);
    assert.deepEqual(t.fake.writes,[],'nothing created');
    assert.equal((await t.load()).status,'FAILED');
  }finally{await t.cleanup();}
});

test('15 + 16 + 17 + 18: draft recorded immediately; restarts and lost responses never duplicate the listing, an image or the customer file',async()=>{
  const t=await fresh();
  try{
    // Lost response on image 3 (Etsy stored it) -> RETRY after a restart adopts it instead of re-uploading.
    t.fake.failOnce('uploadListingImage',{kind:'network',after:true});
    let r=await t.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(r.outcome,'failed');
    const draft=await rj(t,'etsy/draft.json');
    assert.ok(draft.listing_id,'listing id recorded before uploads');
    let p=await t.load();assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'ETSY_PREPARING');
    t.restart();assert.deepEqual(await t.wf.recover(),[]);
    // Lost response on the customer ZIP too.
    t.fake.failOnce('uploadDigitalFile',{kind:'network',after:true});
    r=await pressRetry(t);assert.equal(r.outcome,'failed');
    t.restart();
    r=await pressRetry(t);assert.equal(r.outcome,'awaiting_etsy_publish_approval',JSON.stringify(r));
    assert.equal(t.fake.count('createListing'),1,'one listing');
    assert.equal(t.fake.count('uploadListingImage'),10,'ten image uploads, none repeated');
    assert.equal(t.fake.count('uploadDigitalFile'),1,'one file upload');
    const u=await rj(t,'etsy/uploads.json');
    assert.ok(u.images.some(i=>i.reconciled)&&u.files[0].reconciled,'lost responses reconciled from Etsy');
    // Crash mid-step (lock held) -> recover -> RETRY resumes without any new write.
    p=await t.load();
    await t.store.save({...transition(transition(p,'etsy_publishing'),'etsy_publish_aborted'),lock:{op:'etsy-refresh',id:'x',at:new Date().toISOString()}});
    t.restart();assert.deepEqual(await t.wf.recover(),['001']);
    const w=t.fake.writes.length;
    assert.equal((await pressRetry(t)).outcome,'awaiting_etsy_publish_approval');
    assert.equal(t.fake.writes.length,w,'no write after a restart');
    // /etsy again on a ready draft only re-verifies (read-only).
    await t.wf.handleUpdate(msg('/etsy 001'));assert.equal(t.fake.writes.length,w);
  }finally{await t.cleanup();}
});

test('15 (create): an uncertain create is reconciled or blocked, a definite Etsy rejection is retried safely',async()=>{
  const a=await fresh();
  try{ // response lost after Etsy created the draft -> adopted, not duplicated
    a.fake.failOnce('createListing',{kind:'network',after:true});
    assert.equal((await a.wf.handleUpdate(msg('/etsy 001'))).outcome,'failed');
    assert.equal((await pressRetry(a)).outcome,'awaiting_etsy_publish_approval');
    assert.equal(a.fake.count('createListing'),1);assert.match((await rj(a,'etsy/draft.json')).adopted,/uncertain create/);
  }finally{await a.cleanup();}
  const b=await fresh();
  try{ // network error before Etsy created anything -> blocked until the owner confirms there is no draft
    b.fake.failOnce('createListing',{kind:'network'});
    await b.wf.handleUpdate(msg('/etsy 001'));
    const r=await pressRetry(b);assert.equal(r.outcome,'failed');assert.match(r.detail,/UNCERTAIN_CREATE/);
    assert.equal(b.fake.count('createListing'),1,'never a blind second create');
    assert.equal((await b.wf.handleUpdate(msg('/etsy 001 confirm-no-draft'))).outcome,'etsy_no_draft_confirmed');
    assert.equal((await pressRetry(b)).outcome,'awaiting_etsy_publish_approval');
    assert.equal(b.fake.count('createListing'),2);assert.equal(b.fake.listings.size,1);
  }finally{await b.cleanup();}
  const c=await fresh();
  try{ // Etsy answered 400: nothing was created, so a retry may create
    c.fake.failOnce('createListing',{kind:'http',status:400});
    await c.wf.handleUpdate(msg('/etsy 001'));
    assert.match((await c.load()).last_error.message,/ETSY_VALIDATION_ERROR/);
    assert.equal((await pressRetry(c)).outcome,'awaiting_etsy_publish_approval');assert.equal(c.fake.listings.size,1);
  }finally{await c.cleanup();}
});

test('19-24: the draft is read back from Etsy; wrong title, price, a missing image or file fail verification; an active listing is critical',async()=>{
  for(const [name,mutate,re] of [
    ['title',(f,id)=>f.edit(id,{title:'Something else'}),/title: expected/],
    ['price',(f,id)=>f.edit(id,{priceAmount:9.99}),/price: expected GBP 4\.25, Etsy has GBP 9\.99/],
    ['missing image',(f,id)=>f.images.get(id).pop(),/listing image count: expected 10, Etsy has 9/],
    ['missing file',(f,id)=>f.files.set(id,[]),/digital file count: expected 1, Etsy has 0/]]){
    const t=await fresh();
    try{
      // Change Etsy after the last upload, before the read-back verification.
      const orig=t.fake.uploadDigitalFile.bind(t.fake);
      t.fake.uploadDigitalFile=async(...a)=>{const r=await orig(...a);mutate(t.fake,[...t.fake.listings.keys()][0]);return r;};
      const r=await t.wf.handleUpdate(msg('/etsy 001'));
      assert.equal(r.outcome,'failed',name);assert.match(r.detail,/VERIFY_FAILED/);assert.match(r.detail,re,name);
      assert.ok(!texts(t).some(x=>x.includes('ETSY DRAFT READY')),`${name}: no review`);
      assert.equal(t.fake.count('activateListing'),0);
    }finally{await t.cleanup();}
  }
  const t=await fresh();
  try{
    const orig=t.fake.uploadDigitalFile.bind(t.fake);
    t.fake.uploadDigitalFile=async(...a)=>{const r=await orig(...a);t.fake.edit([...t.fake.listings.keys()][0],{state:'active'});return r;};
    const r=await t.wf.handleUpdate(msg('/etsy 001'));
    assert.match(r.detail,/CRITICAL_ACTIVE/);assert.equal((await t.load()).last_error.retryable,false);
  }finally{await t.cleanup();}
});

test('25 + 32 + 31: /etsy never publishes; with ETSY_PUBLISH_ENABLED off there is no PUBLISH button and a forged press is refused',async()=>{
  assert.deepEqual(stage4Config({}),{dryRun:true,draftWritesEnabled:false,publishEnabled:false,publishFlag:false,mode:'dry-run',shopId:undefined,seller:{whoMade:null,whenMade:null,quantity:999}});
  assert.equal(stage4Config({ETSY_PUBLISH_ENABLED:'true'}).publishEnabled,false,'never while dry run is on');
  assert.equal(stage4Config({ETSY_STAGE4_DRY_RUN:'false'}).mode,'blocked','no writes unless ETSY_DRAFT_WRITES_ENABLED=true');
  assert.equal(stage4Config({ETSY_STAGE4_DRY_RUN:'false',ETSY_DRAFT_WRITES_ENABLED:'true',ETSY_PUBLISH_ENABLED:'yes'}).publishEnabled,false,'only the exact string "true"');
  const t=await fresh({publishEnabled:false});
  try{
    await ready(t);
    assert.equal(t.fake.count('activateListing'),0);
    const review=texts(t).find(x=>x.startsWith('🏪 PRODUCT #001 — ETSY DRAFT READY'));
    for(const line of ['DRAFT — NOT LIVE','Price:\n£4.25','Tags:\n13/13','Listing images:\n10/10','Digital files:\n1/1','Stage 2 production:\nVERIFIED','Stage 3 marketing:\nVERIFIED','Nothing is live on Etsy.'])assert.ok(review.includes(line),line);
    assert.match(review,/Etsy draft:\nVERIFIED/);assert.match(review,/Publishing is switched off on this server/);
    assert.deepEqual(labels(t),['🔗 Open Etsy Editor','REFRESH DRAFT','LEAVE AS DRAFT','💰 Product Cost','🧾 Product Summary','❓ What can I do here?','🏠 Home']);
    const p=await t.load();
    const r=await t.wf.handleUpdate(press(encode('epublish','001',p.review.nonce)));
    assert.equal(r.outcome,'publish_disabled');assert.equal(t.fake.count('activateListing'),0);
  }finally{await t.cleanup();}
});

test('26 + 27 + 33 + 16-success: PUBLISH asks for a second confirmation; only CONFIRM PUBLISH activates, and PUBLISHED needs Etsy to read back ACTIVE',async()=>{
  const fake=new FakeEtsy({serverPublishEnabled:true});
  const t=await fresh({publishEnabled:true,fake});
  try{
    await ready(t);
    assert.deepEqual(labels(t),['PUBLISH','🔗 Open Etsy Editor','REFRESH DRAFT','LEAVE AS DRAFT','💰 Product Cost','🧾 Product Summary','❓ What can I do here?','🏠 Home']);
    assert.equal((await pressLabel(t,'PUBLISH')).outcome,'awaiting_publish_confirmation');
    assert.equal(fake.count('activateListing'),0,'PUBLISH alone never publishes');
    const confirm=texts(t).at(-1);
    assert.match(confirm,/^⚠️ PUBLISH PRODUCT #001\?/);assert.match(confirm,/may trigger Etsy's normal listing charges/);assert.match(confirm,/Price:\n£4\.25/);
    assert.deepEqual(labels(t),['CONFIRM PUBLISH','KEEP AS DRAFT']);
    const r=await pressLabel(t,'CONFIRM PUBLISH');
    assert.equal(r.outcome,'published',JSON.stringify(r));
    assert.equal(fake.count('activateListing'),1);
    const p=await t.load();assert.equal(p.status,'PUBLISHED');assert.ok(p.etsy.published_at);
    const rec=await rj(t,'etsy/publish-record.json');
    assert.equal(rec.status,'published');assert.equal(rec.remote_state,'active');assert.equal(rec.final_price.amount,4.25);
    assert.match(rec.listing_url,/^https:\/\/www\.etsy\.com\/listing\//);
    assert.match(texts(t).at(-1),/^🎉 PRODUCT #001 — LIVE ON ETSY[\s\S]*Status:\nLIVE/);
    assert.equal(p.api_usage.length,t.usage0,'zero OpenAI usage across the whole of Stage 4');
    assert.equal((await t.wf.handleUpdate(msg('/etsy 001'))).outcome,'nothing_to_do','PUBLISHED is terminal');
    assert.throws(()=>transition(p,'rejected'),/Cannot apply/);
  }finally{await t.cleanup();}
});

test('28: a stale confirmation is refused after the Etsy draft changed (manual edit), and nothing is activated',async()=>{
  const fake=new FakeEtsy({serverPublishEnabled:true});
  const t=await fresh({publishEnabled:true,fake});
  try{
    await ready(t);await pressLabel(t,'PUBLISH');
    fake.edit([...fake.listings.keys()][0],{priceAmount:1.99});
    const r=await pressLabel(t,'CONFIRM PUBLISH');
    assert.equal(r.outcome,'etsy_publish_aborted');assert.equal(fake.count('activateListing'),0);
    assert.ok(r.reasons.some(x=>/price differs/.test(x))&&r.reasons.some(x=>/changed since the PUBLISH button was pressed/.test(x)));
    const p=await t.load();assert.equal(p.status,'AWAITING_ETSY_PUBLISH_APPROVAL');assert.equal(p.etsy.publish_request,null);
    // REFRESH DRAFT reports the drift; publishing stays blocked; nothing is overwritten on Etsy.
    const w=fake.writes.length;
    await t.wf.handleUpdate(msg('/etsy 001'));
    assert.match(texts(t).at(-1),/differs from the approved listing\. Publishing is blocked\.[\s\S]*price: expected GBP 4\.25, Etsy has GBP 1\.99/);
    assert.deepEqual(labels(t),['🔗 Open Etsy Editor','REFRESH DRAFT','LEAVE AS DRAFT','💰 Product Cost','🧾 Product Summary','❓ What can I do here?','🏠 Home']);assert.equal(fake.writes.length,w);
    // Owner undoes the edit on Etsy -> REFRESH -> PUBLISH is offered again.
    fake.edit([...fake.listings.keys()][0],{priceAmount:4.25});
    await pressLabel(t,'REFRESH DRAFT');assert.deepEqual(labels(t),['PUBLISH','🔗 Open Etsy Editor','REFRESH DRAFT','LEAVE AS DRAFT','💰 Product Cost','🧾 Product Summary','❓ What can I do here?','🏠 Home']);
    // An old confirm button is out of date.
    const old=encode('econfirm','001','aaaaaaaaaaaa');assert.equal((await t.wf.handleUpdate(press(old))).outcome,'stale');
  }finally{await t.cleanup();}
});

test('29 + 30: a changed Stage 2 file or Stage 3 image blocks publishing',async()=>{
  for(const which of ['stage2','stage3']){
    const fake=new FakeEtsy({serverPublishEnabled:true});
    const t=await fresh({publishEnabled:true,fake});
    try{
      await ready(t);await pressLabel(t,'PUBLISH');
      if(which==='stage2'){const rec=await rj(t,'production/build-record.json');const rel=Object.keys(rec.outputs).find(r=>r.endsWith('.pdf'));await appendFile(join(t.ws,'production/deliverables',rec.package,rel),'x');}
      else await appendFile(join(t.ws,'marketing/images/05-design-a.png'),'x');
      const r=await pressLabel(t,'CONFIRM PUBLISH');
      assert.equal(r.outcome,'etsy_publish_aborted',which);assert.equal(fake.count('activateListing'),0,which);
      assert.ok(r.reasons.some(x=>/changed/.test(x)),JSON.stringify(r.reasons));
      assert.equal((await t.load()).status,'AWAITING_ETSY_PUBLISH_APPROVAL');
    }finally{await t.cleanup();}
  }
});

test('34: a failed or interrupted activation is retryable, never duplicates the listing, and RETRY never activates again',async()=>{
  // Etsy activated it but the response was lost -> RETRY reads Etsy and completes, without a second activation.
  const fake=new FakeEtsy({serverPublishEnabled:true});
  const t=await fresh({publishEnabled:true,fake});
  try{
    await ready(t);await pressLabel(t,'PUBLISH');
    fake.failOnce('activateListing',{kind:'network',after:true});
    const r=await pressLabel(t,'CONFIRM PUBLISH');assert.equal(r.outcome,'failed');
    let p=await t.load();assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'AWAITING_ETSY_PUBLISH_APPROVAL');
    assert.equal((await rj(t,'etsy/publish-record.json')).status,'activation_outcome_unknown');
    assert.equal((await pressRetry(t)).outcome,'published');
    assert.equal(fake.count('activateListing'),1);assert.equal(fake.count('createListing'),1);
    assert.equal((await t.load()).status,'PUBLISHED');
  }finally{await t.cleanup();}
  // Etsy rejected the activation -> RETRY finds a draft and returns to review; a new PUBLISH + CONFIRM is required.
  const fake2=new FakeEtsy({serverPublishEnabled:true});
  const u=await fresh({publishEnabled:true,fake:fake2});
  try{
    await ready(u);await pressLabel(u,'PUBLISH');
    fake2.failOnce('activateListing',{kind:'http',status:409});
    await pressLabel(u,'CONFIRM PUBLISH');
    const r=await pressRetry(u);assert.equal(r.outcome,'awaiting_etsy_publish_approval');
    assert.equal(fake2.count('activateListing'),1,'RETRY did not activate');
    assert.equal((await u.load()).status,'AWAITING_ETSY_PUBLISH_APPROVAL');assert.equal(fake2.listings.size,1);
  }finally{await u.cleanup();}
});

test('35: secrets never reach product.json, Stage 4 records, the activity log or Telegram',async()=>{
  const t=await fresh();
  try{
    t.fake.failOnce('uploadListingImage',{kind:'network'});
    await t.wf.handleUpdate(msg('/etsy 001'));
    t.fake.failOnce('getSellerTaxonomyNodes',{kind:'http',status:500});
    const stored=[JSON.stringify(await t.load()),JSON.stringify(t.telegram.sent)];
    for(const f of await readdir(join(t.ws,'etsy')))if(f.endsWith('.json'))stored.push(await readFile(join(t.ws,'etsy',f),'utf8'));
    const all=stored.join('\n');
    for(const s of [SECRET_TOKEN,SECRET_KEY,'S3cr3tAcc3ssT0kenValue'])assert.ok(!all.includes(s),`leaked ${s.slice(0,8)}…`);
    assert.match(all,/NETWORK_ERROR/);assert.match(all,/\[redacted/);
    const activity=await rj(t,'etsy/api-activity.json');
    assert.ok(activity.length>10&&activity.every(a=>!('headers' in a)&&!('body' in a)));
    assert.deepEqual(Object.keys(activity[0]).sort(),['at','http_status','method','ok','operation','remote_id','resource','retry_count','write'].sort());
    const s=makeSanitizer(['my-shared-secret-value']);
    assert.equal(s('Authorization: Bearer 123.abcdefghijklmnopqrstuvwxyz token my-shared-secret-value https://api.etsy.com/v3/x?code=zzz'),
      'Authorization: Bearer [redacted] token [redacted] https://api.etsy.com/v3/x?[query-redacted]');
  }finally{await t.cleanup();}
});

test('17-18 + manual edits: LEAVE AS DRAFT keeps the Etsy draft; an unmanaged extra image on Etsy stops further uploads',async()=>{
  const t=await fresh();
  try{
    await ready(t);
    assert.equal((await pressLabel(t,'LEAVE AS DRAFT')).outcome,'etsy_kept_draft');
    assert.equal(t.fake.listings.size,1);assert.equal([...t.fake.listings.values()][0].state,'draft');
    assert.equal((await t.load()).status,'AWAITING_ETSY_PUBLISH_APPROVAL');
  }finally{await t.cleanup();}
  const u=await fresh();
  try{
    u.fake.failOnce('uploadListingImage',{kind:'network'});   // stops after 0 images
    await u.wf.handleUpdate(msg('/etsy 001'));
    const id=[...u.fake.listings.keys()][0];u.fake.images.get(id).push({listing_image_id:1,rank:1,full_width:1200,full_height:900});   // owner added a photo on Etsy
    const r=await pressRetry(u);assert.match(r.detail,/REMOTE_DRIFT/);
    assert.equal(u.fake.count('uploadListingImage'),1);
  }finally{await u.cleanup();}
});

test('config: missing seller declarations or a blocked mode stop /etsy before anything happens; a failed Stage 4 product can never be rejected',async()=>{
  const t=await fresh({seller:{whoMade:null,whenMade:null,quantity:999}});
  try{
    const r=await t.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(r.outcome,'etsy_not_configured');assert.match(texts(t).at(-1),/ETSY_SELLER_WHO_MADE is not set[\s\S]*ETSY_SELLER_WHEN_MADE is not set/);
    assert.equal(t.fake.calls.length,0);assert.equal((await t.load()).status,'MARKETING_APPROVED');
  }finally{await t.cleanup();}
  const b=await fresh({mode:'blocked'});
  try{assert.equal((await b.wf.handleUpdate(msg('/etsy 001'))).outcome,'etsy_not_configured');assert.equal(b.factoryCalls(),0);}finally{await b.cleanup();}
  const c=await fresh();
  try{
    c.fake.failOnce('checkAuth',{kind:'auth'});
    const r=await c.wf.handleUpdate(msg('/etsy 001'));assert.match(r.detail,/AUTH_ERROR/);assert.deepEqual(c.fake.writes,[],'auth checked before any write');
    const p=await c.load();assert.equal(canApply(p,'rejected'),false);
    assert.equal((await c.wf.handleUpdate(press(encode('cancel','001',(await c.load()).review.nonce)))).outcome,'etsy_left');assert.equal((await c.load()).status,'FAILED');
    await c.wf.handleUpdate(msg('/cancel'));assert.notEqual((await c.load()).status,'REJECTED');
  }finally{await c.cleanup();}
});

test('31: activation is reachable only through the gated publish path',async()=>{
  const read=p=>readFile(new URL(p,import.meta.url),'utf8');
  const files={'../src/stage4/engine.mjs':await read('../src/stage4/engine.mjs'),'../src/orchestrator/workflow.mjs':await read('../src/orchestrator/workflow.mjs'),
    '../src/stage4/dry-run.mjs':await read('../src/stage4/dry-run.mjs'),'../src/stage4/etsy-live.mjs':await read('../src/stage4/etsy-live.mjs')};
  // The only caller of activateListing is Stage4.publish(), called only by runEtsyPublish (CONFIRM PUBLISH).
  assert.equal((files['../src/stage4/engine.mjs'].match(/\.activateListing\(/g)??[]).length,1);
  assert.match(files['../src/stage4/engine.mjs'],/async publish\(\{expectedFingerprint\}\)\{\n    if\(this\.mode!=='live'\)[\s\S]*?if\(this\.config\.publishEnabled!==true\)[\s\S]*?revalidateForPublish/);
  assert.equal((files['../src/orchestrator/workflow.mjs'].match(/engine\.publish\(/g)??[]).length,1);
  assert.match(files['../src/orchestrator/workflow.mjs'],/async runEtsyPublish\(productId,actor\)\{[\s\S]*?engine\.publish\(/);
  assert.doesNotMatch(files['../src/stage4/dry-run.mjs'],/state='active'|state:'active'/);
  for(const f of Object.values(files))assert.doesNotMatch(f,/state:\s*['"]active['"]\s*}\)|['"]state['"],\s*['"]active['"]/);
  // In services, only activateListing sends state=active, and it checks the server gate first.
  const svc=await readFile(new URL('../../services/src/etsy/etsy-service.ts',import.meta.url),'utf8');
  assert.equal((svc.match(/state: "active"/g)??[]).length,1);
  assert.match(svc,/async activateListing[\s\S]*?publishEnabled !== true[\s\S]*?ACTIVATE \$\{input\.listingId\}[\s\S]*?state: "active"/);
});

test('control panel on a real Etsy draft: Refresh Draft re-verifies read-only, and publishing is never offered even with the server flag on',async()=>{
  const {menuData}=await import('../src/telegram/menu.mjs');
  const fake=new FakeEtsy({serverPublishEnabled:true});
  const t=await fresh({publishEnabled:true,fake});
  try{
    await ready(t);
    const writes=fake.writes.length, sent=t.telegram.sent.length;
    const r=await t.wf.handleUpdate(press(menuData('refresh','001')));
    assert.equal(r.outcome,'etsy_refreshed');assert.equal(fake.writes.length,writes,'no Etsy write');
    const after=t.telegram.sent.slice(sent);
    assert.deepEqual([...new Set(after.map(s=>s.type))].sort(),['answer','edited'],'the menu message is edited; no Stage 4 review is re-sent');
    const screen=after.find(s=>s.type==='edited');
    assert.match(screen.text,/Etsy draft re-checked: it matches the approved listing/);
    assert.doesNotMatch(JSON.stringify(screen.replyMarkup),/epublish|econfirm|PUBLISH/);
    const listingId=(await t.load()).etsy.listing_id;
    assert.ok(screen.replyMarkup.inline_keyboard.flat().some(b=>b.url===`https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`));
    // Drift is reported on the screen, still read-only.
    fake.edit((await t.load()).etsy.listing_id,{priceAmount:1.5});
    await t.wf.handleUpdate(press(menuData('refresh','001')));
    assert.match(t.telegram.sent.at(-1).text,/differs from the approved listing:\n• price: expected GBP 4\.25, Etsy has GBP 1\.50/);
    assert.equal(fake.count('activateListing'),0);assert.equal(fake.writes.length,writes);
  }finally{await t.cleanup();}
});

// ---- Etsy shop sections (ADR-054) through the real /etsy flow ----
test('ADR-054: /etsy reuses the existing "Christmas" section and organises the draft; zero OpenAI; publishing behaviour unchanged',async()=>{
  const t=await fresh({fake:new FakeEtsy({sections:[{shopSectionId:61,title:'Greeting Cards'},{shopSectionId:62,title:'Christmas'}]})});
  try{
    const calls0=t.calls.length;
    await ready(t);
    const p=await t.load(), listing=t.fake.listings.get(p.etsy.listing_id);
    assert.equal(listing.shopSectionId,62,'seasonal section wins over Greeting Cards');
    assert.equal(t.fake.count('createShopSection'),0);
    assert.equal(p.etsy.verification.passed,true);assert.equal(listing.state,'draft');assert.equal(t.fake.count('activateListing'),0);
    const review=texts(t).find(x=>x.startsWith('🏪 PRODUCT #001 — ETSY DRAFT READY'));
    assert.match(review,/🏷 Etsy section\nChristmas\n✅ Listing organised/);
    assert.equal(t.calls.length,calls0,'no OpenAI call');
    const activity=await rj(t,'etsy/api-activity.json');
    assert.ok(activity.some(a=>a.operation==='getShopSections'&&!a.write));assert.ok(activity.some(a=>a.operation==='assignListingSection'&&a.write&&a.ok));
    assert.equal((await rj(t,'etsy/section.json')).status,'assigned');
  }finally{await t.cleanup();}
});

test('ADR-054: a section failure never fails the draft; "/etsy <id> section" retries ONLY that step (no re-create, re-upload, earlier stage or OpenAI)',async()=>{
  const t=await fresh({fake:new FakeEtsy({sections:[],scopes:['listings_r','listings_w','shops_w']})});
  try{
    t.fake.failOnce('assignListingSection',{kind:'http',status:503});
    const before={production:await snapshot(join(t.ws,'production')),marketing:await snapshot(join(t.ws,'marketing'))};
    const calls0=t.calls.length;
    await ready(t);
    let p=await t.load();
    assert.equal(p.status,'AWAITING_ETSY_PUBLISH_APPROVAL');assert.equal(p.etsy.verification.passed,true);
    const review=texts(t).find(x=>x.startsWith('🏪 PRODUCT #001 — ETSY DRAFT READY'));
    assert.match(review,/⚠️ Etsy section not set\nChristmas\nRetry \(free\): \/etsy 001 section/);
    assert.equal(t.fake.sections.filter(s=>s.title==='Christmas').length,1,'the section was created once');
    const writes={create:t.fake.count('createListing'),images:t.fake.count('uploadListingImage'),files:t.fake.count('uploadDigitalFile'),sections:t.fake.count('createShopSection')};
    const c0=t.fake.calls.length;
    const r=await t.wf.handleUpdate(msg('/etsy 001 section'));
    assert.deepEqual([r.outcome,r.status],['etsy_section','assigned']);
    // ONLY the section step: auth check, read the draft and the sections, assign, read back. Nothing else.
    const ops=new Set(t.fake.calls.slice(c0));
    assert.deepEqual([...ops].filter(o=>!['checkAuth','getListing','getShopSections','assignListingSection'].includes(o)),[],[...ops].join(', '));
    assert.match(texts(t).at(-1),/^🏷 Etsy section\nChristmas\n✅ Section created\n✅ Listing organised$/);
    assert.equal(t.fake.listings.get(p.etsy.listing_id).shopSectionId,t.fake.sections[0].shopSectionId);
    assert.deepEqual({create:t.fake.count('createListing'),images:t.fake.count('uploadListingImage'),files:t.fake.count('uploadDigitalFile'),sections:t.fake.count('createShopSection')},writes,
      'no listing, image, file or section created again');
    assert.deepEqual({production:await snapshot(join(t.ws,'production')),marketing:await snapshot(join(t.ws,'marketing'))},before,'Stage 2 and Stage 3 untouched');
    assert.equal(t.calls.length,calls0,'no OpenAI call');
    p=await t.load();assert.equal(p.status,'AWAITING_ETSY_PUBLISH_APPROVAL');
    // Again: a no-op.
    const w=t.fake.writes.length;
    assert.equal((await t.wf.handleUpdate(msg('/etsy 001 section'))).status,'already_assigned');assert.equal(t.fake.writes.length,w);
  }finally{await t.cleanup();}
});

test('ADR-054: dry run and missing scope: a missing section is reported with the fix, nothing is created; /etsy <id> section before a draft is refused',async()=>{
  const t=await fresh({mode:'dry-run'});
  try{
    assert.equal((await t.wf.handleUpdate(msg('/etsy 001 section'))).outcome,'nothing_to_do');
    await ready(t);
    const review=texts(t).find(x=>x.startsWith('🏪 PRODUCT #001 — ETSY DRAFT READY'));
    assert.match(review,/⚠️ Etsy section missing\nChristmas\nCreate it on Etsy \(or re-authorise with shops_w\), then:\nRetry \(free\): \/etsy 001 section/);
    assert.equal(t.fake.calls.length,0);
  }finally{await t.cleanup();}
});

// ---------------------------------------------------------------------------
// Product #019 regression: Etsy reads text back HTML-encoded ("Ghost's" -> "Ghost&#39;s"), the verifier
// compared raw strings, and Telegram showed only the first line of VERIFY_FAILED (nothing after the colon).
test('#019: an Etsy-encoded apostrophe verifies (equivalent text); a genuine description change still fails and names the field in Telegram',async()=>{
  const ok=await fresh();
  try{
    await ready(ok);
    const id=[...ok.fake.listings.keys()][0];
    assert.match((await ok.fake.getListing(id)).description,/family&#39;s/,'the fake reads back like Etsy');
    assert.equal((await rj(ok,'etsy/verification.json')).passed,true);
  }finally{await ok.cleanup();}
  const t=await fresh();
  try{
    const orig=t.fake.uploadDigitalFile.bind(t.fake);
    t.fake.uploadDigitalFile=async(...a)=>{const r=await orig(...a);const id=[...t.fake.listings.keys()][0];
      t.fake.edit(id,{description:t.fake.listings.get(id).description.replace("family's","family's festive")});return r;};
    const r=await t.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(r.outcome,'failed');assert.match(r.detail,/VERIFY_FAILED/);
    const m=(await t.load()).last_error.message;
    assert.match(m.split('\n')[0],/does not match the approved listing \(description\)/,'the field is on the first line');
    assert.match(m,/• description: .*differs at character \d+: approved ".*family's Christmas.*", Etsy ".*family's festive/);
    const shown=texts(t).at(-1);
    assert.match(shown,/Etsy draft verification failed/);assert.match(shown,/Mismatch:\n• description: /);
    assert.match(shown,/Draft remains safe and unpublished\./);
    assert.ok(!/[{}]/.test(shown)&&shown.length<900,'short, no JSON');
    assert.equal(t.fake.count('activateListing'),0);assert.equal(t.calls.length,0,'zero OpenAI');
  }finally{await t.cleanup();}
});

test('#019: RETRY after VERIFY_FAILED reuses the existing draft, makes no Etsy write, never duplicates and never publishes',async()=>{
  const t=await fresh({publishEnabled:true});
  try{
    let id, good;
    const orig=t.fake.uploadDigitalFile.bind(t.fake);
    t.fake.uploadDigitalFile=async(...a)=>{const r=await orig(...a);id=[...t.fake.listings.keys()][0];good=t.fake.listings.get(id).description;
      t.fake.edit(id,{description:`${good} Extra.`});return r;};
    assert.equal((await t.wf.handleUpdate(msg('/etsy 001'))).outcome,'failed');
    assert.equal((await rj(t,'etsy/draft.json')).listing_id,id);
    const writes=t.fake.writes.length;
    t.fake.edit(id,{description:good});           // the cause is fixed on Etsy
    t.restart();
    assert.equal((await pressRetry(t)).outcome,'awaiting_etsy_publish_approval');
    assert.equal(t.fake.count('createListing'),1,'one draft, reused');assert.equal(t.fake.listings.size,1);
    assert.equal(t.fake.writes.length,writes,'Retry made no Etsy write');
    assert.equal((await rj(t,'etsy/draft.json')).listing_id,id);
    assert.equal(t.fake.count('activateListing'),0,'nothing publishes automatically, even with publishing enabled');
    assert.equal(t.fake.listings.get(id).state,'draft');assert.notEqual((await t.load()).status,'PUBLISHED');
  }finally{await t.cleanup();}
});
