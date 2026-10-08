// APPROVE PRODUCTION is refused for a package built with an older document
// design (recorded build metadata vs the live adapter); the owner rebuilds
// (free) and approves the new package. OpenAI and Telegram mocked; production
// is the real deterministic package. Generic: shown here with a greeting card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { harness, msg, press, button, lastKeyboard, concept, bookDirection } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { BUILD_RECORD } from '../../production/src/index.mjs';

const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify the front text.'],
    ['card-inside','Inside Message','Exact message: “Wishing you a joyful Christmas”.','Verify the message.'],
    ['card-back','Back','Small motif. No text.','No printed text, logo or website on this panel.']]
    .map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});

async function awaitingApproval(){
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection()}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')))).outcome,'creative_approved');
  const p=await h.store.load('001');
  for(const im of p.proofs.attempts[0].images)await h.store.writeBytes(p,im.file,await artwork(im.page_number));
  h.wf.ai={client:{json:()=>{throw new Error('OpenAI called in Stage 2');},image:()=>{throw new Error('OpenAI called in Stage 2');}}};   // trap
  assert.equal((await h.wf.handleUpdate(msg('/produce 001'))).outcome,'awaiting_production_approval');
  return {h,recordPath:join(h.store.dirOf(p),BUILD_RECORD)};
}
const texts=h=>h.telegram.sent.filter(s=>s.type==='message').map(s=>s.text);

for(const [label,tamper,builtWith] of [
  ['an older design version',a=>({...a,version:a.version-1}),'Standard v1'],
  ['missing design metadata',({format,version})=>({format,version}),'Unknown design']])
  test(`APPROVE PRODUCTION refuses ${label}; nothing changes; 🏭 Rebuild (free) then approval succeeds`,async()=>{
    const {h,recordPath}=await awaitingApproval();
    try{
      const calls=h.calls.length;
      const rec=JSON.parse(await readFile(recordPath,'utf8'));
      assert.deepEqual(rec.adapter,{format:'greeting-card',design:'standard',design_name:'Standard',version:2},'recorded at build time');
      await writeFile(recordPath,JSON.stringify({...rec,adapter:tamper(rec.adapter)},null,2));
      const before=await readFile(recordPath);
      const r=await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')));
      assert.equal(r.outcome,'package_outdated');
      assert.equal(texts(h).at(-1),['❌ Production package is outdated','','This package was built with:',builtWith,'','Current design:','Standard v2','','Rebuild production before approving.'].join('\n'));
      assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['🏭 Rebuild','Back']);
      const p=await h.store.load('001');
      assert.equal(p.status,'AWAITING_PRODUCTION_APPROVAL');assert.equal(p.production.approved_at??null,null);
      assert.ok((await readFile(recordPath)).equals(before),'the package is not modified');
      // Rebuild from the refusal screen: free, records the live design, and can then be approved.
      assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'🏭 Rebuild')))).outcome,'awaiting_production_approval');
      assert.deepEqual(JSON.parse(await readFile(recordPath,'utf8')).adapter,{format:'greeting-card',design:'standard',design_name:'Standard',version:2});
      assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
      assert.equal((await h.store.load('001')).status,'PRODUCTION_APPROVED');
      assert.equal(h.calls.length,calls,'no model call');
    }finally{await h.cleanup();}
  });

test('a package built with the live design is approved as before',async()=>{
  const {h}=await awaitingApproval();
  try{assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');}
  finally{await h.cleanup();}
});
