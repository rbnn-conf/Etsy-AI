// Every length-bounded field of the crochet pattern schema (ADR-048): just under, exactly at and over its
// limit, through generatePattern with a fake client (zero cost). Limits are read from the schema itself.
// Safe fields are repaired losslessly; semantic fields are rejected; valid output is unchanged; validation decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePattern, normalizePatternDraft, patternLimitsBlock, patternSchemaFor } from '../src/openai/crochet.mjs';
import { loadSchema, fieldLimits, strictSchema } from '../src/orchestrator/schema.mjs';
import { sameWords } from '../src/orchestrator/bounded-text.mjs';
import { canonicalMeaning, SPECIAL_STITCH_MEANING } from '../src/orchestrator/crochet-terms.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';

const schema=await loadSchema('crochet-pattern');
const base=()=>({category:'flower',difficulty:'beginner',finished_size:'About 6 cm across',yarn:[{description:'Cotton yarn, petal colour',colour:'blush',amount:'About 8 m'}],
  yarn_weight:'3-light',requires_hook:true,hook_size:{mm:4,us:'G-6'},additional_materials:['Tapestry needle'],stitches_used:['ch','sc'],
  abbreviations:[{abbr:'ch',meaning:'chain'},{abbr:'sc',meaning:'single crochet'},{abbr:'st',meaning:'stitch'}],gauge:'Not critical for this pattern.',
  instructions:[{heading:'Flower',steps:[{label:'Rnd 1',text:'Make a magic ring, 6 sc into the ring.',stitch_count:6}]}],assembly:['Sew the leaf to the stem.'],
  finishing:['Fasten off and weave in all ends.'],notes:['Use a stitch marker.']});
const entry={pattern_id:'rose',name:'Rose',category:'flower',role:'focal',difficulty:'beginner',summary:'A rose.',approx_size:'about 6 cm',yarn_weight:'3-light',hook_mm:4,
  construction:'in the round',main_stitches:['sc'],assembly_required:false};
const plan={theme:'flowers',audience:['adults'],patterns:[entry]}, brief={pattern_count:1,terminology:'US'};
const fakeAi=data=>{const calls=[];return {calls,ai:{textModel:'fake',client:{async json(req){calls.push(req);return {data:structuredClone(data),usage:{total_tokens:1},model:'fake'};}}}};};
const run=d=>generatePattern(fakeAi(d).ai,{entry,plan,brief});

// Whole words only, exactly n characters (no word longer than 9 characters, so nothing can be "cut").
function words(n){
  const out=[];let len=0,i=0;
  while(n-len>10){const w='abcdefghi'.slice(0,3+(i++%6));out.push(w);len+=w.length+1;}
  out.push('x'.repeat(n-len));return out.join(' ');
}
// Set the field at a schema path ("instructions[].steps[].text") on the first array element.
function setAt(d,path,v){
  const keys=path.replace(/\[\]/g,'.0').split('.');let o=d;
  for(const k of keys.slice(0,-1))o=o[k];
  o[keys.at(-1)]=v;return d;
}
const getAt=(d,path)=>path.replace(/\[\]/g,'.0').split('.').reduce((o,k)=>o?.[k],d);

// Classification of an OVER-limit value (ADR-048).
const REPAIRED={finishing:'split','assembly[]':'split','finishing[]':'split','notes[]':'split',category:'planned category','abbreviations[].meaning':'moved to notes',
  'instructions[].heading':'positional "Section N"','instructions[].steps[].label':'positional "Step N"'};
const LENGTHS=fieldLimits(schema).filter(l=>l.kind==='length');

test('the matrix covers every length-bounded field in the committed schema (17 fields)',()=>{
  assert.deepEqual(LENGTHS.map(l=>l.path),['category','finished_size','yarn[].description','yarn[].colour','yarn[].amount','hook_size.us','additional_materials[]',
    'stitches_used[]','abbreviations[].abbr','abbreviations[].meaning','gauge','instructions[].heading','instructions[].steps[].label','instructions[].steps[].text',
    'assembly[]','finishing[]','notes[]']);
});

for(const {path,max} of LENGTHS){
  test(`${path} (max ${max}): under and exactly at the limit pass unchanged; over is ${REPAIRED[path]?`repaired (${REPAIRED[path]}), losslessly`:'rejected (never rewritten)'}`,async()=>{
    for(const n of [max-1,max]){
      const d=setAt(base(),path,words(n));
      const r=await run(d);
      assert.deepEqual(r.data,d,`${path} at ${n} characters is unchanged`);assert.equal(r.normalized,undefined);
    }
    const over=words(max+1), d=setAt(base(),path,over);
    if(!REPAIRED[path]){
      await assert.rejects(run(d),e=>e instanceof InvalidModelOutputError&&new RegExp(`\\.${path.split('.').at(-1).replace(/\[\]/g,'')}(\\[0\\])?: longer than ${max}`).test(e.message));
      return;
    }
    const r=await run(d);
    if(REPAIRED[path]==='split'){
      const field=path.replace('[]',''), items=r.data[field];
      assert.ok(items.every(x=>x.length<=max));assert.ok(sameWords(items,[over]),'every word kept, in order');
    }else if(path==='instructions[].heading'){
      assert.equal(r.data.instructions[0].heading,'Section 1');assert.deepEqual(r.data.instructions[0].steps,d.instructions[0].steps);
    }else if(path==='instructions[].steps[].label'){
      assert.equal(r.data.instructions[0].steps[0].label,'Step 1');assert.equal(r.data.instructions[0].steps[0].text,d.instructions[0].steps[0].text);
    }else if(path==='category'){
      assert.equal(r.data.category,entry.category);
    }else{
      assert.equal(r.data.abbreviations[0].meaning,'chain');
      assert.equal(r.data.notes.at(-1),`ch: ${over}`,'the full wording is kept verbatim in notes');
    }
    // Every other field untouched.
    const rest=o=>{const c=structuredClone(o);for(const k of ['finishing','assembly','notes','category','abbreviations','instructions'])delete c[k];return c;};
    assert.deepEqual(rest(r.data),rest(d));
  });
}

test('abbreviation meanings: concise passes unchanged; exactly 80 passes; a verbose STANDARD meaning keeps its fixed meaning, the wording moves to notes verbatim',async()=>{
  assert.deepEqual((await run(base())).data.abbreviations,base().abbreviations);
  const verbose='Insert the hook into the next stitch, yarn over, pull up a loop, then yarn over again and pull through both loops to complete the stitch.';
  const d=base();d.abbreviations[1].meaning=verbose;
  const r=await run(d);
  assert.equal(r.data.abbreviations[1].meaning,'single crochet');
  assert.deepEqual(r.data.notes,['Use a stitch marker.',`sc: ${verbose}`]);
  assert.ok(r.data.notes.join(' ').includes(verbose),'never truncated: every word kept, in order');
  assert.deepEqual(r.normalized[0],{field:'abbreviations[1].meaning',length:verbose.length,to:'standard meaning',moved_to_notes:1});
});

test('a verbose SPECIAL-stitch meaning (pattern-defined) is never canonicalised: the table points to Notes, the method is kept whole',async()=>{
  const method='(Yarn over, insert the hook into the same stitch and pull up a loop) four times, yarn over and pull through all nine loops on the hook, then ch 1 to close.';
  const d=base();d.abbreviations.push({abbr:'puff',meaning:method});
  const r=await run(d);
  assert.equal(r.data.abbreviations[3].meaning,SPECIAL_STITCH_MEANING);
  assert.equal(r.data.notes.at(-1),`puff: ${method}`);
  // inc / dec have a fixed MEANING (increase / decrease, ADR-050); puff, bobble and clusters do not.
  assert.equal(canonicalMeaning('inc','US'),'increase');assert.equal(canonicalMeaning('dec','UK'),'decrease');
  assert.equal(canonicalMeaning('puff','US'),null);assert.equal(canonicalMeaning('bobble','UK'),null);
  // Terminology decides the standard meaning: US sc vs UK dc.
  assert.equal(canonicalMeaning('sc','US'),'single crochet');assert.equal(canonicalMeaning('sc','UK'),null);assert.equal(canonicalMeaning('htr','UK'),'half treble crochet');
});

test('no room in notes (5 items): the over-long meaning is left as it is and rejected, never truncated',async()=>{
  const d=base();d.notes=['a.','b.','c.','d.','e.'];d.abbreviations[1].meaning=words(81);
  await assert.rejects(run(d),/abbreviations\[1\]\.meaning: longer than 80/);
  const n=normalizePatternDraft(d,schema,{entry,terminology:'US'});
  assert.equal(n.data.abbreviations[1].meaning,d.abbreviations[1].meaning);assert.deepEqual(n.data.notes,d.notes);
});

test('stitches_used: a written-out stitch that is one of the pattern\'s own abbreviation meanings becomes that abbreviation; anything else is rejected',async()=>{
  const d=base();d.abbreviations.push({abbr:'FPdc',meaning:'front post double crochet'});d.stitches_used.push('front post double crochet');
  const r=await run(d);
  assert.deepEqual(r.data.stitches_used,['ch','sc','FPdc']);
  const u=base();u.stitches_used.push('long unknown stitch');
  await assert.rejects(run(u),/stitches_used\[2\]: longer than 12/);
});

test('hook_size.us: one unambiguous US code is kept; an ambiguous or code-less value is rejected',async()=>{
  const d=base();d.hook_size.us='US G-6 (4 mm)';
  assert.equal((await run(d)).data.hook_size.us,'G-6');
  const two=base();two.hook_size.us='E-4 or F-5 hook';
  await assert.rejects(run(two),/hook_size\.us: longer than 10/);
  const none=base();none.hook_size.us='a 4 mm hook here';
  await assert.rejects(run(none),/hook_size\.us: longer than 10/,'"a 4" is never read as a hook code');
});

test('the request states every limit from the schema; the model schema fixes the planned difficulty; committed limits are unchanged',async()=>{
  const f=fakeAi(base());await generatePattern(f.ai,{entry,plan,brief});
  const user=f.calls[0].user, block=patternLimitsBlock(schema);
  assert.ok(user.endsWith(block),'the limits are the last block of the request');
  for(const l of fieldLimits(schema))assert.ok(block.includes(`- ${l.path}: `)&&block.includes(String(l.max)),l.path);
  assert.match(block,/- abbreviations\[\]\.meaning: at most 80 characters each/);assert.match(block,/- instructions\[\]\.steps\[\]\.text: at most 600 characters each/);
  // Strict mode enforces enums: the model cannot return another difficulty (a former paid failure).
  assert.deepEqual(f.calls[0].schema.properties.difficulty.enum,['beginner']);
  assert.deepEqual(strictSchema(patternSchemaFor(schema,{difficulty:'easy'})).properties.difficulty.enum,['easy']);
  assert.deepEqual(schema.properties.difficulty.enum,['beginner','easy','intermediate','experienced'],'the committed schema is not mutated');
  assert.equal(schema.properties.abbreviations.items.properties.meaning.maxLength,80);assert.equal(schema.properties.finished_size.maxLength,80);
});

// ADR-049: headings and step labels are presentation metadata; the crochet instruction is steps[].text.
const sections=()=>[
  {heading:'Petals',steps:[{label:'Rnd 1',text:'Make a magic ring, 6 sc into the ring.',stitch_count:6},
    {label:'Work second petal layer',text:'Working in the back loops of Rnd 1, (ch 3, 2 dc, ch 3, sl st) in each st around.',stitch_count:null},
    {label:'Rnds 2-3',text:'Sc in each st around.',stitch_count:6},
    {label:'Attach the outer petal ring to the centre',text:'Sl st the outer ring to the centre, matching petals. Fasten off, leaving a long tail.',stitch_count:null},
    {label:null,text:'Weave in the starting tail.',stitch_count:null}]},
  {heading:'Leaves, worked separately and sewn under the outer petal layer at the base of the flower head',steps:[
    {label:'Row 1',text:'Ch 8, sc in 2nd ch from hook and in each ch across.',stitch_count:7},
    {label:'Attach first leaf to stem',text:'Sew the leaf under the outer petals.',stitch_count:null}]}];

test('step labels: under and exactly 16 unchanged; over 16 becomes "Step N" from its position; step text byte-for-byte unchanged',async()=>{
  for(const label of ['Rnds 4-6 repeat','Rnds 4-6 repeats']){
    const d=base();d.instructions[0].steps[0].label=label;
    assert.deepEqual((await run(d)).data,d,`${label.length}-character label unchanged`);
  }
  const d=base();d.instructions=sections();
  const before=JSON.stringify(d.instructions.map(s=>s.steps.map(st=>st.text)));
  const r=await run(d), ins=r.data.instructions;
  assert.deepEqual(ins[0].steps.map(st=>st.label),['Rnd 1','Step 2','Rnds 2-3','Step 4',null],'each over-long label named by its own position; short and null labels kept');
  assert.deepEqual(ins[1].steps.map(st=>st.label),['Row 1','Step 2'],'numbered within its section');
  assert.equal(JSON.stringify(ins.map(s=>s.steps.map(st=>st.text))),before,'every step text byte-for-byte unchanged');
  assert.deepEqual(ins.map(s=>s.steps.map(st=>st.stitch_count)),d.instructions.map(s=>s.steps.map(st=>st.stitch_count)));
  const logged=r.normalized.filter(c=>/label$/.test(c.field));
  assert.deepEqual(logged.map(c=>[c.field,c.from,c.to]),[['instructions[0].steps[1].label','Work second petal layer','Step 2'],
    ['instructions[0].steps[3].label','Attach the outer petal ring to the centre','Step 4'],['instructions[1].steps[1].label','Attach first leaf to stem','Step 2']],
    'the original wording is kept in the change log');
});

test('the #016 failure shape: steps[1..3] labels over 16 in section 0 are all repaired and the draft validates',async()=>{
  const d=base();d.instructions=[{heading:'Petals',steps:[{label:'Rnd 1',text:'Make a magic ring, 6 sc into the ring.',stitch_count:6},
    {label:'Work first petal layer',text:'(Ch 3, 2 dc, ch 3, sl st) in each st around.',stitch_count:null},
    {label:'Work second petal layer',text:'Sl st to the back loops of Rnd 1; repeat the petals.',stitch_count:null},
    {label:'Work third petal layer',text:'Repeat in the back loops of the second layer.',stitch_count:null}]}];
  const r=await run(d);
  assert.deepEqual(r.data.instructions[0].steps.map(st=>st.label),['Rnd 1','Step 2','Step 3','Step 4']);
  assert.deepEqual(r.data.instructions[0].steps.map(st=>st.text),d.instructions[0].steps.map(st=>st.text));
});

test('section headings: under and exactly 60 unchanged; over 60 becomes "Section N"; the steps beneath are unchanged',async()=>{
  for(const n of [59,60]){const d=base();d.instructions[0].heading=words(n);assert.deepEqual((await run(d)).data,d);}
  const d=base();d.instructions=sections();
  const r=await run(d);
  assert.deepEqual(r.data.instructions.map(s=>s.heading),['Petals','Section 2']);
  const steps=s=>s.steps.map(({text,stitch_count})=>({text,stitch_count}));
  assert.deepEqual(steps(r.data.instructions[1]),steps(d.instructions[1]),'the instructions beneath are unchanged');
  assert.equal(r.data.instructions[1].steps[0].label,'Row 1');
  assert.ok(r.normalized.some(c=>c.field==='instructions[1].heading'&&c.from===d.instructions[1].heading&&c.to==='Section 2'));
});

test('label and heading repair is deterministic and idempotent; the input is never mutated; the validator still decides',async()=>{
  const d=base();d.instructions=sections();const copy=structuredClone(d);
  const a=normalizePatternDraft(d,schema,{entry,terminology:'US'}), b=normalizePatternDraft(structuredClone(d),schema,{entry,terminology:'US'});
  assert.deepEqual(a,b,'same input, same output');
  assert.deepEqual(d,copy,'input not mutated');
  const again=normalizePatternDraft(a.data,schema,{entry,terminology:'US'});
  assert.deepEqual(again.data,a.data);assert.deepEqual(again.changes,[],'a repaired draft needs no further repair');
  // Step text is never repaired: an over-long text in a step with an over-long label still fails.
  const t=base();t.instructions=sections();t.instructions[0].steps[1].text=words(601);
  await assert.rejects(run(t),/instructions\[0\]\.steps\[1\]\.text: longer than 600/);
  const n=normalizePatternDraft(t,schema,{entry,terminology:'US'});
  assert.equal(n.data.instructions[0].steps[1].text,t.instructions[0].steps[1].text);
});
