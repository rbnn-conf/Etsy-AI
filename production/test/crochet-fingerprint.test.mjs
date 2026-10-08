// Pattern -> visual fingerprint (ADR-046): deterministic, explicit wording only, unknowns never guessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternFingerprint, bundleFingerprints } from '../src/crochet/fingerprint.mjs';
import { crochetBundle } from './crochet-fixture.mjs';

const rose=(over={})=>({pattern_id:'garden-rose',name:'Cottage Garden Rose',category:'flower',difficulty:'easy',finished_size:'About 7.5 cm across',
  yarn:[{description:'Cotton yarn, petal colour',colour:'blush',amount:'10 m'},{description:'Cotton yarn, leaf colour',colour:'sage',amount:'4 m'}],
  yarn_weight:'3-light',hook_size:{mm:3,us:'D-3'},additional_materials:['Tapestry needle'],stitches_used:['ch','sc','dc'],abbreviations:{},gauge:'Not critical.',
  instructions:[{heading:'Petals',steps:[{label:'Row 1',text:'Ch 60. This strip makes 18 petals in three petal layers.'},{label:'Row 2',text:'Work 6 rounded petals per section.'}]},
    {heading:'Leaves (make 2)',steps:[{label:'Row 1',text:'With sage, ch 10, work along both sides to make a pointed leaf.'}]}],
  assembly:['Roll the strip into a spiral centre and sew it closed.','Sew the leaves to the base of the rose.'],finishing:['Weave in ends.'],...over});

test('explicit wording becomes fingerprint values, each with its evidence',()=>{
  const f=patternFingerprint(rose());
  assert.deepEqual([f.pattern_id,f.pattern_name,f.motif_type,f.flower_type],['garden-rose','Cottage Garden Rose','flower','rose']);
  assert.equal(f.petal_count,18,'"6 petals per section" is a per-unit count, not the total');
  assert.equal(f.petal_layer_count,3);assert.equal(f.petal_shape,'rounded');
  assert.deepEqual(f.centre,{present:true,type:'spiral'});
  assert.deepEqual(f.leaves,{present:true,count:2,shape:'pointed',attachment:'sewn to the base'});
  assert.deepEqual(f.stem,{present:false,type:'none',length_cm:null,wired:false});
  assert.equal(f.finished.width_cm,7.5);assert.equal(f.yarn_weight,'3-light');assert.equal(f.hook_mm,3);assert.deepEqual(f.fibres,['cotton']);
  assert.deepEqual(f.colour_roles,[{role:'petal colour',colour:'blush'},{role:'leaf colour',colour:'sage'}]);
  assert.deepEqual(f.embellishments,[]);
  assert.equal(f.evidence.petal_layer_count,'instructions[0].steps[0].text');assert.equal(f.evidence.leaf_count,'instructions[1].heading');
  assert.deepEqual(f.unknown,[]);
});

test('a value implied only by stitch arithmetic is NOT computed: it is null and listed as unknown',()=>{
  const daisy=bundleFingerprints(crochetBundle())['fixture-daisy'];
  // "*ch 8, sl st in the next st; rep from * around" over 6 sts implies 6 petals: never counted.
  assert.equal(daisy.petal_count,null);assert.equal(daisy.petal_layer_count,null);
  assert.ok(daisy.unknown.includes('petal_count')&&daisy.unknown.includes('petal_layer_count')&&daisy.unknown.includes('centre_type'));
  assert.equal(daisy.centre_colour_role,'yellow','"With yellow" in the Centre section');
});

test('known absence vs unknown: no leaf or stem instruction = none; a leaf section without a count = unknown count',()=>{
  const daisy=bundleFingerprints(crochetBundle())['fixture-daisy'];
  assert.deepEqual(daisy.leaves,{present:false,count:0,shape:null,attachment:null});assert.equal(daisy.stem.present,false);
  const r=patternFingerprint(rose({instructions:[{heading:'Petals',steps:[{text:'Work 5 petals.'}]},{heading:'Leaf',steps:[{text:'Ch 8 and work a leaf.'}]}],assembly:[]}));
  assert.equal(r.leaves.present,true);assert.equal(r.leaves.count,null);assert.ok(r.unknown.includes('leaf_count'));
  assert.equal(r.petal_count,5);
});

test('conflicting explicit counts are not resolved by guessing; wire and beads come only from materials or instructions',()=>{
  const r=patternFingerprint(rose({instructions:[{heading:'Petals',steps:[{text:'Rnd 3: make 5 petals.'},{text:'Rnd 5: make 8 petals.'}]}]}));
  assert.equal(r.petal_count,null);assert.deepEqual(r.petal_counts_stated,[5,8]);
  const wired=patternFingerprint(rose({additional_materials:['Tapestry needle','Floral wire, 20 cm','Glass beads'],
    instructions:[{heading:'Petals',steps:[{text:'Work 5 petals.'}]},{heading:'Stem',steps:[{text:'Cover the wire with sc to make a 15 cm stem.'}]}]}));
  assert.deepEqual(wired.stem,{present:true,type:'crochet-covered wire',length_cm:15,wired:true});
  assert.deepEqual(wired.embellishments.sort(),['bead','wire']);
});

test('a foliage pattern is the leaf itself (no "leaves" attribute); fingerprints are deterministic',()=>{
  const fps=bundleFingerprints(crochetBundle());
  assert.equal(fps['fixture-leaf'].motif_type,'foliage');assert.equal(fps['fixture-leaf'].leaves,null);
  assert.equal(fps['fixture-leaf'].finished.height_cm,6);
  assert.deepEqual(bundleFingerprints(crochetBundle()),fps);
});
