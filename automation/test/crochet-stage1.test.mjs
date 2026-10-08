// Crochet pattern bundle through Stage 1 and into Stage 2 (ADR-041), with a
// fake OpenAI client and fake Telegram. FIXTURE patterns only: not sellable
// content, never tested by anyone. No network, no Etsy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { menuData } from '../src/telegram/ui.mjs';
import { PAGE_RULES, pageCountProblems } from '../src/orchestrator/page-rules.mjs';
import { canvasPrompt, canvasProblems } from '../src/orchestrator/canvas.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { parseBrief, fromModelPattern, needsPatterns, planProblems } from '../src/orchestrator/crochet.mjs';
import { generatePatternPlan } from '../src/openai/crochet.mjs';
import { formatSupport } from '../src/orchestrator/formats.mjs';
import { withRolePlan, fakeTelegram, msg, press, button, concept, bookDirection, CHAT, USER } from './helpers.mjs';
import { lineArt } from './colouring-fixture.mjs';
import { crochetBundle } from '../../production/test/crochet-fixture.mjs';
import { validateCrochetBundle, isTested, createHandoff } from '../../production/src/index.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { FakeEtsy } from './etsy-fake.mjs';
import { snapshot } from './colouring-fixture.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
const crochetConcept=id=>concept(id,{proposed_name:`Bouquet Studio ${id}`,product_type:'crochet pattern bundle',product_format:'crochet-pattern-bundle',page_count:3,orientation:'portrait',
  target_customer:'adult crocheters',deliverable_components:['Complete pattern PDF','Individual pattern PDFs','Printing guide']});
const crochetSpec=()=>({name:'Bouquet Studio Crochet Flowers',slug:'bouquet-studio-crochet-flowers',season:'All year',product_type:'crochet pattern bundle',target_customer:'adult crocheters',page_count:3,
  canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'Soft botanical illustration with a clear margin.'},
  pages:[['cover','Cover artwork'],['pattern-illustration','Representative flower illustration'],['motif','Decorative motif']].map(([t,title],i)=>({page_number:i+1,page_type:t,title,concept:'c',instructions:null,
    artwork_description:'an illustration',generation_prompt:`${title} illustration.`,production_notes:'Illustration only.'}))});
// A plan with exactly the requested count; each pattern a valid US-terms fixture draft (FIXTURE content).
const ROLES=['focal','filler','foliage','secondary','accent','structural'], NAMES=['Rose','Daisy','Leaf','Tulip','Bud','Stem','Poppy','Lily','Fern','Cosmos','Peony','Lavender'];
const planFor=user=>{const n=Number(/EXACTLY (\d+)/.exec(user)[1]);
  return withRolePlan({theme:'crochet flowers',audience:['adults','beginners'],style:['botanical','soft pastel'],
    patterns:Array.from({length:n},(_,i)=>({pattern_id:`fixture-flower-${i+1}`,name:`Fixture ${NAMES[i%NAMES.length]}${i>=NAMES.length?` ${i+1}`:''}`,category:'flower',role:ROLES[i%ROLES.length],
      difficulty:i%2?'easy':'beginner',approx_size:'about 6 cm',yarn_weight:'3-light',hook_mm:3,construction:'worked in the round',main_stitches:['sc','sl st'],
      assembly_required:false,artwork:'none',summary:'A small fixture flower.'})),
    combinations:{title:'Bouquet ideas',intro:null,items:n>=3?[{name:'Fixture posy',patterns:[{pattern_id:'fixture-flower-1',quantity:3},{pattern_id:'fixture-flower-3',quantity:2}],notes:['Tie the stems together.']}]:[]}});};
export const goodPattern=user=>{const e=JSON.parse(/Pattern to draft:\n([\s\S]*?\})/.exec(user)[1]);
  return {category:'flower',difficulty:e.difficulty,finished_size:'About 6 cm across',yarn:[{description:'Cotton yarn, petal colour',colour:'pink',amount:'About 8 m'}],
    yarn_weight:'3-light',requires_hook:true,hook_size:{mm:3,us:'D-3'},additional_materials:['Tapestry needle','Scissors'],stitches_used:['ch','sc','sl st'],
    abbreviations:[{abbr:'ch',meaning:'chain'},{abbr:'sc',meaning:'single crochet'},{abbr:'sl st',meaning:'slip stitch'},{abbr:'st',meaning:'stitch'},{abbr:'MR',meaning:'magic ring'}],
    gauge:'Not critical for this pattern.',instructions:[{heading:'Flower',steps:[{label:'Rnd 1',text:'Make a MR, 6 sc into the ring, sl st to the first st.',stitch_count:6}]}],
    assembly:[],finishing:['Fasten off and weave in all ends.'],notes:[]};};

// FIXTURE listing copy for 4 patterns (what a well-behaved model returns; every claim is checked by code).
export const crochetListing=(n=4)=>({title:`Crochet Flower Pattern Bundle, ${n} Crochet Flower Patterns, Printable Bouquet Crochet Patterns PDF`,
  description:`Make a bouquet that lasts: soft crochet flowers, leaves and stems you can combine into your own arrangements and handmade gifts.\n\nWhat you receive:\n- ${n} crochet patterns in US crochet terms\n- The complete collection as one PDF, plus each pattern as its own PDF\n- Pattern index, materials and tools reference and abbreviations reference\n- A4 and US Letter\n- Printing guide\n\nThese are written patterns and have not been test-crocheted. The cover artwork is an illustration.\n\nThis is a digital download. No physical item is shipped.`,
  tag_candidates:['crochet flower','crochet pattern','flower crochet','bouquet pattern','crochet bouquet','crochet rose','crochet leaves','crochet gift idea','crochet pdf','floral crochet','crochet stems','cottagecore crochet','botanical crochet','printable pattern'],
  materials:['Digital PDF'],suggested_price_gbp:6.5,pricing_rationale:'Typical for a small digital crochet pattern bundle.',category_suggestion:'Craft Supplies & Tools > Patterns & How To > Crochet',
  occasion:'Birthday',primary_colour:'Pink',secondary_colour:'Green',hook:'Flowers you make yourself',customer_summary:`${n} printable crochet flower patterns.`,
  what_you_receive:[`${n} crochet patterns`,'Complete collection PDF','Each pattern as its own PDF','A4 and US Letter','Printing guide'],printing_summary:'Print at 100% on A4 or US Letter.',
  digital_download_disclaimer:'Digital download only. No physical item is shipped.',listing_claims:[{key:'pattern-count',text:`${n} crochet patterns`},{key:'digital',text:'Digital download'}]});
const COPY=user=>{const ids=section=>[...((user.split(`${section} `)[1]??'').split('\n\n')[0]).matchAll(/^- ([\w-]+):/gm)].map(m=>m[1]);
  return {lines:ids('LINES').map(id=>({id,text:'A calm hour with your hook and yarn.'})),scenes:ids('SCENES').map(id=>({id,brief:'Pale oak table, cream linen, soft window light.'}))};};
function fakeAi({pattern=(n,user)=>goodPattern(user),listing=crochetListing}={}){
  const calls=[];
  const client={
    async json({schemaName,user}){
      calls.push({kind:'json',schemaName,user});
      const n=calls.filter(c=>c.schemaName===schemaName).length;
      const data={concepts:{concepts:['A','B','C'].map(crochetConcept)},specification:crochetSpec(),'creative-direction':bookDirection(),
        'crochet-plan':schemaName==='crochet-plan'?planFor(user):null,'crochet-pattern':schemaName==='crochet-pattern'?pattern(n,user):null,
        listing:schemaName==='listing'?listing(Number(/"crochet_patterns": (\d+)/.exec(user)?.[1]??4)):null,'marketing-copy':schemaName==='marketing-copy'?COPY(user):null}[schemaName];
      if(!data)throw new Error(`unexpected ${schemaName}`);
      return {data:structuredClone(data),usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
    },
    async image({step,prompt,size}){calls.push({kind:'image',step,prompt,size});
      if(step==='marketing-scene')return {bytes:await sharp({create:{width:1024,height:1024,channels:3,background:'#d9cbbd'}}).png().toBuffer(),usage:{total_tokens:1},model:'fake-image'};
      return {bytes:await lineArt(calls.filter(c=>c.kind==='image').length),usage:{total_tokens:1},model:'fake-image'};}};
  return {ai:{client,textModel:'fake-text',imageModel:'gpt-image-test',imageQuality:'medium',previewQuality:'low'},calls};
}
async function harness(opts={}){
  const root=await mkdtemp(join(tmpdir(),'lx-crochet-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=fakeAi(opts);
  const wf=new Workflow({store,registry,telegram,ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{},...(opts.stage4?{stage4:opts.stage4}:{})});
  return {root,store,telegram,calls,wf,cleanup:()=>rm(root,{recursive:true,force:true})};
}
const lastScreen=h=>h.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=h=>lastScreen(h).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const tap=(h,label)=>{const b=lastScreen(h).replyMarkup.inline_keyboard.flat().find(x=>x.text===label);if(!b)throw new Error(`no "${label}" in ${labels(h).join(' | ')}`);return h.wf.handleUpdate(press(b.callback_data));};
const lastText=h=>h.telegram.sent.filter(s=>s.type==='message'||s.type==='edited').at(-1).text;
const confirm=async(h,label)=>{await tap(h,label);return tap(h,labels(h)[0]);};   // through the cost / destructive confirmation
const textCalls=(h,schema)=>h.calls.filter(c=>c.schemaName===schema).length;

/** /newproduct -> concepts -> A -> APPROVE STYLE (creative approval only). */
async function styleApproved(opts){
  const h=await harness(opts);
  await h.wf.handleUpdate(msg('/newproduct crochet flower bouquet pattern bundle'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  return h;
}
async function brief(h,text){
  await h.wf.handleUpdate(press(menuData('prod','001')));
  await tap(h,'🧶 Set Pattern Count & Terms');
  return h.wf.handleUpdate(msg(text));
}

test('Stage 1 enablement: format rules, artwork page_count separate from pattern_count, canvas, schema enum, support',async()=>{
  assert.deepEqual(PAGE_RULES['crochet-pattern-bundle'],{min:1,max:3});
  assert.deepEqual(pageCountProblems({product_format:'crochet-pattern-bundle',product_type:'crochet pattern bundle',page_count:3}),[]);
  // A 33-pattern bundle never asks for 33 artwork pages.
  assert.match(pageCountProblems({product_format:'crochet-pattern-bundle',product_type:'crochet pattern bundle',page_count:33})[0],/above 3/);
  const enumList=(await loadSchema('concepts')).properties.concepts.items.properties.product_format.enum;
  assert.ok(enumList.includes('crochet-pattern-bundle'));
  assert.deepEqual(canvasProblems('crochet-pattern-bundle',{background:'illustrated',edge:'full-bleed'}),['$.canvas.edge: crochet-pattern-bundle requires safe-margin, got full-bleed']);
  assert.match(canvasPrompt({orientation:'portrait',background:'white',edge:'safe-margin'},'crochet-pattern-bundle'),/following the CROCHET PRODUCT DIRECTION, and contains no written instructions/);
  assert.deepEqual(formatSupport('crochet flower pattern'),{format:'crochet-pattern-bundle',known:true,stage1:true,stage2:true});
  assert.deepEqual(parseBrief('33'),{pattern_count:33,terminology:'US',guidance:null});
  assert.deepEqual(parseBrief('12 patterns, UK terms'),{pattern_count:12,terminology:'UK',guidance:null});
  assert.equal(parseBrief('lots'),null);assert.equal(parseBrief('0'),null);assert.equal(parseBrief('61'),null);
});

test('candidate generation contract: schema-valid structured data; code sets identity, ai-assisted origin and unverified; never testing',async()=>{
  const s=await loadSchema('crochet-pattern'), user='Pattern to draft:\n{"name":"X","category":"flower","difficulty":"easy","summary":"s"}';
  const m=goodPattern(user);
  assert.deepEqual(validate(s,m),[]);
  assert.ok(!('testing' in s.properties)&&!('verification_status' in s.properties)&&!('origin' in s.properties),'the model cannot state testing, origin or verification');
  const p=fromModelPattern({pattern_id:'x',name:'X'},m);
  assert.equal(p.origin,'ai-assisted-draft');assert.equal(p.verification_status,'unverified');assert.ok(!('testing' in p));assert.equal(isTested(p),false);
  assert.deepEqual(p.abbreviations,{ch:'chain',sc:'single crochet','sl st':'slip stitch',st:'stitch',MR:'magic ring'});
  // The plan must have exactly the brief's count and unique identities, or it is rejected (never trimmed or padded).
  const {ai}=fakeAi();
  const wrong={...ai,client:{json:async()=>({data:{...planFor('EXACTLY 3'),patterns:planFor('EXACTLY 2').patterns},model:'fake-text'})}};
  await assert.rejects(generatePatternPlan(wrong,{product:{request:{text:'x'},name:'n'},brief:{pattern_count:3,terminology:'US'}}),/2 patterns planned; the owner asked for 3/);
  const dup={...ai,client:{json:async()=>{const d=planFor('EXACTLY 2');d.patterns[1].pattern_id=d.patterns[0].pattern_id;return {data:d,model:'fake-text'};}}};
  await assert.rejects(generatePatternPlan(dup,{product:{request:{text:'x'},name:'n'},brief:{pattern_count:2,terminology:'US'}}),/duplicate pattern_id/);
});

test('collection plan quality: near-duplicates, incomplete arrangements and unbalanced difficulty are rejected before any pattern is drafted',()=>{
  const brief=n=>({pattern_count:n,terminology:'US'});
  assert.deepEqual(planProblems(planFor('EXACTLY 12'),brief(12)),[]);
  let p=planFor('EXACTLY 12');p.patterns[5].name='Small Fixture Rose';
  assert.match(planProblems(p,brief(12)).join(),/near-duplicate.*Fixture Rose, Small Fixture Rose/);
  p=planFor('EXACTLY 12');p.patterns[4].name='Pink Fixture Daisy';
  assert.match(planProblems(p,brief(12)).join(),/near-duplicate/);
  p=planFor('EXACTLY 12');for(const x of p.patterns)if(['foliage','structural'].includes(x.role))x.role='secondary';
  assert.match(planProblems(p,brief(12)).join(),/no foliage or structural pieces/);
  p=planFor('EXACTLY 12');for(const x of p.patterns)x.difficulty='intermediate';
  assert.match(planProblems(p,brief(12)).join(),/every pattern is intermediate/);
  p=planFor('EXACTLY 12');p.patterns.forEach((x,i)=>{x.difficulty=i<10?'intermediate':'beginner';});
  assert.match(planProblems(p,brief(12)).join(),/unbalanced: 10 of 12|only 2 of 12 patterns are beginner or easy/);
  assert.match(planProblems(planFor('EXACTLY 12'),brief(33)).join(),/12 patterns planned; the owner asked for 33/);
  // The owner's brief can carry collection guidance; it reaches the plan call.
  assert.deepEqual(parseBrief('33 US: roses, daisies and leaves'),{pattern_count:33,terminology:'US',guidance:'roses, daisies and leaves'});
  assert.deepEqual(parseBrief('33\nRoses and daisies.\nLeaves.'),{pattern_count:33,terminology:'US',guidance:'Roses and daisies.\nLeaves.'});
  assert.equal(parseBrief('33 US').guidance,null);
});

test('happy path: creative approval is not pattern approval; candidates -> validation -> APPROVE PATTERNS (SHA-256) -> /produce -> /market -> /etsy: fixed category mapping, fail closed, Retry creates ONE draft (ADR-059)',async()=>{
  const fake=new FakeEtsy();   // live-mode fake: its seller taxonomy first lacks the approved crochet node
  const h=await styleApproved({stage4:{config:{mode:'live',publishEnabled:false,shopId:fake.shopId,seller:{whoMade:'i_did',whenMade:'made_to_order',quantity:999}},liveClient:async()=>fake}});
  try{
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/does NOT approve any crochet instructions/);
    let p=await h.store.load('001');
    assert.ok(needsPatterns(p));assert.equal(p.page_count,3,'3 artwork pages');
    // Stage 2 refuses before APPROVE PATTERNS.
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'patterns_not_approved');
    assert.equal((await brief(h,'4')).outcome,'pattern_brief_set');
    const before=h.calls.length;
    assert.equal((await confirm(h,'🧶 Draft 4 Candidate Patterns (AI)')).outcome,'awaiting_pattern_approval');
    assert.equal(textCalls(h,'crochet-plan'),1);assert.equal(textCalls(h,'crochet-pattern'),4);assert.equal(h.calls.length-before,5,'1 plan + 4 patterns');
    p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_PATTERN_APPROVAL');assert.equal(p.page_count,3,'pattern_count never changes the artwork page count');
    const ws=h.store.dirOf(p), bytes=await readFile(join(ws,'crochet','patterns.json')), bundle=JSON.parse(bytes);
    assert.equal(bundle.pattern_count,4);assert.equal(bundle.provenance.origin,'ai-assisted-draft');
    assert.ok(bundle.patterns.every(x=>x.verification_status==='unverified'&&!('testing' in x)));
    assert.ok(validateCrochetBundle(bundle).ok);
    assert.equal(p.crochet.validation.source_sha256,sha(bytes));
    assert.ok(h.telegram.sent.some(s=>s.type==='document'&&/crochet-patterns-review\.txt$/.test(s.fileName)),'the owner receives the full text to review');
    assert.match(lastScreen(h).text,/AI-assisted drafts\. Verification: unverified/);
    assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
    p=await h.store.load('001');
    assert.equal(p.status,'CREATIVE_APPROVED');
    assert.deepEqual({sha:p.crochet.approval.source_sha256,n:p.crochet.approval.pattern_count,origin:p.crochet.approval.origin,v:p.crochet.approval.verification},
      {sha:sha(bytes),n:4,origin:'ai-assisted-draft',v:{unverified:4,tested:0}});
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/does not mean they have been tested/);
    // Stage 2 refuses until the crochet visuals are checked against the approved patterns (ADR-047): concise, no state change.
    const refused=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(refused.outcome,'crochet_visuals_unchecked');assert.match(refused.reasons.join(),/visual-specs\.json is missing/);
    assert.equal(lastScreen(h).text,'❌ #001 cannot enter production\nCrochet visuals are not checked against the approved patterns.\n\nRun Restyle and approve the new proofs first.');
    assert.equal((await h.store.load('001')).status,'CREATIVE_APPROVED');
    // Restyle (free) -> traceable proofs (3 image calls, confirmed) -> APPROVE STYLE.
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Generate Style Proofs');await tap(h,labels(h)[0]);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
    // Stage 2: deterministic build from the exact approved source, no model call.
    const calls=h.calls.length;
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.equal(h.calls.length,calls,'Stage 2 makes no OpenAI call');
    const record=JSON.parse(await readFile(join(ws,'production','build-record.json'),'utf8'));
    assert.equal(record.crochet.pattern_count,4);assert.equal(record.stage3_handoff.integrity.all_tested,false);
    assert.equal(record.stage3_handoff.artwork.hero.photographic_evidence,false);
    const qc=JSON.parse(await readFile(join(ws,'production','qc-report.json'),'utf8'));
    assert.equal(qc.passed,true,qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('; '));
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
    // Stage 3 (ADR-041): the crochet campaign from the real customer PDFs; integrity enforced; QC-gated owner review.
    const m=await h.wf.handleUpdate(msg('/market 001'));
    assert.equal(m.outcome,'awaiting_marketing_approval',JSON.stringify(m));
    const mq=JSON.parse(await readFile(join(ws,'marketing','qc.json'),'utf8'));
    assert.equal(mq.passed,true,mq.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('; '));
    const plan=JSON.parse(await readFile(join(ws,'marketing','plan.json'),'utf8'));
    assert.deepEqual(plan.slides.map(s=>s.template),['hero','interior','collage','index','included','printable','lifestyle','bundle']);
    assert.equal(plan.examples,undefined,'no AI example of a finished crocheted item');
    const scene=h.calls.find(c=>c.step==='marketing-scene');
    assert.match(scene.prompt,/Do NOT include: flowers of any kind, bouquets, crocheted or knitted items/);
    const listing=JSON.parse(await readFile(join(ws,'marketing','listing.json'),'utf8'));
    assert.ok(!/\btested\b/i.test(listing.title+listing.description.replace(/not been test-crocheted/,'')));
    const listingCall=h.calls.filter(c=>c.schemaName==='listing').at(-1);
    assert.match(listingCall.user,/NOT tested: never say tested/);assert.doesNotMatch(listingCall.user,/OWNER-APPROVED SEARCH FOCUS/,'no SEO focus without an approved SEO decision');
    // ADR-047: Stage 3 receives the approved pattern facts and the checked visuals as authoritative facts.
    assert.equal(record.stage3_handoff.visuals.visual_match_status,'internally_checked');
    assert.deepEqual(record.stage3_handoff.visuals.pictured.items.map(i=>[i.pattern_id,i.quantity]),[['fixture-flower-1',3],['fixture-flower-3',2]]);
    assert.match(listingCall.user,/"pattern_facts"/);assert.match(listingCall.user,/NOT physically verified/);
    assert.match(listingCall.user,/Never write e\.g\. "18-petal rose" unless pattern_facts says 18 petals/);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')))).outcome,'marketing_approved');
    // Stage 4 (ADR-059): the listing's category is the canonical text and the format resolves to the fixed approved ID (6343),
    // re-checked against Etsy's live taxonomy. Etsy without that node: TAXONOMY_UNRESOLVED, nothing written, plain Telegram text.
    assert.equal(listing.category_suggestion,'Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints');
    const e=await h.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(e.outcome,'failed',JSON.stringify(e));assert.match(e.detail,/TAXONOMY_UNRESOLVED.*6343 is not in Etsy's seller taxonomy/);
    assert.deepEqual(fake.writes,[],'no Etsy write before the category resolves');
    assert.equal((await h.store.load('001')).etsy?.listing_id??null,null,'no Etsy draft');
    assert.equal(lastText(h),["⚠️ Etsy category needs checking",'',"The approved Etsy category does not match Etsy's current categories.",'','Nothing was created on Etsy.','Check the category mapping, then Retry.','','Retry is free.'].join('\n'));
    assert.doesNotMatch(lastText(h),/Craft Supplies|Stage4Error|TAXONOMY_UNRESOLVED|6343/,'no raw error or long category in Telegram');
    // Etsy now has the node. Retry resumes at Etsy preparation: no OpenAI call, Stage 2/3 untouched, exactly ONE draft.
    fake.nodes=[...fake.nodes,{id:1001,name:'Craft Supplies & Tools',parentId:undefined},{id:1002,name:'Patterns & How To',parentId:1001},{id:6343,name:'Patterns & Blueprints',parentId:1002}];
    const callsBefore=h.calls.length, snapBefore={production:await snapshot(join(ws,"production")),marketing:await snapshot(join(ws,'marketing'))};
    const retry=await tap(h,labels(h).find(l=>/Retry/.test(l)));
    assert.equal(retry.outcome,'awaiting_etsy_publish_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.equal(h.calls.length,callsBefore,'no OpenAI call');
    assert.deepEqual({production:await snapshot(join(ws,'production')),marketing:await snapshot(join(ws,'marketing'))},snapBefore);
    const payload=JSON.parse(await readFile(join(ws,'etsy/payload.json'),'utf8'));
    assert.deepEqual([payload.listing.taxonomy.id,payload.listing.taxonomy.path],[6343,'Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints']);
    assert.match(payload.listing.taxonomy.source,/^owner-approved crochet-pattern-bundle mapping/);
    assert.equal(fake.count('createListing'),1);assert.equal([...fake.listings.values()][0].taxonomyId,6343);assert.equal([...fake.listings.values()][0].state,'draft');
    assert.equal(fake.count('activateListing'),0);
    // A further Etsy run reuses the recorded draft: never a second listing.
    await h.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(fake.count('createListing'),1,'no duplicate draft');assert.equal(fake.listings.size,1);
  }finally{await h.cleanup();}
});

test('a draft that fails validation cannot be approved; it goes back to redraft with the validator errors (never repaired)',async()=>{
  // Pattern 2's first draft uses "fpdc" without defining it (no canonical meaning, so assembly cannot define it, ADR-050).
  const bad=user=>{const m=goodPattern(user);m.instructions[0].steps[0].text='Make a MR, 6 fpdc into the ring, sl st to the first st.';return m;};
  const h=await styleApproved({pattern:(n,user)=>n===2?bad(user):goodPattern(user)});
  try{
    await brief(h,'3');
    await confirm(h,'🧶 Draft 3 Candidate Patterns (AI)');
    let p=await h.store.load('001');
    assert.equal(p.crochet.validation.ok,false);
    assert.deepEqual(p.crochet.patterns.map(e=>e.status),['valid','invalid','valid']);
    assert.match(p.crochet.patterns[1].errors.join(),/"fpdc" is used in the instructions but not defined/);
    assert.ok(!labels(h).includes('✅ Approve Patterns'),'no approve button for an invalid source');
    // A stale approve press is refused too.
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'patterns_not_approved');
    await confirm(h,'🔁 Redraft Invalid Patterns (AI)');
    const redraft=h.calls.filter(c=>c.schemaName==='crochet-pattern').at(-1);
    assert.match(redraft.user,/failed validation\. Fix exactly these problems:[\s\S]*"fpdc" is used/);
    assert.equal(textCalls(h,'crochet-pattern'),4,'only the invalid pattern was redrafted');
    p=await h.store.load('001');
    assert.equal(p.crochet.validation.ok,true);assert.equal(p.crochet.patterns[1].revision,2);
    assert.ok(await exists(join(h.store.dirOf(p),'crochet','history','fixture-flower-2-r01.json')),'the replaced draft is kept');
    assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
  }finally{await h.cleanup();}
});

test('owner-supplied source: free validation, approval bound to SHA-256; a changed source after approval is refused by production',async()=>{
  const h=await styleApproved();
  try{
    const p0=await h.store.load('001'), ws=h.store.dirOf(p0);
    await mkdir(join(ws,'crochet'),{recursive:true});
    await writeFile(join(ws,'crochet','patterns.json'),JSON.stringify(crochetBundle({patterns:2}),null,2));
    await h.wf.handleUpdate(press(menuData('prod','001')));
    const calls=h.calls.length;
    assert.equal((await tap(h,'📂 Validate Supplied patterns.json (free)')).outcome,'awaiting_pattern_approval');
    assert.equal(h.calls.length,calls,'validation makes no OpenAI call');
    let p=await h.store.load('001');
    assert.equal(p.crochet.validation.ok,true);assert.equal(p.crochet.plan,null);assert.deepEqual(p.crochet.patterns.map(e=>e.status),['supplied','supplied']);
    // Edited after validation, before approval: approval refused until re-validated.
    const src=join(ws,'crochet','patterns.json'), edited=JSON.parse(await readFile(src,'utf8'));edited.title='Fixture Crochet Flowers II';
    await writeFile(src,JSON.stringify(edited,null,2));
    const r=await tap(h,'✅ Approve Patterns');
    assert.equal(r.outcome,'patterns_not_approvable');assert.match(r.problem,/changed after it was validated/);
    await h.wf.handleUpdate(press(menuData('prod','001')));
    await tap(h,'🔄 Re-validate patterns.json (free)');
    assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
    p=await h.store.load('001');
    assert.equal(p.crochet.approval.source_sha256,sha(await readFile(src)));assert.equal(p.crochet.approval.origin,'owner-authored');
    // Changed after APPROVE PATTERNS: Stage 2 refuses it, naming the reason.
    edited.patterns[0].finishing=['Fasten off.'];await writeFile(src,JSON.stringify(edited,null,2));
    // The /produce pre-check stops it with no state change; the Stage 2 handoff (the authority) names the reason.
    const prod=await h.wf.handleUpdate(msg('/produce 001'));
    // ADR-053: an edit is not a visuals problem: the free Re-validate + Approve, never "Run Restyle".
    assert.equal(prod.outcome,'crochet_patterns_edited');assert.match(prod.reasons.join(),/changed after APPROVE PATTERNS/);
    await assert.rejects(createHandoff(await h.store.load('001'),ws),/changed after APPROVE PATTERNS.*revalidate and approve the patterns again/);
    assert.ok(!await exists(join(ws,'production','deliverables')),'nothing was built');
  }finally{await h.cleanup();}
});

test('revise one pattern (owner instruction), then reject: every file archived, back to the approved style, brief kept',async()=>{
  const h=await styleApproved();
  try{
    await brief(h,'2 UK');
    let p=await h.store.load('001');assert.deepEqual([p.crochet.brief.pattern_count,p.crochet.brief.terminology],[2,'UK']);
    // UK terms: the fixture drafts use US "sc", so validation fails (terminology is checked, never converted).
    await confirm(h,'🧶 Draft 2 Candidate Patterns (AI)');
    p=await h.store.load('001');
    assert.match(p.crochet.validation.errors.join(),/"sc" is US terminology; the bundle declares UK/);
    await confirm(h,'✏️ Revise a Pattern (AI)');
    assert.equal((await h.wf.handleUpdate(msg('2: use UK terms throughout'))).outcome,'awaiting_pattern_approval');
    const last=h.calls.filter(c=>c.schemaName==='crochet-pattern').at(-1);
    assert.match(last.user,/Owner's revision instruction \(apply it\):\nuse UK terms throughout/);
    p=await h.store.load('001');
    assert.equal(p.crochet.revision_notes.at(-1).text,'use UK terms throughout');assert.equal(p.crochet.patterns[1].revision,2);
    const ws=h.store.dirOf(p);
    assert.equal((await confirm(h,'❌ Reject Patterns')).outcome,'patterns_rejected');
    p=await h.store.load('001');
    assert.equal(p.status,'CREATIVE_APPROVED');assert.equal(p.crochet.approval,null);assert.deepEqual(p.crochet.brief.pattern_count,2);
    assert.ok(!await exists(join(ws,'crochet','patterns.json')));
    const hist=await readdir(join(ws,'crochet','history'));
    const rejected=hist.find(d=>d.startsWith('rejected-'));
    assert.deepEqual((await readdir(join(ws,'crochet','history',rejected))).sort(),['drafts','patterns.json','plan.json','review.txt']);
  }finally{await h.cleanup();}
});

// ---------------------------------------------------------------- ADR-044: brief reset (Task 1) and RESTYLE ---
import { restyleConflicts, canRestyle } from '../src/orchestrator/restyle.mjs';
import { requestedBrief, briefMismatch } from '../src/orchestrator/crochet.mjs';
import { confirmScreen, productScreen } from '../src/telegram/menu.mjs';
import { briefPrompt } from '../src/telegram/crochet.mjs';
import { harness as genericHarness } from './helpers.mjs';
import { encode } from '../src/telegram/approvals.mjs';

const REQUEST='crochet flower bouquet pattern bundle: 33 crochet flower & bouquet patterns, US terms';
async function approvedStyle(text,opts){
  const h=await harness(opts);
  await h.wf.handleUpdate(msg(`/newproduct ${text}`));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  return h;
}
const setBrief=async(h,text)=>{await h.wf.handleUpdate(press(menuData('prod','001')));
  await tap(h,labels(h).find(l=>/Set Pattern Count|Change Pattern Count/.test(l)));return h.wf.handleUpdate(msg(text));};
const UNRELATED=p=>({product_id:p.product_id,workspace:p.workspace,name:p.name,request:p.request,concepts:p.concepts,concept_previews:p.concept_previews,
  pages:p.pages,proofs:p.proofs,visual_direction:p.visual_direction,creative_approved_at:p.creative_approved_at,canvas:p.canvas,direction_feedback:p.direction_feedback});
const tooLongStep=user=>({...goodPattern(user),instructions:[{heading:'Flower',steps:[{label:'Rnd 1',text:'Work 2 sc in each st around. '.repeat(30),stitch_count:6}]}]});

test('brief reset: a 12 UK brief that failed during patterns moves cleanly to 33 US through Reject + Change Pattern Count; stale plan archived; nothing else changes',async()=>{
  const h=await approvedStyle(REQUEST,{pattern:(n,user)=>tooLongStep(user)});
  try{
    // The prompt leads with the request; a mismatching brief is flagged before anything is paid for.
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🧶 Set Pattern Count & Terms');
    assert.match(lastText(h),/Your request: 33 patterns, US terms\. To match it, reply: 33 US/);
    assert.doesNotMatch(lastText(h),/12 UK/);
    assert.equal((await h.wf.handleUpdate(msg('12 UK'))).outcome,'pattern_brief_set');
    assert.match(lastScreen(h).text,/⚠️ This brief differs from your request: 12 patterns \(your request said 33\); UK terms \(your request said US\)/);
    const r=await confirm(h,'🧶 Draft 12 Candidate Patterns (AI)');
    assert.equal(r.outcome,'failed');assert.match(r.detail,/steps\[0\]\.text: longer than 600/);
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.ok(p.crochet.plan);assert.equal(p.crochet.patterns.length,12);
    const before=UNRELATED(p), ws=h.store.dirOf(p), planBytes=await readFile(join(ws,'crochet','plan.json'));
    // Reject (the FAILED product's own Cancel): every pattern file archived, brief kept, back to the approved style.
    assert.equal((await h.wf.handleUpdate(msg('/cancel'))).outcome,'patterns_rejected');
    p=await h.store.load('001');
    assert.equal(p.status,'CREATIVE_APPROVED');assert.equal(p.crochet.plan,null,'stale plan invalidated');
    assert.deepEqual([p.crochet.patterns,p.crochet.source,p.crochet.validation,p.crochet.approval,p.crochet.pending],[[],null,null,null,null]);
    assert.ok(!await exists(join(ws,'crochet','plan.json')));
    const hist=(await readdir(join(ws,'crochet','history'))).find(d=>d.startsWith('rejected-'));
    assert.ok((await readFile(join(ws,'crochet','history',hist,'plan.json'))).equals(planBytes),'the stale plan is archived, byte for byte');
    // Change Pattern Count is offered again (no plan) and records 33 US; the warning disappears.
    assert.equal((await setBrief(h,'33 US')).outcome,'pattern_brief_set');
    p=await h.store.load('001');
    assert.deepEqual([p.crochet.brief.pattern_count,p.crochet.brief.terminology],[33,'US']);
    assert.doesNotMatch(lastScreen(h).text,/differs from your request/);
    assert.ok(labels(h).includes('🧶 Draft 33 Candidate Patterns (AI)'));
    assert.deepEqual(UNRELATED(p),before,'concepts, pages, proofs, direction and creative approval are unchanged');
    assert.match(p.crochet.revision_notes.at(-1).text,/Candidate patterns rejected; archived to crochet\/history\/rejected-/);
  }finally{await h.cleanup();}
});

test('requestedBrief / briefMismatch: the request states 33 US; a 12 UK brief is flagged, a matching brief is not',()=>{
  assert.deepEqual(requestedBrief(REQUEST),{pattern_count:33,terminology:'US'});
  assert.deepEqual(briefMismatch({pattern_count:12,terminology:'UK'},requestedBrief(REQUEST)),['12 patterns (your request said 33)','UK terms (your request said US)']);
  assert.deepEqual(briefMismatch({pattern_count:33,terminology:'US'},requestedBrief(REQUEST)),[]);
  assert.equal(requestedBrief('crochet flower bouquet pattern bundle'),null);
  assert.doesNotMatch(briefPrompt({product_id:'001',request:{text:'crochet flowers'}}),/Your request/);
});

/** Style approved -> 4 patterns drafted and APPROVED: the state #016 will be in before a restyle. */
async function patternsApprovedProduct(){
  const h=await approvedStyle('crochet flower bouquet pattern bundle: 4 crochet flower patterns, US terms');
  assert.equal((await setBrief(h,'4')).outcome,'pattern_brief_set');
  assert.equal((await confirm(h,'🧶 Draft 4 Candidate Patterns (AI)')).outcome,'awaiting_pattern_approval');
  assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
  return h;
}

test('RESTYLE: concise confirmation; entering restyle makes no model or image call; only the style approval is cleared; patterns untouched; archive written',async()=>{
  const h=await patternsApprovedProduct();
  try{
    let p=await h.store.load('001');
    const ws=h.store.dirOf(p), crochet=structuredClone(p.crochet), approvedAt=p.creative_approved_at, proofFiles=p.proofs.attempts[0].images.map(i=>i.file);
    const patternBytes=await readFile(join(ws,'crochet','patterns.json')), oldDirection=JSON.parse(await readFile(join(ws,'creative','creative-direction.json'),'utf8'));
    await h.wf.handleUpdate(press(menuData('prod','001')));
    assert.ok(labels(h).includes('🎨 Restyle Product'));
    await tap(h,'🎨 Restyle Product');
    assert.equal(lastScreen(h).text,'Restyle #001?\nCurrent proofs will be archived.\nPatterns will not be changed.\nNew proofs will require 3 image calls.');
    assert.deepEqual(labels(h),['Confirm Restyle','Cancel']);
    const calls=h.calls.length;
    const r=await tap(h,'Confirm Restyle');
    assert.equal(r.outcome,'restyled');
    assert.equal(h.calls.length,calls,'no OpenAI text or image call on entering restyle');
    p=await h.store.load('001');
    // Back at the style-proof gate; only the creative approval is cleared.
    assert.equal(p.status,'SPEC_READY');assert.equal(p.creative_approved_at,null);
    assert.deepEqual(p.crochet,crochet,'pattern approval, brief, plan and source unchanged');
    assert.ok((await readFile(join(ws,'crochet','patterns.json'))).equals(patternBytes));
    assert.equal(p.status_history.at(-1).event,'restyle_started');
    const rec=p.restyles.at(-1);
    assert.deepEqual([rec.previous.creative_approved_at,rec.previous.direction_version,rec.previous.approved_attempt,rec.direction_version,rec.patterns_sha256],
      [approvedAt,1,1,2,crochet.approval.source_sha256]);
    assert.match(rec.reason,/realistic crochet/);
    // Archive: previous direction, pages and approval record (with the proof SHA-256s); proof images kept in place.
    const arch=join(ws,...rec.archive.split('/'));
    assert.deepEqual(JSON.parse(await readFile(join(arch,'creative-direction.v01.json'),'utf8')),oldDirection);
    const approval=JSON.parse(await readFile(join(arch,'approval.json'),'utf8'));
    assert.equal(approval.creative_approved_at,approvedAt);assert.equal(approval.proofs.length,3);
    for(const [i,f] of proofFiles.entries()){assert.ok(await exists(join(ws,f)),`${f} kept`);assert.equal(approval.proofs[i].sha256,sha(await readFile(join(ws,f))));}
    assert.equal(JSON.parse(await readFile(join(arch,'pages.json'),'utf8'))[0].generation_prompt,'Cover artwork illustration.');
    // The new direction and briefs: realistic crochet; superseded wording gone; real names and count from the approved source.
    const d=JSON.parse(await readFile(join(ws,'creative','creative-direction.json'),'utf8')), bundle=JSON.parse(patternBytes);
    assert.equal(d.version,2);assert.equal(d.source,'restyle');assert.equal(p.visual_direction.version,2);
    assert.ok(!d.avoid.some(a=>/photorealism/i.test(a)));
    assert.match(d.line_weight,/^Branding ornaments and dividers only, never the crochet product: /);
    assert.deepEqual(restyleConflicts({direction:d,pages:p.pages,canvas:p.canvas}),[]);
    assert.match(p.pages[0].generation_prompt,/small line exactly “4 crochet patterns • US terms”/);
    for(const x of bundle.patterns)assert.ok(p.pages[1].generation_prompt.includes(x.name),`overview names ${x.name}`);
    assert.match(p.pages[1].production_notes,/pattern index with every name is typeset by code/);
    assert.equal(p.pages[1].page_type,'pattern-overview');assert.match(p.pages[2].generation_prompt,/^Macro stitch detail/);
    assert.equal(p.page_count,3);
    // Production refuses until the new style is approved.
    assert.notEqual((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.ok(!canRestyle(p));
  }finally{await h.cleanup();}
});

test('RESTYLE -> Generate Style Proofs (confirmed, 3 image calls, updated crochet direction) -> APPROVE STYLE -> /produce uses the new proofs; patterns still approved',async()=>{
  const h=await patternsApprovedProduct();
  try{
    const crochet=structuredClone((await h.store.load('001')).crochet);
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
    await h.wf.handleUpdate(press(menuData('prod','001')));
    assert.ok(labels(h).includes('🎨 Generate Style Proofs'));
    await tap(h,'🎨 Generate Style Proofs');
    assert.match(lastScreen(h).text,/This will incur OpenAI API cost/);
    const images=h.calls.filter(c=>c.kind==='image').length;
    assert.equal((await tap(h,labels(h)[0])).outcome,'awaiting_creative_approval');
    const proofs=h.calls.filter(c=>c.kind==='image').slice(images);
    assert.equal(proofs.length,3,'exactly 3 image calls, only after the confirmation');
    for(const c of proofs){
      assert.match(c.prompt,/CROCHET PRODUCT DIRECTION/);assert.match(c.prompt,/clearly visible yarn fibres/);
      for(const old of ['gouache','never photographic','Illustration only','photorealism;'])assert.ok(!c.prompt.includes(old),`"${old}" survived`);
    }
    let p=await h.store.load('001');
    assert.equal(p.proofs.attempts.at(-1).reason,'restyle');assert.equal(p.proofs.attempts.at(-1).direction_version,2);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/The approved patterns are unchanged/);
    p=await h.store.load('001');
    assert.deepEqual(p.crochet,crochet,'pattern approval intact through restyle and re-approval');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    const handoff=JSON.parse(await readFile(join(h.store.dirOf(p),'production','handoff.json'),'utf8'));
    assert.ok(handoff.assets.every(a=>a.file.startsWith('proofs/attempt-02/')),'Stage 2 takes the newly approved proofs');
  }finally{await h.cleanup();}
});

test('RESTYLE is crochet-only and needs approved patterns: no button and a forged press is refused, state unchanged',async()=>{
  // Crochet, style approved, patterns not yet approved.
  const h=await approvedStyle(REQUEST);
  try{
    const p=await h.store.load('001');
    assert.ok(!canRestyle(p));
    assert.ok(!JSON.stringify(productScreen(p).keyboard).includes('rstyle'));
    const r=await h.wf.handleUpdate(press(encode('rstyle','001',p.review.nonce)));
    assert.equal(r.outcome,'restyle_refused');assert.match(r.problem,/Approve the patterns first/);
    assert.deepEqual(await h.store.load('001'),p);
  }finally{await h.cleanup();}
  // A non-crochet product (activity book), creatively approved.
  const g=await genericHarness();
  try{
    await g.wf.handleUpdate(msg('/newproduct cute ghost activity book'));await g.wf.handleUpdate(msg('/go'));
    await g.wf.handleUpdate(press(button(g.telegram,'A')));
    assert.equal((await g.wf.handleUpdate(press(button(g.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
    const p=await g.store.load('001');
    assert.ok(!canRestyle(p));
    assert.deepEqual(productScreen(p).keyboard.inline_keyboard.flat().map(b=>b.text).filter(t=>/Restyle|Style Proofs/.test(t)),[]);
    const r=await g.wf.handleUpdate(press(encode('rstyle','001',p.review.nonce)));
    assert.equal(r.outcome,'restyle_refused');assert.match(r.problem,/crochet pattern bundles only/);
    const after=await g.store.load('001');
    assert.deepEqual(after,p);assert.equal(after.restyles,undefined);
    assert.ok(!g.calls.some(c=>c.kind==='image'&&/CROCHET PRODUCT DIRECTION/.test(c.prompt)));
  }finally{await g.cleanup();}
});

test('Telegram restyle copy: concise, says patterns stay unchanged, warns about 3 image calls, no implementation detail',()=>{
  const s=confirmScreen({product_id:'016',review:{nonce:'abc123def'}},'rstyle');
  assert.deepEqual(s.text.split('\n'),['Restyle #016?','Current proofs will be archived.','Patterns will not be changed.','New proofs will require 3 image calls.']);
  assert.deepEqual(s.keyboard.inline_keyboard.flat().map(b=>b.text),['Confirm Restyle','Cancel']);
  assert.doesNotMatch(s.text,/SPEC_READY|ADR|direction|json|SHA|schema/i);
});

// ---------------------------------------------------------------- ADR-046: restyle visuals are traceable to the approved patterns ---
test('RESTYLE builds every crochet piece from the approved patterns: cover = an approved combination; specs internally_checked and recorded',async()=>{
  const h=await patternsApprovedProduct();
  try{
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');
    const rr=await tap(h,'Confirm Restyle');assert.equal(rr.outcome,'restyled',JSON.stringify(rr));
    const p=await h.store.load('001'), ws=h.store.dirOf(p);
    const doc=JSON.parse(await readFile(join(ws,'creative','visual-specs.json'),'utf8')), bundle=JSON.parse(await readFile(join(ws,'crochet','patterns.json'),'utf8'));
    const ids=bundle.patterns.map(x=>x.pattern_id);
    assert.equal(doc.visual_match_status,'internally_checked');assert.equal(doc.patterns_sha256,p.crochet.approval.source_sha256);
    assert.match(doc.note,/Not physically verified/);
    // The cover bouquet IS the approved "Fixture posy" combination: 3 x flower-1, 2 x flower-3. Nothing else.
    assert.equal(doc.combination,'Fixture posy');
    assert.deepEqual(doc.specs.cover.items.map(i=>[i.pattern_id,i.quantity]),[['fixture-flower-1',3],['fixture-flower-3',2]]);
    for(const k of ['cover','overview','detail']){
      assert.equal(doc.specs[k].status,'internally_checked');assert.deepEqual(doc.specs[k].problems,[]);
      assert.ok(doc.specs[k].items.every(i=>ids.includes(i.pattern_id)),`${k}: only approved pattern IDs`);
      assert.ok(doc.specs[k].ornaments.every(o=>o.medium!=='crochet'));
    }
    const cover=p.pages[0].generation_prompt;
    assert.match(cover,/Render the finished crochet result represented by this specification/);
    assert.deepEqual([...cover.matchAll(/\[pattern ([a-z0-9-]+)\]/g)].map(m=>m[1]),['fixture-flower-1','fixture-flower-3']);
    assert.match(cover,/Show ONLY these crochet pieces: 5 in total/);
    assert.match(p.pages[0].production_notes,/Crochet pieces: 3 × Fixture Rose \(fixture-flower-1\), 2 × Fixture Leaf \(fixture-flower-3\), from creative\/visual-specs\.json/);
    const rec=p.restyles.at(-1);
    assert.deepEqual([rec.visual_specs,rec.visual_match_status],['creative/visual-specs.json','internally_checked']);
    assert.notEqual(rec.visual_match_status,'physically_verified');
  }finally{await h.cleanup();}
});

test('RESTYLE refuses product subjects that bypass the patterns (free-text hero, crochet species in the shared style); nothing changes',async()=>{
  for(const [values,why] of [[{cover:{hero_subject:'a bouquet of peonies'}},/"hero_subject" is not accepted/],
    [{direction:{shared_prompt:'Premium look with a lifelike crochet bouquet of blush roses and cream daisies.'}},/names a crochet rose outside the pattern-derived spec/],
    [{cover:{hero_combination:'Invented Wreath'}},/hero_combination "Invented Wreath" is not a combination in the approved patterns/]]){
    const h=await patternsApprovedProduct();
    try{
      const before=await h.store.load('001'), ws=h.store.dirOf(before);
      await writeFile(join(ws,'creative','restyle-direction.json'),JSON.stringify(values));
      await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');
      const r=await tap(h,'Confirm Restyle');
      assert.equal(r.outcome,'failed');assert.match(r.detail,why);
      const after=await h.store.load('001');
      assert.deepEqual([after.creative_approved_at,after.pages,after.crochet,after.visual_direction],[before.creative_approved_at,before.pages,before.crochet,before.visual_direction]);
      assert.ok(!await exists(join(ws,'creative','visual-specs.json')));
      assert.equal(after.restyles,undefined);
    }finally{await h.cleanup();}
  }
});

test('ADR-047: a crochet product\'s first proofs are recorded as concept-style (no species or counts needed); Restyle proofs as traceable-product; other formats carry no purpose',async()=>{
  const h=await patternsApprovedProduct();
  try{
    let p=await h.store.load('001');
    assert.equal(p.proofs.attempts[0].purpose,'concept-style');
    // The fixture spec names no flower species and no counts: the style gate is reached without them.
    assert.ok(p.pages.every(pg=>!/\b(rose|daisy|peony|\d+ patterns?)\b/i.test(pg.generation_prompt)));
    const first=h.calls.filter(c=>c.kind==='image'&&!/CONCEPT PREVIEW/.test(c.prompt));
    assert.ok(first.length&&first.every(c=>/CONCEPT \/ STYLE PROOF ONLY/.test(c.prompt)));
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Generate Style Proofs');await tap(h,labels(h)[0]);
    p=await h.store.load('001');
    assert.equal(p.proofs.attempts.at(-1).purpose,'traceable-product');
    assert.ok(h.calls.filter(c=>c.kind==='image').slice(-3).every(c=>/PATTERN-DERIVED PRODUCT VISUAL/.test(c.prompt)&&!/CONCEPT \/ STYLE PROOF ONLY/.test(c.prompt)));
  }finally{await h.cleanup();}
  const g=await genericHarness();
  try{
    await g.wf.handleUpdate(msg('/newproduct cute ghost activity book'));await g.wf.handleUpdate(msg('/go'));
    await g.wf.handleUpdate(press(button(g.telegram,'A')));
    const p=await g.store.load('001');
    assert.ok(p.proofs.attempts.every(a=>!('purpose' in a)));
    assert.ok(!g.calls.some(c=>c.kind==='image'&&/STYLE PROOF ONLY|PATTERN-DERIVED/.test(c.prompt)));
  }finally{await g.cleanup();}
});

test('ADR-052: an approved source edited afterwards: unsupported characters are caught at review (free, no approval), the fix is re-approved, the checked visuals are re-bound without images, /produce passes',async()=>{
  const h=await patternsApprovedProduct();
  try{
    // Restyle + new proofs + style approval, so the Stage 2 visual gate is satisfied for the approved patterns.
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Generate Style Proofs');await tap(h,labels(h)[0]);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
    let p=await h.store.load('001');
    const ws=h.store.dirOf(p), src=join(ws,'crochet','patterns.json'), approved=p.crochet.approval, calls=h.calls.length;
    // Unchanged source: nothing to re-validate.
    await h.wf.handleUpdate(press(menuData('prod','001')));
    assert.equal((await tap(h,'🔄 Re-validate edited patterns.json (free)')).outcome,'patterns_unchanged');
    // A stray non-Latin word lands in the approved source.
    const bundle=JSON.parse(await readFile(src,'utf8'));
    bundle.patterns[1].finishing[0]=`${bundle.patterns[1].finishing[0]} બંધ`;
    await writeFile(src,JSON.stringify(bundle,null,2)+'\n');
    await h.wf.handleUpdate(press(menuData('prod','001')));
    assert.equal((await tap(h,'🔄 Re-validate edited patterns.json (free)')).outcome,'awaiting_pattern_approval');
    p=await h.store.load('001');
    assert.equal(p.crochet.approval,null);assert.equal(p.crochet.approval_history.at(-1).source_sha256,approved.source_sha256,'the old approval is kept as history');
    assert.equal(p.crochet.validation.ok,false);
    assert.deepEqual(p.crochet.validation.unprintable.map(x=>[x.location,x.char,x.code]),[['Pattern 2, Finishing 1','બ','U+0AAC'],['Pattern 2, Finishing 1','ં','U+0A82'],['Pattern 2, Finishing 1','ધ','U+0AA7']]);
    const review=h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text).find(t=>/pattern review/.test(t)&&/unsupported characters/.test(t));
    assert.match(review,/❌ Pattern text contains unsupported characters\nPattern 2, Finishing 1: "બ" U\+0AAC, "ં" U\+0A82, "ધ" U\+0AA7\n\nFix the source and re-validate\.\nNo model call was made\./);
    assert.ok(!labels(h).includes('✅ Approve Patterns'),'approval is blocked before Stage 2');
    // The owner removes the stray word and makes one small wording fix (so the source differs from the old approval).
    bundle.patterns[1].finishing[0]='Fasten off, then weave in all ends.';
    await writeFile(src,JSON.stringify(bundle,null,2)+'\n');
    assert.equal((await tap(h,'🔄 Re-validate patterns.json (free)')).outcome,'awaiting_pattern_approval');
    assert.equal((await h.store.load('001')).crochet.validation.ok,true);
    assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/The checked visuals still match these patterns \(no new images needed\)/);
    const specs=JSON.parse(await readFile(join(ws,'creative','visual-specs.json'),'utf8'));
    p=await h.store.load('001');
    assert.equal(specs.patterns_sha256,p.crochet.approval.source_sha256);
    assert.deepEqual(specs.rebinds.map(r=>[r.from,r.to]),[[approved.source_sha256,p.crochet.approval.source_sha256]]);
    assert.equal(h.calls.length,calls,'no model or image call anywhere in the fix');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
  }finally{await h.cleanup();}
});

test('ADR-052: a production failure on unprintable text shows the concise copy and the free re-validate button',async()=>{
  const { knownFailureText }=await import('../src/telegram/ui.mjs');
  const { failureKeyboard }=await import('../src/telegram/approvals.mjs');
  const p={product_id:'016',status:'FAILED',concepts:{selected:{batch:1,concept_id:'A'},batches:[{batch:1,concepts:[{concept_id:'A',product_format:'crochet-pattern-bundle'}]}]},crochet:{approval:{source_sha256:'a'.repeat(64)}},review:{nonce:'abcdef123456'},
    last_error:{step:'production',retryable:false,message:'HandoffError: The approved pattern text uses characters the document fonts cannot print ("બ" U+0AAC, "ં" U+0A82, "ધ" U+0AA7; at $.patterns[21].finishing[3]). Stage 2 never replaces text; edit the source and approve it again.'}};
  assert.equal(knownFailureText(p),['❌ #016 cannot enter production','Pattern text contains unsupported characters: "બ" U+0AAC, "ં" U+0A82, "ધ" U+0AA7','',
    'Fix crochet/patterns.json, then Re-validate (free) and approve the patterns again.','No model call was made.'].join('\n'));
  assert.ok(failureKeyboard(p).inline_keyboard.flat().some(b=>b.text==='🔄 Re-validate edited patterns.json (free)'));
});

test('ADR-053: a handoff made for the OLD approval is refreshed on re-approval (archived, not reused); Build then succeeds; no paid call',async()=>{
  const h=await patternsApprovedProduct();
  try{
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
    await h.wf.handleUpdate(press(menuData('prod','001')));await tap(h,'🎨 Generate Style Proofs');await tap(h,labels(h)[0]);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
    // A first production run writes a handoff for the approved patterns; the owner cancels it.
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    await h.wf.handleUpdate(press(menuData('prod','001')));await confirm(h,'✖️ Cancel Production');
    let p=await h.store.load('001');assert.equal(p.status,'CREATIVE_APPROVED');
    const ws=h.store.dirOf(p), src=join(ws,'crochet','patterns.json'), handoffPath=join(ws,'production','handoff.json'), calls=h.calls.length;
    const oldHandoff=JSON.parse(await readFile(handoffPath,'utf8'));
    // Text-only correction of the approved source.
    const bundle=JSON.parse(await readFile(src,'utf8'));bundle.patterns[0].finishing[0]='Fasten off, then weave in all ends.';
    await writeFile(src,JSON.stringify(bundle,null,2)+'\n');
    // Before re-approval: refused with the plain copy (never "Run Restyle").
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'crochet_patterns_edited');
    assert.match(lastText(h),/patterns changed after approval\ncrochet\/patterns\.json was edited and has not been approved again\.\n\nPress Re-validate edited patterns\.json \(free\), then Approve Patterns\.\nNo paid call is required\./);
    assert.doesNotMatch(lastText(h),/Restyle/);
    // Re-validate (free) -> Approve: visuals re-bound and the stale handoff refreshed at once.
    await h.wf.handleUpdate(press(menuData('prod','001')));
    assert.equal((await tap(h,'🔄 Re-validate edited patterns.json (free)')).outcome,'awaiting_pattern_approval');
    assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
    p=await h.store.load('001');
    const approved=p.crochet.approval.source_sha256, fresh=JSON.parse(await readFile(handoffPath,'utf8'));
    assert.equal(sha(await readFile(src)),approved,'approved checksum = patterns.json');
    assert.equal(fresh.crochet.source.sha256,approved,'handoff = approved checksum');
    assert.equal(JSON.parse(await readFile(join(ws,'creative','visual-specs.json'),'utf8')).patterns_sha256,approved,'visual specs = approved checksum');
    assert.notEqual(oldHandoff.crochet.source.sha256,approved);
    assert.deepEqual(JSON.parse(await readFile(join(ws,'production','handoff.v01.json'),'utf8')),oldHandoff,'the old handoff is archived, unchanged');
    assert.equal(p.production.handoff.sha256,sha(await readFile(handoffPath)));
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.equal(h.calls.length,calls,'no model or image call');
  }finally{await h.cleanup();}
});

test('ADR-053: a production failure on an edited, not re-approved source hides Retry and points to the free Re-validate',async()=>{
  const { knownFailureText, retrySafety }=await import('../src/telegram/ui.mjs');
  const { failureKeyboard }=await import('../src/telegram/approvals.mjs');
  const base={product_id:'016',status:'FAILED',resume_state:'PRODUCTION_READY',concepts:{selected:{batch:1,concept_id:'A'},batches:[{batch:1,concepts:[{concept_id:'A',product_format:'crochet-pattern-bundle'}]}]},
    crochet:{approval:{source_sha256:'a'.repeat(64)}},review:{nonce:'abcdef123456'}};
  const edited={...base,last_error:{step:'production',retryable:false,message:'HandoffError: Approved content changed since handoff: crochet/patterns.json. Production refuses it: revalidate and approve it again in Stage 1.'}};
  assert.equal(knownFailureText(edited),['❌ #016 patterns changed after approval','crochet/patterns.json was edited and has not been approved again.','',
    'Press Re-validate edited patterns.json (free), then Approve Patterns.','No paid call is required.'].join('\n'));
  assert.equal(retrySafety(edited).safe,false,'a retry would fail the same way');
  const keys=failureKeyboard(edited).inline_keyboard.flat().map(b=>b.text);
  assert.ok(keys.includes('🔄 Re-validate edited patterns.json (free)'));assert.ok(!keys.some(k=>/Retry/.test(k)));
  const stale={...base,last_error:{step:'production',retryable:false,message:'HandoffError: The crochet pattern approval changed since the production handoff. CANCEL, then /produce again.'}};
  assert.equal(knownFailureText(stale),['❌ #016 production state is stale','Patterns were re-approved, but the production handoff still references an older version.','',
    'Refresh production state and retry.','No paid call is required.'].join('\n'));
  assert.equal(retrySafety(stale).safe,true,'a retry refreshes the handoff (free)');
});
