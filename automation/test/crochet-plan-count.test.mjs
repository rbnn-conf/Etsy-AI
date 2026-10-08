// The crochet plan's exact pattern count (ADR-045): the model is told EXACTLY N
// (prompt and per-brief schema); exact-count validation stays the authority;
// the only repair drops EXACT duplicates when that leaves exactly N. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePatternPlan, planCountRule, planSchemaFor, dropExactDuplicatePatterns } from '../src/openai/crochet.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';
import { loadSchema } from '../src/orchestrator/schema.mjs';
import { knownFailure, knownFailureText } from '../src/telegram/ui.mjs';
import { withRolePlan } from './helpers.mjs';
import { failureScreen, productScreen } from '../src/telegram/menu.mjs';

const ROLES=['focal','filler','foliage','secondary','accent','structural'];
const entry=i=>({pattern_id:`bloom-${i+1}`,name:`Bloom ${i+1}`,category:'flower',role:ROLES[i%ROLES.length],difficulty:i%2?'easy':'beginner',
  approx_size:'about 6 cm',yarn_weight:'3-light',hook_mm:3,construction:'worked in the round',main_stitches:['sc','sl st'],assembly_required:false,artwork:'none',summary:`Bloom number ${i+1}.`});
const planOf=patterns=>withRolePlan({theme:'crochet flowers',audience:['adults','beginners'],style:['botanical'],patterns,
  combinations:{title:'Bouquet ideas',intro:null,items:[{name:'Posy',patterns:[{pattern_id:'bloom-1',quantity:3},{pattern_id:'bloom-3',quantity:2}],notes:['Tie the stems.']}]}});
const plan=n=>planOf(Array.from({length:n},(_,i)=>entry(i)));
const product={request:{text:'crochet flower bouquet pattern bundle: 33 crochet flower & bouquet patterns, US terms'},name:'Moonlit Meadow',product_type:'crochet pattern bundle',target_customer:'adults',season:'all'};
const brief=n=>({pattern_count:n,terminology:'US',guidance:null});
function fakeAi(data){
  const calls=[];
  return {calls,ai:{textModel:'fake',client:{async json(req){calls.push(req);return {data:structuredClone(data),usage:{total_tokens:1},model:'fake'};}}}};
}
const run=(data,n)=>{const f=fakeAi(data);return {f,p:generatePatternPlan(f.ai,{product,concept:null,brief:brief(n),direction:null})};};

test('requested 33, model returns exactly 33: accepted, 33 items, nothing normalised',async()=>{
  const {p}=run(plan(33),33), r=await p;
  assert.equal(r.data.patterns.length,33);assert.equal(r.normalized,undefined);
  assert.deepEqual(r.data,plan(33));
});

test('requested 33, model returns 34 unique patterns: rejected (never truncated)',async()=>{
  await assert.rejects(run(plan(34),33).p,e=>e instanceof InvalidModelOutputError&&/34 patterns planned; the owner asked for 33/.test(e.message));
  // The repair never touches a unique extra item.
  assert.deepEqual(dropExactDuplicatePatterns(plan(34),33),{data:plan(34),changes:[]});
});

test('requested 33, model returns 32: rejected (nothing is invented)',async()=>{
  await assert.rejects(run(plan(32),33).p,/32 patterns planned; the owner asked for 33/);
  assert.deepEqual(dropExactDuplicatePatterns(plan(32),33).changes,[]);
});

test('requested 33, model returns 34 with one EXACT duplicate: the copy is dropped, exactly 33 remain, order kept',async()=>{
  const P=plan(33).patterns, withDup=planOf([...P.slice(0,10),structuredClone(P[4]),...P.slice(10)]);
  // Key order does not matter for "exact".
  withDup.patterns[10]=Object.fromEntries(Object.entries(withDup.patterns[10]).reverse());
  const {p}=run(withDup,33), r=await p;
  assert.equal(r.data.patterns.length,33);
  assert.deepEqual(r.data.patterns,P,'the 33 originals, in their original order');
  assert.deepEqual(r.normalized,[{field:'patterns',from:34,to:33,removed:[{index:10,pattern_id:'bloom-5'}]}]);
});

test('unsafe cases are left for validation: a near-duplicate (same id, different content), or a duplicate that does not reach N',async()=>{
  const P=plan(33).patterns;
  const near=planOf([...P,{...P[4],summary:'A slightly different bloom.'}]);
  assert.deepEqual(dropExactDuplicatePatterns(near,33).changes,[]);
  await assert.rejects(run(near,33).p,/34 patterns planned; the owner asked for 33/);
  const twoExtra=planOf([...P,structuredClone(P[1]),entry(40)]);
  assert.deepEqual(dropExactDuplicatePatterns(twoExtra,33).changes,[],'35 with one duplicate would leave 34: nothing removed');
  await assert.rejects(run(twoExtra,33).p,/35 patterns planned; the owner asked for 33/);
});

test('the requested count is dynamic: 12 and 4 work, and the model is told that exact number',async()=>{
  for(const n of [12,4,33]){
    const {f,p}=run(plan(n),n), r=await p;
    assert.equal(r.data.patterns.length,n);
    const req=f.calls[0], blocks=req.user.split('\n\n');
    assert.equal(blocks.at(-1),planCountRule(n),'the count rule is the last block, next to the array the model writes');
    assert.match(req.user,new RegExp(`Generate EXACTLY ${n} patterns\\.\\nThe \`patterns\` array length MUST equal ${n}\\.`));
    assert.match(req.user,/Do not add a bonus pattern, alternate, extra motif, appendix pattern, variation or duplicate/);
    assert.match(req.user,new RegExp(`count the \`patterns\` items and make sure the total is exactly ${n}`));
    const d=req.schema.properties.patterns.description;
    assert.match(d,new RegExp(`^EXACTLY ${n} patterns: the array length MUST equal ${n}\\.`));
    assert.match(d,new RegExp(`Exactly ${n} items?\\.$`));
    assert.doesNotMatch(d,/Maximum 60/,'no conflicting count reaches the model');
    assert.match(req.system,/The array\s+length MUST equal N: not N \+ 1, not N - 1/);
  }
});

test('local validation still uses the committed schema; the per-brief schema changes only what the model is told',async()=>{
  const s=await loadSchema('crochet-plan');
  assert.equal(s.properties.patterns.minItems,1);assert.equal(s.properties.patterns.maxItems,60);
  const m=planSchemaFor(s,33);
  assert.equal(m.properties.patterns.minItems,33);assert.equal(m.properties.patterns.maxItems,33);
  assert.equal(s.properties.patterns.maxItems,60,'the committed schema object is not mutated');
});

test('Telegram: a plan-count failure is shown in plain words; the exception is not',()=>{
  const p={product_id:'016',status:'FAILED',resume_state:'CREATIVE_APPROVED',name:'Moonlit Meadow',request:{text:'x'},review:{nonce:'abc123def'},
    last_error:{step:'patterns',message:'InvalidModelOutputError: crochet plan: model output rejected: 34 patterns planned; the owner asked for 33',at:'2026-10-02T09:13:24.197Z',retryable:true}};
  assert.equal(knownFailureText(p),'❌ Product #016 failed at Pattern Plan\nPlanned 34 patterns, but 33 were requested.\nCompleted files were kept.\n\nRetry will call OpenAI.');
  for(const t of [failureScreen(p).text,productScreen(p).text])assert.doesNotMatch(t,/InvalidModelOutputError|model output rejected/);
  assert.match(productScreen(p).text,/Failed at Pattern Plan: Planned 34 patterns, but 33 were requested\./);
  // Other failures keep the generic text.
  assert.equal(knownFailure({...p,last_error:{...p.last_error,message:'OpenAI /responses failed (HTTP 500)'}}),null);
  assert.equal(knownFailureText({...p,last_error:{...p.last_error,message:'OpenAI /responses failed (HTTP 500)'}}),null);
});
