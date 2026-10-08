// Etsy shop sections (ADR-054): deterministic resolution from structured product metadata, and the
// journalled, idempotent, never-fatal Etsy step. Fake Etsy only; no network, no OpenAI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Stage4, resolveShopSection, matchSection, sectionKey, SECTION_MAP, loadSectionMap } from '../src/stage4/index.mjs';
import { FakeEtsy } from './etsy-fake.mjs';

// A product as product.json stores it: the selected concept carries the canonical product_format.
const product=(format,{season=null,product_type=null}={})=>({product_id:'099',season,product_type,
  concepts:{selected:{batch:1,concept_id:'A'},batches:[{batch:1,concepts:[{concept_id:'A',product_format:format}]}]}});

test('the LumiumX product families resolve to one canonical section each (seasonal/topic before format)',()=>{
  const cases=[
    [product('planner',{product_type:'Monthly budget planner',season:'All year'}),'Budget & Finance'],
    [product('colouring-book',{season:'Autumn',product_type:'Adult harvest market colouring book'}),'Autumn Printables'],
    [product('colouring-book',{season:'Halloween',product_type:'Spooky colouring book'}),'Halloween'],
    [product('activity-book',{season:'Halloween',product_type:'Halloween activity book'}),'Halloween'],
    [product('greeting-card',{season:'Christmas',product_type:'Christmas greeting card'}),'Christmas'],
    [product('crochet-pattern-bundle',{season:'All-season twilight meadow',product_type:'Crochet flower bouquet pattern bundle'}),'Crochet Patterns'],
    [product('colouring-book',{season:'All year',product_type:'Botanical colouring book'}),'Colouring Books'],
    [product('activity-book',{season:null,product_type:'Puzzle activity book'}),'Activity Books'],
    [product('greeting-card',{season:'All year',product_type:'Birthday card'}),'Greeting Cards'],
    [product('invitation',{season:'Christmas',product_type:'Christmas party invitation'}),'Christmas'],
    [product('colouring-book',{season:'Fall',product_type:'Colouring book'}),'Autumn Printables']];
  for(const [p,want] of cases)assert.equal(resolveShopSection(p).section,want,`${p.concepts.batches[0].concepts[0].product_format} / ${p.season} / ${p.product_type}`);
  // Every target is one of the declared canonical sections.
  for(const v of Object.values(SECTION_MAP.map))assert.ok(SECTION_MAP.sections.includes(v));
});

test('unknown mappings never guess: a recognised unmapped season, an unknown format, an ambiguous season',()=>{
  const winter=resolveShopSection(product('colouring-book',{season:'Winter',product_type:'Colouring book'}));
  assert.equal(winter.section,null);assert.equal(winter.warning,'No Etsy shop-section mapping found for colouring-book / winter');assert.equal(winter.label,'colouring-book / winter');
  const unknown=resolveShopSection(product('worksheet-bundle',{season:'All year',product_type:'Maths worksheets'}));
  assert.equal(unknown.section,null);assert.match(unknown.warning,/No Etsy shop-section mapping found for worksheet-bundle/);
  assert.equal(resolveShopSection(product('colouring-book',{season:'Halloween and Christmas'})).section,null,'two seasons: ambiguous');
  assert.equal(resolveShopSection({product_id:'1',season:'Christmas'}).section,'Christmas','no format: the seasonal section still applies');
  assert.equal(resolveShopSection({product_id:'1',season:null}).section,null);
});

test('only structured metadata is read: marketing prose can never change the section',()=>{
  const p={...product('crochet-pattern-bundle',{season:'All-season twilight meadow',product_type:'Crochet flower bouquet pattern bundle'}),
    name:'Moonlit Meadow Halloween Christmas Budget Bundle',etsy:{title:'Halloween Christmas budget'},marketing:{listing:{title:'Halloween'}}};
  assert.equal(resolveShopSection(p).section,'Crochet Patterns');
});

test('the config is checked: an undeclared section or theme, or a title over 24 characters, is refused',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lx-sections-'));
  const { writeFile }=await import('node:fs/promises');
  try{
    const bad=async(m,re)=>{const f=join(dir,'s.json');await writeFile(f,JSON.stringify({sections:['A'],seasons:{},topics:{},...m}));assert.throws(()=>loadSectionMap(f),re);};
    await bad({map:{'colouring-book':'Not Declared'}},/not in sections/);
    await bad({map:{'colouring-book:winter':'A'}},/undeclared theme "winter"/);
    await bad({sections:['A very long section name over limit'],map:{}},/1-24 characters/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('section titles match safely: exact first, then case/spacing/accents/"&" vs "and"; several = ambiguous',()=>{
  assert.equal(sectionKey('Budget & Finance'),sectionKey('budget  and finance'));
  assert.equal(matchSection([{shopSectionId:1,title:'budget and finance'}],'Budget & Finance').section.shopSectionId,1);
  assert.equal(matchSection([{shopSectionId:1,title:'Halloween'},{shopSectionId:2,title:'halloween'}],'Halloween').section.shopSectionId,1,'exact wins');
  const two=matchSection([{shopSectionId:1,title:'HALLOWEEN'},{shopSectionId:2,title:'halloween '}],'Halloween');
  assert.equal(two.section,null);assert.equal(two.ambiguous,true);
  assert.deepEqual(matchSection([],'Halloween'),{section:null,ambiguous:false,candidates:[]});
  // Etsy may return titles HTML-escaped.
  assert.equal(matchSection([{shopSectionId:7,title:'Budget &amp; Finance'}],'Budget & Finance').section.shopSectionId,7);
  assert.equal(matchSection([{shopSectionId:8,title:'Budget &#38; Finance'}],'Budget & Finance').section.shopSectionId,8);
});

test('the 8 canonical sections the owner creates in Shop Manager are exactly the config, and each is found by its own title',()=>{
  const OWNER=['Budget & Finance','Autumn Printables','Halloween','Christmas','Colouring Books','Activity Books','Crochet Patterns','Greeting Cards'];
  assert.deepEqual(SECTION_MAP.sections,OWNER);
  const shop=OWNER.map((title,i)=>({shopSectionId:500+i,title}));
  OWNER.forEach((t,i)=>assert.equal(matchSection(shop,t).section.shopSectionId,500+i,t));
  assert.deepEqual([...new Set(Object.values(SECTION_MAP.map))].sort(),[...OWNER].sort(),'every canonical section is reachable, nothing else is');
});

// ---- the Etsy step, on a fake draft ----
async function setup({sections=[],scopes=['listings_r','listings_w'],format='colouring-book',season='Halloween',product_type='Halloween colouring book'}={}){
  const dir=await mkdtemp(join(tmpdir(),'lx-s4-section-')), fake=new FakeEtsy({sections,scopes});
  const listing=await fake.createListing({shopId:fake.shopId,title:'T',description:'D',priceAmount:4,quantity:999,whoMade:'i_did',whenMade:'made_to_order',taxonomyId:1,listingType:'download',tags:[],materials:[],state:'draft'});
  fake.calls.length=0;
  const s4=()=>new Stage4({productDir:dir,product:product(format,{season,product_type}),client:fake,mode:'live',config:{shopId:fake.shopId}});
  const ctx={shop:{shopId:fake.shopId,scopes:[...scopes]}}, draft={listing_id:listing.listingId};
  return {dir,fake,s4,ctx,draft,listingId:listing.listingId,record:async()=>JSON.parse(await readFile(join(dir,'etsy','section.json'),'utf8')),cleanup:()=>rm(dir,{recursive:true,force:true})};
}

test('an existing section is reused (no create), the listing receives its section_id, read back from Etsy',async()=>{
  const t=await setup({sections:[{shopSectionId:31,title:'Christmas'},{shopSectionId:32,title:'Halloween'}]});
  try{
    const r=await t.s4().organise(t.ctx,t.draft);
    assert.deepEqual([r.status,r.section,r.shop_section_id,r.created],['assigned','Halloween',32,false]);
    assert.equal(t.fake.listings.get(t.listingId).shopSectionId,32);
    assert.equal(t.fake.count('createShopSection'),0);
    assert.deepEqual(t.fake.writes,['assignListingSection']);
    assert.equal((await t.record()).status,'assigned');
  }finally{await t.cleanup();}
});

test('a missing section is created (with shops_w), its new id captured and assigned',async()=>{
  const t=await setup({sections:[{shopSectionId:31,title:'Christmas'}],scopes:['listings_r','listings_w','shops_w']});
  try{
    const r=await t.s4().organise(t.ctx,t.draft);
    assert.equal(r.status,'assigned');assert.equal(r.created,true);
    const made=t.fake.sections.find(s=>s.title==='Halloween');
    assert.ok(made);assert.equal(r.shop_section_id,made.shopSectionId);assert.equal(t.fake.listings.get(t.listingId).shopSectionId,made.shopSectionId);
    assert.deepEqual(t.fake.writes,['createShopSection','assignListingSection']);
  }finally{await t.cleanup();}
});

test('without shops_w a missing section is reported, never created; the draft is untouched',async()=>{
  const t=await setup({sections:[]});
  try{
    const r=await t.s4().organise(t.ctx,t.draft);
    assert.equal(r.status,'section_missing');assert.match(r.warning,/"Halloween" does not exist yet.*shops_w/);
    assert.deepEqual(t.fake.writes,[]);assert.equal(t.fake.listings.get(t.listingId).shopSectionId,undefined);
  }finally{await t.cleanup();}
});

test('re-running is idempotent: the correct section already assigned is a no-op; no duplicate section ever',async()=>{
  const t=await setup({sections:[],scopes:['listings_r','listings_w','shops_w']});
  try{
    const first=await t.s4().organise(t.ctx,t.draft);
    const w=t.fake.writes.length;
    for(let i=0;i<3;i++){
      const again=await t.s4().organise(t.ctx,t.draft);
      assert.deepEqual([again.status,again.shop_section_id,again.created],['already_assigned',first.shop_section_id,true]);
    }
    assert.equal(t.fake.writes.length,w,'no write on a re-run');
    assert.equal(t.fake.sections.filter(s=>sectionKey(s.title)==='halloween').length,1,'exactly one Halloween section');
  }finally{await t.cleanup();}
});

test('normalisation never makes a duplicate: "budget and finance" on Etsy is reused for "Budget & Finance"',async()=>{
  const t=await setup({sections:[{shopSectionId:41,title:'budget and finance'}],scopes:['listings_r','listings_w','shops_w'],format:'planner',season:null,product_type:'Budget planner'});
  try{
    const r=await t.s4().organise(t.ctx,t.draft);
    assert.deepEqual([r.status,r.shop_section_id,r.created],['assigned',41,false]);
    assert.equal(t.fake.count('createShopSection'),0);assert.equal(t.fake.sections.length,1);
  }finally{await t.cleanup();}
});

test('a create whose response was lost is reconciled on retry (found by reading Etsy), never created twice',async()=>{
  const t=await setup({sections:[],scopes:['listings_r','listings_w','shops_w']});
  try{
    t.fake.failOnce('createShopSection',{kind:'network',after:true});
    const r1=await t.s4().organise(t.ctx,t.draft);
    assert.equal(r1.status,'failed');assert.equal(r1.retryable,true);assert.doesNotMatch(r1.error,/S3cr3t/,'sanitised');
    assert.equal(t.fake.sections.length,1,'Etsy did create it');
    const r2=await t.s4().organise(t.ctx,t.draft);
    assert.deepEqual([r2.status,r2.created],['assigned',true]);
    assert.equal(t.fake.count('createShopSection'),1,'never created twice');assert.equal(t.fake.sections.length,1);
  }finally{await t.cleanup();}
});

test('an unmapped product creates nothing and makes no Etsy call; an Etsy failure is recorded, never thrown',async()=>{
  const t=await setup({sections:[{shopSectionId:31,title:'Colouring Books'}],season:'Winter',product_type:'Winter colouring book',scopes:['listings_r','listings_w','shops_w']});
  try{
    const r=await t.s4().organise(t.ctx,t.draft);
    assert.equal(r.status,'unmapped');assert.equal(r.warning,'No Etsy shop-section mapping found for colouring-book / winter');
    assert.deepEqual(t.fake.calls,[],'no Etsy call');
  }finally{await t.cleanup();}
  const u=await setup({sections:[{shopSectionId:32,title:'Halloween'}]});
  try{
    u.fake.failOnce('assignListingSection',{kind:'http',status:500});
    const r=await u.s4().organise(u.ctx,u.draft);
    assert.equal(r.status,'failed');assert.equal(r.error_code,'ETSY_SERVER_ERROR');
    assert.equal((await u.s4().organise(u.ctx,u.draft)).status,'assigned','only this step is retried');
  }finally{await u.cleanup();}
});
