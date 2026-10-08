// Telegram UX v2: dashboard, guided next steps, contextual help, failure
// screen and retry safety, native command menu, costs/billing link, factory
// adapters. Telegram, OpenAI and Etsy are fakes: zero network, zero OpenAI
// calls, zero Etsy writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { msg, press, fakeTelegram, fakeAi, CHAT, USER } from './helpers.mjs';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { STATES } from '../src/orchestrator/state.mjs';
import { encode, failureKeyboard, nextStepKeyboard, conceptKeyboard, proofKeyboard, productionKeyboard, marketingKeyboard, etsyReviewKeyboard } from '../src/telegram/approvals.mjs';
import { menuData, parseMenu, BOT_COMMANDS, OPENAI_USAGE_URL, homeScreen, productScreen, failureScreen, contextHelpScreen, costsScreen, costsUnavailableScreen, toolsScreen,
  statusScreen, etsyDraftsScreen, newProductScreen, helpScreen, productActions, productCounts } from '../src/telegram/menu.mjs';
import { retrySafety } from '../src/telegram/ui.mjs';
import { loadPricing, CostLedger } from '../src/costs/index.mjs';

const TABLE={schema_version:1,version:'test-v1',provider:'openai',currency:'USD',models:{'fake-text':{unit:'per_1m_tokens',text:{input:2,cached_input:0.2,cache_write:2.5,output:12}},
  'fake-image':{unit:'per_1m_tokens',image:{text_input:5,image_input:8,image_output:30}}},fx:{pair:'USD_GBP',rate:0.8,as_of:'2026-09-26',source:'test'}};
async function bot({stage4Config={},ledger=true,plan={}}={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-ux-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=fakeAi(plan);
  const costs=ledger?{ledger:new CostLedger({dir:join(root,'state','costs'),pricing:loadPricing({table:TABLE,env:{}})}),pricing:loadPricing({table:TABLE,env:{}})}:null;
  const wf=new Workflow({store,registry,telegram,ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{},costs,
    stage4:{config:{mode:'dry-run',publishEnabled:false,seller:{whoMade:'i_did',whenMade:'made_to_order',quantity:999},...stage4Config},connected:()=>true}});
  return {root,store,registry,telegram,calls,wf,cleanup:()=>rm(root,{recursive:true,force:true})};
}
const shown=t=>t.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=t=>shown(t).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const find=(t,label)=>shown(t).replyMarkup.inline_keyboard.flat().find(b=>b.text===label);
const nav=(s,a='',b='')=>press(menuData(s,a,b));
const P=(status,extra={})=>({product_id:'014',name:'Winter Windows',status,review:{nonce:'abcdef123456'},status_history:[],api_usage:[],...extra});
const failed=(step,message,resume='PRODUCTION_READY')=>P('FAILED',{resume_state:resume,last_error:{step,message,at:'2026-09-28T10:00:00.000Z'}});
const allButtons=kb=>kb.inline_keyboard.flat();

test('native command menu: owner-facing commands only, registered once via setMyCommands, every one handled',async()=>{
  assert.deepEqual(BOT_COMMANDS.map(c=>c.command),['start','newproduct','products','status','produce','market','etsy','seo','costs','help']);
  assert.ok(BOT_COMMANDS.every(c=>/^[a-z0-9_]{1,32}$/.test(c.command)&&c.description.length>0&&c.description.length<=256));
  assert.ok(!BOT_COMMANDS.some(c=>/publish|confirm|debug|reset/.test(c.command)),'no publish or internal commands');
  const t=await bot();
  try{
    assert.deepEqual(await t.wf.registerCommands(),{outcome:'registered',count:BOT_COMMANDS.length});
    assert.deepEqual(t.telegram.sent.find(s=>s.type==='commands').commands,BOT_COMMANDS);
    // Every advertised command does something (never the generic hint).
    for(const {command} of BOT_COMMANDS){const r=await t.wf.handleUpdate(msg(`/${command}`));assert.notEqual(r.outcome,'hint',command);assert.notEqual(r.outcome,'error',command);}
  }finally{await t.cleanup();}
  // A client without setMyCommands (older fakes) is tolerated.
  const {Workflow:W}=await import('../src/orchestrator/workflow.mjs');
  assert.deepEqual(await new W({store:null,registry:null,telegram:{},auth:()=>true}).registerCommands(),{outcome:'unsupported'});
});

test('home dashboard: counts from local state, tracked spend, attention when a product failed; concise',async()=>{
  const products=[P('AWAITING_CREATIVE_APPROVAL',{product_id:'001'}),P('AWAITING_ETSY_PUBLISH_APPROVAL',{product_id:'002'}),P('REJECTED',{product_id:'003'}),P('PUBLISHED',{product_id:'004'}),failed('marketing','x','PRODUCTION_APPROVED')];
  const h=homeScreen({products,spend:1.234});
  assert.match(h.text,/🏭 Factory\n⚠️ 1 product needs attention/);
  assert.match(h.text,/📦 Active products: 3\n🏪 Etsy drafts: 1/);assert.match(h.text,/💰 Tracked API spend\n£1\.23/);
  assert.ok(h.text.length<500,'mobile friendly');
  assert.match(homeScreen({products:[]}).text,/💰 Tracked API spend\nnot tracked/);
  assert.deepEqual(h.keyboard.inline_keyboard.map(r=>r.map(b=>b.text)),[['✨ Create Product'],['📦 My Products','🏪 Etsy Drafts'],['🔎 SEO'],['💰 Costs','📊 Factory'],['⚙️ Tools','❓ Help']]);
});

test('create product without commands: Describe a product, then the next plain message starts it (free); the prompt expires',async()=>{
  const t=await bot();
  try{
    await t.wf.handleUpdate(nav('new'));
    assert.deepEqual(labels(t),['✏️ Describe a product','❓ What can I do here?','🏠 Home']);
    assert.equal((await t.wf.handleUpdate(nav('describe'))).outcome,'awaiting_description');
    const r=await t.wf.handleUpdate(msg('christmas colouring book for adults'));
    assert.equal(r.outcome,'created');assert.equal((await t.store.load(r.productId)).request.text,'christmas colouring book for adults');
    assert.equal(t.calls.length,0,'creating a product makes no OpenAI call');
    // Next steps on the creation message: Generate Concepts goes through the cost confirmation.
    assert.deepEqual(labels(t),['▶️ Generate Concepts','📦 Product','🏠 Home']);
    assert.equal(find(t,'▶️ Generate Concepts').callback_data,menuData('ask',r.productId,'go'));
    // The prompt is used once: a later message is not a product.
    assert.equal((await t.wf.handleUpdate(msg('hello'))).outcome,'hint');
    // Expired prompt: ignored.
    await t.registry.update(x=>{x.pending_by_chat={[String(CHAT)]:{kind:'new_product',at:'2000-01-01T00:00:00.000Z'}};});
    assert.equal((await t.wf.handleUpdate(msg('old idea'))).outcome,'hint');
  }finally{await t.cleanup();}
});

test('guided next steps after approvals: the next stage as a button (paid/Etsy steps via confirmation), product and home',()=>{
  const ask=(id,b)=>menuData('ask',id,b);
  const kb=s=>nextStepKeyboard(P(s));
  assert.deepEqual(allButtons(kb('CREATIVE_APPROVED')).map(b=>[b.text,b.callback_data]),[['🏭 Build Production Files',encode('produce','014','abcdef123456')],['📦 Product',menuData('prod','014')],['🏠 Home',menuData('home')]]);
  assert.deepEqual(allButtons(kb('PRODUCTION_APPROVED'))[0],{text:'🛍 Create Listing & Marketing',callback_data:menuData('mmode','014')},'marketing starts with the style choice');
  assert.deepEqual(allButtons(kb('MARKETING_APPROVED'))[0],{text:'🏪 Create Etsy Draft',callback_data:ask('014','edraft')});
  // Every review message carries "What can I do here?" + Home, without touching its existing buttons.
  for(const k of [conceptKeyboard(P('AWAITING_CONCEPT_SELECTION')),proofKeyboard(P('AWAITING_CREATIVE_APPROVAL')),productionKeyboard(P('AWAITING_PRODUCTION_APPROVAL')),
    marketingKeyboard(P('AWAITING_MARKETING_APPROVAL')),etsyReviewKeyboard(P('AWAITING_ETSY_PUBLISH_APPROVAL'))])
    assert.deepEqual(k.inline_keyboard.at(-1).map(b=>b.text),['❓ What can I do here?','🏠 Home']);
});

test('contextual help: only what applies to the screen or product state, with its commands, and a Back button',async()=>{
  const mr=contextHelpScreen('014',P('AWAITING_MARKETING_APPROVAL'));
  assert.match(mr.text,/^❓ PRODUCT #014 — Marketing \(marketing review\)\n\nAvailable here:\n• View marketing\n• Approve marketing\n• Edit individual images[\s\S]*• Request changes[\s\S]*• Regenerate marketing[\s\S]*• View the product cost\n• Return home\n\nCommands:\n \/market 014\n \/cancel\n \/start\n \/status 014$/);
  assert.doesNotMatch(mr.text,/produce|etsy|newproduct/,'nothing from other stages');
  assert.deepEqual(allButtons(mr.keyboard).map(b=>[b.text,b.callback_data]),[['⬅️ Back',menuData('prod','014')],['🏠 Home',menuData('home')]]);
  assert.match(contextHelpScreen('014',P('CREATIVE_APPROVED')).text,/Build the production files[\s\S]*\/produce 014/);
  assert.match(contextHelpScreen('costs').text,/OpenAI usage and billing/);
  const t=await bot();
  try{
    await t.wf.handleUpdate(msg('/newproduct card'));
    assert.equal((await t.wf.handleUpdate(nav('ctx','001'))).outcome,'context_help');assert.match(shown(t).text,/Generate concepts \(API cost, asks first\)[\s\S]*\/go/);
    assert.equal((await t.wf.handleUpdate(nav('ctx','home'))).outcome,'context_help');assert.match(shown(t).text,/\/newproduct <request>/);
    assert.equal(parseMenu('m1|ctx|evil|'),null,'unknown help context refused');
  }finally{await t.cleanup();}
});

test('retry safety comes from recorded state: free steps direct, paid steps confirmed, uncertain Etsy creation or an active listing get no retry',()=>{
  const kb=p=>allButtons(failureKeyboard(p));
  const free=failed('production','ProductionQcError: production QC failed: x');
  assert.deepEqual(retrySafety(free),{safe:true,paid:false,reason:'Free: completed work is kept and skipped.'});
  assert.deepEqual(kb(free).map(b=>b.text),['🔄 Retry Safe Step','📋 Details','📦 Product','🏠 Home']);
  assert.equal(kb(free)[0].callback_data,encode('retry','014','abcdef123456'),'direct, nonce-protected');
  const paid=failed('marketing','OpenAIError: HTTP 500','PRODUCTION_APPROVED');
  assert.equal(kb(paid)[0].text,'🔄 Retry (API cost)');assert.equal(kb(paid)[0].callback_data,menuData('ask','014','retry'),'paid: confirmation first');
  for(const m of ['Stage4Error: [UNCERTAIN_CREATE] network error during create','Stage4Error: [CRITICAL_ACTIVE] listing active']){
    const p=failed('etsy',m,'ETSY_PREPARING');
    assert.equal(retrySafety(p).safe,false);assert.ok(!kb(p).some(b=>/Retry/.test(b.text)),m);
  }
  assert.match(retrySafety(failed('etsy','[UNCERTAIN_CREATE] x','ETSY_PREPARING')).reason,/confirm-no-draft/);
  assert.equal(retrySafety(failed('mystery','x')).safe,false,'unknown step: never guessed safe');
  assert.equal(retrySafety(P('DRAFT')).safe,false);
});

test('failure screen: short error first, details on request, same retry rules; stale Details on a recovered product is harmless',async()=>{
  const p=failed('marketing',`MarketingQcError: marketing QC failed: product artwork dominates each image: 01-hero 32% < 40%\n${'detail '.repeat(400)}`,'PRODUCTION_APPROVED');
  const s=failureScreen(p);
  assert.match(s.text,/^⚠️ Product #014 needs attention\n\nMarketingQcError: marketing QC failed: product artwork dominates each image: 01-hero 32% < 40%/);
  assert.match(s.text,/Step {16}marketing\nWhen {16}2026-09-28 10:00 UTC\nResumes from {8}PRODUCTION_APPROVED/);
  assert.ok(s.text.length<=4000);
  assert.deepEqual(allButtons(s.keyboard).map(b=>b.text),['🔄 Retry (API cost)','✖️ Cancel','📦 Product','🏠 Home']);
  assert.equal(allButtons(s.keyboard)[1].callback_data,menuData('ask','014','mcancel'),'destructive cancel is confirmed');
  const t=await bot();
  try{
    await t.wf.handleUpdate(msg('/newproduct card'));
    // Details for a product that is not failed (e.g. already retried): just the product screen.
    assert.equal((await t.wf.handleUpdate(nav('fail','001'))).outcome,'stale');
  }finally{await t.cleanup();}
});

test('paid and destructive confirmations; stale buttons stay harmless (old a1 refused, old navigation just re-renders)',async()=>{
  const t=await bot();
  try{
    await t.wf.handleUpdate(msg('/newproduct cute ghost activity book'));
    const p=await t.store.load('001');
    await t.wf.handleUpdate(nav('ask','001','go'));assert.match(shown(t).text,/This will incur OpenAI API cost/);
    await t.wf.handleUpdate(nav('ask','001','reject'));assert.match(shown(t).text,/cannot be undone/);assert.deepEqual(labels(t),['Confirm','Keep Product']);
    const confirm=find(t,'Confirm').callback_data;
    assert.equal((await t.wf.handleUpdate(press(confirm))).outcome,'rejected');
    assert.equal((await t.wf.handleUpdate(press(confirm))).outcome,'stale','a repeated destructive press does nothing');
    assert.equal((await t.wf.handleUpdate(press(encode('go','001',p.review.nonce)))).outcome,'stale','an old paid button never spends');
    assert.equal(t.calls.length,0);
    for(const s of ['home','prods','costs','status','tools','help','etsy'])assert.notEqual((await t.wf.handleUpdate(nav(s,s==='prods'?'0':''))).outcome,'error',s);
    assert.equal((await t.wf.handleUpdate(nav('ask','001','go'))).outcome,'stale','a rejected product offers no paid action');
  }finally{await t.cleanup();}
});

test('costs screen: ledger totals, honest wording, official OpenAI usage/billing URL button (no scraping, no credit claim)',async()=>{
  assert.equal(OPENAI_USAGE_URL,'https://platform.openai.com/usage');
  const s=costsScreen({today:0.1,last7:0.5,month:1,all:2,products:4,average:0.5,unpriced:0},{trackingStartedAt:'2026-09-28T09:00:00.000Z'});
  assert.match(s.text,/^💰 API COSTS\n\nTracked since: 28 Sep 2026\n\nToday {15}£0\.10\nLast 7 days {9}£0\.50\nThis month {10}£1\.00\nAll tracked {9}£2\.00\n\nAverage \/ product {3}£0\.50/);
  assert.match(s.text,/Factory costs are calculated from recorded API usage\.\nOpenAI's dashboard is the source of truth for your account billing and remaining credits\./);
  assert.doesNotMatch(s.text,/remaining credit[^s]|balance: |credit left/i,'no claim about remaining credit');
  const url=allButtons(s.keyboard).find(b=>b.text==='🌐 OpenAI Usage / Billing');
  assert.deepEqual(url,{text:'🌐 OpenAI Usage / Billing',url:'https://platform.openai.com/usage'});
  assert.equal(new URL(url.url).hostname,'platform.openai.com');
  assert.deepEqual(allButtons(costsUnavailableScreen().keyboard).find(b=>b.url).url,OPENAI_USAGE_URL,'available even without a ledger');
  assert.equal(allButtons(toolsScreen().keyboard).find(b=>b.url).url,OPENAI_USAGE_URL);
  const t=await bot({ledger:false});
  try{assert.equal((await t.wf.handleUpdate(msg('/costs'))).outcome,'costs');assert.match(shown(t).text,/Cost tracking is not configured/);}finally{await t.cleanup();}
});

test('factory screen: adapters from the production registry (colouring book available), no API calls on refresh',async()=>{
  const t=await bot({stage4Config:{mode:'dry-run'}});
  try{
    await t.wf.handleUpdate(msg('/newproduct card'));
    const calls=t.calls.length;
    assert.equal((await t.wf.handleUpdate(msg('/status'))).outcome,'status','active product: its screen');
    assert.match(shown(t).text,/^📦 PRODUCT #001/);
    assert.equal((await t.wf.handleUpdate(nav('status'))).outcome,'status');
    const s=shown(t).text;
    assert.match(s,/Etsy\s+🧪 Dry run \(shop connected\)/);assert.match(s,/Publishing\s+🔒 Manual/);
    assert.match(s,/Adapters\nGreeting card\s+🟢 Ready\nColouring book\s+🟢 Ready/);
    // Readiness is the whole path: a full-book adapter without Stage 1 full-book generation is not "Ready".
    assert.match(statusScreen({counts:productCounts([]),openaiConfigured:true,etsy:{mode:'dry-run'},adapters:[{label:'Greeting card',ready:true},{label:'Colouring book',ready:false,note:'Stage 1 incomplete'}]}).text,
      /Greeting card\s+🟢 Ready\nColouring book\s+🟡 Stage 1 incomplete/);
    await t.wf.handleUpdate(nav('status'));assert.equal(t.calls.length,calls,'refresh: zero OpenAI calls');
    assert.match(statusScreen({counts:productCounts([]),openaiConfigured:false,etsy:{mode:'blocked'},adapters:[{label:'Greeting card',ready:true}]}).text,/Etsy\s+⛔ Blocked/);
  }finally{await t.cleanup();}
});

test('commands stay backwards compatible and gain shortcuts: /products, /status <n>, /etsy with no product shows drafts',async()=>{
  const t=await bot();
  try{
    assert.equal((await t.wf.handleUpdate(msg('/status'))).outcome,'status');assert.match(shown(t).text,/^📊 FACTORY/,'no product: the factory');
    assert.equal((await t.wf.handleUpdate(msg('/etsy'))).outcome,'menu_etsy');assert.match(shown(t).text,/^🏪 ETSY DRAFTS/);
    await t.wf.handleUpdate(msg('/newproduct card'));
    assert.equal((await t.wf.handleUpdate(msg('/products'))).outcome,'menu_products');assert.match(labels(t)[0],/^#001/);
    assert.equal((await t.wf.handleUpdate(msg('/status 1'))).outcome,'status');assert.match(shown(t).text,/^📦 PRODUCT #001/);
    assert.equal((await t.wf.handleUpdate(msg('/status 777'))).outcome,'usage');
    for(const c of ['/produce','/market','/etsy 001','/go','/previews','/cancel','/menu','/help'])assert.notEqual((await t.wf.handleUpdate(msg(c))).outcome,'error',c);
  }finally{await t.cleanup();}
});

test('no Etsy publish button on ANY menu, help, dashboard or guidance screen, in every product state',()=>{
  const screens=[homeScreen(),newProductScreen(),helpScreen(),toolsScreen(),costsUnavailableScreen(),etsyDraftsScreen([]),contextHelpScreen('home'),contextHelpScreen('etsy'),
    statusScreen({counts:{},openaiConfigured:true,etsy:{mode:'live',connected:true,publishFlag:true},adapters:[]})];
  for(const s of STATES){
    const p=P(s,{etsy:{mode:'live',listing_id:1},last_error:{step:'etsy',message:'x'},resume_state:'ETSY_PREPARING'});
    screens.push(productScreen(p),contextHelpScreen(p.product_id,p),failureScreen(p),{keyboard:nextStepKeyboard(p)},{keyboard:failureKeyboard(p)},{keyboard:{inline_keyboard:productActions(p)}});
  }
  for(const s of screens){
    const data=JSON.stringify(s.keyboard);
    assert.doesNotMatch(data,/epublish|econfirm/,'no publish callback');
    assert.ok(!allButtons(s.keyboard).some(b=>/publish/i.test(b.text)),`no publish label: ${s.text?.split('\n')[0]}`);
  }
});
