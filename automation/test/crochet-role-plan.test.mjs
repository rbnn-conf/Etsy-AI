// ADR-068: crochet collection type + role plan. The planner declares what KIND of collection it is and reserves
// the role slots inside the requested count before writing patterns; the arrangement rules (#016 bouquets) apply
// to arrangements only. No network: fake model, local schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planProblems, PLAN_ROLES, COLLECTION_TYPES } from '../src/orchestrator/crochet.mjs';
import { generatePatternPlan, planCountRule } from '../src/openai/crochet.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { withRolePlan } from './helpers.mjs';

const brief=n=>({pattern_count:n,terminology:'US',guidance:null});
const piece=(id,role,i=0)=>({pattern_id:id,name:id.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),category:'accessory',role,difficulty:i%2?'easy':'beginner',
  approx_size:'about 10 cm',yarn_weight:'4-medium',hook_mm:4,construction:'worked in the round',main_stitches:['sc'],assembly_required:false,artwork:'none',summary:'A piece.'});
const combo=(name,ids)=>({name,patterns:ids.map(pattern_id=>({pattern_id,quantity:1})),notes:[]});
const plan=(patterns,items=[],type=null)=>withRolePlan({theme:'t',audience:['adults','beginners'],style:['s'],patterns,combinations:{title:'Ideas',intro:null,items}},type);
// #024's shape: 3 Halloween costume accessories the model suggests wearing together.
const COSTUME=[piece('witch-hat','focal'),piece('bat-wings','secondary',1),piece('pumpkin-pouch','accent')];
const WEAR=[combo('Little witch outfit',['witch-hat','bat-wings','pumpkin-pouch'])];

test('#024 shape: a coordinated set (costume pieces worn together) passes; it is never forced to contain leaves or stems',()=>{
  assert.deepEqual(planProblems(plan(COSTUME,WEAR,'coordinated-set'),brief(3)),[]);
  assert.deepEqual(planProblems(plan(COSTUME,[],'independent'),brief(3)),[]);
  // The same pieces declared as an ARRANGEMENT are judged as one (what #024 was): every missing role is named.
  const e=planProblems(plan(COSTUME,WEAR,'arrangement'),brief(3));
  assert.ok(e.some(x=>/no foliage or structural pieces/.test(x)));assert.ok(e.some(x=>/no combination joins a focal piece/.test(x)));
  // A plan made before ADR-068 (no collection_type) keeps the old rule exactly: combinations = arrangement.
  const {collection_type,role_plan,...legacy}=plan(COSTUME,WEAR);
  assert.ok(planProblems(legacy,brief(3)).some(x=>/no foliage or structural pieces/.test(x)));
});

test('4. an independent collection may not list combinations; coordinated sets and independents need no focal or foliage',()=>{
  assert.match(planProblems(plan(COSTUME,WEAR,'independent'),brief(3)).join(),/an independent collection lists 1 combination/);
  const noFocal=[piece('bat-wings','secondary'),piece('pumpkin-pouch','accent',1)];
  assert.deepEqual(planProblems(plan(noFocal,[],'independent'),brief(2)),[]);
});

const ARR=[piece('rose','focal'),piece('daisy','secondary',1),piece('bud','filler'),piece('leaf','foliage',1),piece('stem','structural')];
test('1. arrangement with no focal piece -> fail',()=>{
  const p=ARR.map(x=>x.role==='focal'?{...x,role:'secondary'}:x);
  assert.match(planProblems(plan(p,[combo('Posy',['daisy','leaf'])],'arrangement'),brief(5)).join(),/no focal piece/);
});
test('2. arrangement with a focal piece but no foliage or structural pieces -> fail',()=>{
  const p=ARR.map(x=>['foliage','structural'].includes(x.role)?{...x,role:'accent'}:x);
  assert.match(planProblems(plan(p,[combo('Posy',['rose','bud'])],'arrangement'),brief(5)).join(),/no foliage or structural pieces/);
});
test('3. valid focal + filler + foliage/structural + supporting arrangement -> pass',()=>{
  assert.deepEqual(planProblems(plan(ARR,[combo('Posy',['rose','leaf','stem'])],'arrangement'),brief(5)),[]);
});

test('5. the role and collection-type names are EXACTLY the same in the generation schema and the validator',async()=>{
  const s=await loadSchema('crochet-plan');
  assert.deepEqual(s.properties.patterns.items.properties.role.enum,[...PLAN_ROLES]);
  assert.deepEqual(Object.keys(s.properties.role_plan.properties),[...PLAN_ROLES]);assert.deepEqual(s.properties.role_plan.required,[...PLAN_ROLES]);
  assert.deepEqual(s.properties.collection_type.enum,[...COLLECTION_TYPES]);
  // The model decides the type and the slots BEFORE writing patterns (schema order is generation order).
  const keys=Object.keys(s.properties);assert.ok(keys.indexOf('collection_type')<keys.indexOf('patterns')&&keys.indexOf('role_plan')<keys.indexOf('patterns'));
  assert.deepEqual(validate(s,{...plan(COSTUME,WEAR,'coordinated-set'),collection_type:'bouquet'}).length>0,true,'free-form types are rejected');
});

test('6. a #016-style 33-pattern bouquet collection still passes, as an arrangement and as a legacy plan',()=>{
  const roles=['focal','secondary','filler','accent','foliage','structural'];
  const P=Array.from({length:33},(_,i)=>({...piece(`flower-${['a','b','c','d','e','f','g','h','i','j','k'][i%11]}-${Math.floor(i/11)+1}x`,roles[i%6],i),name:`Bloom ${String.fromCharCode(65+i%26)}${i>=26?i:''}`}));
  const items=[combo('Bouquet',[P[0].pattern_id,P[4].pattern_id,P[5].pattern_id])];
  assert.deepEqual(planProblems(plan(P,items,'arrangement'),brief(33)),[]);
  const {collection_type,role_plan,...legacy}=plan(P,items);
  assert.deepEqual(planProblems(legacy,brief(33)),[],'an existing plan without the new fields is judged exactly as before');
});

test('7 + 8. roles are allocated INSIDE the requested count: a role_plan that adds a slot, or roles that differ from it, are rejected',()=>{
  const good=plan(ARR,[combo('Posy',['rose','leaf'])],'arrangement');
  assert.deepEqual(planProblems(good,brief(5)),[]);
  // Adding a sixth pattern just to fill a role exceeds the brief: rejected, never trimmed.
  const extra=plan([...ARR,piece('vine','structural',1)],[combo('Posy',['rose','leaf'])],'arrangement');
  assert.match(planProblems(extra,brief(5)).join(),/6 patterns planned; the owner asked for 5.*role_plan allocates 6 pattern slots; the owner asked for 5/);
  const off={...good,role_plan:{...good.role_plan,foliage:2,secondary:0}};
  assert.match(planProblems(off,brief(5)).join(),/pattern roles do not match role_plan: secondary 1 \(planned 0\), foliage 1 \(planned 2\)/);
  // With fewer than 3 patterns an arrangement is impossible: the model is told, and the validator says why.
  assert.match(planCountRule(2),/collection_type cannot be "arrangement"/);assert.doesNotMatch(planCountRule(5),/cannot be "arrangement"/);
  const two=plan([piece('rose','focal'),piece('leaf','foliage',1)],[combo('Posy',['rose','leaf'])],'arrangement');
  assert.match(planProblems(two,brief(2)).join(),/an arrangement needs at least 3 patterns/);
});

test('a rejected plan reports EVERY problem (no truncation) and carries the plan for diagnosis; one call, no retry loop',async()=>{
  const calls=[], bad=plan(COSTUME,WEAR,'arrangement');
  const ai={textModel:'fake',client:{async json(req){calls.push(req);return {data:structuredClone(bad),usage:{total_tokens:1},model:'fake'};}}};
  const err=await generatePatternPlan(ai,{product:{request:{text:'3 easy Halloween crochet designs'},name:'Little Halloween Costume Accessories'},concept:null,brief:brief(3),direction:null}).catch(e=>e);
  assert.equal(calls.length,1);assert.equal(err.name,'InvalidModelOutputError');
  assert.deepEqual(err.draft.problems,planProblems(bad,brief(3)));
  for(const x of err.draft.problems)assert.ok(err.message.includes(x),x);
  assert.match(calls[0].user,/ROLE PLAN \(hard rule\): decide collection_type first/);
});
