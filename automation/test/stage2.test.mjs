// Stage 2 through the Telegram workflow: /produce -> handoff -> build -> QC ->
// review -> APPROVE PRODUCTION / REBUILD / CANCEL. OpenAI and Telegram mocked;
// production itself is the real deterministic package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { transition } from '../src/orchestrator/state.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { harness, msg, press, button, lastKeyboard, concept, bookDirection, pressRetry } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { sharp } from '../../production/src/lib.mjs';

const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify the front text.'],
    ['card-inside','Inside Message','Exact message: “Wishing you a joyful Christmas”.','Verify the message.'],
    ['card-back','Back','Small motif. No text.','No printed text, logo or website on this panel.']]
    .map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});

/** A CREATIVE_APPROVED greeting card via the real Stage 1 flow, with realistic 2:3 proof images. */
async function approved({blank=false}={}){
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection()}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  const p=await h.store.load('001');
  for(const im of p.proofs.attempts[0].images)
    await h.store.writeBytes(p,im.file,blank?await sharp({create:{width:512,height:768,channels:3,background:'#ffffff'}}).png().toBuffer():await artwork(im.page_number));
  return {h,p,ws:h.store.dirOf(p)};
}
const texts=h=>h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text);
const snapshot=async ws=>{const out={};const walk=async(d,rel='')=>{for(const e of await readdir(d,{withFileTypes:true})){if(e.name==='production')continue;const r=rel?`${rel}/${e.name}`:e.name;
  if(e.isDirectory())await walk(join(d,e.name),r);else if(r!=='product.json')out[r]=(await readFile(join(d,e.name))).toString('base64').slice(0,64)+(await readFile(join(d,e.name))).length;}};await walk(ws);return out;};

test('13 + 14: /produce builds, QCs, then (only then) sends the review; zero OpenAI calls',async()=>{
  const {h,ws}=await approved();
  try{
    const before=h.calls.length;
    h.wf.ai={client:{json:()=>{throw new Error('OpenAI called in Stage 2');},image:()=>{throw new Error('OpenAI called in Stage 2');}}};   // trap
    const r=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(r.outcome,'awaiting_production_approval');
    assert.equal(h.calls.length,before,'no model call at all');
    const p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_PRODUCTION_APPROVAL');
    assert.deepEqual(p.status_history.slice(-4).map(s=>s.to),['PRODUCTION_READY','PRODUCTION_BUILDING','PRODUCTION_QC','AWAITING_PRODUCTION_APPROVAL']);
    assert.equal(p.production.qc.passed,true);assert.equal(p.production.adapter.format,'greeting-card');
    const review=texts(h).find(t=>t.startsWith('📦 PRODUCT #001 — PRODUCTION READY'));
    assert.ok(review,'review sent');
    for(const line of ['Robin at the Frosted Gate','✓ A4 folded card (2 pages)','✓ US Letter folded card (2 pages)','✓ Card panels 4 x 6 in (3 pages)',
      '✓ Original card artwork (unchanged) (3 PNG)','✓ Printing guide','✓ PDFs valid · ✓ Pages complete · ✓ Artwork verified · ✓ Package verified'])assert.ok(review.includes(line),line);
    assert.match(review,/✓ ZIP package \(\d+\.\d MB\)/);assert.match(review,/Print resolution: A4 \d+ ppi/);assert.match(review,/Please check:\n- Page 1 \(front, proof-01\): check the baked-in text reads exactly "Merry Christmas"\./);
    const photos=h.telegram.sent.filter(s=>s.type==='photo');
    assert.deepEqual(photos.slice(-2).map(s=>s.caption),['#001 · Outside (print first)','#001 · Inside (print on the back)']);
    assert.ok(!h.telegram.sent.some(s=>/\.pdf$/i.test(s.fileName??'')),'no PDFs sent to Telegram');
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['APPROVE PRODUCTION','REBUILD','CANCEL','❓ What can I do here?','🏠 Home']);
    assert.ok((await readdir(join(ws,'production','package'))).includes('LumiumX-Robin-at-the-Frosted-Gate.zip'));
  }finally{await h.cleanup();}
});

test('2: /produce refuses a product that is not creatively approved; nothing is written',async()=>{
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
    await h.wf.handleUpdate(press(button(h.telegram,'A')));   // now AWAITING_CREATIVE_APPROVAL
    const r=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(r.outcome,'not_approved');
    assert.match(texts(h).at(-1),/Stage 2 needs a creatively approved product\. #001 is AWAITING_CREATIVE_APPROVAL/);
    const p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_CREATIVE_APPROVAL');assert.ok(!('production' in p));
    assert.ok(!(await readdir(h.store.dirOf(p))).includes('production'));
    assert.equal((await h.wf.handleUpdate(msg('/produce 999'))).outcome,'usage');
  }finally{await h.cleanup();}
});

test('12: a QC failure blocks the review and approval; Stage 1 files are untouched',async()=>{
  const {h,ws}=await approved({blank:true});   // blank artwork: QC "no blank pages" must fail
  try{
    const stage1=await snapshot(ws);
    const r=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'production');
    const p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'PRODUCTION_READY');assert.equal(p.production.qc.passed,false);
    assert.match(p.last_error.message,/^ProductionQcError: production QC failed: .*no blank pages: A4\//);
    assert.match(p.last_error.message,/no duplicate outputs: identical files: Card-Artwork\//,'three identical blank originals are also caught');
    assert.ok(!texts(h).some(t=>t.includes('PRODUCTION READY')),'no review after a QC failure');
    assert.ok(!lastKeyboard(h.telegram).some(b=>b.text==='APPROVE PRODUCTION'));
    assert.equal((await h.wf.handleUpdate(press(encode('papprove','001',p.review.nonce)))).outcome,'invalid_state','cannot approve');
    assert.deepEqual(await snapshot(ws),stage1,'references, creative, previews and proofs unchanged');
    // The failure message offers a free, direct retry (deterministic step) and details; no cancel there.
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['🔄 Retry Safe Step','📋 Details','📦 Product','🏠 Home']);
    // Cancel (the product screen's confirmed action, same a1 operation) returns to CREATIVE_APPROVED; nothing is deleted.
    assert.equal((await h.wf.handleUpdate(press(encode('pcancel','001',(await h.store.load('001')).review.nonce)))).outcome,'production_cancelled');
    assert.equal((await h.store.load('001')).status,'CREATIVE_APPROVED');
    assert.deepEqual(await snapshot(ws),stage1);
  }finally{await h.cleanup();}
});

test('15: a crash mid-build resumes with RETRY and rebuilds only what is missing; recovery itself does nothing',async()=>{
  const {h,ws}=await approved();
  try{
    await h.wf.handleUpdate(msg('/produce 001'));
    // Simulate a crash during a rebuild: state PRODUCTION_BUILDING, lock held, one deliverable lost.
    let p=await h.store.load('001');
    p=transition(transition(p,'production_rebuild'),'production_started');
    await h.store.save({...p,lock:{op:'production',id:'x',at:new Date().toISOString()}});
    await rm(join(ws,'production','deliverables','LumiumX-Robin-at-the-Frosted-Gate','US-Letter'),{recursive:true});
    assert.deepEqual(await h.wf.recover(),['001']);
    p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'PRODUCTION_READY');assert.equal(p.last_error.step,'production');assert.equal(p.lock,null);
    assert.equal((await pressRetry(h)).outcome,'awaiting_production_approval');
    assert.ok(h.logs.some(l=>/#001 production build: 1 written, 7 already complete\./.test(l)),h.logs.filter(l=>/production build/.test(l)).join(' | '));
  }finally{await h.cleanup();}
});

test('buttons: REBUILD gives identical files; CANCEL keeps creative approval; APPROVE PRODUCTION is final and not repeatable',async()=>{
  const {h,ws}=await approved();
  try{
    await h.wf.handleUpdate(msg('/produce 001'));
    const zip=join(ws,'production','package','LumiumX-Robin-at-the-Frosted-Gate.zip'), first=await readFile(zip);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'REBUILD')))).outcome,'awaiting_production_approval');
    assert.ok(h.logs.some(l=>/production build: 8 written, 0 already complete/.test(l)),'REBUILD rebuilds everything');
    assert.ok(first.equals(await readFile(zip)),'deterministic: identical ZIP');
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'CANCEL')))).outcome,'production_cancelled');
    assert.equal((await h.store.load('001')).status,'CREATIVE_APPROVED');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.ok(h.logs.some(l=>/production handoff reused/.test(l)),'immutable handoff reused');
    const approve=button(h.telegram,'APPROVE PRODUCTION');
    assert.equal((await h.wf.handleUpdate(press(approve))).outcome,'production_approved');
    const p=await h.store.load('001');
    assert.equal(p.status,'PRODUCTION_APPROVED');assert.ok(p.production.approved_at);
    assert.match(texts(h).at(-1),/Stage 3 \(listing, marketing, Etsy\) has not started/);
    assert.equal((await h.wf.handleUpdate(press(approve))).outcome,'stale');
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'nothing_to_do');
    assert.throws(()=>transition(p,'rejected'),/Cannot apply/,'terminal');
  }finally{await h.cleanup();}
});

test('two card designs from an owner production plan: review names both designs and the shared inside; previews A, B, inside; zero OpenAI calls',async()=>{
  const {h,ws}=await approved();
  try{
    await writeFile(join(ws,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'001',decided_by:'owner',reason:'second front',card_variants:[
      {id:'A',name:'Merry Christmas',front_source:'proof-01',inside_source:'proof-02',back_type:'minimal'},
      {id:'B',name:'Christmas Wishes',front_source:'proof-03',inside_source:'proof-02',back_type:'minimal'}]}));
    const before=h.calls.length;
    h.wf.ai={client:{json:()=>{throw new Error('OpenAI called');},image:()=>{throw new Error('OpenAI called');}}};
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.equal(h.calls.length,before);
    const review=texts(h).find(t=>t.startsWith('📦 PRODUCT #001 — PRODUCTION READY'));
    assert.match(review,/Robin at the Frosted Gate\n\nIncludes 2 printable card designs:\nA — Merry Christmas\nB — Christmas Wishes\n\nShared inside:\n“Wishing you a joyful Christmas”\n\nCustomer files:/);
    assert.ok(review.includes('✓ A4 folded cards (2 designs, 2 pages each)'));assert.ok(review.includes('✓ US Letter folded cards (2 designs, 2 pages each)'));
    assert.ok(review.includes('✓ Original card artwork (unchanged) (3 PNG)'));
    assert.match(review,/Page 3 \(proof-03\) is specified as the back but is used as the front of B — Christmas Wishes/);
    assert.deepEqual(h.telegram.sent.filter(s=>s.type==='photo').slice(-3).map(s=>s.caption),
      ['#001 · A — Merry Christmas: outside','#001 · B — Christmas Wishes: outside','#001 · Inside — shared by A and B']);
    assert.ok(!h.telegram.sent.some(s=>/\.pdf$/i.test(s.fileName??'')),'PNG previews only');
    const deliverables=join(ws,'production','deliverables','LumiumX-Robin-at-the-Frosted-Gate');
    assert.deepEqual((await readdir(join(deliverables,'A4'))).sort(),['LumiumX-Robin-at-the-Frosted-Gate-Christmas-Wishes-A4.pdf','LumiumX-Robin-at-the-Frosted-Gate-Merry-Christmas-A4.pdf']);
  }finally{await h.cleanup();}
});

test('/produce on a product awaiting production approval re-sends the review without rebuilding',async()=>{
  const {h}=await approved();
  try{
    await h.wf.handleUpdate(msg('/produce 001'));
    const n=h.logs.filter(l=>/production build:/.test(l)).length;
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    assert.equal(h.logs.filter(l=>/production build:/.test(l)).length,n,'no rebuild');
    assert.equal(texts(h).filter(t=>t.includes('PRODUCTION READY')).length,2);
  }finally{await h.cleanup();}
});
