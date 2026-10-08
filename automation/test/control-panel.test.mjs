// Telegram control panel + OpenAI cost accounting. Telegram, OpenAI and Etsy
// are fakes: zero network, zero OpenAI calls, zero Etsy writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { msg, press, fakeTelegram, fakeAi, CHAT, USER, button } from './helpers.mjs';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { transition } from '../src/orchestrator/state.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { parseMenu, menuData, productActions, productScreen, productsScreen, confirmScreen, homeScreen, helpScreen, statusScreen, productCounts, CONFIRM } from '../src/telegram/menu.mjs';
import { loadPricing, priceUsage, CostLedger, productCost, factoryTotals, byModel, byProduct, gbp, stageOf } from '../src/costs/index.mjs';

// The real #009 usage shapes (from product.json api_usage).
const TEXT_USAGE={input_tokens:1406,input_tokens_details:{cache_write_tokens:1403,cached_tokens:0},output_tokens:2460,output_tokens_details:{reasoning_tokens:1675},total_tokens:3866};
const IMAGE_USAGE={input_tokens:909,input_tokens_details:{image_tokens:0,text_tokens:909},output_tokens:343,output_tokens_details:{image_tokens:343,text_tokens:0},total_tokens:1252};
const TABLE={schema_version:1,version:'test-v1',provider:'openai',currency:'USD',models:{
  'fake-text':{unit:'per_1m_tokens',text:{input:2,cached_input:0.2,cache_write:2.5,output:12}},
  'fake-image':{unit:'per_1m_tokens',image:{text_input:5,image_input:8,image_output:30}}},fx:{pair:'USD_GBP',rate:0.8,as_of:'2026-09-26',source:'test'}};

async function panel({pricing=loadPricing({table:TABLE,env:{}}),ledger=true,stage4Config={},plan={}}={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-panel-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=fakeAi(plan);
  const costs=ledger?{ledger:new CostLedger({dir:join(root,'state','costs'),pricing}),pricing}:null;
  const wf=new Workflow({store,registry,telegram,ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{},costs,
    stage4:{config:{mode:'dry-run',publishEnabled:false,publishFlag:false,seller:{whoMade:'i_did',whenMade:'made_to_order',quantity:999},...stage4Config},connected:()=>true}});
  return {root,store,telegram,calls,wf,costs,cleanup:()=>rm(root,{recursive:true,force:true})};
}
const last=t=>t.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=t=>last(t).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const data=t=>last(t).replyMarkup.inline_keyboard.flat().map(b=>b.callback_data??b.url);
const nav=(screen,a='',b='')=>press(menuData(screen,a,b));
const fakeP=(status,extra={})=>({product_id:'010',name:'Robin Cards',status,review:{nonce:'abcdef123456'},status_history:[],api_usage:[],...extra});

test('/start and /menu show the control panel; /help lists the commands grouped',async()=>{
  const t=await panel();
  try{
    for(const c of ['/start','/menu']){
      assert.equal((await t.wf.handleUpdate(msg(c))).outcome,'menu');
      assert.match(last(t).text,/^✨ LUMIUMX FACTORY\n\nCreate, manufacture and prepare digital products for Etsy\.\n\n🏭 Factory\nRunning normally\n\n📦 Active products: 0\n🏪 Etsy drafts: 0\n\n💰 Tracked API spend\n£0\.00\n\nWhat would you like to do\?$/);
      assert.deepEqual(labels(t),['✨ Create Product','📦 My Products','🏪 Etsy Drafts','🔎 SEO','💰 Costs','📊 Factory','⚙️ Tools','❓ Help']);
    }
    assert.equal((await t.wf.handleUpdate(msg('/help'))).outcome,'help');
    const h=last(t).text;
    for(const x of ['Product','/newproduct <request>','/products','/status','/cancel','Review','Production & marketing','/produce <number>','/market <number>','Etsy','/etsy <number>','Costs','/costs','commands remain available as shortcuts'])assert.ok(h.includes(x),x);
    assert.doesNotMatch(h,/PUBLISH|\/publish/,'no publishing command is advertised');
    // Help button edits the menu message in place.
    const r=await t.wf.handleUpdate({...nav('help'),callback_query:{...nav('help').callback_query,message:{message_id:777,chat:{id:CHAT}}}});
    assert.equal(r.edited,true);assert.equal(t.telegram.sent.at(-1).type,'edited');assert.equal(t.telegram.sent.at(-1).messageId,777);
    // Existing slash commands still work.
    assert.equal((await t.wf.handleUpdate(msg('/newproduct robin christmas card'))).outcome,'created');
    assert.equal((await t.wf.handleUpdate(msg('/status'))).outcome,'status');
  }finally{await t.cleanup();}
});

test('product browser: newest first, stage labels, pagination; selecting opens the product screen',async()=>{
  const t=await panel();
  try{
    for(let i=0;i<10;i++)await t.wf.handleUpdate(msg(`/newproduct card ${i}`));
    await t.wf.handleUpdate(nav('prods','0'));
    let l=labels(t);
    assert.match(l[0],/^#010  🎨 Creative/);assert.equal(l.filter(x=>x.startsWith('#')).length,8);
    assert.ok(l.includes('Older ▶️'));assert.match(last(t).text,/page 1\/2/);
    await t.wf.handleUpdate(nav('prods','1'));
    l=labels(t);assert.deepEqual(l.filter(x=>x.startsWith('#')).map(x=>x.slice(0,4)),['#002','#001']);assert.ok(l.includes('◀️ Newer'));
    await t.wf.handleUpdate(nav('prod','001'));
    assert.match(last(t).text,/^📦 PRODUCT #001\n\ncard 0\n\nStage: 🎨 Creative/);
    assert.deepEqual(labels(t),['▶️ Generate Concepts','✖️ Cancel Product','💰 Product Cost','❓ What can I do here?','⬅️ Back','🏠 Home']);
    // Another chat's product is never shown.
    assert.equal((await t.wf.handleUpdate({update_id:9,callback_query:{id:'x',from:{id:USER},message:{message_id:1,chat:{id:999}},data:menuData('prod','001')}})).outcome,'unauthorized');
  }finally{await t.cleanup();}
});

test('state-aware buttons: only valid actions per state, and never an Etsy publish action',async()=>{
  const cases={
    AWAITING_CONCEPT_SELECTION:['👀 View Concepts','🔄 New Ideas','✖️ Cancel Product'],
    AWAITING_CREATIVE_APPROVAL:['👀 View Proofs','✅ Approve Creative','✏️ Give Feedback','🔄 Regenerate','❌ Reject'],
    AWAITING_PRODUCTION_APPROVAL:['📦 View Deliverables','✅ Approve Production','🔄 Rebuild (no API cost)','✖️ Cancel Production'],
    AWAITING_MARKETING_APPROVAL:['👀 View Marketing','✅ Approve Marketing','🧩 Edit Individual Images','✏️ Regenerate Listing Copy','🖼 Regenerate Marketing Images','🔄 Regenerate All','✖️ Cancel Marketing'],
    MARKETING_APPROVED:['🏪 Create Etsy Draft','🧾 Product Summary'],
    AWAITING_ETSY_PUBLISH_APPROVAL:['🔗 Open Etsy Editor','🔄 Refresh Draft','🧾 Product Summary'],
    PRODUCTION_BUILDING:[],MARKETING_GENERATING:[],PUBLISHING:[],REJECTED:[]};
  for(const [status,want] of Object.entries(cases)){
    const p=fakeP(status,{etsy:{mode:'live',listing_id:4584343288}});
    assert.deepEqual(productActions(p).flat().map(b=>b.text),want,status);
  }
  assert.deepEqual(productActions(fakeP('AWAITING_ETSY_PUBLISH_APPROVAL',{etsy:{mode:'live',listing_id:4584343288}}))[0][0],{text:'🔗 Open Etsy Editor',url:'https://www.etsy.com/your/shops/me/listing-editor/edit/4584343288'});
  assert.deepEqual(productActions(fakeP('AWAITING_ETSY_PUBLISH_APPROVAL',{etsy:{mode:'dry-run',listing_id:900000001}})).flat().map(b=>b.text),['🔄 Refresh Draft','🧾 Product Summary'],'no editor link for a simulated draft');
  assert.deepEqual(productActions(fakeP('AWAITING_CREATIVE_APPROVAL',{lock:{op:'proofs'}})),[],'nothing while a step runs');
  // Across EVERY state, no menu ever carries an Etsy publish/confirm action.
  const {STATES}=await import('../src/orchestrator/state.mjs');
  for(const s of STATES){
    const scr=productScreen(fakeP(s,{etsy:{mode:'live',listing_id:1}}));
    assert.doesNotMatch(JSON.stringify(scr),/epublish|econfirm|PUBLISH/,s);
  }
  for(const scr of [homeScreen(),helpScreen()])assert.doesNotMatch(JSON.stringify(scr),/epublish|econfirm|PUBLISH/);
});

test('callback validation: malformed, unknown or oversized data is refused; confirmations only for offered actions',async()=>{
  for(const bad of ['m1|nope||','m1|prod|abc|','m1|prod|01|','m1|ask|001|epublish','m1|ask|001|drop','m1|home|'+'x'.repeat(70),'m1|prods|../|','m2|home||',42,null])
    assert.equal(parseMenu(bad),null,String(bad));
  assert.deepEqual(parseMenu('m1|ask|009|edraft'),{screen:'ask',a:'009',b:'edraft'});
  assert.throws(()=>menuData('ask','009','epublish!'),/unsafe/);
  assert.ok(!Object.hasOwn(CONFIRM,'epublish'),'publishing cannot even be confirmed from the menus');
  const t=await panel();
  try{
    assert.equal((await t.wf.handleUpdate(press('m1|evil|x|'))).outcome,'unparseable');
    await t.wf.handleUpdate(msg('/newproduct card'));
    // Create Etsy Draft is not valid for a DRAFT product: the confirmation is refused.
    assert.equal((await t.wf.handleUpdate(nav('ask','001','edraft'))).outcome,'stale');
    assert.match(last(t).text,/That action is no longer available/);
  }finally{await t.cleanup();}
});

test('confirmation flows: expensive and destructive actions ask first; confirming runs the same operation as the slash command, once',async()=>{
  const t=await panel({plan:{}});
  try{
    await t.wf.handleUpdate(msg('/newproduct cute ghost activity book'));
    let p=await t.store.load('001');
    // Cancel product -> Confirm / Keep Product.
    await t.wf.handleUpdate(nav('ask','001','reject'));
    assert.deepEqual(labels(t),['Confirm','Keep Product']);
    assert.equal((await t.wf.handleUpdate(nav('prod','001'))).outcome,'menu_product','Keep Product just goes back');
    // Generate concepts -> explicit API-cost confirmation.
    await t.wf.handleUpdate(nav('ask','001','go'));
    assert.match(last(t).text,/This will incur OpenAI API cost/);
    assert.deepEqual(labels(t),['Generate — API cost will be incurred','Cancel']);
    const confirmData=data(t)[0];
    assert.equal(confirmData,encode('go','001',p.review.nonce),'the confirm button is the ordinary nonce-protected product action');
    const before=t.calls.length;
    const r=await t.wf.handleUpdate(press(confirmData));
    assert.ok(t.calls.length>before,'the /go operation ran (fake OpenAI)');
    p=await t.store.load('001');assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');
    // The same button pressed again is stale: nothing runs twice.
    const n=t.calls.length;
    assert.equal((await t.wf.handleUpdate(press(confirmData))).outcome,'stale');assert.equal(t.calls.length,n);
    // Create Etsy Draft confirmation wording.
    const ready={...p,status:'MARKETING_APPROVED'};
    assert.deepEqual(confirmScreen(ready,'edraft').keyboard.inline_keyboard.flat().map(b=>b.text),['🏪 Create Etsy Draft','Cancel']);
    assert.match(confirmScreen(ready,'edraft').text,/DRAFT only\. Nothing is published/);
  }finally{await t.cleanup();}
});

test('cost calculation: authoritative usage x versioned prices, cache writes, images, GBP, unknown models unpriced',()=>{
  const pricing=loadPricing({table:TABLE,env:{}});
  const text=priceUsage({kind:'text',model:'fake-text',usage:TEXT_USAGE},pricing);
  assert.equal(text.priced,true);
  // (3 uncached x $2 + 1403 cache-write x $2.50 + 2460 output x $12) per 1M
  assert.equal(text.source_cost,(3*2+1403*2.5+2460*12)/1e6);
  const img=priceUsage({kind:'image',model:'fake-image',usage:IMAGE_USAGE},pricing);
  assert.equal(img.source_cost,(909*5+343*30)/1e6);
  assert.match(priceUsage({kind:'text',model:'gpt-9-unknown',usage:TEXT_USAGE},pricing).reason,/no price configured for model "gpt-9-unknown"/);
  assert.match(priceUsage({kind:'text',model:'fake-text',usage:null},pricing).reason,/no usage reported/);
  // The shipped table prices the models this factory actually uses.
  const real=loadPricing({env:{}});
  assert.equal(real.version,'openai-2026-09-28');assert.equal(real.currency,'USD');
  assert.ok(priceUsage({kind:'text',model:'gpt-5.6-terra',usage:TEXT_USAGE},real).priced);
  assert.ok(priceUsage({kind:'image',model:'gpt-image-2.5-flare',usage:IMAGE_USAGE},real).priced);
  // GBP rate: config, or the env override; a malformed table is refused (never guessed).
  assert.equal(loadPricing({table:TABLE,env:{AUTOMATION_FX_USD_GBP:'0.5'}}).fx.rate,0.5);
  assert.equal(loadPricing({table:{...TABLE,fx:undefined},env:{}}).fx,null);
  assert.throws(()=>loadPricing({table:{...TABLE,models:{x:{unit:'per_1m_tokens',text:{input:'cheap'}}}},env:{}}),/not a number/);
  assert.throws(()=>loadPricing({table:{...TABLE,currency:'EUR'},env:{}}),/Invalid/);
  assert.deepEqual(['ideas','concept-preview','proof-image','listing','marketing-scene'].map(s=>stageOf(s,null)),['creative_concepts','creative_concepts','artwork','listing_copy','marketing']);
  assert.equal(stageOf('proof-image','direction-change'),'creative_revisions');
  assert.deepEqual([gbp(0),gbp(0.004),gbp(0.0263),gbp(12.5),gbp(null)],['£0.00','<£0.01','£0.03','£12.50','—']);
});

test('ledger: append-only priced events with pricing version and GBP rate; old events keep their version; unpriced when unknown',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lumiumx-ledger-'));
  try{
    const dir=join(root,'costs');
    const v1=new CostLedger({dir,pricing:loadPricing({table:TABLE,env:{}}),now:()=>new Date('2026-09-28T10:00:00Z')});
    assert.equal(v1.startedAt(),null,'reading never starts tracking');
    v1.record({productId:'009',operation:'marketing',records:[{step:'listing',model:'fake-text',kind:'text',usage:TEXT_USAGE,at:'2026-09-28T09:59:00Z',outcome:'rejected',request:{vision_inputs:0}},
      {step:'marketing-scene',model:'fake-image',kind:'image',usage:IMAGE_USAGE,at:'2026-09-28T09:59:30Z',outcome:'ok',request:{images:1,size:'1024x1024',quality:'medium'}},
      {step:'listing',model:'mystery',kind:'text',usage:TEXT_USAGE,at:'2026-09-28T09:59:40Z'}]});
    // A price change is a NEW version; earlier events are never re-priced.
    const v2=new CostLedger({dir,pricing:loadPricing({table:{...TABLE,version:'test-v2',models:{...TABLE.models,'fake-text':{unit:'per_1m_tokens',text:{input:4,cached_input:0.4,cache_write:5,output:24}}},fx:{...TABLE.fx,rate:0.75}},env:{}}),now:()=>new Date('2026-09-28T11:00:00Z')});
    v2.record({productId:'010',operation:'ideation',records:[{step:'ideas',model:'fake-text',kind:'text',usage:TEXT_USAGE,at:'2026-09-28T10:59:00Z'}]});
    const {events,corrupt}=v2.events();
    assert.equal(corrupt,0);assert.equal(events.length,4);
    const [a,b,c,d]=events;
    assert.deepEqual([a.pricing_version,a.fx.rate,a.source_currency,a.stage,a.outcome,a.priced],['test-v1',0.8,'USD','listing_copy','rejected',true],'a rejected (billed) call is still priced');
    assert.equal(a.gbp_cost,Math.round(a.source_cost*0.8*1e8)/1e8);
    assert.deepEqual(b.request,{images:1,size:'1024x1024',quality:'medium'});assert.equal(b.usage.image_output_tokens,343);
    assert.deepEqual([c.priced,c.gbp_cost,c.source_cost],[false,null,null]);assert.match(c.unpriced_reason,/no price configured/);
    assert.deepEqual([d.pricing_version,d.fx.rate],['test-v2',0.75]);assert.equal(d.source_cost,2*a.source_cost);
    const raw=await readFile(join(dir,'ledger.jsonl'),'utf8');
    assert.equal(raw.trim().split('\n').length,4,'one line per event, appended');
    assert.doesNotMatch(raw,/sk-|Bearer|prompt|api_key/i,'no secrets or prompts');
    assert.equal(v2.startedAt(),'2026-09-28T10:00:00.000Z','tracking start never moves');
    // Aggregation.
    const tot=factoryTotals(events,new Date('2026-09-28T12:00:00Z'));
    assert.equal(tot.products,2);assert.equal(tot.unpriced,1);assert.equal(tot.all,a.gbp_cost+b.gbp_cost+d.gbp_cost);assert.equal(tot.today,tot.all);
    assert.deepEqual(byModel(events).map(r=>r.model),['fake-text','fake-image','mystery']);
    assert.deepEqual(byProduct(events).map(r=>r.productId),['010','009']);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('product cost: tracked stages, £0.00 only for deterministic stages actually reached, pre-tracking calls reported, not priced',()=>{
  const events=[{product_id:'009',stage:'listing_copy',gbp_cost:0.02,priced:true},{product_id:'009',stage:'marketing',gbp_cost:0.03,priced:true},
    {product_id:'009',stage:'marketing',gbp_cost:null,priced:false},{product_id:'008',stage:'artwork',gbp_cost:9,priced:true}];
  const p={product_id:'009',status_history:[{to:'PRODUCTION_BUILDING'},{to:'PRODUCTION_QC'},{to:'MARKETING_PLANNING'}],
    api_usage:[{at:'2026-09-27T10:00:00Z'},{at:'2026-09-27T11:00:00Z'},{at:'2026-09-29T10:00:00Z'}]};
  const c=productCost(p,events,'2026-09-28T00:00:00Z');
  assert.equal(c.total,0.05);assert.equal(c.unpriced,1);assert.equal(c.untrackedCalls,2);
  assert.deepEqual(c.rows.map(r=>[r.label,r.gbp]),[['Listing copy',0.02],['Marketing generation',0.03],['Production',0],['QC',0]]);
  assert.ok(!c.rows.some(r=>r.label==='Etsy'),'Etsy not reached: no £0.00 claimed');
  const scr=productScreen({...p,name:'Robin',status:'AWAITING_MARKETING_APPROVAL',review:{nonce:'abcdef123456'}},{cost:c}).text;
  assert.match(scr,/Estimated API cost: £0\.05 \(\+1 unpriced call\)/);
  assert.match(scr,/Tracked since 2026-09-28 00:00 UTC/);
  assert.match(scr,/2 earlier OpenAI calls were made before tracking began and are not included\./);
  assert.equal(productCost({...p,status_history:[]},[],null).untrackedCalls,3,'no tracking yet: all recorded calls are untracked');
  // A product whose calls ALL predate tracking is shown as not tracked, never as £0.00.
  const old=productScreen({...p,name:'Robin',status:'AWAITING_ETSY_PUBLISH_APPROVAL',etsy:{mode:'live',listing_id:1},review:{nonce:'abcdef123456'}},{cost:productCost(p,[],'2026-09-30T00:00:00Z')}).text;
  assert.match(old,/Estimated API cost: not tracked — all 3 OpenAI calls predate cost tracking/);assert.doesNotMatch(old,/£0\.00/);
  const fresh=productScreen({product_id:'011',status:'DRAFT',review:{nonce:'abcdef123456'},status_history:[],api_usage:[]},{cost:productCost({product_id:'011',status_history:[],api_usage:[]},[],'2026-09-30T00:00:00Z')}).text;
  assert.match(fresh,/Estimated API cost: £0\.00 \(no OpenAI calls yet\)/);
});

test('ledger writes from real workflow runs; an accounting failure never breaks product state',async()=>{
  const t=await panel();
  try{
    await t.wf.handleUpdate(msg('/newproduct cute ghost activity book'));await t.wf.handleUpdate(msg('/go'));
    const p=await t.store.load('001');
    const {events}=t.costs.ledger.events();
    assert.equal(events.length,p.api_usage.length,'one ledger event per metered OpenAI call');
    assert.ok(events.every(e=>e.product_id==='001'&&e.pricing_version==='test-v1'&&e.operation));
    assert.ok(p.api_usage.every(u=>!('request' in u)),'product.json keeps its api_usage shape');
    assert.ok(events.some(e=>e.kind==='image'&&e.request?.size),'image size/quality recorded in the ledger');
    // /costs renders from the ledger.
    assert.equal((await t.wf.handleUpdate(msg('/costs'))).outcome,'costs');
    const s=last(t).text;
    assert.match(s,/^💰 API COSTS\n\nTracked since: \d{1,2} \w{3} \d{4}\n\nToday {15}<?£/);
    for(const x of ['Today','Last 7 days','This month','All tracked','Average / product',"OpenAI's dashboard is the source of truth for your account billing and remaining credits."])assert.ok(s.includes(x),x);
    assert.deepEqual(labels(t),['📦 By Product','🤖 By Model','🌐 OpenAI Usage / Billing','❓ What can I do here?','🏠 Home']);
    await t.wf.handleUpdate(nav('costm'));assert.match(last(t).text,/fake-text[\s\S]*Prices: test-v1 \(USD\); GBP rate 0\.8/);
    await t.wf.handleUpdate(nav('pcost','001'));assert.match(last(t).text,/PRODUCT #001 — ESTIMATED API COST[\s\S]*Creative concepts[\s\S]*Total/);
    // The home dashboard shows the tracked spend from the same ledger.
    await t.wf.handleUpdate(msg('/start'));assert.ok(last(t).text.includes(`💰 Tracked API spend\n${gbp(factoryTotals(events).all)}`),last(t).text);
    assert.match(last(t).text,/📦 Active products: 1\n/);
  }finally{await t.cleanup();}
  // A ledger that throws: the step still succeeds and product.json is intact.
  const u=await panel();
  try{
    u.costs.ledger.record=()=>{throw new Error('disk full');};
    await u.wf.handleUpdate(msg('/newproduct cute ghost activity book'));
    const r=await u.wf.handleUpdate(msg('/go'));
    assert.notEqual(r.outcome,'failed');
    const p=await u.store.load('001');assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');assert.ok(p.api_usage.length>0);
  }finally{await u.cleanup();}
});

test('factory status: local state and config only, zero API calls; publishing shown as manual',async()=>{
  const t=await panel({stage4Config:{mode:'live',publishEnabled:false,publishFlag:true}});
  try{
    await t.wf.handleUpdate(msg('/newproduct card one'));await t.wf.handleUpdate(msg('/newproduct card two'));
    const calls=t.calls.length;
    assert.equal((await t.wf.handleUpdate(nav('status'))).outcome,'status');
    const s=last(t).text;
    assert.match(s,/^📊 FACTORY\n\nTelegram\s+🟢 Online\nOpenAI\s+🟢 Configured\nProduction\s+🟢 Ready\nMarketing\s+🟢 Ready\nEtsy\s+🟢 Connected\nPublishing\s+🔒 Manual/);
    assert.match(s,/ETSY_PUBLISH_ENABLED is on, but publishing is never offered from these screens/);
    assert.match(s,/Adapters\nGreeting card\s+🟢 Ready\nColouring book\s+🟢 Ready/);
    assert.match(s,/Creative\s+2/);assert.match(s,/Refresh makes no API calls/);
    assert.deepEqual(labels(t),['🔄 Refresh','❓ What can I do here?','🏠 Home']);
    assert.equal((await t.wf.handleUpdate(nav('status'))).outcome,'status','refresh');
    assert.equal(t.calls.length,calls,'no OpenAI call');
    assert.deepEqual(statusScreen({counts:productCounts([]),openaiConfigured:false,etsy:{mode:'dry-run',connected:false,publishFlag:false}}).text.match(/Publishing\s+(.*)/)[1],'🔒 Manual');
  }finally{await t.cleanup();}
});
