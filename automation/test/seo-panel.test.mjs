// Telegram SEO & market research panel (ADR-036). Telegram, OpenAI and Etsy are
// fakes/spies: zero network, zero OpenAI calls, zero Etsy calls. Products are
// COPIES of real product files in a temp folder; the repository is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { msg, press, fakeTelegram, fakeAi, CHAT, USER } from './helpers.mjs';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { menuData, parseMenu } from '../src/telegram/menu.mjs';
import { SeoState } from '../src/seo/state.mjs';
import { importResearchCycle } from '../src/seo/panel.mjs';
import { parseSeoData } from '../src/seo/screens.mjs';
import { validateIdea, validateProfile, validateEvidencePackage } from '../../seo/src/index.mjs';

const REPO=join(import.meta.dirname,'..','..');
const NOW=new Date('2026-09-30T10:00:00Z');
const COPY={'005-cozy-autumn-adventures':['listing/listing.json','README.md'],'009-christmas-greetings-card':['product.json','etsy/payload.json','marketing/listing.json'],
  '013-christmas-card':['product.json','marketing/listing.json']};
const sha=b=>createHash('sha256').update(b).digest('hex');

async function panel(){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-seo-')), productsDir=join(root,'products'), stateDir=join(root,'state');
  for(const [ws,files] of Object.entries(COPY))for(const f of files){await mkdir(join(productsDir,ws,f,'..'),{recursive:true});await copyFile(join(REPO,'products',ws,f),join(productsDir,ws,f));}
  const store=new ProductStore({productsDir}), registry=new Registry({stateDir}), telegram=fakeTelegram(), {ai,calls}=fakeAi();
  const etsyCalls=[];
  const make=()=>new Workflow({store,registry,telegram,ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{},now:()=>NOW,
    stage4:{config:{mode:'dry-run',publishEnabled:false},connected:()=>true,liveClient:async()=>{etsyCalls.push('liveClient');throw new Error('Etsy must not be called');}}});
  const t={root,productsDir,stateDir,store,telegram,calls,etsyCalls,wf:make(),restart(){t.wf=make();},state:new SeoState({stateDir,now:()=>NOW}),
    cleanup:()=>rm(root,{recursive:true,force:true})};
  return t;
}
const screens=t=>t.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup);
const last=t=>screens(t).at(-1);
const text=t=>last(t).text;
const labels=t=>last(t).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const buttonData=(t,label)=>{const b=last(t).replyMarkup.inline_keyboard.flat().find(x=>x.text===label||x.text.startsWith(label));if(!b)throw new Error(`no "${label}" in ${labels(t).join(' | ')}`);return b.callback_data;};
const tap=async(t,label)=>t.wf.handleUpdate(press(buttonData(t,label)));
const send=async(t,s)=>t.wf.handleUpdate(msg(s));
const go=async(t,screen,a='',b='')=>t.wf.handleUpdate(press(menuData(screen,a,b)));
const sessionOf=async(t,productId)=>(await t.state.read()).sessions[(await t.state.read()).product_links[productId]];
const latestSession=async t=>Object.values((await t.state.read()).sessions).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))[0];
/** Owner types one Marketplace Insights capture through the Telegram entry flow and saves it. */
async function capture(t,{searches,daily=null,results,conversion,trendValue=null,related=null}){
  await tap(t,'📝 Enter Results');
  await send(t,searches);
  if(daily)await send(t,daily);
  await send(t,results);
  await tap(t,conversion);
  if(trendValue===null)await tap(t,'Skip Trend');else await send(t,trendValue);
  if(related===null)await tap(t,'No Related Terms');else await send(t,related);
  assert.match(text(t),/^📊 REVIEW INSIGHT/);
  return tap(t,'✅ Save Observation');
}
async function newIdea(t,{description='cozy autumn colouring pages for adults',themes='autumn, cozy'}={}){
  await go(t,'seonew');await tap(t,'✏️ Describe a Product');await send(t,description);
  await tap(t,'✅ Use:');await send(t,themes);
  await tap(t,'✅ Done');                       // audience (pre-selected from the description's own words)
  await tap(t,'⬜ Digital');await tap(t,'⬜ Printable');await tap(t,'✅ Done');
  await tap(t,'Skip');                         // styles
  return tap(t,'✅ Create Research Plan');
}
const real=async p=>JSON.parse(await readFile(join(REPO,'seo',p),'utf8'));
async function importAcceptanceCycle(t){
  const idea=validateIdea(await real('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
  const profile=await real('fixtures/profiles/cozy-autumn-colouring-adults-structured.json');
  const dir='fixtures/research-cycle/cozy-autumn-real';
  return importResearchCycle(t.state,{idea,profile,captures:[await real(`${dir}/capture-1.json`),await real(`${dir}/capture-2.json`)],finish:await real(`${dir}/owner-finish.json`),
    product_id:'005',name:'Cozy Autumn Adventures',chat_id:CHAT,now:NOW});
}

test('/seo and the home 🔎 SEO button open the SEO dashboard',async()=>{
  const t=await panel();
  try{
    assert.equal((await send(t,'/seo')).outcome,'seo_menu');
    assert.match(text(t),/^🔎 SEO & MARKET RESEARCH/);
    assert.deepEqual(labels(t),['🏪 Audit Existing Product','🆕 Research New Product','🧠 Insights Library','📊 Active Research','🏠 Home']);
    await send(t,'/start');await tap(t,'🔎 SEO');
    assert.match(text(t),/^🔎 SEO & MARKET RESEARCH/);
    assert.ok(parseMenu(menuData('seoprod','005')));assert.equal(parseMenu('m1|seoprod|5|'),null);assert.equal(parseMenu('m1|seonext|../x|'),null);
  }finally{await t.cleanup();}
});

test('existing product audit: product list from local listings; no research yet; current listing; start research asks, never guesses',async()=>{
  const t=await panel();
  try{
    await go(t,'seoprods','0');
    assert.match(text(t),/^🏪 CHOOSE PRODUCT/);
    assert.deepEqual(labels(t).filter(l=>/#\d{3}/.test(l)),['#005 Cozy Autumn Adventures','#009 Robin at the Frosted Gate','#013 Father Christmas on the Night Shift']);
    await tap(t,'#005');
    assert.match(text(t),/^🔎 SEO AUDIT — PRODUCT #005\n\nCozy Autumn Adventures[\s\S]*Current SEO\n────────────\nCozy Autumn Coloring Book Printable[\s\S]*No Marketplace Insights research is attached yet\./);
    assert.deepEqual(labels(t),['🔎 Start SEO Research','📋 Current Listing','🔎 SEO Menu','🏠 Home']);
    await tap(t,'📋 Current Listing');
    assert.match(text(t),/Tags: autumn coloring, fall coloring book/);assert.match(text(t),/local file; Etsy is not read/);
    await tap(t,'⬅️ Back');await tap(t,'🔎 Start SEO Research');
    assert.match(text(t),/What is the product\?[\s\S]*From its own words: coloring pages, coloring book/,'suggestions only from the listing\'s own words');
    await tap(t,'✅ Use:');await send(t,'autumn, fall');
    assert.match(text(t),/Who is it for\?[\s\S]*Selected: none/,'no audience is guessed: the title and excerpt name none');
    assert.deepEqual(t.etsyCalls,[]);assert.equal(t.calls.length,0);
  }finally{await t.cleanup();}
});

test('new product research: describe → confirm details → research plan (17 queries, 4 P1) → view plan',async()=>{
  const t=await panel();
  try{
    await go(t,'seonew');
    assert.deepEqual(labels(t).slice(0,1),['✏️ Describe a Product']);
    await tap(t,'✏️ Describe a Product');await send(t,'cozy autumn colouring pages for adults');
    assert.match(text(t),/From its own words: coloring pages/);
    await tap(t,'✅ Use:');await send(t,'autumn, cozy');
    assert.match(text(t),/Selected: adults/);assert.match(text(t),/Format: coloring pages\nThemes: autumn, cozy/);
    await tap(t,'✅ Done');
    assert.match(text(t),/How is it delivered\?[\s\S]*Selected: none/,'"digital" is never assumed');
    await tap(t,'⬜ Digital');await tap(t,'⬜ Printable');await tap(t,'✅ Done');await tap(t,'Skip');
    assert.match(text(t),/Missing details stay unknown/);
    assert.equal((await tap(t,'✅ Create Research Plan')).outcome,'seo_plan_created');
    assert.match(text(t),/^🔎 RESEARCH PLAN\n\nProduct:\ncozy autumn colouring pages for adults\n\nResearch queries: 17\nP1 required: 4\nP2 optional: 10\nP3 exploration: 3/);
    assert.deepEqual(labels(t),['🚀 Start Research','📋 View Plan','❌ Cancel']);
    await tap(t,'📋 View Plan');
    assert.match(text(t),/▫️ P1 autumn coloring pages\n▫️ P1 fall coloring pages\n▫️ P1 cozy coloring pages\n▫️ P1 adult coloring pages/);
    assert.ok(!/halloween|christmas/i.test(text(t)));
  }finally{await t.cleanup();}
});

test('Marketplace Insights entry: exact and rounded values, daily counts, conversion buttons, trend skip, related terms; nothing saved before Save',async()=>{
  const t=await panel();
  try{
    await newIdea(t);await tap(t,'🚀 Start Research');
    assert.match(text(t),/^🔎 MARKETPLACE INSIGHTS\n\nSearch Etsy Marketplace Insights for:\n\n"autumn coloring pages"\n\nPriority: P1 · required\nReason: theme \+ product format/);
    assert.deepEqual(labels(t),['📝 Enter Results','🚫 Etsy Has No Data','📊 Research Status','🏠 Home'],'no Finish while nothing is expandable');
    const s=await latestSession(t), ws=()=>t.state.open(s.id);
    await tap(t,'📝 Enter Results');
    await send(t,'1.4k');
    assert.match(text(t),/Etsy showed a rounded value: 1\.4k[\s\S]*paste Etsy's 30 daily search counts/);
    await send(t,'1,2,3');assert.match(text(t),/⚠️ expected 30 daily counts, got 3/);
    await send(t,'26,28,26,35,48,27,54,31,44,61,51,41,190,170,31,19,43,36,18,31,41,29,36,42,39,55,31,35,17,24');
    await send(t,'12.9k');
    assert.deepEqual(labels(t),['Very High','High','Typical','Low','Very Low','❌ Cancel']);
    await tap(t,'Very High');
    await send(t,'+18.5');
    await send(t,'coloring pages for adults | 1.6k | 133.4k | High\nautumn leaves coloring');
    assert.match(text(t),/^📊 REVIEW INSIGHT\n\nautumn coloring pages\n\nSearches: 1,359 \(sum of 30 daily counts; Etsy showed 1\.4k\)\nResults: 12,900 \(rounded: Etsy showed 12\.9k\)\nConversion: Very High\nTrend: \+18\.5%\nRelated terms: 2 \(discovery only\)\n\nCaptured:\n30 Sep 2026/);
    assert.equal((await ws()).hasResearch,false,'nothing is written before Save');
    assert.equal((await tap(t,'✅ Save Observation')).outcome,'seo_saved');
    assert.match(text(t),/^✅ INSIGHT CAPTURED\n\nautumn coloring pages\n\nResearch progress:\n1 \/ 4 required observations/);
    const o=(await ws()).research.observations[0];
    assert.deepEqual([o.keyword,o.searches_30d,o.search_results,o.conversion_label,o.trend_percent,o.captured_at],['autumn coloring pages',1359,12900,'very_high',18.5,'2026-09-30']);
    assert.match(o.source.note,/exact sum of Etsy's 30 daily counts \(headline shown as "1\.4k"\)[\s\S]*rounded value "12\.9k"[\s\S]*discovery metadata only/);
    assert.deepEqual(o.related_terms,[{term:'coloring pages for adults',searches_30d:1600,search_results:133400,conversion_label:'high'},{term:'autumn leaves coloring',searches_30d:null,search_results:null,conversion_label:null}]);
    // Next query: trend skipped, rounded searches kept as rounded (and said so).
    await tap(t,'🔎 Next Query');
    assert.match(text(t),/"fall coloring pages"/);
    await tap(t,'📝 Enter Results');await send(t,'2.3k');await tap(t,'Keep rounded 2.3k');await send(t,'29100');await tap(t,'Very High');
    await tap(t,'Skip Trend');await tap(t,'No Related Terms');
    assert.match(text(t),/Searches: 2,300 \(rounded: Etsy showed 2\.3k\)\nResults: 29,100\nConversion: Very High\nTrend: not shown/);
    await tap(t,'✅ Save Observation');
    const f=(await ws()).research.observations.find(x=>x.keyword==='fall coloring pages');
    assert.equal(f.trend_percent,null);assert.match(f.source.note,/Etsy displayed the rounded value "2\.3k"; the exact count is unknown/);
  }finally{await t.cleanup();}
});

test('duplicate submission safety: Save pressed twice, and old buttons after a save, never create a second observation',async()=>{
  const t=await panel();
  try{
    await newIdea(t);await tap(t,'🚀 Start Research');
    const enter=buttonData(t,'📝 Enter Results');
    await t.wf.handleUpdate(press(enter));await send(t,'641');await send(t,'12900');await tap(t,'Very High');await tap(t,'Skip Trend');await tap(t,'No Related Terms');
    const save=buttonData(t,'✅ Save Observation');
    assert.equal((await t.wf.handleUpdate(press(save))).outcome,'seo_saved');
    assert.equal((await t.wf.handleUpdate(press(save))).outcome,'stale');
    assert.equal((await t.wf.handleUpdate(press(enter))).outcome,'stale','the query screen button is out of date');
    const s=await latestSession(t), ws=await t.state.open(s.id);
    assert.equal(ws.research.version,1);assert.equal(ws.research.observations.length,1);
    assert.ok(t.telegram.sent.some(x=>x.type==='answer'&&/Already handled: this button is out of date/.test(x.text??'')));
    // Malformed or foreign s1 data is refused.
    assert.equal(parseSeoData('s1|sav|e123|abc'),null);
    assert.equal((await t.wf.handleUpdate(press('s1|xyz|s0000000000|000000000000'))).outcome,'seo_unknown_session');
    assert.equal((await t.wf.handleUpdate(press('s1|sav|s0000000000|000000000000',{user:9}))).outcome,'unauthorized');
  }finally{await t.cleanup();}
});

test('unavailable flow, expansion recommendation, "why these terms", owner finish confirmation, finish warning and results',async()=>{
  const t=await panel();
  try{
    await newIdea(t);await tap(t,'🚀 Start Research');
    // autumn: captured with related terms; fall and adult captured; cozy: Etsy has no data.
    await capture(t,{searches:'641',results:'12.9k',conversion:'Very High',trendValue:'+18.5',related:'coloring pages for adults | 1.6k | 133.4k | High\nhalloween coloring pages | 5k | 25.5k | High'});
    await tap(t,'🔎 Next Query');await capture(t,{searches:'2300',results:'29100',conversion:'Very High'});
    await tap(t,'🔎 Next Query');
    assert.match(text(t),/"cozy coloring pages"/);
    assert.equal((await tap(t,'🚫 Etsy Has No Data')).outcome,'seo_unavailable');
    assert.ok(t.telegram.sent.some(x=>x.type==='answer'&&/unknown, not zero/.test(x.text??'')));
    assert.match(text(t),/"adult coloring pages"/);
    await capture(t,{searches:'4345',results:'138.5k',conversion:'High',trendValue:'3.2'});
    await tap(t,'🔎 Next Query');
    assert.match(text(t),/^🔎 MORE RESEARCH RECOMMENDED\n\nThe evidence has revealed additional relevant searches\.\n\nRecommended next:\n• coloring pages for adults\n\nResearch budget:\n17 \/ 40 queries\n0 \/ 3 expansion rounds/);
    assert.deepEqual(labels(t),['🔎 Start Next Round','⏹ Finish With Current Evidence','📊 Why These Terms?','🏠 Home']);
    await tap(t,'📊 Why These Terms?');
    assert.match(text(t),/• coloring pages for adults \(STRONG\)\n  STRONG buyer-intent refinement[\s\S]*halloween coloring pages: irrelevant to the original product idea/);
    await tap(t,'⬅️ Back');await tap(t,'🔎 Start Next Round');
    assert.match(text(t),/"coloring pages for adults"\n\nPriority: Round 2 \(expansion\) · required/);
    assert.ok(labels(t).includes('⏹ Finish With Current Evidence'),'finish is offered while the round is pending');
    await tap(t,'⏹ Finish With Current Evidence');
    assert.match(text(t),/^⏹ FINISH SEO RESEARCH\?\n\n1 recommended search has not been researched:\n• coloring pages for adults\n\nIt will remain UNKNOWN\.\n\nIt will NOT:\n• become zero\n• become unavailable\n• become rejected\n• enter scoring\n\nThe factory will score only captured evidence\./);
    assert.deepEqual(labels(t),['✅ Finish & Score','🔎 Continue Research']);
    assert.equal((await tap(t,'✅ Finish & Score')).outcome,'seo_finished_scored');
    const r=text(t);
    assert.match(r,/^🎯 SEO RESEARCH COMPLETE\n\nProduct:\ncozy autumn colouring pages for adults\n\nReadiness:\n🟡 Ready with warnings\n\nConfidence:\nMEDIUM\n\nPRIMARY\nfall coloring pages\n\nSECONDARY\nadult coloring pages/);
    assert.match(r,/Warnings:\n[\s\S]*Research was ended before all recommended expansion terms were captured\. Requested but not researched: coloring pages for adults/);
    assert.deepEqual(labels(t),['📊 View Evidence','🧠 Research Library','🏠 Home'],'no revision for a new product; no publishing');
    // Related-term figures never became evidence; the unresearched term stays unknown.
    const s=await latestSession(t), ws=await t.state.open(s.id), pkg=JSON.parse(await readFile(join(ws.dir,'evidence-package.json'),'utf8'));
    assert.deepEqual(pkg.captured_observations.map(o=>o.keyword),['adult coloring pages','autumn coloring pages','fall coloring pages']);
    assert.ok(!JSON.stringify(pkg.captured_observations).includes('133400')&&!pkg.captured_observations.some(o=>'related_terms' in o));
    assert.deepEqual(pkg.unresearched_terms.map(x=>x.term),['coloring pages for adults']);assert.deepEqual(validateEvidencePackage(pkg,ws.research),{ok:true,errors:[]});
    await tap(t,'📊 View Evidence');
    assert.match(text(t),/Unknown \(not evidence, not zero\):\n• cozy coloring pages \(Etsy had no data\)\n• coloring pages for adults \(not researched: owner finished\)/);
  }finally{await t.cleanup();}
});

test('Product #005 acceptance: the completed real research reproduces the accepted strategy; owner-stopped terms stay unknown',async()=>{
  const t=await panel();
  try{
    const r=await importAcceptanceCycle(t);
    assert.equal(r.readiness,'READY_TO_SCORE_WITH_WARNINGS');
    await go(t,'seoprod','005');
    const a=text(t);
    assert.match(a,/^🔎 SEO AUDIT — PRODUCT #005\n\nCozy Autumn Adventures\n\nResearch: 🟡 Ready with warnings\n\nConfidence: MEDIUM\n\nCurrent SEO\n────────────\nCozy Autumn Coloring Book Printable, 20 Fall Coloring Pages, Cute Autumn Activity,20 Cozy Fall Coloring Pages for Adults | A4 & US Letter Digital Download\n\nTags: 13\/13/);
    assert.match(a,/Research recommendation\n────────────\n🎯 Primary\nfall coloring pages\n\n🥈 Secondary\nadult coloring pages\n\n🔗 Supporting\ncozy coloring pages\ncozy coloring book/);
    assert.deepEqual(labels(t),['📝 Generate SEO Revision','📊 View Evidence','✅ Keep Current SEO','🔎 SEO Menu','🏠 Home'],'finished research cannot be continued');
    await tap(t,'📊 View Evidence');
    assert.match(text(t),/Captured observations \(5\):/);
    assert.match(text(t),/Unknown \(not evidence, not zero\):\n• coloring pages for adults \(not researched: owner finished\)\n• printable coloring book for adults \(not researched: owner finished\)/);
    // The committed accepted values come from the engine, not from this test or the panel.
    const src=await readFile(join(REPO,'automation','src','seo','panel.mjs'),'utf8')+await readFile(join(REPO,'automation','src','seo','screens.mjs'),'utf8');
    for(const k of ['fall coloring pages','adult coloring pages','cozy coloring book','005'])assert.ok(!src.includes(k),k);
  }finally{await t.cleanup();}
});

test('existing-product SEO revision: deterministic proposal (no OpenAI), approval saves only; a live/unknown Etsy listing is never modified',async()=>{
  const t=await panel();
  try{
    await importAcceptanceCycle(t);
    const before=sha(await readFile(join(t.productsDir,'005-cozy-autumn-adventures/listing/listing.json')));
    await go(t,'seoprod','005');await tap(t,'📝 Generate SEO Revision');
    const r=text(t);
    assert.match(r,/^📝 PROPOSED SEO REVISION[\s\S]*TITLE\n\nCURRENT:\nCozy Autumn Coloring Book Printable[\s\S]*PROPOSED:\n20 Cozy Fall Coloring Pages for Adults | A4 & US Letter\|20 Cozy Fall Coloring Pages for Adults | A4 & US Letter\|20 Cozy Fall Coloring Pages for Adults | A4 & US Letter/);
    assert.match(r,/ADD:\n• adult coloring pages\n• cozy coloring pages/);assert.match(r,/REMOVE:\n• fall activity\n• pumpkin coloring\n• printable activity/);
    assert.match(r,/New opening line:\nCozy Fall Coloring Pages for Adults\.\nThen your current description, unchanged\./);
    assert.match(r,/"adult" comes from the approved research \("adult coloring pages"\), not from the current listing: confirm it is true/);
    assert.match(r,/Generated without OpenAI \(£0\.00\)\. Nothing is sent to Etsy\./);
    assert.deepEqual(labels(t),['✅ Approve SEO Revision','📋 Copy Recommended SEO','📊 View Evidence','🔎 SEO Menu','🏠 Home']);
    assert.equal((await tap(t,'✅ Approve SEO Revision')).outcome,'seo_approved');
    assert.match(text(t),/^🔴 LIVE ETSY LISTING\n\n#005 Cozy Autumn Adventures\n\nIts Etsy state is not known locally, so it is treated as live\.\n\nAutomatic modification is not permitted from this SEO screen\./);
    assert.deepEqual(labels(t),['📋 Copy Recommended SEO','🏠 Home']);
    const s=await sessionOf(t,'005'), approved=await t.state.readSessionJson(s.id,'approved-revision.json');
    assert.equal(approved.approved_by,'@owner');assert.equal(s.decision.kind,'approved');
    await tap(t,'📋 Copy Recommended SEO');
    assert.match(t.telegram.sent.at(-1).text,/^TITLE\n20 Cozy Fall Coloring Pages for Adults | A4 & US Letter\|20 Cozy Fall Coloring Pages for Adults | A4 & US Letter\|20 Cozy Fall Coloring Pages for Adults | A4 & US Letter\n\nTAGS\nfall coloring pages, adult coloring pages/);
    assert.equal(sha(await readFile(join(t.productsDir,'005-cozy-autumn-adventures/listing/listing.json'))),before,'the product is untouched');
    assert.deepEqual(t.etsyCalls,[]);assert.equal(t.calls.length,0,'no OpenAI call');
  }finally{await t.cleanup();}
});

test('live Etsy listing (#009): approval shows the manual path with the Etsy editor link; a local product (#013) is saved for its future draft',async()=>{
  const t=await panel();
  try{
    for(const [pid,name] of [['009','Robin at the Frosted Gate'],['013','Father Christmas on the Night Shift']]){
      await importResearchCycle(t.state,{idea:validateIdea(await real('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea,
        profile:await real('fixtures/profiles/cozy-autumn-colouring-adults-structured.json'),captures:[await real('fixtures/research-cycle/cozy-autumn-real/capture-1.json'),
        await real('fixtures/research-cycle/cozy-autumn-real/capture-2.json')],finish:await real('fixtures/research-cycle/cozy-autumn-real/owner-finish.json'),product_id:pid,name,chat_id:CHAT,now:NOW});
      await go(t,'seoprod',pid);await tap(t,'📝 Generate SEO Revision');await tap(t,'✅ Approve SEO Revision');
      if(pid==='009'){
        assert.match(text(t),/^🔴 LIVE ETSY LISTING[\s\S]*Etsy listing 4584343288\.[\s\S]*Automatic modification is not permitted/);
        const link=last(t).replyMarkup.inline_keyboard.flat().find(b=>b.text==='🔗 Open Etsy Editor');
        assert.equal(link.url,'https://www.etsy.com/your/shops/me/listing-editor/edit/4584343288');
      }else assert.match(text(t),/^✅ SEO REVISION APPROVED[\s\S]*available as an input when the Etsy draft is prepared\. Nothing was published or sent to Etsy\./);
    }
    // No SEO screen ever offers publishing or an Etsy write.
    const all=screens(t).flatMap(s=>s.replyMarkup.inline_keyboard.flat());
    assert.ok(!all.some(b=>/publish/i.test(b.text)||/^a1\|(epublish|econfirm|edraft)/.test(b.callback_data??'')));
    assert.deepEqual(t.etsyCalls,[]);assert.equal(t.calls.length,0);
    for(const f of ['panel.mjs','screens.mjs','state.mjs','library.mjs','catalogue.mjs']){
      const code=(await readFile(join(REPO,'automation','src','seo',f),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
      assert.doesNotMatch(code,/stage4|etsy-live|ETSY_PUBLISH|openai\/|OpenAIClient|fetch\(|https?:\/\/api/i,f);
    }
  }finally{await t.cleanup();}
});

test('Insights Library: summary, keyword search, history keeps every capture (no averaging); reuse keeps the original provenance; research again adds a new capture',async()=>{
  const t=await panel();
  try{
    await importAcceptanceCycle(t);
    await go(t,'seolib');
    assert.match(text(t),/^🧠 MARKETPLACE INSIGHTS LIBRARY\n\nUnique keywords: 5\nObservations: 5\nLatest capture: 29 Sep 2026/);
    await tap(t,'🔍 Search Keyword');await send(t,'adult coloring pages');
    assert.match(text(t),/• adult coloring pages — 1 observation, latest 29 Sep 2026/);
    // A NEW product research reaches "adult coloring pages": reuse instead of a new lookup.
    await newIdea(t,{description:'minimalist adult coloring pages',themes:'minimalist'});
    await tap(t,'🚀 Start Research');
    assert.match(text(t),/"minimalist coloring pages"/);
    await tap(t,'🚫 Etsy Has No Data');
    assert.match(text(t),/^♻️ EXISTING RESEARCH FOUND\n\n"adult coloring pages"\n\nCaptured:\n29 Sep 2026\n\nSearches:\n4,345\n\nResults:\n138,500\n\nConversion:\nHigh\n\nTrend:\n\+3\.2%/);
    assert.deepEqual(labels(t),['♻️ Reuse This Observation','🔄 Research Again','📈 View History','🔎 SEO Menu','🏠 Home']);
    await tap(t,'📈 View History');
    assert.match(text(t),/^📈 KEYWORD HISTORY\n\nadult coloring pages\n\n29 Sep 2026\nSearches 4,345 · Results 138,500\nConversion High · Trend \+3\.2%/);
    await tap(t,'⬅️ Research');
    assert.equal((await tap(t,'♻️ Reuse This Observation')).outcome,'seo_reused');
    assert.match(text(t),/^✅ INSIGHT REUSED\n\nadult coloring pages\nOriginal capture: 29 Sep 2026 \(provenance kept\)/);
    const lib=await t.state.read(), s=Object.values(lib.sessions).find(x=>x.name==='minimalist adult coloring pages');
    const ws=await t.state.open(s.id), o=ws.research.observations.find(x=>x.keyword==='adult coloring pages');
    const orig=(await t.state.open(lib.product_links['005'])).research.observations.find(x=>x.keyword==='adult coloring pages');
    assert.equal(o.observation_id,orig.observation_id,'the same historical observation, not a new one dated today');
    assert.equal(o.captured_at,'2026-09-29');assert.deepEqual(o.source,orig.source);
    assert.equal(s.reuse[0].observation_id,orig.observation_id);assert.match(s.reuse[0].from.research_id,/^seo-s[0-9a-f]{10}$/);
    await tap(t,'🧠 View Evidence');
    assert.match(text(t),/• adult coloring pages\n  4,345 searches · 138,500 results · High · trend \+3\.2%\n  29 Sep 2026 · ♻️ reused \(original provenance\)/);
    // Research again (in a third session): a genuinely new capture; history shows both, oldest first.
    await newIdea(t,{description:'bold adult coloring pages',themes:'bold'});await tap(t,'🚀 Start Research');await tap(t,'🚫 Etsy Has No Data');
    await tap(t,'🔄 Research Again');
    await send(t,'4400');await send(t,'140000');await tap(t,'High');await tap(t,'Skip Trend');await tap(t,'No Related Terms');await tap(t,'✅ Save Observation');
    await go(t,'seokeys');await tap(t,'📈 adult coloring pages (2)');
    assert.match(text(t),/29 Sep 2026\nSearches 4,345[\s\S]*30 Sep 2026\nSearches 4,400 · Results 140,000/);
    assert.match(text(t),/nothing is averaged or interpolated/);
    assert.equal(orig.searches_30d,4345,'the historical observation is unchanged');
  }finally{await t.cleanup();}
});

test('active research, resume after a restart and after navigating away; stale callbacks refused',async()=>{
  const t=await panel();
  try{
    await newIdea(t);await tap(t,'🚀 Start Research');
    await tap(t,'📝 Enter Results');await send(t,'641');
    // Navigate away and restart the bot mid-entry.
    await send(t,'/start');t.restart();
    await send(t,'12900');
    assert.match(text(t),/Conversion rate shown by Etsy\?/,'the entry continues after a restart');
    await tap(t,'Very High');await tap(t,'Skip Trend');await tap(t,'No Related Terms');await tap(t,'✅ Save Observation');
    await go(t,'seoact');
    assert.match(text(t),/^📊 ACTIVE RESEARCH\n\ncozy autumn colouring pages for adults\n1\/4 required · Waiting for Marketplace Insights/);
    await tap(t,'▶️');
    assert.match(text(t),/"fall coloring pages"/);
    // Stale: an old query button after the owner moved on.
    const old=buttonData(t,'🚫 Etsy Has No Data');
    await tap(t,'🚫 Etsy Has No Data');
    assert.equal((await t.wf.handleUpdate(press(old))).outcome,'stale');
    // Cancel keeps captured observations in the library.
    await go(t,'seoact');await tap(t,'▶️');
    const s=await latestSession(t);
    await t.wf.handleUpdate(press(`s1|cnl|${s.id}|${(await t.state.session(s.id)).nonce}`));
    assert.equal((await t.state.session(s.id)).status,'cancelled');
    await go(t,'seolib');assert.match(text(t),/Observations: 1/);
  }finally{await t.cleanup();}
});

test('keep current SEO: the owner decision is recorded; nothing is changed',async()=>{
  const t=await panel();
  try{
    await importAcceptanceCycle(t);
    await go(t,'seoprod','005');
    assert.equal((await tap(t,'✅ Keep Current SEO')).outcome,'seo_kept');
    assert.match(text(t),/^✅ CURRENT SEO KEPT\n\n#005 Cozy Autumn Adventures\n\nRecorded: the current listing SEO stays as it is\. Nothing was changed\./);
    assert.equal((await sessionOf(t,'005')).decision.kind,'keep');
    await go(t,'seoprod','005');
    assert.match(text(t),/Owner decision: keep current SEO \(30 Sep 2026\)/);
    assert.deepEqual(t.etsyCalls,[]);
  }finally{await t.cleanup();}
});

test('unrelated flows unchanged: products, commands and describe still work beside an SEO entry',async()=>{
  const t=await panel();
  try{
    await go(t,'seodesc');                        // SEO waits for a description…
    await t.wf.handleUpdate(press(menuData('describe')));   // …then the owner chooses the factory's Describe instead
    assert.equal((await send(t,'robin christmas card')).outcome,'created','the factory flow gets the text');
    assert.equal(await t.state.entry(CHAT),null);
    assert.equal((await send(t,'/status')).outcome,'status');
    assert.equal((await send(t,'/products')).outcome,'menu_products');
    const files=await readdir(join(t.productsDir));assert.ok(files.some(f=>/^014-robin-christmas-card$/.test(f)));
    assert.equal(t.calls.length,0);
  }finally{await t.cleanup();}
});
