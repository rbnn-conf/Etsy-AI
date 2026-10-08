// Specification canvas contract (ADR-061): a format's fixed canvas values are
// part of what the model is told, not a choice, and a format-fixed edge is set
// before validation. The validator (canvasProblems) is unchanged. Product #020
// failed with "crochet-pattern-bundle requires safe-margin, got full-bleed".
// Fake OpenAI and Telegram only: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasProblems, specificationSchemaFor, normaliseCanvas, EDGES } from '../src/orchestrator/canvas.mjs';
import { generateSpecification } from '../src/openai/specification.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';
import { loadSchema, strictSchema, validate } from '../src/orchestrator/schema.mjs';
import { PAGE_RULES } from '../src/orchestrator/page-rules.mjs';
import { loadPrompt } from '../src/openai/prompts.mjs';
import { harness, msg, press, button, concept, pressRetry, previewCalls, proofCalls } from './helpers.mjs';

const CROCHET='crochet-pattern-bundle';
const crochetConcept=id=>concept(id,{proposed_name:`Falling Leaves ${id}`,product_type:'Crochet pattern bundle',product_format:CROCHET,page_count:3,orientation:'portrait',
  target_customer:'adult crocheters',deliverable_components:['Pattern cover artwork','Written PDF instructions']});
// What the model returned for #020: a photographic, full-bleed canvas.
const crochetSpec=(edge='full-bleed',background='illustrated')=>({name:'Falling Leaves Crochet Table Set',slug:'falling-leaves-crochet-table-set',season:'Autumn',product_type:'Crochet pattern bundle',
  target_customer:'adult crocheters',page_count:3,canvas:{orientation:'portrait',background,edge,format_notes:'Editorial crochet photography with space for the title.'},
  pages:['cover','pattern-illustration','detail'].map((t,i)=>({page_number:i+1,page_type:t,title:`Page ${i+1}`,concept:'c',instructions:null,
    artwork_description:'crochet leaves on linen',generation_prompt:`page ${i+1} crochet leaves`,production_notes:'Illustration only.'}))});
const canvasOf=s=>s.properties.canvas.properties;
/** A fake client that records the strict schema the model was sent and returns `data`. */
const recordingAi=data=>{const sent=[];return {sent,ai:{textModel:'t',client:{async json({schema}){sent.push(schema);return {data:structuredClone(data),usage:{},model:'t'};}}}};};

test('the model is never offered full-bleed for a crochet pattern bundle (strict schema enum is safe-margin only)',async()=>{
  const {ai,sent}=recordingAi(crochetSpec('safe-margin'));
  await generateSpecification(ai,{requestText:'autumn crochet',concept:crochetConcept('A'),direction:{}});
  assert.deepEqual(canvasOf(sent[0]).edge.enum,['safe-margin']);
  assert.deepEqual(canvasOf(sent[0]).orientation.enum,['portrait'],'orientation is the chosen concept preview\'s');
  assert.deepEqual(canvasOf(sent[0]).background.enum,['white','coloured','illustrated'],'crochet background stays a creative choice');
  // The committed schema (local validation) is unchanged: both edges remain valid JSON, the format rule decides.
  assert.deepEqual(canvasOf(await loadSchema('specification')).edge.enum,[...EDGES]);
});

test('crochet: a full-bleed model output cannot reach validation; the specification resolves to safe-margin',async()=>{
  const {ai}=recordingAi(crochetSpec('full-bleed'));
  const r=await generateSpecification(ai,{requestText:'autumn crochet',concept:crochetConcept('A'),direction:{}});
  assert.equal(r.data.canvas.edge,'safe-margin');
  assert.deepEqual(r.normalized,[{field:'canvas.edge',from:'full-bleed',to:'safe-margin',reason:'crochet-pattern-bundle requires safe-margin'}]);
  assert.equal(r.data.canvas.background,'illustrated','nothing else is changed');
  assert.deepEqual(canvasProblems(CROCHET,r.data.canvas),[]);
});

test('crochet: a valid safe-margin specification passes unchanged (no normalisation recorded)',async()=>{
  const {ai}=recordingAi(crochetSpec('safe-margin','white'));
  const r=await generateSpecification(ai,{requestText:'autumn crochet',concept:crochetConcept('A'),direction:{}});
  assert.equal(r.normalized,undefined);
  assert.deepEqual(r.data,crochetSpec('safe-margin','white'));
});

test('the validator is not weakened: canvasProblems still rejects full-bleed for every safe-margin format',()=>{
  for(const f of [CROCHET,'planner','worksheet-bundle','colouring-book','activity-book'])
    assert.deepEqual(canvasProblems(f,{background:'white',edge:'full-bleed'}),[`$.canvas.edge: ${f} requires safe-margin, got full-bleed`]);
});

test('other formats keep their canvas behaviour: cards and invitations may be full-bleed; colouring books stay white (rejected, never repainted)',async()=>{
  const full=await loadSchema('specification');
  for(const f of ['greeting-card','invitation','single-printable','printable-set','party-kit']){
    assert.deepEqual(canvasOf(specificationSchemaFor(full,f)).edge.enum,['safe-margin','full-bleed'],f);
    const fb={canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'x'}};
    assert.deepEqual(normaliseCanvas(f,fb),{data:fb,changes:[]},`${f}: full-bleed is kept`);
  }
  for(const f of ['colouring-book','activity-book']){
    const c=canvasOf(specificationSchemaFor(full,f));
    assert.deepEqual(c.background.enum,['white'],f);assert.deepEqual(c.edge.enum,['safe-margin'],f);
    // Background is artwork content: a coloured colouring page is still rejected, not silently made white.
    const {data}=normaliseCanvas(f,{canvas:{orientation:'portrait',background:'coloured',edge:'full-bleed',format_notes:'x'}});
    assert.deepEqual(canvasProblems(f,data.canvas),[`$.canvas.background: ${f} requires white, got coloured`]);
  }
  for(const f of ['planner','worksheet-bundle'])assert.deepEqual(canvasOf(specificationSchemaFor(full,f)).edge.enum,['safe-margin'],f);
});

test('every format: the narrowed model schema still accepts everything the format rule accepts (no empty enum, no contract/validator gap)',async()=>{
  const full=await loadSchema('specification');
  for(const f of Object.keys(PAGE_RULES)){
    const c=canvasOf(strictSchema(specificationSchemaFor(full,f,'landscape')));
    for(const k of ['orientation','background','edge'])assert.ok(c[k].enum.length>=1,`${f} ${k}`);
    for(const background of c.background.enum)for(const edge of c.edge.enum)
      assert.deepEqual(canvasProblems(f,{background,edge}),[],`${f}: the model is offered ${background}/${edge}, so the validator must accept it`);
  }
  // A concept orientation unknown to the schema never produces an empty enum; validation decides.
  assert.deepEqual(canvasOf(specificationSchemaFor(full,'greeting-card','diagonal')).orientation.enum,['portrait','landscape','square']);
});

test('the specification prompt states the crochet edge rule',async()=>{
  assert.match(await loadPrompt('product-specification'),/Crochet pattern bundles: safe-margin always/);
});

test('#020 replay: FAILED at specification with the edge error; Retry resumes there, keeps Concept A, reuses concepts/previews/direction, safe-margin',async()=>{
  const failure=new InvalidModelOutputError('specification: model output rejected: $.canvas.edge: crochet-pattern-bundle requires safe-margin, got full-bleed');
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(crochetConcept)}),specification:n=>n===1?failure:crochetSpec('full-bleed')}});
  try{
    await h.wf.handleUpdate(msg('/newproduct autumn crochet table set pattern bundle'));await h.wf.handleUpdate(msg('/go'));
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'A')))).outcome,'failed');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'CONCEPT_SELECTED');assert.equal(p.last_error.step,'specification');
    const selected=structuredClone(p.concepts.selected), batches=structuredClone(p.concepts.batches), direction=structuredClone(p.visual_direction);
    const before=h.calls.length, previews=previewCalls(h.calls).length;
    const r=await pressRetry(h);
    assert.equal(r.outcome,'awaiting_creative_approval');
    const after=h.calls.slice(before);
    p=await h.store.load('001');
    assert.equal(p.canvas.edge,'safe-margin');
    assert.deepEqual(p.concepts.selected,selected,'Concept A is preserved');assert.deepEqual(p.concepts.batches,batches,'no new concept batch');
    assert.deepEqual(p.visual_direction,direction,'the creative direction is reused');
    assert.deepEqual(after.filter(c=>c.kind==='json').map(c=>c.schemaName),['specification'],'Retry makes exactly one text call: the specification');
    assert.equal(previewCalls(h.calls).length,previews,'no concept preview is regenerated');
    assert.equal(proofCalls(after).length,3,'then the 3 creative proofs, as on the normal path after a specification');
    assert.ok(proofCalls(after).every(c=>/Keep a clear margin on every side/.test(c.prompt)&&!/full bleed/i.test(c.prompt)));
  }finally{await h.cleanup();}
});
