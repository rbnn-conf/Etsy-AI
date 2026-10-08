// Stage 3 receives the approved crochet pattern facts and checked visuals (ADR-047). Pure; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE3_ADAPTERS } from '../src/stage3/adapters/index.mjs';
import { crochetClaimProblems, countClaimProblems } from '../src/stage3/crochet-integrity.mjs';

const ROSE={pattern_id:'garden-rose',pattern_name:'Cottage Garden Rose',motif_type:'flower',flower_type:'rose',finished_size:'About 7.5 cm across',finished_width_cm:7.5,finished_height_cm:null,
  yarn_weight:'3-light',hook_mm:3,fibres:['cotton'],colour_roles:[{role:'petal colour',colour:'blush'}],petal_count:18,petal_layer_count:3,petal_shape:'rounded',
  centre:'spiral',leaves:2,stem:'none',embellishments:[],unknown:[]};
const DAISY={...ROSE,pattern_id:'fixture-daisy',pattern_name:'Fixture Daisy',flower_type:'daisy',petal_count:null,petal_layer_count:null,petal_shape:null,
  centre:'present, type not stated',leaves:'none',unknown:['petal_count','petal_layer_count','petal_shape','centre_type']};
const VIOLET={...DAISY,pattern_id:'five-petal-violet',pattern_name:'Five-Petal Violet',flower_type:'violet'};
const visuals=(status='internally_checked')=>({visual_match_status:status,physically_verified:status==='physically_verified',patterns_sha256:'a'.repeat(64),
  source:{file:'creative/visual-specs.json',sha256:'b'.repeat(64)},pictured:{combination:'Garden posy',items:[{pattern_id:'garden-rose',pattern_name:'Cottage Garden Rose',quantity:3},{pattern_id:'fixture-daisy',pattern_name:'Fixture Daisy',quantity:2}]},
  pattern_facts:[ROSE,DAISY,VIOLET]});
const facts=(v=visuals())=>({product_format:'crochet-pattern-bundle',product_name:'Moonlit Meadow',product_type:'crochet pattern bundle',target_customer:'adults',theme:'flowers',pattern_count:3,
  patterns:{count:3,list:[ROSE,DAISY,VIOLET].map((p,i)=>({number:i+1,name:p.pattern_name,category:'flower',level:'Easy'})),categories:['flower']},
  categories:['flower'],skill_levels:['Easy'],terminology:'US',page_quantity:{total_pages:40},formats:[{key:'A4',label:'A4'}],combinations:null,package:{parts:1},style:{mood:null},
  integrity:{all_tested:false,verification:{tested:0,unverified:3}},artwork:{hero:{photographic_evidence:false}},deliverables:{step_by_step_instructions:true},visuals:v});
const C=STAGE3_ADAPTERS['crochet-pattern-bundle'];
const reasons=(t,f=facts())=>crochetClaimProblems(t,f).map(x=>x.reason);

test('listing facts carry the approved pattern data, the pictured approved IDs and quantities, and the match status',()=>{
  const m=C.modelFacts(facts());
  assert.deepEqual(m.pattern_facts.patterns.map(p=>p.pattern_id),['garden-rose','fixture-daisy','five-petal-violet']);
  assert.match(m.pattern_facts.note,/source of truth[\s\S]*never state, estimate or imply a value/);
  assert.deepEqual(m.pictured.items.map(i=>[i.pattern_id,i.quantity]),[['garden-rose',3],['fixture-daisy',2]]);
  assert.equal(m.pictured.combination,'Garden posy');
  assert.equal(m.visual_match_status.value,'internally_checked');assert.match(m.visual_match_status.note,/NOT physically verified/);
  const rules=C.modelRules(facts()).join('\n');
  assert.match(rules,/PATTERN DATA \(pattern_facts\) is the source of truth; the CHECKED VISUAL \(pictured\) is the only allowed representation of it; BRANDING is decoration only/);
  assert.match(rules,/Never say physically verified, tested, photographed, a finished sample, or exactly as pictured/);
});

test('unknown fingerprint fields stay unknown in the facts (null / "not stated", never a number)',()=>{
  const d=C.modelFacts(facts()).pattern_facts.patterns.find(p=>p.pattern_id==='fixture-daisy');
  assert.equal(d.petal_count,null);assert.equal(d.petal_layer_count,null);assert.equal(d.centre,'present, type not stated');
  assert.deepEqual(d.unknown,['petal_count','petal_layer_count','petal_shape','centre_type']);
});

test('marketing cannot promote petal, layer or leaf counts the patterns do not establish; supported counts and pattern names pass',()=>{
  assert.deepEqual(reasons('An 18-petal rose with three petal layers and two pointed leaves.'),[]);
  assert.match(reasons('A 12-petal daisy.').join(),/do not establish 12 petals/);
  assert.match(reasons('Every flower has 18 petals and 4 leaves.').join(),/do not establish 4 leafs|do not establish 4 leaf/);
  assert.match(reasons('Two-layer petals throughout.').join(),/do not establish 2 petal layers/);
  assert.deepEqual(reasons('The Five-Petal Violet is quick to make.'),[],'a pattern name is not a count claim');
  // Without checked visuals no count is established at all.
  assert.match(countClaimProblems('An 18-petal rose.',{}).map(x=>x.reason).join(),/do not establish 18 petals/);
});

test('physically verified is never inferred: refused unless the human record says so; exactly-as-pictured always refused',()=>{
  assert.match(reasons('Physically verified patterns.').join(),/not physically verified/);
  assert.deepEqual(reasons('These patterns are not physically verified.'),[]);
  assert.ok(!reasons('Physically verified patterns.',facts(visuals('physically_verified'))).some(r=>/not physically verified/.test(r)));
  assert.match(reasons('Your bouquet will look exactly as pictured.',facts(visuals('physically_verified'))).join(),/exact result/);
  assert.equal(C.modelFacts(facts()).visual_match_status.value,'internally_checked','never upgraded on the way in');
});

test('a crochet package built before the visual gate carries no visual facts (nothing invented); non-crochet adapters are unchanged',()=>{
  const old=C.modelFacts(facts(null));
  assert.equal(old.pattern_facts,undefined);assert.equal(old.pictured,undefined);
  assert.ok(!C.modelRules(facts(null)).some(r=>/pattern_facts/.test(r)));
  for(const [k,a] of Object.entries(STAGE3_ADAPTERS)){
    if(k==='crochet-pattern-bundle')continue;
    assert.ok(!/pattern_facts|visual_match_status|PATTERN DATA/.test(a.modelFacts.toString()+String(a.modelRules??'')),k);
  }
});
