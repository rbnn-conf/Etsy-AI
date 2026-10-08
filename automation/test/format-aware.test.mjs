// Format-aware creative system: canvas, image size, neutral direction fields,
// general reference analysis and labelled variations. Offline only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasProblems, canvasPrompt, imageSizeFor, IMAGE_SIZES } from '../src/orchestrator/canvas.mjs';
import { buildImagePrompt } from '../src/openai/images.mjs';
import { loadPrompt } from '../src/openai/prompts.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { loadAutomationConfig, configProblems } from '../src/config.mjs';
import { harness, msg, photo, press, button, concept, bookDirection, previewCalls, proofCalls, PNG } from './helpers.mjs';

const WHITE_PAGE={orientation:'portrait',background:'white',edge:'safe-margin',format_notes:'Large simple shapes to colour.'};
const CARD_CANVAS=(orientation='landscape')=>({orientation,background:'illustrated',edge:'full-bleed',format_notes:'A finished card front with space for a short greeting.'});
const adultCardDirection=()=>({...bookDirection(),illustration_style:'painterly gouache winter landscape',line_weight:'no outlines',line_quality:'not applicable',
  character_language:'not applicable',palette:'deep forest green, cranberry and warm gold',colour_mode:'full colour',mood:'calm, elegant, festive',
  age_suitability:'adults',print_considerations:'full-bleed colour; trim after printing',
  shared_prompt:'Original painterly gouache Christmas artwork with soft brush texture, deep greens, cranberry and warm gold accents.'});
const productWith=({format,canvas,pages=1,type='greeting card'})=>({product_id:'001',name:'Test Product',canvas,
  concepts:{batches:[{batch:1,concepts:[concept('A',{product_format:format,product_type:type})]}],selected:{batch:1,concept_id:'A'}},
  pages:Array.from({length:pages},(_,i)=>({page_number:i+1,page_type:'card-front',title:`P${i+1}`,generation_prompt:`subject ${i+1}`}))});
const cardConcepts=(n=1,orientation='portrait')=>({concepts:['A','B','C'].map(id=>concept(id,{orientation,proposed_name:`Winter Card ${id}`,product_type:'christmas greeting card',product_format:'greeting-card',
  target_customer:'adults sending elegant Christmas cards',page_count:n,deliverable_components:['card front design','printing guide']}))});
const cardSpec=(n=1,orientation='landscape')=>({name:'Winter Pines Christmas Card',slug:'winter-pines-christmas-card',season:'Christmas',product_type:'christmas greeting card',
  target_customer:'adults',page_count:n,canvas:CARD_CANVAS(orientation),pages:Array.from({length:n},(_,i)=>({page_number:i+1,page_type:['card-front','card-inside'][i],
  title:['Winter Pines','Inside'][i],concept:'c',instructions:null,artwork_description:'snowy pines at dusk',generation_prompt:'snowy pine forest at dusk, "Merry Christmas" in elegant serif',production_notes:'check spelling'}))});

test('children\'s colouring book keeps printable white line-art behaviour',async()=>{
  const prompt=await buildImagePrompt({direction:bookDirection(),product:productWith({format:'colouring-book',canvas:WHITE_PAGE,type:'colouring book'}),page:{page_number:2,page_type:'colouring',generation_prompt:'a ghost'}});
  assert.match(prompt,/colour mode: black-and-white line art/);
  assert.match(prompt,/CANVAS: A single portrait design with a plain white background\. Keep a clear margin on every side/);
  assert.match(prompt,/colouring page: clean closed outlines on white/);
  assert.deepEqual(canvasProblems('colouring-book',WHITE_PAGE),[]);
  assert.deepEqual(canvasProblems('colouring-book',{...WHITE_PAGE,background:'coloured',edge:'full-bleed'}),
    ['$.canvas.background: colouring-book requires white, got coloured','$.canvas.edge: colouring-book requires safe-margin, got full-bleed']);
  assert.deepEqual(canvasProblems('planner',{...WHITE_PAGE,edge:'full-bleed'}),['$.canvas.edge: planner requires safe-margin, got full-bleed']);
});

test('adult Christmas greeting card: full-colour, full-bleed, no characters, adult audience',async()=>{
  const d=adultCardDirection(), schema=await loadSchema('creative-direction');
  assert.deepEqual(validate(schema,{...d,version:1,source:'concept',based_on_references:[],feedback_applied:null,created_at:new Date().toISOString()}),[]);
  assert.deepEqual(canvasProblems('greeting-card',CARD_CANVAS()),[]);
  const prompt=await buildImagePrompt({direction:d,product:productWith({format:'greeting-card',canvas:CARD_CANVAS()}),page:{page_number:1,page_type:'card-front',generation_prompt:'snowy pines'}});
  assert.match(prompt,/colour mode: full colour/);
  assert.match(prompt,/landscape design with an illustrated background/);
  assert.match(prompt,/runs to every edge \(full bleed\)/);
  assert.match(prompt,/retail-quality greeting card design, not a colouring page/);
  assert.doesNotMatch(prompt,/plain white background|clear margin on every side/);
  // "not applicable" fields are left out of the style parameters, not sent as nonsense.
  assert.doesNotMatch(prompt,/character language|line quality/);
  // Strict validation still holds: empty values are rejected.
  assert.match(validate(schema,{...d,character_language:'',version:1,source:'concept',based_on_references:[],feedback_applied:null,created_at:new Date().toISOString()}).join(),/character_language: shorter than 1/);
});

test('image size follows orientation with an explicit per-model table; unknown models are refused',()=>{
  assert.equal(imageSizeFor('gpt-image-1','portrait'),'1024x1536');
  assert.equal(imageSizeFor('gpt-image-1','landscape'),'1536x1024');
  assert.equal(imageSizeFor('gpt-image-1','square'),'1024x1024');
  assert.equal(imageSizeFor('dall-e-3','landscape'),'1792x1024');
  assert.throws(()=>imageSizeFor('mystery-model','portrait'),/No image size table/);
  assert.throws(()=>imageSizeFor('gpt-image-1','panorama'),/Unknown orientation/);
  for(const sizes of Object.values(IMAGE_SIZES)){
    const [pw,ph]=sizes.portrait.split('x').map(Number),[lw,lh]=sizes.landscape.split('x').map(Number),[sw,sh]=sizes.square.split('x').map(Number);
    assert.ok(ph>pw&&lw>lh&&sw===sh,'each size really has its orientation');
  }
  const base={AUTOMATION_TELEGRAM_BOT_TOKEN:'t',TELEGRAM_CHAT_ID:'1',OPENAI_API_KEY:'k',OPENAI_TEXT_MODEL:'m'};
  assert.deepEqual(configProblems(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'gpt-image-1',OPENAI_IMAGE_SIZE:'1024x1536'})),[],'legacy size var is ignored, not fatal');
  assert.ok(configProblems(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'mystery-model'})).some(p=>p.includes('no known size table')));
});

test('end to end: a landscape card is generated landscape, never with portrait assumptions',async()=>{
  const h=await harness({plan:{concepts:()=>cardConcepts(1,'landscape'),specification:()=>cardSpec(1,'landscape'),'creative-direction':()=>adultCardDirection()}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greeting card for adults'));await h.wf.handleUpdate(msg('/go'));
    const r=await h.wf.handleUpdate(press(button(h.telegram,'A')));
    assert.equal(r.outcome,'awaiting_creative_approval');
    assert.deepEqual(previewCalls(h.calls).map(c=>c.size),['1536x1024','1536x1024','1536x1024'],'previews landscape too');
    const images=proofCalls(h.calls);
    assert.deepEqual(images.map(c=>c.size),['1536x1024','1536x1024','1536x1024']);
    for(const c of images){assert.match(c.prompt,/A single landscape design/);assert.doesNotMatch(c.prompt,/portrait/);}
    const p=await h.store.load('001');
    assert.equal(p.canvas.orientation,'landscape');
    assert.deepEqual(p.proofs.attempts[0].images.map(i=>i.size),['1536x1024','1536x1024','1536x1024'],'size recorded per proof');
  }finally{await h.cleanup();}
});

test('end to end: a 1-page card gets 3 clearly labelled creative variations and page_count stays 1',async()=>{
  const h=await harness({plan:{concepts:()=>cardConcepts(1),specification:()=>cardSpec(1,'portrait'),'creative-direction':()=>adultCardDirection()}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greeting card for adults'));await h.wf.handleUpdate(msg('/go'));
    await h.wf.handleUpdate(press(button(h.telegram,'A')));
    const p=await h.store.load('001');
    assert.equal(p.page_count,1);assert.equal(p.pages.length,1);
    assert.deepEqual(p.proofs.selected_pages.map(s=>[s.page_number,s.role]),[[1,'primary'],[1,'composition-variation'],[1,'treatment-variation']]);
    const prompts=proofCalls(h.calls).map(c=>c.prompt);
    assert.doesNotMatch(prompts[0],/CREATIVE VARIATION/);
    assert.match(prompts[1],/CREATIVE VARIATION: an alternative composition of this same page, not an additional page/);
    assert.match(prompts[2],/CREATIVE VARIATION: an alternative treatment of this same page, not an additional page/);
    const album=h.telegram.sent.filter(s=>s.type==='album').at(-1).items.map(i=>i.caption);
    assert.deepEqual(album,['#001 proof 1/3 — Primary direction (page 1: Winter Pines)','#001 proof 2/3 — Composition variation (page 1: Winter Pines)',
      '#001 proof 3/3 — Treatment variation (page 1: Winter Pines)']);
    const summary=h.telegram.sent.filter(s=>s.type==='message').at(-1).text;
    assert.match(summary,/^PRODUCT #001 — CREATIVE PROOFS/);
    assert.match(summary,/Designed pages: 1\nCreative proofs: 3\nCanvas: portrait · illustrated background · full-bleed/);
    assert.match(summary,/Proof 1 — Primary direction \(page 1: Winter Pines\)\nProof 2 — Composition variation \(page 1: Winter Pines\)\nProof 3 — Treatment variation \(page 1: Winter Pines\)/);
    assert.match(summary,/1 designed page\. The extra proofs are alternative designs to choose between, not extra pages\./);
    assert.doesNotMatch(summary,/Designed pages: 3|3 pages/);
  }finally{await h.cleanup();}
});

test('a multi-page book still labels proofs as pages, with no variation wording',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));await h.wf.handleUpdate(photo('ref1'));await h.wf.handleUpdate(msg('/go'));
    await h.wf.handleUpdate(press(button(h.telegram,'B')));
    const summary=h.telegram.sent.filter(s=>s.type==='message').at(-1).text;
    assert.match(summary,/Designed pages: 12\nCreative proofs: 3/);
    assert.match(summary,/Proof 1 — Page 2: Page 2\nProof 2 — Page 3: Page 3\nProof 3 — Page 12: Page 12/);
    assert.doesNotMatch(summary,/variation|not extra pages/i);
    assert.ok(proofCalls(h.calls).every(c=>c.size==='1024x1536'&&!/CREATIVE VARIATION/.test(c.prompt)));
  }finally{await h.cleanup();}
});

test('specification: a colouring book cannot get a coloured full-bleed canvas',async()=>{
  const book={...cardSpec(12,'portrait'),name:'Snowy Colouring Book',product_type:'colouring book',canvas:{...WHITE_PAGE,background:'coloured'},
    pages:Array.from({length:12},(_,i)=>({...cardSpec(1).pages[0],page_type:'colouring',page_number:i+1}))};
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(id=>concept(id,{product_type:'colouring book',product_format:'colouring-book',page_count:12}))}),specification:()=>book}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas colouring book'));await h.wf.handleUpdate(msg('/go'));
    const r=await h.wf.handleUpdate(press(button(h.telegram,'A')));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'specification');
    assert.match((await h.store.load('001')).last_error.message,/canvas\.background: colouring-book requires white, got coloured/);
    assert.equal(proofCalls(h.calls).length,0,'no proof spend on an invalid spec');
  }finally{await h.cleanup();}
});

test('reference analysis does not require a children\'s-product interpretation',async()=>{
  const prompt=await loadPrompt('reference-analysis');
  assert.doesNotMatch(prompt,/young children|\(activity books, colouring books, planners\)/);
  assert.match(prompt,/Do not assume what kind of product or audience the references are/);
  assert.match(prompt,/typography behaviour/);assert.match(prompt,/orientation and layout/);assert.match(prompt,/background treatment/);
  const schema=await loadSchema('reference-analysis');
  assert.ok(!('age_suitability' in schema.properties),'no age field');
  for(const k of ['apparent_audience','typography','orientation_layout'])assert.ok(schema.required.includes(k),k);
  const adult={reference_summaries:[{reference_file:'references/reference-01.jpg',summary:'botanical watercolour card'}],
    ...Object.fromEntries(schema.required.filter(k=>!['reference_summaries','do_not_copy','analysed_at','model','reference_files'].includes(k)).map(k=>[k,'watercolour value'])),
    character_proportions:'not applicable',facial_simplicity:'not applicable',apparent_audience:'adults',typography:'no visible text',
    do_not_copy:[{element:'the shop logo',reason:'brand asset'}],analysed_at:new Date().toISOString(),model:'m',reference_files:['references/reference-01.jpg']};
  assert.deepEqual(validate(schema,adult),[]);
});

test('Product #009-shaped data stays valid: no canvas before the specification, old direction fields still render',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(photo('ref1'));
    const p=await h.store.load('001');
    assert.ok(!('canvas' in p));
    await h.store.save({...p});   // saving a pre-spec product.json without canvas is still valid
    const schema=await loadSchema('product');
    assert.match(validate(schema,{...p,canvas:{orientation:'diagonal',background:'white',edge:'safe-margin',format_notes:'x'}}).join(),/canvas\.orientation: must be one of/);
  }finally{await h.cleanup();}
  assert.match(canvasPrompt(CARD_CANVAS('square'),undefined),/A single square design/,'concepts without a format get no format hint but still a canvas');
});
