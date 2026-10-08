// Over-long crochet finishing items (ADR-043): a lossless split before the
// schema validator, which stays the final authority. No network: a fake
// client stands in for the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { splitBoundedText, normalizeBoundedInstructionArray, sameWords } from '../src/orchestrator/bounded-text.mjs';
import { generatePattern, normalizePatternDraft, BOUNDED_INSTRUCTION_ARRAYS } from '../src/openai/crochet.mjs';
import { loadSchema, validate, strictSchema } from '../src/orchestrator/schema.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';

const MAX=300;
const allWithin=a=>a.every(x=>x.length<=MAX);
// Every chunk is made of whole words of the original (no word cut in half).
const wholeWords=(chunks,original)=>{const w=new Set(original.split(/\s+/).filter(Boolean));return chunks.every(c=>c.split(' ').every(x=>w.has(x)));};

const LONG_PARAGRAPH='Fasten off, leaving a long tail for sewing, and weave in the starting tail on the reverse side of the centre. '+
  'Block the finished flower lightly to shape the petals, pinning each petal tip into position on a foam mat and misting with water until damp but not wet. '+
  'Allow it to dry completely before assembly, which may take several hours depending on the yarn and the room. '+
  'Thread the floral wire through the base of the stem, bend the top 1 cm into a small hook and pull it back into the stitches so it cannot be seen. '+
  'Finally inspect the whole flower in good light and adjust any petal that has twisted, e.g. by easing it gently with your fingers.';
const ONE_SENTENCE=('Weave the remaining yarn tail through the back loops of the last round of petals, working slowly around the flower, keeping every stitch even, '+
  'tightening gently so that the centre closes neatly without puckering the outer petals, and checking the front after every few stitches so that the visible side stays smooth, '+
  'then secure the tail with a small knot hidden behind a petal and trim the excess close to the work').trim();

const draft=finishing=>({category:'flower',difficulty:'beginner',finished_size:'About 6 cm across',yarn:[{description:'Cotton yarn, petal colour',colour:'blush',amount:'About 8 m'}],
  yarn_weight:'3-light',requires_hook:true,hook_size:{mm:3,us:'D-3'},additional_materials:['Tapestry needle','Scissors','Floral wire'],stitches_used:['ch','sc','sl st'],
  abbreviations:[{abbr:'ch',meaning:'chain'},{abbr:'sc',meaning:'single crochet'},{abbr:'sl st',meaning:'slip stitch'},{abbr:'st',meaning:'stitch'},{abbr:'MR',meaning:'magic ring'}],
  gauge:'Not critical for this pattern.',instructions:[{heading:'Flower',steps:[{label:'Rnd 1',text:'Make a MR, 6 sc into the ring, sl st to the first st.',stitch_count:6}]}],
  assembly:[],finishing,notes:['Use a stitch marker at the start of each round.']});

test('a finishing item below 300 characters is returned unchanged (same string, same array)',()=>{
  const items=['Fasten off and weave in all ends.','Block lightly to shape the petals.'];
  const n=normalizeBoundedInstructionArray(items,{maxLength:MAX});
  assert.equal(n.items,items);assert.deepEqual(n.changes,[]);
  assert.deepEqual(splitBoundedText(items[0],MAX),[items[0]]);
});

test('a finishing item of exactly 300 characters passes unchanged',async()=>{
  const exact=`${'Weave in the ends neatly. '.repeat(11)}${'x'.repeat(MAX-'Weave in the ends neatly. '.length*11)}`;
  assert.equal(exact.length,MAX);
  const n=normalizeBoundedInstructionArray([exact],{maxLength:MAX});
  assert.deepEqual(n.items,[exact]);assert.deepEqual(n.changes,[]);
  const schema=await loadSchema('crochet-pattern');
  assert.deepEqual(validate(schema,draft([exact])),[]);
});

test('one sentence over 300 characters is split at clause/word boundaries: every word kept, none cut, each part <= 300',()=>{
  assert.ok(ONE_SENTENCE.length>MAX&&!/[.!?]/.test(ONE_SENTENCE.slice(0,-1)),'fixture is one long sentence');
  const parts=splitBoundedText(ONE_SENTENCE,MAX);
  assert.ok(parts.length>=2);
  assert.ok(allWithin(parts));
  assert.ok(sameWords(parts,ONE_SENTENCE),'no word lost, added or reordered');
  assert.ok(wholeWords(parts,ONE_SENTENCE),'no word cut in half');
  // Clause boundary preferred: the first part ends at a comma, not mid-clause.
  assert.match(parts[0],/,$/);
});

test('a long multi-sentence finishing instruction becomes several entries, split at sentence ends, nothing lost',()=>{
  assert.ok(LONG_PARAGRAPH.length>MAX*2);
  const n=normalizeBoundedInstructionArray(['Fasten off.',LONG_PARAGRAPH,'Trim any loose fibres.'],{maxLength:MAX});
  assert.ok(n.items.length>=4);
  assert.ok(allWithin(n.items));
  assert.equal(n.items[0],'Fasten off.');assert.equal(n.items.at(-1),'Trim any loose fibres.');
  assert.ok(sameWords(n.items,['Fasten off.',LONG_PARAGRAPH,'Trim any loose fibres.']));
  const middle=n.items.slice(1,-1);
  for(const m of middle)assert.match(m,/[.!?]$/,`split at a sentence end: ${m}`);
  // "e.g." never ends a chunk.
  assert.ok(!middle.some(m=>/e\.g\.$/.test(m)));
  assert.deepEqual(n.changes,[{index:1,length:LONG_PARAGRAPH.length,parts:middle.length}]);
});

test('normalizePatternDraft: only finishing changes; every other field is untouched; a valid draft is the same object',async()=>{
  const schema=await loadSchema('crochet-pattern');
  assert.ok(BOUNDED_INSTRUCTION_ARRAYS.includes('finishing'));
  const ok=draft(['Fasten off and weave in all ends.']);
  const same=normalizePatternDraft(ok,schema);
  assert.equal(same.data,ok);assert.deepEqual(same.changes,[]);
  assert.equal(JSON.stringify(same.data),JSON.stringify(draft(['Fasten off and weave in all ends.'])));
  const long=draft(['Fasten off.',LONG_PARAGRAPH]), before=structuredClone(long);
  const n=normalizePatternDraft(long,schema);
  assert.deepEqual(long,before,'the input is not mutated');
  const {finishing:f1,...rest1}=n.data, {finishing:f0,...rest0}=before;
  assert.deepEqual(rest1,rest0);
  assert.ok(sameWords(f1,f0));assert.ok(allWithin(f1));
  assert.deepEqual(validate(schema,n.data),[]);
  assert.equal(n.changes[0].field,'finishing');
});

const fakeAi=data=>({textModel:'fake-text',client:{async json(){return {data:structuredClone(data),usage:{total_tokens:1},model:'fake-text'};}}});
const entry={pattern_id:'rose',name:'Rose',category:'flower',role:'focal',difficulty:'beginner',summary:'A rose.',approx_size:'about 6 cm',yarn_weight:'3-light',hook_mm:3,
  construction:'in the round',main_stitches:['sc'],assembly_required:false};
const plan={theme:'crochet flowers',audience:['adults'],patterns:[entry]}, brief={pattern_count:1,terminology:'US'};

test('model response -> parse -> lossless split -> schema validation: the reported failure ($.finishing[0] longer than 300) now passes',async()=>{
  const r=await generatePattern(fakeAi(draft([LONG_PARAGRAPH,'Weave in all ends.'])),{entry,plan,brief});
  assert.ok(allWithin(r.data.finishing));assert.ok(r.data.finishing.length>2);
  assert.ok(sameWords(r.data.finishing,[LONG_PARAGRAPH,'Weave in all ends.']));
  assert.equal(r.normalized.length,1);
  // Already-valid output: identical, and nothing reported.
  const v=await generatePattern(fakeAi(draft(['Weave in all ends.'])),{entry,plan,brief});
  assert.deepEqual(v.data,draft(['Weave in all ends.']));assert.equal(v.normalized,undefined);
});

test('validation stays the final authority: what cannot be split safely, or splits past maxItems, is still rejected',async()=>{
  // One 301-character "word": never cut, so still too long.
  await assert.rejects(generatePattern(fakeAi(draft(['x'.repeat(MAX+1)])),{entry,plan,brief}),e=>e instanceof InvalidModelOutputError&&/finishing\[0\]: longer than 300/.test(e.message));
  // Eight items, one of which splits: more than the schema's 8 items.
  await assert.rejects(generatePattern(fakeAi(draft([...Array(7).fill('Weave in all ends.'),LONG_PARAGRAPH])),{entry,plan,brief}),e=>e instanceof InvalidModelOutputError&&/finishing: more than 8 items/.test(e.message));
  // Five notes, one of which splits: more than the schema's 5 notes.
  const d=draft(['Weave in all ends.']);d.notes=[...Array(4).fill('Use a stitch marker.'),LONG_PARAGRAPH];
  await assert.rejects(generatePattern(fakeAi(d),{entry,plan,brief}),/notes: more than 5 items/);
});

// ---------------------------------------------------------------- assembly and notes (same helper, own limits) ---
const LONG_ASSEMBLY='Arrange the three large roses at the centre of the bouquet, with the tallest rose slightly behind the others so each flower head is visible from the front. '+
  'Add the daisies around the roses, spacing them evenly and turning each one so the petals face outwards. '+
  'Slide the lavender stems between the daisies, keeping the tips about 3 cm above the flower heads. '+
  'Fill the remaining gaps with the small blue flowers and the sage leaves, then wrap the gathered stems tightly with floral tape from just below the lowest leaf to the base. '+
  'Finally sew the end of the stem wrap in place with a few small stitches so it cannot unwind.';
const fields={assembly:400,notes:300};

test('BOUNDED_INSTRUCTION_ARRAYS: finishing, assembly and notes, each with its own schema limit; never step text',async()=>{
  const schema=await loadSchema('crochet-pattern');
  assert.deepEqual([...BOUNDED_INSTRUCTION_ARRAYS],['finishing','assembly','notes']);
  assert.deepEqual(BOUNDED_INSTRUCTION_ARRAYS.map(k=>schema.properties[k].items.maxLength),[300,400,300]);
});

for(const [field,max] of Object.entries(fields)){
  const withField=items=>{const d=draft(['Weave in all ends.']);d[field]=items;return d;};
  test(`${field}: under ${max} unchanged; exactly ${max} passes; over ${max} split, nothing lost, every item <= ${max}`,async()=>{
    const schema=await loadSchema('crochet-pattern');
    const short=withField(['Sew the leaf to the stem with the long tail.']);
    const s=normalizePatternDraft(short,schema);
    assert.equal(s.data,short);assert.deepEqual(s.changes,[]);
    const exact=`${'Sew the pieces together. '.repeat(Math.floor(max/25))}`.padEnd(max,'x');
    assert.equal(exact.length,max);
    const e=normalizePatternDraft(withField([exact]),schema);
    assert.deepEqual(e.data[field],[exact]);assert.deepEqual(e.changes,[]);
    assert.deepEqual(validate(schema,e.data),[]);
    assert.ok(LONG_ASSEMBLY.length>max);
    const input=withField(['Sew the leaf to the stem.',LONG_ASSEMBLY]), before=structuredClone(input);
    const n=normalizePatternDraft(input,schema);
    assert.deepEqual(input,before,'the input is not mutated');
    const out=n.data[field];
    assert.ok(out.length>2);
    assert.ok(out.every(x=>x.length<=max),`every ${field} item <= ${max}`);
    assert.equal(out[0],'Sew the leaf to the stem.');
    assert.ok(sameWords(out,['Sew the leaf to the stem.',LONG_ASSEMBLY]),'no word lost, added or reordered');
    assert.ok(wholeWords(out.slice(1),LONG_ASSEMBLY),'no word cut in half');
    assert.deepEqual(n.changes,[{field,index:1,length:LONG_ASSEMBLY.length,parts:out.length-1}]);
    const {[field]:_a,...rest1}=n.data, {[field]:_b,...rest0}=before;
    assert.deepEqual(rest1,rest0,'every other field untouched');
    assert.deepEqual(validate(schema,n.data),[]);
    // End to end: the model's over-long item is split, then validated and accepted.
    const r=await generatePattern(fakeAi(withField([LONG_ASSEMBLY])),{entry,plan,brief});
    assert.ok(r.data[field].every(x=>x.length<=max));assert.ok(sameWords(r.data[field],LONG_ASSEMBLY));
    assert.equal(r.normalized[0].field,field);
  });
}

// ---------------------------------------------------------------- step text: never split; guidance only ---
test('step text is never split automatically: an over-long step is rejected as it was, steps unchanged',async()=>{
  const schema=await loadSchema('crochet-pattern');
  const long=`${'Rnd 2: 2 sc in each st around, then sl st to the first st and ch 1. '.repeat(10)}`.trim();
  assert.ok(long.length>600);
  const d=draft(['Weave in all ends.']);d.instructions[0].steps[0].text=long;
  const n=normalizePatternDraft(d,schema);
  assert.equal(n.data,d,'same object: nothing touched');assert.deepEqual(n.changes,[]);
  assert.equal(n.data.instructions[0].steps.length,1);assert.equal(n.data.instructions[0].steps[0].text,long);
  await assert.rejects(generatePattern(fakeAi(d),{entry,plan,brief}),e=>e instanceof InvalidModelOutputError&&/steps\[0\]\.text: longer than 600/.test(e.message));
});

test('the model is told the step text, assembly, notes and scalar limits; schema limits unchanged',async()=>{
  const schema=await loadSchema('crochet-pattern'), step=schema.properties.instructions.items.properties.steps.items.properties.text;
  assert.equal(step.maxLength,600);assert.equal(schema.properties.gauge.maxLength,200);
  const sent=strictSchema(schema);
  assert.match(sent.properties.instructions.items.properties.steps.items.properties.text.description,/Never several independent rounds or rows in one step: add another step instead\. Maximum 600 characters\./);
  assert.match(sent.properties.assembly.items.description,/Maximum 400 characters\./);
  assert.match(sent.properties.notes.items.description,/Maximum 300 characters\./);
  assert.match(sent.properties.gauge.description,/Maximum 200 characters\./);
  const prompt=await readFile(join(import.meta.dirname,'..','prompts','crochet-pattern.md'),'utf8');
  assert.match(prompt,/EVERY step's text must be 600 characters or fewer/);
  assert.match(prompt,/Never put several\s+independent rounds or rows into one paragraph: add another explicit step\s+instead/);
  assert.match(prompt,/Keep the stitch counts and the order exact/);
  assert.match(prompt,/EVERY `assembly` item must be 400 characters or fewer/);
  assert.match(prompt,/EVERY `notes` item 300 characters or fewer/);
  // The exact scalar limits now come from the schema, in the request (ADR-048), not hardcoded in the prompt.
  assert.match(prompt,/LENGTH AND COUNT LIMITS block at the end of the request \(taken from the\s+schema\)/);
});

test('the model is told: concise separate finishing items, each <= 300 characters; the schema limit itself is unchanged',async()=>{
  const schema=await loadSchema('crochet-pattern');
  assert.equal(schema.properties.finishing.items.maxLength,300);
  const sent=strictSchema(schema).properties.finishing;
  assert.match(sent.items.description,/Maximum 300 characters\./);
  assert.match(sent.description,/add another item instead of lengthening one/);
  const prompt=await readFile(join(import.meta.dirname,'..','prompts','crochet-pattern.md'),'utf8');
  assert.match(prompt,/EVERY finishing\s+item must be 300 characters or fewer/);
  assert.match(prompt,/one action \(or a few closely related actions\) per item/);
  assert.match(prompt,/add\s+another item instead of lengthening one/);
});
