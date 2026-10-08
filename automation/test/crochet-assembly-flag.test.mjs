// The plan's assembly decision reaches the source pattern in both directions (ADR-051): true requires assembly,
// false lets the validator stop treating every section as a piece. Code never writes assembly text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromModelPattern } from '../src/orchestrator/crochet.mjs';

const model={category:'flower',difficulty:'easy',finished_size:'About 15 cm long',yarn:[{description:'Cotton',colour:'lavender',amount:'About 6 m'}],
  yarn_weight:'2-fine',requires_hook:true,hook_size:{mm:2.25,us:'B-1'},additional_materials:['Floral wire'],stitches_used:['ch','sc'],
  abbreviations:[{abbr:'ch',meaning:'chain'},{abbr:'sc',meaning:'single crochet'}],gauge:'Not critical.',
  instructions:[{heading:'Covered Stem',steps:[{label:null,text:'Work 50 sc around the wire.',stitch_count:50}]}],assembly:[],finishing:['Weave in the ends.'],notes:[]};
const entry=assembly_required=>({pattern_id:'lavender-sprig',name:'Lavender Sprig',...(assembly_required===undefined?{}:{assembly_required})});

test('fromModelPattern carries the plan\'s assembly_required true AND false; absent stays absent; no assembly text is written',()=>{
  assert.equal(fromModelPattern(entry(true),model).assembly_required,true);
  assert.equal(fromModelPattern(entry(false),model).assembly_required,false);
  assert.equal('assembly_required' in fromModelPattern(entry(undefined),model),false);
  for(const v of [true,false,undefined])assert.equal('assembly' in fromModelPattern(entry(v),model),false);
});
