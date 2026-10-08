// ADR-065 approval integrity, end to end with a FAKE model (ZERO real OpenAI / Etsy / image calls):
// the hero chosen in the comparison is the hero the full campaign produces, for Factory, Hybrid and AI Creative;
// the approval survives a restart; drift is refused before any paid image; minor adaptations are allowed;
// paid assets are reused on Retry; a legacy (pre-ADR-064) approval like #022's is honoured as shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deriveFacts, planColouringCreative, deriveStrategy } from '../../marketing/src/stage3/index.mjs';
import { approvedHeroFor, approvalProblems, approvalLock } from '../src/stage3/approved-hero.mjs';
import { productionApproved } from './colouring-fixture.mjs';
import { pressRetry, CHAT, USER } from './helpers.mjs';
import { Registry } from '../src/orchestrator/store.mjs';
import { sharp } from '../../production/src/lib.mjs';

const ACTOR='@owner';
const rj=async(ws,f)=>JSON.parse(await readFile(join(ws,f),'utf8'));
const fileSha=async(ws,f)=>createHash('sha256').update(await readFile(join(ws,f))).digest('hex');
/** Distinct fake backplates (the colouring QC requires lifestyle backplates to differ). */
const backplate=async n=>{const dirs=['x2="1" y2="0"','x2="0" y2="1"','x2="1" y2="1"','x1="1" x2="0" y2="1"'][n%4];
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" ${dirs}><stop offset="0" stop-color="#f2d9a6"/><stop offset="1" stop-color="#2b1a10"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="${200+(n%4)*220}" cy="${240+(n%4)*90}" r="${90+(n%4)*30}" fill="#fff" opacity=".5"/></svg>`)).png().toBuffer();};
const scenes=(h,from=0)=>h.calls.slice(from).filter(c=>c.kind==='image'&&c.step==='marketing-scene');

/** Fake Creative Director answering each engine with its baseline; optionally failing scene images once (index list). */
function fake(h,facts,{failScene=[]}={}){
  const client=h.wf.ai.client, json=client.json.bind(client), image=client.image.bind(client);
  client.json=async a=>{
    if(a.schemaName!=='marketing-creative-direction')return json(a);
    h.calls.push({kind:'json',schemaName:a.schemaName,user:a.user});
    const engine=/HERO ROUTE \(AI Creative\)/.test(a.user)?'ai-creative':'hybrid', base=planColouringCreative(facts,{strategy:deriveStrategy(facts),engine});
    const slides=base.slides.filter(s=>a.user.includes(`- ${s.id} [`)).map(s=>{const c=s.creative;
      return {id:s.id,purpose:c.purpose,buyer_message:c.buyer_message,emotional_goal:c.emotional_goal,headline:'',focal_asset:c.focal_asset,supporting_assets:c.supporting_assets,
        composition:c.composition,hierarchy:c.hierarchy,background:c.background,props:c.props.slice(0,2),crop:{asset:'',focus:[.5,.5],zoom:1},text_zone:c.text_zone,scene_brief:c.scene_brief,avoid:[],support:''};});
    const {source,fallbacks,...concept}=base.concept;
    return {data:{campaign:{mood:'warm',palette:'amber and walnut',lighting:'golden light',concept},slides,lines:[]},usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
  };
  let n=0;
  client.image=async a=>{
    if(a.step==='marketing-scene'&&failScene.includes(n++)){h.calls.push({kind:'image-failed',step:a.step});throw Object.assign(new Error('fake image outage'),{retryable:true});}
    if(a.step==='marketing-scene'){h.calls.push({kind:'image',step:a.step,prompt:a.prompt,size:a.size});return {bytes:await backplate(n),usage:{total_tokens:1},model:'fake-image'};}
    return image(a);
  };
}
async function compareThenChoose(engine,opts){
  const {h,ws}=await productionApproved();
  const facts=await deriveFacts(ws);fake(h,facts,opts);
  assert.equal((await h.wf.runHeroComparison('001',ACTOR)).outcome,'hero_comparison_ready');
  const cmp=(await h.store.load('001')).marketing.comparison.engines[engine], n0=h.calls.length;
  const r=await h.wf.runMarketing('001',ACTOR,{engine,chosenBy:ACTOR});
  return {h,ws,facts,cmp,n0,r};
}

for(const [n,engine,composition] of [[2,'hybrid','cb-lifestyle-hero'],[3,'ai-creative','cb-editorial-hero']])
test(`${n}. ${engine} comparison approval -> ${engine} final hero: the approved direction and paid backplate are the campaign hero (no hero image call)`,{timeout:600_000},async()=>{
  const {h,ws,cmp,n0,r}=await compareThenChoose(engine);
  try{
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    const p=await h.store.load('001'), plan=await rj(ws,'marketing/plan.json'), hero=plan.directions['01-hero'];
    // Persisted at selection: a reference to exactly the candidate shown.
    assert.equal(p.marketing.engine_chosen.approved_hero.image.sha256,cmp.image.sha256);assert.equal(p.marketing.engine_chosen.approved_hero.scene.sha256,cmp.scene.sha256);
    assert.equal(p.marketing.engine_chosen.approved_hero.route.route,engine);
    // The campaign consumes it: same composition, page, text zone, scene brief, route, and the SAME backplate file.
    assert.equal(hero.composition,composition);assert.equal(hero.source,'approved-comparison');
    for(const k of ['composition','focal_asset','text_zone','scene_brief'])assert.deepEqual(hero[k],cmp.direction[k],k);
    assert.deepEqual(hero.route,cmp.route);
    const sc=plan.scenes.find(x=>x.slide==='01-hero');assert.equal(sc.file,cmp.scene.file);assert.equal(sc.sha256,cmp.scene.sha256);
    assert.equal(await fileSha(ws,cmp.scene.file),cmp.scene.sha256,'the approved backplate was never repainted');
    assert.ok(!scenes(h,n0).some(c=>c.prompt===cmp.scene.prompt),'no image call for the approved hero');
    assert.equal(scenes(h,n0).length,plan.scenes.length-1,'one paid backplate per OTHER card that owns one');
    assert.deepEqual(approvalProblems(plan),[]);assert.equal(plan.approved_hero.legacy,false);
    assert.equal(plan.campaign_direction.palette,cmp.campaign.palette,'the approved campaign styles the rest');
    if(engine==='hybrid')assert.equal(plan.slides[0].example,`example-p${cmp.direction.focal_asset.slice(5)}`,'the transformation demo keeps its labelled example');
    else assert.equal(plan.slides[0].example,undefined);
  }finally{await h.cleanup();}
});

test('1. Factory comparison approval -> Factory final hero: its exact paid scene is reused; no factory hero image call',{timeout:600_000},async()=>{
  const {h,ws,cmp,n0,r}=await compareThenChoose('factory');
  try{
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    const plan=await rj(ws,'marketing/plan.json');
    assert.equal(plan.approved_hero.engine,'factory');assert.equal(plan.engine.id,'factory');
    if(cmp.scene){
      const sc=plan.scenes.find(x=>x.id===plan.slides[0].scene);assert.equal(sc.file,cmp.scene.file);assert.equal(sc.sha256,cmp.scene.sha256);
      assert.ok(!scenes(h,n0).some(c=>c.prompt===cmp.scene.prompt));assert.equal(scenes(h,n0).length,plan.scenes.length-1);
    }
    assert.deepEqual(approvalProblems(plan),[]);
  }finally{await h.cleanup();}
});

test('4 + 7 + 8. a failure after one paid backplate: restart, Retry -> the approval survives, nothing already paid is regenerated',{timeout:600_000},async()=>{
  // Scene calls in the full campaign: #0 = first non-hero backplate (succeeds), #1 = fails once.
  const {h,ws,cmp,n0,r}=await compareThenChoose('ai-creative',{failScene:[4]});   // 3 comparison scenes (0-2), then campaign: 3 ok, 4 fails
  try{
    assert.equal(r.outcome,'failed');
    const plan1=await rj(ws,'marketing/plan.json'), made=plan1.scenes.filter(x=>x.sha256&&x.slide!=='01-hero');
    assert.equal(made.length,1,'the first paid backplate was saved immediately');
    const madeSha=await fileSha(ws,made[0].file), lock=plan1.approved_hero;
    // Bot restart.
    const {Workflow}=await import('../src/orchestrator/workflow.mjs');
    h.wf=new Workflow({store:h.store,registry:new Registry({stateDir:join(h.root,'state')}),telegram:h.telegram,ai:h.wf.ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{}});
    await h.wf.recover();
    const n1=h.calls.length;
    assert.equal((await pressRetry(h)).outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    const plan2=await rj(ws,'marketing/plan.json');
    assert.deepEqual(plan2.approved_hero,lock,'the approval survives the restart');
    assert.deepEqual(plan2.directions['01-hero'],plan1.directions['01-hero']);
    assert.equal(await fileSha(ws,made[0].file),madeSha,'the saved backplate was not repainted');
    assert.equal(h.calls.slice(n1).filter(c=>c.kind==='json').length,0,'no listing or direction call again');
    assert.equal(scenes(h,n1).length,1,'only the backplate that failed is made');
    assert.equal(await fileSha(ws,cmp.scene.file),cmp.scene.sha256);
  }finally{await h.cleanup();}
});

test('5 + 6. the campaign cannot silently change the approved composition / story; copy, crop and supporting pages may adapt',{timeout:600_000},async()=>{
  const {h,ws,r}=await compareThenChoose('hybrid',{failScene:[3]});   // the first campaign backplate fails: the plan exists, nothing rendered
  try{
    assert.equal(r.outcome,'failed');
    const plan=await rj(ws,'marketing/plan.json'), good=structuredClone(plan);
    // 6: minor final-render adaptations pass the lock.
    Object.assign(plan.directions['01-hero'],{headline:'A New Headline',support:'Line',crop:{asset:'page-3',focus:[.4,.4],zoom:1.2},supporting_assets:['page-5']});
    assert.deepEqual(approvalProblems(plan),[]);
    // 5: a different composition family / scene story / backplate is refused, and no image is made.
    for(const [k,v] of [['composition','cb-editorial-hero'],['scene_brief','A low-angle cinematic editorial set.']]){
      const bad=structuredClone(good);bad.directions['01-hero'][k]=v;assert.ok(approvalProblems(bad).some(x=>x.startsWith(k)),k);}
    const swapped=structuredClone(good);swapped.scenes.find(x=>x.slide==='01-hero').sha256='0'.repeat(64);assert.ok(approvalProblems(swapped).some(x=>/hero backplate/.test(x)));
    const bad=structuredClone(good);bad.directions['01-hero'].composition='cb-editorial-hero';
    await writeFile(join(ws,'marketing/plan.json'),JSON.stringify(bad));
    const n1=h.calls.length;assert.equal((await pressRetry(h)).outcome,'failed');
    const p=await h.store.load('001');assert.match(p.last_error.message,/Approved hero integrity: .*composition/);assert.equal(p.last_error.retryable,false);
    assert.equal(h.calls.slice(n1).filter(c=>c.kind==='image'||c.kind==='imageEdit').length,0,'refused before any paid image');
    // An owner who deliberately regenerates the hero in review supersedes the approval (recorded), so it is not policed.
    assert.deepEqual(approvalProblems({...bad,approved_hero:{...bad.approved_hero,superseded:{op:'direction'}}}),[]);
  }finally{await h.cleanup();}
});

test('9. legacy approval (#022 shape: no route, AI Creative candidate that looked like Hybrid, chosen after the comparison) is honoured as shown',{timeout:600_000},async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws);fake(h,facts);
    assert.equal((await h.wf.runHeroComparison('001',ACTOR)).outcome,'hero_comparison_ready');
    // Rewrite the stored comparison to the pre-ADR-064 shape #022 has: AI Creative = a cb-lifestyle-hero cosy desk, no route/brief fields.
    let p=await h.store.load('001');const E=p.marketing.comparison.engines, {route:_r,...legacyDir}=E.hybrid.direction;
    const legacy={...legacyDir,scene_brief:'Rich walnut desk in warm amber lamp light, with a chunky cream knit at one edge and a ceramic mug of tea nearby.'};
    const strip=({route,brief,...x})=>x;
    p={...p,marketing:{...p.marketing,engine:'ai-creative',engine_chosen:{by:ACTOR,at:new Date(Date.parse(p.marketing.comparison.at)+60_000).toISOString()},
      comparison:{...p.marketing.comparison,engines:{factory:strip(E.factory),hybrid:strip(E.hybrid),'ai-creative':{...strip(E['ai-creative']),direction:legacy}}}}};
    await h.store.save(p);
    const a=approvedHeroFor(p,'ai-creative');assert.equal(a.legacy,true);assert.equal(a.route,null);assert.equal(a.direction.composition,'cb-lifestyle-hero');
    const n0=h.calls.length, r=await h.wf.runMarketing('001',ACTOR);   // the stored engine, exactly like #022's Retry
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    const plan=await rj(ws,'marketing/plan.json'), hero=plan.directions['01-hero'];
    assert.equal(hero.composition,'cb-lifestyle-hero','what the owner saw, not the new editorial route');assert.equal(hero.scene_brief,legacy.scene_brief);
    assert.equal(plan.approved_hero.legacy,true);assert.equal(plan.approved_hero.locked.route,null);
    assert.equal(plan.scenes.find(x=>x.slide==='01-hero').sha256,E['ai-creative'].scene.sha256);
    assert.ok(!scenes(h,n0).some(c=>c.prompt===E['ai-creative'].scene.prompt),'the approved backplate is not repainted');
    // A legacy choice made BEFORE the comparison existed approves nothing: the new route applies, nothing is invented.
    const before={...p,marketing:{...p.marketing,engine_chosen:{by:ACTOR,at:new Date(Date.parse(p.marketing.comparison.at)-60_000).toISOString()}}};
    assert.equal(approvedHeroFor(before,'ai-creative'),null);
    // A new-style approval whose candidate changed afterwards is refused (reselect), never silently replaced.
    const rec={...p.marketing,engine_chosen:{by:ACTOR,at:p.marketing.engine_chosen.at,approved_hero:{engine:'ai-creative',image:{sha256:'0'.repeat(64)},scene:null,direction_sha256:null}}};
    assert.throws(()=>approvedHeroFor({...p,marketing:rec},'ai-creative'),/changed after it was approved/);
    assert.equal(approvalLock(a,'01-hero').locked.direction.composition,'cb-lifestyle-hero');
  }finally{await h.cleanup();}
});
