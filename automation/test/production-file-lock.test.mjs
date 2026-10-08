// Stage 2 file safety through the Telegram workflow: the per-product build lock,
// abandoned temp cleanup, and the plain message for a Windows file lock.
// OpenAI and Telegram mocked; production is the real deterministic package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, access, mkdir, utimes, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { harness, msg, press, button, lastKeyboard, concept, bookDirection, pressRetry } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { BUILD_LOCK, STALE_BUILD_LOCK_MS } from '../../production/src/index.mjs';
import { knownFailureText, retrySafety } from '../src/telegram/ui.mjs';
import { failureScreen } from '../src/telegram/menu.mjs';

const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify the front text.'],
    ['card-inside','Inside Message','Exact message: “Wishing you a joyful Christmas”.','Verify the message.'],
    ['card-back','Back','Small motif. No text.','No printed text, logo or website on this panel.']]
    .map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});
async function approved(){
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection()}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  const p=await h.store.load('001');
  for(const im of p.proofs.attempts[0].images)await h.store.writeBytes(p,im.file,await artwork(im.page_number));
  h.wf.ai={client:{json:()=>{throw new Error('OpenAI called in Stage 2');},image:()=>{throw new Error('OpenAI called in Stage 2');}}};   // trap
  return {h,ws:h.store.dirOf(p)};
}
const exists=p=>access(p).then(()=>true,()=>false);
const texts=h=>h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text);

test('a build is refused while another live process holds the product build lock; the lock is untouched; Retry after it ends is free and completes',async()=>{
  const {h,ws}=await approved();
  try{
    const lockPath=join(ws,BUILD_LOCK), holder={pid:process.ppid,host:hostname(),id:'other-bot',at:new Date().toISOString()};
    await mkdir(join(ws,'production'),{recursive:true});await writeFile(lockPath,JSON.stringify(holder));
    const before=h.calls.length;
    const r=await h.wf.handleUpdate(msg('/produce 001'));
    assert.equal(r.outcome,'failed');
    const p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.lock,null);assert.equal(p.last_error.step,'production');assert.equal(p.last_error.retryable,true);
    assert.match(p.last_error.message,/Production is already running for this product/);
    assert.deepEqual(await readdir(join(ws,'production')),['.build.lock'],'nothing written: not even the handoff');
    assert.deepEqual(JSON.parse(await readFile(lockPath,'utf8')),holder,'the active lock is never removed');
    assert.equal(texts(h).at(-1),'⚠️ Product #001 build already running\nAnother bot process is building this product right now.\n\nWait for it to finish, then Retry (free).');
    // The other build ends (its lock released): Retry is offered, free, and finishes the build.
    await rm(lockPath);
    assert.equal((await pressRetry(h)).outcome,'awaiting_production_approval');
    assert.equal(h.calls.length,before,'zero OpenAI calls');
    assert.ok(!await exists(lockPath),'released after the build');
  }finally{await h.cleanup();}
});

test('the build recovers an expired lock and removes abandoned temp files, keeping every real file',async()=>{
  const {h,ws}=await approved();
  try{
    const prod=join(ws,'production'), old=new Date(Date.now()-11*60*1000);
    await mkdir(prod,{recursive:true});
    await writeFile(join(ws,BUILD_LOCK),JSON.stringify({pid:process.ppid,host:hostname(),id:'old',at:new Date(Date.now()-STALE_BUILD_LOCK_MS-60000).toISOString()}));
    await writeFile(join(prod,'build-record.json.tmp-18060'),'{"partial":');await utimes(join(prod,'build-record.json.tmp-18060'),old,old);
    assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
    const names=await readdir(prod);
    assert.ok(!names.some(n=>/\.tmp-/.test(n)),'abandoned temp removed');
    assert.ok(!names.includes('.build.lock'),'lock released');
    assert.ok(names.includes('build-record.json')&&names.includes('handoff.json')&&names.includes('qc-report.json'));
    JSON.parse(await readFile(join(prod,'build-record.json'),'utf8'));
  }finally{await h.cleanup();}
});

test('Telegram: a Windows file lock on a production file is plain, path-free, and Retry stays free',()=>{
  const raw="EPERM: operation not permitted, rename 'C:\\Users\\x\\products\\016-crochet\\production\\build-record.json.tmp-18060' -> 'C:\\Users\\x\\products\\016-crochet\\production\\build-record.json'";
  for(const message of [raw,raw.replace('EPERM','EBUSY'),raw.replace('EPERM','EACCES')]){
    const p={product_id:'016',status:'FAILED',resume_state:'PRODUCTION_READY',review:{nonce:'abcdef123456',keyboard_message_ids:[]},lock:null,last_error:{step:'production',message,at:'2026-10-05T18:05:07.547Z',retryable:true}};
    assert.equal(knownFailureText(p),'⚠️ Product #016 build paused\nWindows temporarily locked a production file.\n\nNo work was lost.\nRetry is free.');
    assert.deepEqual(retrySafety(p),{safe:true,paid:false,reason:'Free: completed work is kept and skipped.'});
    const screen=failureScreen(p);
    assert.doesNotMatch(screen.text,/C:\\|EPERM|EBUSY|EACCES|tmp-/,'no raw path or code shown');
    assert.ok(screen.keyboard.inline_keyboard.flat().some(b=>b.text==='🔄 Retry Safe Step'),'free retry offered');
  }
  // Other production failures are unaffected.
  assert.equal(knownFailureText({product_id:'016',last_error:{step:'production',message:'ENOENT: no such file or directory, open x'}}),null);
});
