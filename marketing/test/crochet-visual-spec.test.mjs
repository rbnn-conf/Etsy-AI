// Pattern <-> visual integrity (ADR-046): specs come from fingerprints, contradictions fail,
// unknowns never fail, bouquets only use approved pattern IDs, ornaments are never crochet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { visualSpec, checkVisualSpec, visualSpecProblems, crochetProductPrompt, featuresOf, VISUAL_MATCH_STATUSES } from '../src/stage3/crochet-visual-spec.mjs';
import { patternFingerprint, bundleFingerprints } from '../../production/src/crochet/fingerprint.mjs';
import { crochetBundle } from '../../production/test/crochet-fixture.mjs';

const ROSE={pattern_id:'garden-rose',name:'Cottage Garden Rose',category:'flower',difficulty:'easy',finished_size:'About 7.5 cm across',
  yarn:[{description:'Cotton yarn, petal colour',colour:'blush'},{description:'Cotton yarn, leaf colour',colour:'sage'}],yarn_weight:'3-light',hook_size:{mm:3},
  additional_materials:['Tapestry needle'],stitches_used:['ch','sc'],abbreviations:{},gauge:'n/a',
  instructions:[{heading:'Petals',steps:[{text:'This strip makes 18 petals in three petal layers.'}]},{heading:'Leaves (make 2)',steps:[{text:'Work a pointed leaf.'}]}],
  assembly:['Roll the strip into a spiral centre.','Sew the leaves to the base.'],finishing:['Weave in ends.']};
const F={...bundleFingerprints(crochetBundle()),'garden-rose':patternFingerprint(ROSE)};
const ctx={fingerprints:F};
const one=(features,id='garden-rose')=>({version:1,kind:'single',items:[{pattern_id:id,quantity:1,features:{...featuresOf(F[id]),...features}}],ornaments:[]});
const attrs=spec=>visualSpecProblems(spec,ctx).map(p=>p.attribute);

test('a spec derived from the fingerprint passes; petal count match passes',()=>{
  const s=checkVisualSpec(visualSpec({kind:'single',items:[{pattern_id:'garden-rose'}],fingerprints:F}),ctx);
  assert.equal(s.status,'internally_checked');assert.deepEqual(s.problems,[]);
  assert.deepEqual(attrs(one({petal_count:18})),[]);
});

test('contradictions fail: petal count, petal layers, leaf count, flower type, stem, wire, embellishment, size',()=>{
  assert.deepEqual(attrs(one({petal_count:12})),['petal_count']);
  assert.deepEqual(attrs(one({petal_layer_count:1})),['petal_layer_count']);
  assert.deepEqual(attrs(one({leaves:{present:true,count:3}})),['leaves.count']);
  assert.deepEqual(attrs(one({flower_type:'peony'})),['flower_type']);
  assert.deepEqual(attrs(one({stem:{present:true,wired:true}})),['stem','stem.wired']);
  assert.deepEqual(attrs(one({embellishments:['bead']})),['embellishments']);
  assert.deepEqual(attrs(one({width_cm:15})),['width_cm']);
  assert.deepEqual(attrs(one({sparkles:true})),['sparkles'],'an unknown feature cannot be smuggled in');
  // Pattern makes no leaves (fixture daisy) -> a visual with 2 leaves fails.
  assert.deepEqual(attrs(one({leaves:{present:true,count:2}},'fixture-daisy')),['leaves']);
  const s=checkVisualSpec(one({petal_count:12}),ctx);
  assert.equal(s.status,'derived');assert.throws(()=>crochetProductPrompt(s,F),/not internally_checked/);
});

test('attributes the pattern does not state never cause a failure',()=>{
  // Fixture daisy: petal count, layers, shape and centre type are unknown.
  assert.deepEqual(attrs(one({petal_count:6,petal_layer_count:1,petal_shape:'rounded',centre:{present:true,type:'bobble'}},'fixture-daisy')),[]);
});

test('bouquet: only approved pattern IDs; an invented flower or an unknown ID fails',()=>{
  const ok=visualSpec({kind:'bouquet',items:[{pattern_id:'garden-rose',quantity:3},{pattern_id:'fixture-daisy',quantity:2},{pattern_id:'fixture-leaf',quantity:4}],fingerprints:F});
  assert.equal(checkVisualSpec(ok,ctx).status,'internally_checked');
  const invented={...ok,items:[...ok.items,{quantity:2,features:{flower_type:'peony'}}]};
  assert.deepEqual(visualSpecProblems(invented,ctx).map(p=>[p.item,p.reason]),[['items[3]','every visible crochet motif must map to a real pattern ID']]);
  const unknownId={...ok,items:[...ok.items,{pattern_id:'decorative-peony',quantity:1,features:{}}]};
  assert.match(visualSpecProblems(unknownId,ctx)[0].reason,/not a pattern in the approved bundle/);
  assert.match(visualSpecProblems(ok,{fingerprints:F,approvedIds:['garden-rose']})[0].reason,/not a pattern in the approved bundle/,'approval, not just a fingerprint, decides');
});

test('branding ornaments are flat decoration, never crochet: an illustrated moon passes, a crochet ornament fails',()=>{
  const base=visualSpec({kind:'bouquet',items:[{pattern_id:'garden-rose',quantity:1}],fingerprints:F});
  assert.deepEqual(visualSpecProblems({...base,ornaments:[{kind:'crescent moon',medium:'illustration'},{kind:'botanical sprig',medium:'watercolour'}]},ctx),[]);
  const bad=visualSpecProblems({...base,ornaments:[{kind:'little flowers',medium:'crochet'}]},ctx);
  assert.equal(bad[0].item,'ornaments[0]');assert.match(bad[0].reason,/never crochet or yarn/);
  // Ornaments are not counted as crochet pieces in the prompt.
  const s=checkVisualSpec({...base,ornaments:[{kind:'crescent moon',medium:'illustration'}]},ctx);
  assert.match(crochetProductPrompt(s,F),/Show ONLY these crochet pieces: 1 in total[\s\S]*crescent moon\) are flat illustration decoration, clearly distinct from the crochet pieces; they are printed artwork, not crochet or yarn/);
});

test('the image prompt is built from the final pattern fingerprint and forbids additions',()=>{
  const s=checkVisualSpec(visualSpec({kind:'single',items:[{pattern_id:'garden-rose',quantity:1}],fingerprints:F}),ctx);
  const p=crochetProductPrompt(s,F);
  assert.match(p,/^Render the finished crochet result represented by this specification \(a rendered example of the finished crochet design, derived from the written patterns\):/);
  assert.match(p,/1 × Cottage Garden Rose \[pattern garden-rose\]: a crochet rose about 7\.5 cm across; three distinct petal layers; 18 petals in total; a spiral centre; two pointed crochet leaves; no stem; DK \(light\) weight yarn \(cotton\), 3 mm hook; colours: blush \(petal colour\), sage \(leaf colour\)\./);
  assert.match(p,/Do NOT add: extra petals or petal layers, leaves or stems not listed, extra flower centres, beads, buttons, embroidery, wire/);
  // Unknown attributes are named as unspecified, never invented.
  const d=crochetProductPrompt(checkVisualSpec(visualSpec({kind:'single',items:[{pattern_id:'fixture-daisy'}],fingerprints:F}),ctx),F);
  assert.match(d,/Not specified by the pattern: petal count, petal layer count, petal shape, centre type; keep these plain/);
  assert.doesNotMatch(d,/\d+ petals in total/);
});

test('visual_match_status: derived or internally_checked from code; physically_verified is never produced',()=>{
  assert.deepEqual([...VISUAL_MATCH_STATUSES],['derived','internally_checked','physically_verified']);
  const statuses=[visualSpec({kind:'single',items:[{pattern_id:'garden-rose'}],fingerprints:F}).status,
    checkVisualSpec(visualSpec({kind:'single',items:[{pattern_id:'garden-rose'}],fingerprints:F}),ctx).status,checkVisualSpec(one({petal_count:1}),ctx).status];
  assert.deepEqual(statuses,['derived','internally_checked','derived']);
});
