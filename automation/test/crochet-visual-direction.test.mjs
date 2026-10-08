// The authoritative crochet visual direction (ADR-043): realistic crochet
// product, illustrated branding only, inherited by every crochet image and
// direction prompt, and absent from every other format. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePrompt } from '../src/openai/images.mjs';
import { buildPreviewPrompt } from '../src/openai/concept-preview.mjs';
import { createDirection } from '../src/openai/direction.mjs';
import { generateSpecification } from '../src/openai/specification.mjs';
import { CROCHET_VISUAL_DIRECTION, crochetImageAvoid, imageDirectionFor, stage3AdapterFor, crochetMarketingDirection } from '../../marketing/src/stage3/index.mjs';

// A direction like product #016's (model-written gouache style that forbids photorealism and finished crochet).
const GOUACHE={illustration_style:'Hand-painted botanical gouache.',palette:'Warm cream, soft blush, dusty sage, lavender.',mood:'Poetic and moonlit.',
  shared_prompt:'Original hand-painted botanical gouache, never photographic.',
  avoid:['Photography, photorealism or realistic product mock-ups','Crochet hooks, yarn balls, stitch diagrams or finished crochet objects within the decorative illustrations',
    'Harsh neon colours','Misspelled text']};
const productOf=format=>({product_id:'900',name:'Moonlit Meadow',canvas:{orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'Clear margin.'},
  concepts:{selected:{batch:1,concept_id:'A'},batches:[{batch:1,concepts:[{concept_id:'A',product_format:format}]}]}});
const PAGE={page_number:1,page_type:'cover',generation_prompt:'Cover artwork: a meadow bouquet below the title "MOONLIT MEADOW".'};
const crochetPrompt=()=>buildImagePrompt({direction:GOUACHE,product:productOf('crochet-pattern-bundle'),page:PAGE});
const avoidOf=p=>p.split('DO NOT INCLUDE: ')[1];

test('1. crochet image prompts require realistic, visible yarn and stitch texture',async()=>{
  const p=await crochetPrompt();
  for(const t of ['CROCHET PRODUCT DIRECTION','photorealistic, high-end realistic product photography','clearly visible yarn fibres','visible crochet stitches',
    'realistic loops, petal construction and stitch definition','believable yarn thickness','genuine handmade depth and small imperfections','visible even at Etsy thumbnail size'])
    assert.ok(p.includes(t),`missing: ${t}`);
  // The direction follows the page brief and precedes the canvas and the avoid list.
  assert.ok(p.indexOf('CROCHET PRODUCT DIRECTION')>p.indexOf('PAGE 1')&&p.indexOf('CROCHET PRODUCT DIRECTION')<p.indexOf('CANVAS:'));
  assert.doesNotMatch(p,/clearly an illustration, not a photograph/);
});

test('2. crochet image prompts reject an illustrated product representation; conflicting avoid entries are dropped',async()=>{
  const p=await crochetPrompt(), avoid=avoidOf(p);
  for(const x of CROCHET_VISUAL_DIRECTION.productMustNotLook){
    assert.ok(p.includes(`must NOT look`)&&p.includes(x),`must-not: ${x}`);
    assert.ok(avoid.includes(`a crochet product that looks ${x}`),`avoid list: ${x}`);
  }
  for(const x of ['watercolour painted','hand illustrated','flat vector art','digitally painted','porcelain','plastic','like real biological flowers','like generic floral clipart'])
    assert.ok(CROCHET_VISUAL_DIRECTION.productMustNotLook.includes(x));
  // The model-written entries that would forbid the realistic crochet product are gone; the rest are kept.
  assert.doesNotMatch(avoid,/photorealism|finished crochet objects/i);
  assert.match(avoid,/Harsh neon colours; Misspelled text/);
  assert.deepEqual(crochetImageAvoid(GOUACHE.avoid).dropped,GOUACHE.avoid.slice(0,2));
});

test('3. illustration and watercolour stay permissible in the branding layer only',async()=>{
  const p=await crochetPrompt();
  assert.match(p,/1\. BRANDING LAYER/);
  assert.match(p,/subtle watercolour ornaments \(allowed in the branding layer only\)/);
  assert.match(p,/Any painted, illustrated or watercolour style above applies to this layer ONLY/);
  for(const t of ['Moonlit Meadow','cream, warm ivory, soft blush, lavender, sage','tasteful crescent-moon details','fine botanical ornaments','elegant serif typography'])
    assert.ok(p.includes(t),t);
  // The owner's gouache style is still sent (for the branding), not deleted.
  assert.match(p,/Hand-painted botanical gouache/);
});

test('4. the crochet product itself is required to be realistic, everywhere crochet artwork is directed',async()=>{
  const p=await crochetPrompt();
  assert.match(p,/2\. PRODUCT REPRESENTATION[\s\S]*must look physically crocheted from yarn, photorealistic/);
  assert.match(p,/overrides any conflicting style, medium or avoid wording above/);
  // Concept previews get the same direction (passed in by the workflow).
  const c={concept_id:'A',product_format:'crochet-pattern-bundle',proposed_name:'Moonlit Meadow',target_customer:'crocheters',visual_direction_summary:'botanical',short_description:'flowers'};
  const sib=['B','C'].map(id=>({...c,concept_id:id,proposed_name:id}));
  const pv=await buildPreviewPrompt({requestText:'crochet flowers',concept:c,siblings:sib,direction:GOUACHE,formatDirection:imageDirectionFor('crochet-pattern-bundle')});
  assert.match(pv,/PRODUCT REPRESENTATION[\s\S]*clearly visible yarn fibres/);assert.doesNotMatch(avoidOf(pv),/photorealism/i);
  // The text models that write a crochet direction and specification are told too.
  const users=[];const ai={textModel:'t',client:{async json({user,schemaName}){users.push(user);
    return {data:schemaName==='specification'?{page_count:1,pages:[{page_number:1}],canvas:{orientation:'portrait',background:'white',edge:'safe-margin'}}:{},usage:{},model:'t'};}}};
  await createDirection(ai,{requestText:'crochet',concept:c}).catch(()=>{});
  await generateSpecification(ai,{requestText:'crochet',concept:{...c,page_count:1},direction:GOUACHE}).catch(()=>{});
  assert.equal(users.length,2);
  for(const u of users){assert.match(u,/CROCHET VISUAL DIRECTION/);assert.match(u,/Never put photorealism, realistic product photography, yarn or finished crochet pieces on the avoid list/);}
  // Stage 3 crochet copy and art direction inherit it, with the digital-product disclosure.
  const rules=stage3AdapterFor('crochet-pattern-bundle').modelRules({patterns:{count:33},terminology:'US',integrity:{all_tested:false}}).join('\n');
  for(const r of crochetMarketingDirection())assert.ok(rules.includes(r));
  assert.match(rules,/never a photograph of a test-made item, and never something the buyer receives/);
  assert.match(rules,/1 hero, 2 pattern-overview, 3 detail, 4 whats-included, 5 learning, 6 variations, 7 lifestyle, 8 digital-product/);
  // AI environments still never paint a crocheted item (the approved artwork is composited by code).
  assert.ok(stage3AdapterFor('crochet-pattern-bundle').sceneExclusions().includes('crocheted or knitted items'));
});

test('5. other formats are unchanged: no crochet direction, avoid lists passed through as they were',async()=>{
  for(const format of ['greeting-card','colouring-book','activity-book','invitation',undefined]){
    const p=await buildImagePrompt({direction:GOUACHE,product:productOf(format),page:PAGE});
    assert.doesNotMatch(p,/CROCHET PRODUCT DIRECTION|BRANDING LAYER|yarn fibres|crochet product that looks/,String(format));
    assert.equal(avoidOf(p),GOUACHE.avoid.join('; ')+'.',String(format));
    assert.equal(imageDirectionFor(format),null);
  }
  const c={concept_id:'A',product_format:'greeting-card',proposed_name:'Card',target_customer:'adults',visual_direction_summary:'x',short_description:'y'};
  const sib=['B','C'].map(id=>({...c,concept_id:id,proposed_name:id}));
  const a=await buildPreviewPrompt({requestText:'card',concept:c,siblings:sib,direction:GOUACHE});
  const b=await buildPreviewPrompt({requestText:'card',concept:c,siblings:sib,direction:GOUACHE,formatDirection:imageDirectionFor('greeting-card')});
  assert.equal(a,b);assert.doesNotMatch(a,/CROCHET PRODUCT DIRECTION|BRANDING LAYER|yarn fibres/);
  const users=[];const ai={textModel:'t',client:{async json({user}){users.push(user);return {data:{},usage:{},model:'t'};}}};
  for(const f of ['greeting-card','colouring-book','activity-book'])await createDirection(ai,{requestText:'x',concept:{...c,product_format:f}}).catch(()=>{});
  assert.ok(users.length===3&&users.every(u=>!/CROCHET/.test(u)));
  const facts={'greeting-card':{},'colouring-book':{book:{page_count:24,colouring_pages:24,non_colouring_pages:[]}}};
  for(const [f,x] of Object.entries(facts)){
    const rules=(stage3AdapterFor(f).modelRules?.(x)??[]).join('\n');
    assert.doesNotMatch(rules,/crochet|yarn/i,f);
  }
});

// ---------------------------------------------------------------- ADR-047: pre-pattern proofs are concept/style only ---
import { STYLE_PROOF_NOTE, TRACEABLE_NOTE, crochetDirectionBrief } from '../../marketing/src/stage3/index.mjs';
import { proofSummary } from '../src/telegram/commands.mjs';

test('pre-pattern crochet proofs and previews are marked CONCEPT / STYLE only; after Restyle, the proofs are pattern-derived',async()=>{
  const pre=await crochetPrompt();
  assert.ok(pre.includes(STYLE_PROOF_NOTE));assert.ok(!pre.includes(TRACEABLE_NOTE));
  assert.match(STYLE_PROOF_NOTE,/establishes typography, palette, Moonlit Meadow branding, background, ornament style and general crochet realism/);
  assert.match(STYLE_PROOF_NOTE,/NOT the finished result of any specific pattern and NOT the final bundle/);
  assert.match(STYLE_PROOF_NOTE,/show no pattern count, no pattern names and no precise petal or leaf count as final/);
  const post=await buildImagePrompt({direction:GOUACHE,product:{...productOf('crochet-pattern-bundle'),restyles:[{}]},page:PAGE});
  assert.ok(post.includes(TRACEABLE_NOTE));assert.ok(!post.includes(STYLE_PROOF_NOTE));
  const c={concept_id:'A',product_format:'crochet-pattern-bundle',proposed_name:'M',target_customer:'x',visual_direction_summary:'x',short_description:'x'};
  const pv=await buildPreviewPrompt({requestText:'r',concept:c,siblings:['B','C'].map(id=>({...c,concept_id:id})),direction:GOUACHE,formatDirection:imageDirectionFor('crochet-pattern-bundle')});
  assert.ok(pv.includes(STYLE_PROOF_NOTE),'concept previews are always pre-pattern');
});

test('the text models are told not to hardcode species, counts or pattern names before the patterns exist',()=>{
  const b=crochetDirectionBrief();
  assert.match(b,/Before the patterns exist, every artwork page is a CONCEPT \/ STYLE proof only/);
  assert.match(b,/never name specific flower species, petal or leaf counts, pattern names or a pattern count/);
  assert.match(b,/generic realistic crochet arrangement/);
  assert.doesNotMatch(b,/e\.g\. a bouquet\) as the hero/);
});

test('the proof review says what concept/style proofs can and cannot show; non-crochet proof reviews are unchanged',()=>{
  const p={product_id:'016',name:'M',product_type:'crochet',season:'all',target_customer:'x',page_count:3,canvas:null,reference_files:[],
    pages:[1,2,3].map(n=>({page_number:n,title:`P${n}`,page_type:'cover'})),proofs:{selected_pages:[1,2,3].map(n=>({page_number:n,role:'main-style'}))}};
  const d={illustration_style:'s',line_weight:'l',line_quality:'q',detail_level:'d',palette:'p',colour_mode:'c',mood:'m'};
  const at=purpose=>({attempt:1,direction_version:1,...(purpose?{purpose}:{})});
  assert.match(proofSummary(p,d,at('concept-style')),/CONCEPT \/ STYLE PROOFS ONLY[\s\S]*do not show what a specific pattern makes, the final bouquet, or final species or counts/);
  assert.match(proofSummary(p,d,at('traceable-product')),/PRODUCT VISUALS made from the approved patterns and checked against them\. Rendered examples, not photographs\./);
  const plain=proofSummary(p,d,at(null));
  assert.doesNotMatch(plain,/CONCEPT \/ STYLE|PRODUCT VISUALS/);
});
