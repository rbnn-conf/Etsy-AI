// Crochet VISUAL SET through Stage 1 and into Stage 2 (ADR-063): owner confirmation with the image count,
// resumable paid generation, QC, review, approval, restyle (hero / one preview / all), stop, recover and the
// production gate. Fake OpenAI + fake Telegram: NO network, NO real image or text call. FIXTURE patterns only
// (a Product #020-shaped autumn table set; not sellable content, never tested by anyone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ProductStore, Registry } from '../src/orchestrator/store.mjs';
import { Workflow } from '../src/orchestrator/workflow.mjs';
import { transition } from '../src/orchestrator/state.mjs';
import { menuData } from '../src/telegram/ui.mjs';
import { progressOf, runningText } from '../src/telegram/status.mjs';
import { heroPrompt, previewPrompt } from '../src/openai/crochet-visuals.mjs';
import { withRolePlan, fakeTelegram, msg, press, button, concept, bookDirection, CHAT, USER, lastKeyboard } from './helpers.mjs';
import { lineArt } from './colouring-fixture.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { visualBriefs, VISUAL_MANIFEST, VISUAL_BRIEFS, HERO_FILE, previewFile, previewAsset, HERO_ASSET } from '../../production/src/index.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
const TABLE=[['maple-leaf-placemat','Maple Leaf Placemat','placemat','focal','About 38 cm wide by 35 cm long','Burnt orange'],
  ['oak-leaf-applique','Oak Leaf Appliqué','applique','foliage','About 13 cm long and 6 cm wide','Burnt ochre'],
  ['beech-leaf-coaster','Beech Leaf Coaster','coaster','secondary','About 12 cm long; about 7 cm wide','Warm beech brown'],
  ['acorn-napkin-ring','Acorn Napkin Ring','napkin ring','accent','About 6 cm across','Rust brown'],
  ['falling-leaves-table-runner','Falling Leaves Table Runner','table runner','structural','About 100 cm long by 28 cm wide','Warm oatmeal'],
  ['chestnut-cutlery-pocket','Chestnut Cutlery Pocket','cutlery pocket','filler','About 10 cm wide by 18 cm long','Chestnut brown']];
const NAMES=TABLE.map(t=>t[1]);
const crochetConcept=id=>concept(id,{proposed_name:`Table Set ${id}`,product_type:'crochet pattern bundle',product_format:'crochet-pattern-bundle',page_count:3,orientation:'portrait',
  target_customer:'adult crocheters',deliverable_components:['Complete pattern PDF','Individual pattern PDFs','Printing guide']});
const crochetSpec=()=>({name:'Falling Leaves Crochet Table Set',slug:'falling-leaves-crochet-table-set',season:'Autumn',product_type:'crochet pattern bundle',target_customer:'adult crocheters',page_count:3,
  canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'Soft botanical illustration with a clear margin.'},
  pages:[['cover','Cover artwork'],['pattern-illustration','Representative illustration'],['motif','Decorative motif']].map(([t,title],i)=>({page_number:i+1,page_type:t,title,concept:'c',instructions:null,
    artwork_description:'an illustration',generation_prompt:`${title} illustration.`,production_notes:'Illustration only.'}))});
const planFor=user=>{const n=Number(/EXACTLY (\d+)/.exec(user)[1]);
  return withRolePlan({theme:'autumn table decor',audience:['adults','beginners'],style:['earthy autumn'],
    patterns:TABLE.slice(0,n).map(([pattern_id,name,category,role],i)=>({pattern_id,name,category,role,difficulty:i%2?'easy':'beginner',approx_size:'varies',yarn_weight:'3-light',hook_mm:3,
      construction:'worked in rows',main_stitches:['sc','sl st'],assembly_required:false,artwork:'none',summary:'A fixture table piece.'})),combinations:{title:'Table ideas',intro:null,items:[]}});};
const tablePattern=user=>{const e=JSON.parse(/Pattern to draft:\n([\s\S]*?\})/.exec(user)[1]), t=TABLE.find(x=>x[1]===e.name);
  return {category:e.category,difficulty:e.difficulty,finished_size:t[4],yarn:[{description:'Cotton yarn',colour:t[5],amount:'About 40 m'}],
    yarn_weight:'3-light',requires_hook:true,hook_size:{mm:3,us:'D-3'},additional_materials:['Tapestry needle','Scissors'],stitches_used:['ch','sc','sl st'],
    abbreviations:[{abbr:'ch',meaning:'chain'},{abbr:'sc',meaning:'single crochet'},{abbr:'sl st',meaning:'slip stitch'},{abbr:'st',meaning:'stitch'},{abbr:'MR',meaning:'magic ring'}],
    gauge:'Not critical for this pattern.',instructions:[{heading:'Body',steps:[{label:'Rnd 1',text:'Make a MR, 6 sc into the ring, sl st to the first st.',stitch_count:6}]}],
    assembly:[],finishing:['Fasten off and weave in all ends.'],notes:[]};};
async function png(seed,w,h){
  const shapes=Array.from({length:6},(_,i)=>`<circle cx="${(seed*97+i*131)%w}" cy="${(seed*53+i*89)%h}" r="${60+i*20}" fill="#${(0x8a5a2b+seed*4099+i*1031).toString(16).slice(-6)}"/>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#e9dcc8"/>${shapes}</svg>`)).png().toBuffer();
}
/** Fake OpenAI. failVisual(n): the n-th visual-set image call (1-based) throws. */
function fakeAi({failVisual=()=>false}={}){
  const calls=[];
  const client={
    async json({schemaName,user}){
      calls.push({kind:'json',schemaName,user});
      const data={concepts:{concepts:['A','B','C'].map(crochetConcept)},specification:crochetSpec(),'creative-direction':bookDirection(),
        'crochet-plan':schemaName==='crochet-plan'?planFor(user):null,'crochet-pattern':schemaName==='crochet-pattern'?tablePattern(user):null}[schemaName];
      if(!data)throw new Error(`unexpected ${schemaName}`);
      return {data:structuredClone(data),usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
    },
    async image({step,prompt,size}){
      calls.push({kind:'image',step,prompt,size});
      if(/^crochet-/.test(step)){
        const n=calls.filter(c=>/^crochet-/.test(c.step??'')).length;
        if(failVisual(n))throw Object.assign(new Error('OpenAI /images/generations failed (HTTP 500): upstream'),{retryable:true});
        const [w,h]=size.split('x').map(Number);
        return {bytes:await png(n,w,h),usage:{total_tokens:1},model:'fake-image'};
      }
      return {bytes:await lineArt(calls.filter(c=>c.kind==='image').length),usage:{total_tokens:1},model:'fake-image'};
    }};
  return {ai:{client,textModel:'fake-text',imageModel:'gpt-image-test',imageQuality:'medium',previewQuality:'low'},calls};
}
async function harness(opts={}){
  const root=await mkdtemp(join(tmpdir(),'lx-cvis-'));
  const store=new ProductStore({productsDir:join(root,'products')}), registry=new Registry({stateDir:join(root,'state')});
  const telegram=fakeTelegram(), {ai,calls}=fakeAi(opts);
  const wf=new Workflow({store,registry,telegram,ai,auth:(c,u)=>String(c)===String(CHAT)&&String(u)===String(USER),log:()=>{}});
  return {root,store,telegram,calls,wf,cleanup:()=>rm(root,{recursive:true,force:true})};
}
const lastScreen=h=>h.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=h=>lastScreen(h).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const tap=(h,label)=>{const b=lastScreen(h).replyMarkup.inline_keyboard.flat().find(x=>x.text===label);if(!b)throw new Error(`no "${label}" in ${labels(h).join(' | ')}`);return h.wf.handleUpdate(press(b.callback_data));};
const confirm=async(h,label)=>{await tap(h,label);return tap(h,labels(h)[0]);};
const product=async h=>{await h.wf.handleUpdate(press(menuData('prod','001')));};
const visualCalls=h=>h.calls.filter(c=>/^crochet-/.test(c.step??''));

/** /newproduct -> A -> APPROVE STYLE -> 6 patterns -> APPROVE PATTERNS (CREATIVE_APPROVED, patterns approved). */
async function patternsApproved(opts){
  const h=await harness(opts);
  await h.wf.handleUpdate(msg('/newproduct autumn crochet table set: 6 crochet patterns, US terms'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  await product(h);await tap(h,'🧶 Set Pattern Count & Terms');
  assert.equal((await h.wf.handleUpdate(msg('6'))).outcome,'pattern_brief_set');
  const drafted=await confirm(h,'🧶 Draft 6 Candidate Patterns (AI)');
  assert.equal(drafted.outcome,'awaiting_pattern_approval',drafted.detail);
  assert.equal((await tap(h,'✅ Approve Patterns')).outcome,'patterns_approved');
  return h;
}
/** ADR-047 prerequisites for /produce: Restyle -> new style proofs -> APPROVE STYLE. */
async function restyledStyle(h){
  await product(h);await tap(h,'🎨 Restyle Product');await tap(h,'Confirm Restyle');
  await product(h);await confirm(h,'🎨 Generate Style Proofs');
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
}
const generate=async h=>{await product(h);await tap(h,labels(h).find(l=>/Crochet Visual Set/.test(l)));return tap(h,labels(h)[0]);};

test('COST / CONFIRMATION: the owner sees 1 hero + 6 previews = 7 image generations and the cost warning; nothing is generated before Confirm',async()=>{
  const h=await patternsApproved();
  try{
    const images=h.calls.filter(c=>c.kind==='image').length;
    await product(h);
    assert.ok(labels(h).includes('🖼 Generate Crochet Visual Set'));
    await tap(h,'🖼 Generate Crochet Visual Set');
    const text=lastScreen(h).text;
    assert.match(text,/^🎨 Product #001 — Crochet Visual Set\n\nGenerate:\n• 1 collection hero\n• 6 pattern preview images\n\nTotal: 7 image generations\n/);
    assert.match(text,/⚠️ This will incur image API cost\./);
    assert.deepEqual(labels(h),['Generate Visuals','Cancel']);
    assert.equal(h.calls.filter(c=>c.kind==='image').length,images,'showing the confirmation makes no image call');
    assert.equal((await h.store.load('001')).crochet_visuals,undefined,'nothing planned or written before Confirm');
    // Cancel: still nothing.
    await tap(h,'Cancel');assert.equal(h.calls.filter(c=>c.kind==='image').length,images);
  }finally{await h.cleanup();}
});

test('GENERATE: exactly 1 hero + 6 previews (7 calls), files and manifest mapped to the right patterns, prompts separate approved crochet, props and forbidden items',async()=>{
  const h=await patternsApproved();
  try{
    assert.equal((await generate(h)).outcome,'awaiting_visuals_approval');
    const v=visualCalls(h);
    assert.equal(v.length,7);assert.deepEqual(v.map(c=>c.step),['crochet-hero',...Array(6).fill('crochet-preview')]);
    assert.equal(v[0].size,'1536x1024');assert.ok(v.slice(1).every(c=>c.size==='1024x1024'));
    const p=await h.store.load('001'), ws=h.store.dirOf(p);
    assert.equal(p.status,'AWAITING_VISUALS_APPROVAL');assert.equal(p.crochet_visuals.qc.passed,true,p.crochet_visuals.qc.problems.join('; '));
    // Hero prompt: three explicit sections; all six approved products; props never crochet.
    const hero=v[0].prompt;
    for(const s of ['APPROVED CROCHET OBJECTS — the ONLY crochet or yarn items in the image: exactly 6','NON-CROCHET PROPS','FORBIDDEN CROCHET OBJECTS'])assert.ok(hero.includes(s),s);
    for(const n of NAMES)assert.ok(hero.includes(n),n);
    assert.match(hero,/1\. HERO \(dominant focal piece\): Maple Leaf Placemat/);
    assert.ok(!/complementary|additional crochet|matching crochet/i.test(hero));
    // Each preview prompt: exactly its own product approved; every other pattern forbidden.
    v.slice(1).forEach((c,i)=>{
      const [approved,rest]=c.prompt.split('NON-CROCHET PROPS');
      assert.ok(approved.includes(`${NAMES[i]} [pattern ${TABLE[i][0]}]`));assert.match(approved,/exactly 1\./);
      for(const n of NAMES.filter((_,j)=>j!==i)){assert.ok(!approved.includes(n),`${NAMES[i]} preview approves ${n}`);assert.ok(rest.includes(n),`${NAMES[i]} preview forbids ${n}`);}
    });
    // Files where the manifest says, each mapped to its pattern and fingerprint.
    const m=JSON.parse(await readFile(join(ws,VISUAL_MANIFEST),'utf8'));
    assert.deepEqual(m.assets.map(a=>[a.id,a.role,a.pattern_id,a.file]),[[HERO_ASSET,'hero',null,HERO_FILE],...TABLE.map(([id],i)=>[previewAsset(id),'pattern-preview',id,previewFile(i+1,id)])]);
    assert.equal(previewFile(1,'maple-leaf-placemat'),'visuals/crochet/previews/01-maple-leaf-placemat.png');
    for(const a of m.assets){assert.equal(sha(await readFile(join(ws,a.file))),a.sha256);assert.ok(a.prompt_sha256&&a.brief_sha256&&a.fingerprint_sha256&&a.model&&a.generated_at);}
    m.assets.slice(1).forEach(a=>assert.equal(a.fingerprint_sha256,m.briefs.previews.find(b=>b.pattern_id===a.pattern_id).fingerprint_sha256));
    assert.equal(m.provenance.photographic_evidence,false);assert.equal(m.approval,null);
    // Review: every image shown, labelled as an illustration; text says what code can and cannot check.
    const album=h.telegram.sent.filter(s=>s.type==='album').at(-1);
    assert.equal(album.items.length,7);assert.ok(album.items.every(i=>/illustration/.test(i.caption)));
    const review=lastScreen(h).text;
    assert.match(review,/Code cannot see what an image shows/);assert.match(review,/never photographs of test-crocheted items/);
    assert.ok(labels(h).includes('✅ Approve Visual Set'));
  }finally{await h.cleanup();}
});

test('RESUME: a failure at preview 03 keeps the hero and previews 01-02; Retry pays only for 03-06; an image written just before a crash is adopted, never re-bought',async()=>{
  let fail=true;
  const h=await patternsApproved({failVisual:n=>fail&&n===4});
  try{
    const r=await generate(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'visuals');
    let p=await h.store.load('001');
    const done=p.crochet_visuals.assets.filter(a=>a.status==='generated');
    assert.deepEqual(done.map(a=>a.id),[HERO_ASSET,previewAsset('maple-leaf-placemat'),previewAsset('oak-leaf-applique')],'progress persisted after each image');
    assert.equal(p.crochet_visuals.assets[3].status,'failed');
    const kept=Object.fromEntries(done.map(a=>[a.id,a.sha256]));
    // Simulate a crash right after preview 04 was written (file on disk, never recorded).
    const ws=h.store.dirOf(p), f4=join(ws,previewFile(4,'acorn-napkin-ring'));
    await mkdir(dirname(f4),{recursive:true});await writeFile(f4,await png(40,1024,1024));
    fail=false;
    const before=visualCalls(h).length;
    // The paid retry states how many images are still to make.
    await h.wf.handleUpdate(press(lastKeyboard(h.telegram).find(b=>b.text==='🔄 Retry (API cost)').callback_data));
    assert.match(lastScreen(h).text,/Estimated: 4 image calls/);
    assert.equal((await tap(h,'Confirm')).outcome,'awaiting_visuals_approval');
    const after=visualCalls(h).slice(before);
    assert.equal(after.length,3,'03, 05 and 06 only (04 adopted from disk)');
    assert.ok(after.every(c=>c.step==='crochet-preview'));
    assert.ok(!after.some(c=>/1\. HERO/.test(c.prompt)),'the hero is never regenerated');
    p=await h.store.load('001');
    for(const [id,s] of Object.entries(kept))assert.equal(p.crochet_visuals.assets.find(a=>a.id===id).sha256,s,`${id} reused`);
    assert.equal(p.crochet_visuals.assets[4].adopted_after_restart,true);
    assert.equal(p.crochet_visuals.qc.passed,true);
  }finally{await h.cleanup();}
});

test('RESTYLE: hero only, one preview, all; only those images are paid for and archived; patterns, approval and fingerprints never change; approval is re-required',async()=>{
  const h=await patternsApproved();
  try{
    const textCalls=h.calls.filter(c=>c.kind==='json').length;
    await generate(h);
    assert.equal((await tap(h,'✅ Approve Visual Set')).outcome,'visuals_approved');
    let p=await h.store.load('001');
    const ws=h.store.dirOf(p), crochet=structuredClone(p.crochet), patternBytes=await readFile(join(ws,'crochet','patterns.json'));
    const briefs=await readFile(join(ws,VISUAL_BRIEFS)), shaOf=(q,id)=>q.crochet_visuals.assets.find(a=>a.id===id).sha256, before=structuredClone(p.crochet_visuals.assets);
    assert.equal(p.status,'CREATIVE_APPROVED');assert.ok(p.crochet_visuals.approval);
    // Hero only.
    await product(h);await tap(h,'🎨 Restyle Crochet Visuals');await tap(h,'🔁 Restyle Hero');
    assert.match(lastScreen(h).text,/Regenerate:\n• 1 collection hero\n\nTotal: 1 image generation\nKept, not regenerated: 6 finished images\./);
    assert.match(lastScreen(h).text,/Approved patterns and their fingerprints are not changed/);
    let n=visualCalls(h).length;
    assert.equal((await tap(h,'Regenerate')).outcome,'awaiting_visuals_approval');
    assert.deepEqual(visualCalls(h).slice(n).map(c=>c.step),['crochet-hero']);
    p=await h.store.load('001');
    assert.equal(p.crochet_visuals.approval,null,'restyling clears the visual approval');
    assert.notEqual(shaOf(p,HERO_ASSET),before[0].sha256);
    for(const a of before.slice(1))assert.equal(shaOf(p,a.id),a.sha256,`${a.id} untouched`);
    assert.ok(await exists(join(ws,'visuals','crochet','history',`${HERO_ASSET}-r00.png`)),'the old hero is archived, not deleted');
    // One preview (03 Beech Leaf Coaster), from the review screen.
    await h.wf.handleUpdate(press(menuData('vis','001','p')));
    await tap(h,'🔁 03 Beech Leaf Coaster');
    assert.match(lastScreen(h).text,/Restyle Preview 03 Beech Leaf Coaster[\s\S]*• 1 pattern preview image\n\nTotal: 1 image generation/);
    n=visualCalls(h).length;
    await tap(h,'Regenerate');
    const one=visualCalls(h).slice(n);
    assert.equal(one.length,1);assert.match(one[0].prompt.split('NON-CROCHET PROPS')[0],/Beech Leaf Coaster \[pattern beech-leaf-coaster\]/);
    const p2=await h.store.load('001');
    for(const a of before.filter(a=>a.id!==HERO_ASSET&&a.id!==previewAsset('beech-leaf-coaster')))assert.equal(shaOf(p2,a.id),a.sha256);
    // All.
    await tap(h,'🔁 Restyle All Visuals');assert.match(lastScreen(h).text,/Total: 7 image generations/);
    n=visualCalls(h).length;await tap(h,'Regenerate');assert.equal(visualCalls(h).length-n,7);
    p=await h.store.load('001');
    assert.deepEqual(p.crochet,crochet,'pattern approval, plan and source unchanged');
    assert.ok((await readFile(join(ws,'crochet','patterns.json'))).equals(patternBytes),'patterns.json byte-identical');
    assert.ok((await readFile(join(ws,VISUAL_BRIEFS))).equals(briefs),'briefs (and the fingerprints they bind) unchanged');
    assert.deepEqual(p.crochet_visuals.history.map(x=>x.event),['approved','restyle-hero','restyle-preview','restyle-all']);
    assert.equal(h.calls.filter(c=>c.kind==='json').length,textCalls,'no text-model call anywhere in the visual set: briefs and prompts are built by code');
  }finally{await h.cleanup();}
});

test('RESTYLE stays integrity-gated: an edited patterns.json stops the run before any image call',async()=>{
  const h=await patternsApproved();
  try{
    await generate(h);
    const p=await h.store.load('001'), f=join(h.store.dirOf(p),'crochet','patterns.json');
    const b=JSON.parse(await readFile(f,'utf8'));b.patterns[0].finished_size='About 45 cm wide';await writeFile(f,JSON.stringify(b,null,2)+'\n');
    const n=visualCalls(h).length;
    const r=await tap(h,'🔁 Restyle All Visuals').then(()=>tap(h,'Regenerate'));
    assert.equal(r.outcome,'failed');assert.match(r.detail,/changed since the patterns were approved/);
    assert.equal(visualCalls(h).length,n,'no image call');
  }finally{await h.cleanup();}
});

test('PRODUCTION: a production-approved product (as #020) can make its visual set: production approval is cleared, the set approved, the package rebuilt with every preview placed',async()=>{
  const h=await patternsApproved();
  try{
    await restyledStyle(h);
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
    await product(h);
    assert.ok(labels(h).includes('🖼 Generate Crochet Visual Set'));
    await tap(h,'🖼 Generate Crochet Visual Set');
    assert.match(lastScreen(h).text,/Production approval will be cleared: rebuild the production files afterwards \(no API cost\)\./);
    assert.equal((await tap(h,'Generate Visuals')).outcome,'awaiting_visuals_approval');
    let p=await h.store.load('001');
    assert.ok(p.status_history.some(x=>x.event==='production_reopened'));
    // Not approved yet: production refuses.
    await tap(h,'✖️ Stop (keep every image)');await tap(h,'Confirm');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'crochet_visual_set_unapproved');
    // Finish (free: every image exists) and approve; then production places the previews.
    await product(h);assert.ok(labels(h).includes('🖼 Review Crochet Visual Set'));
    const n=visualCalls(h).length;
    await tap(h,'🖼 Review Crochet Visual Set');assert.match(lastScreen(h).text,/No image API cost/);await tap(h,'Show Review');
    assert.equal(visualCalls(h).length,n,'no image call to resume a complete set');
    assert.equal((await tap(h,'✅ Approve Visual Set')).outcome,'visuals_approved');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    p=await h.store.load('001');
    const ws=h.store.dirOf(p), handoff=JSON.parse(await readFile(join(ws,'production','handoff.json'),'utf8'));
    assert.deepEqual(Object.keys(handoff.crochet.visual_set.previews),TABLE.map(t=>t[0]));
    const record=JSON.parse(await readFile(join(ws,'production','build-record.json'),'utf8'));
    for(const [rel,o] of Object.entries(record.outputs).filter(([,o])=>o.expect.role==='pattern-pdf'))
      assert.deepEqual(o.placements.filter(x=>/finished-item preview/.test(x.where)).map(x=>x.asset),[previewAsset(o.expect.patterns[0])],rel);
    const qc=JSON.parse(await readFile(join(ws,'production','qc-report.json'),'utf8'));
    assert.ok(qc.checks.find(c=>/finished-item preview in the fixed slot/.test(c.name))?.ok);
  }finally{await h.cleanup();}
});

test('PROGRESS: deterministic owner status lists the hero and each preview with ✅ / 🔄 / ⏳ and "Progress: 3 / 7 visuals"',()=>{
  const b={patterns:TABLE.map(([pattern_id,name])=>({pattern_id,name}))};
  const assets=[HERO_ASSET,...TABLE.map(t=>previewAsset(t[0]))].map((id,i)=>({id,role:i?'pattern-preview':'hero',pattern_id:i?TABLE[i-1][0]:null,status:i<3?'generated':'missing'}));
  const p={product_id:'020',status:'VISUALS_GENERATING',crochet:{patterns:b.patterns},crochet_visuals:{assets}};
  const text=runningText('020',progressOf(p,'visuals'),65_000);
  assert.equal(text,['🟢 #020 — GENERATING VISUALS','🎨 Generating crochet visuals','','Collection hero ✅','','Pattern previews:',
    '01 Maple Leaf Placemat ✅','02 Oak Leaf Appliqué ✅','03 Beech Leaf Coaster 🔄','04 Acorn Napkin Ring ⏳','05 Falling Leaves Table Runner ⏳','06 Chestnut Cutlery Pocket ⏳','',
    'Progress: 3 / 7 visuals','⏱ 1m 05s','',"No action needed. I'll message you when it's ready."].join('\n'));
});

test('RECOVER: a restart during generation parks the product in FAILED at "visuals"; the finished images are kept for Retry',async()=>{
  const h=await patternsApproved({failVisual:n=>n===3});
  try{
    await generate(h);
    let p=await h.store.load('001');
    // Make it look interrupted mid-run (generating, locked), as a crash would leave it.
    p=transition({...p},'retry',{actor:'t'});
    p=transition({...p,crochet_visuals:{...p.crochet_visuals,generation:{...p.crochet_visuals.generation,status:'generating',finished_at:null,error:null}}},'visuals_started',{actor:'t'});
    await h.store.save({...p,lock:{op:'visuals',id:'x',at:new Date().toISOString()}});
    assert.deepEqual(await h.wf.recover(),['001']);
    p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.last_error.step,'visuals');assert.equal(p.crochet_visuals.generation.status,'interrupted');
    assert.equal(p.crochet_visuals.assets.filter(a=>a.status==='generated').length,2);
  }finally{await h.cleanup();}
});

test('prompts are built only from checked briefs: a brief with an unapproved crochet object is refused before any call',()=>{
  const bundle={title:'T',theme:'autumn',patterns:TABLE.map(([pattern_id,name,category,,size,colour])=>({pattern_id,name,category,finished_size:size,yarn:[{description:'Cotton',colour,amount:'1'}],
    instructions:[{heading:'Body',steps:[{text:'Ch 10.'}]}],finishing:['Fasten off.']}))};
  const briefs=visualBriefs({bundle,product:{product_id:'020',name:'T',season:'Autumn'}});
  assert.match(heroPrompt(briefs.hero,{bundle}),/APPROVED CROCHET OBJECTS/);
  const bad=structuredClone(briefs.previews[0]);bad.props.push('a crochet flower');
  assert.throws(()=>previewPrompt(bad,{bundle}),/failed the pattern check/);
});
