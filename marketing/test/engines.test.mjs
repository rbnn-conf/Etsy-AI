// Stage 3 marketing engines: deterministic core (no model, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES, ENGINE_VERSION, engineOf, normaliseDirection, defaultDirection, layoutFor, engineMinShare, composeEngineSlide, productLikeShapes, engineQc,
  usesEnvironment, composeSlide, planSlides, productShare, CANVAS } from '../src/stage3/index.mjs';
import { sharp } from '../../production/src/lib.mjs';

const slide=(template,extra={})=>({id:`01-${template}`,template,min_product_share:{hero:.4,design:.45,gift:.2,print:.18,inside:.18}[template]??.1,copy:{headline:{text:'Printable Christmas\nCards'}},...extra});

test('registry: Factory, Hybrid (recommended, never default) and AI Creative; unknown engines refused',()=>{
  assert.deepEqual(Object.keys(ENGINES),['factory','hybrid','ai-creative']);
  assert.equal(ENGINES.hybrid.recommended,true);assert.equal(ENGINES.factory.ai_direction,false);
  assert.throws(()=>engineOf('dalle-freestyle'),/Unknown marketing engine/);
  assert.ok(ENGINES['ai-creative'].archetypes.length>ENGINES.hybrid.archetypes.length,'AI Creative has wider layout control');
  assert.ok(ENGINES['ai-creative'].scale[1]>ENGINES.hybrid.scale[1]&&ENGINES['ai-creative'].rotation>ENGINES.hybrid.rotation);
  assert.equal(ENGINE_VERSION,1);
});

test('art direction is validated and CLAMPED to the engine: unknown archetypes, huge angles and tiny products never pass through',()=>{
  const s=slide('hero');
  const wild={archetype:'poster-with-fake-card',product_scale:0.05,rotation:45,perspective:-40,lighting:'neon',decor:'fireworks',scene_brief:'  a tabletop  '};
  const h=normaliseDirection(wild,s,'hybrid');
  assert.deepEqual([h.archetype,h.product_scale,h.rotation,h.perspective,h.lighting,h.decor,h.scene_brief,h.source],['editorial-right',0.45,3,-3,'warm window light from the left','none','a tabletop','model']);
  const a=normaliseDirection({...wild,archetype:'diagonal',product_scale:0.99,decor:'sprigs'},s,'ai-creative');
  assert.deepEqual([a.archetype,a.product_scale,a.rotation,a.perspective,a.decor],['diagonal',0.7,8,-8,'sprigs']);
  assert.equal(normaliseDirection({archetype:'diagonal'},s,'hybrid').archetype,'editorial-right','hybrid cannot use AI Creative archetypes');
  assert.equal(normaliseDirection(wild,s,'factory').source,'factory','factory ignores model direction');
  assert.equal(defaultDirection(s,'hybrid').source,'default');
});

test('geometry: the region is the REAL artwork box at its own ratio, meets the engine floor, stays on canvas and clear of the copy — portrait, 5x7, square, landscape',()=>{
  for(const engine of ['hybrid','ai-creative'])for(const template of ['hero','design','gift','print','inside'])for(const aspect of [2/3,5/7,1,1.414]){
    const s=slide(template), min=engineMinShare(s,engine);
    for(const d of [defaultDirection(s,engine),normaliseDirection({archetype:'centre-stage',product_scale:0.45,rotation:ENGINES[engine].rotation},s,engine),
      ...(engine==='ai-creative'?[normaliseDirection({archetype:'diagonal',product_scale:0.7,rotation:-8},s,engine),normaliseDirection({archetype:'close-up',product_scale:0.7},s,engine)]:[])]){
      const L=layoutFor(d,{aspect,minShare:min}), r=L.region, b=L.bounds, tag=`${engine} ${template} ${aspect.toFixed(2)} ${d.archetype}`;
      assert.ok(Math.abs(r.w/r.h-aspect)<1e-9,`${tag}: aspect kept`);
      assert.ok(L.share>=min-1e-9,`${tag}: ${L.share.toFixed(3)} >= ${min}`);
      assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=CANVAS+1e-6&&b.y+b.h<=CANVAS+1e-6,`${tag}: rotated bounds on canvas`);
      if(L.zone==='left')assert.ok(L.text.x+L.text.w<=b.x-40,`${tag}: copy clear of product`);
      if(L.zone==='right')assert.ok(L.text.x>=b.x+b.w+40,`${tag}: copy clear of product`);
      assert.ok(L.text.w>=400,`${tag}: a readable text column (${L.text.w|0})`);
    }
  }
  // Floors: engines are stricter than Factory for the same template, never looser.
  for(const t of ['hero','design','gift','print','inside'])assert.ok(engineMinShare(slide(t),'hybrid')>=slide(t).min_product_share);
  assert.equal(engineMinShare(slide('hero'),'factory'),0.4);assert.equal(engineMinShare(slide('hero'),'hybrid'),0.45);
});

// Minimal facts + art (as prepareArt returns): data: URIs, real-looking aspect ratios.
const px=`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
const A={fronts:{A:{sha256:'a'.repeat(64),uri:px,width:1024,height:1536,alt:'front A'},B:{sha256:'b'.repeat(64),uri:px,width:1024,height:1536,alt:'front B'}},
  insides:[{sha256:'c'.repeat(64),uri:px,width:1024,height:1536}],sheets:{'A outside':{sha256:'d'.repeat(64),uri:px,width:1754,height:1241}},letter:null,panels:{},guide:null};
const FACTS={product_name:'Robin',product_type:'Christmas greetings card',season:'Christmas',designs:[{id:'A',name:'Merry Christmas'},{id:'B',name:'Christmas Wishes'}],
  insides:[{text:['Hi'],shared_by:['A','B']}],formats:[{key:'A4',label:'A4'},{key:'US-Letter',label:'US Letter'}],original_artwork_files:3,printing_guide:true};

test('compositor: engine slides show ONLY real Stage 2 artwork (by SHA-256), whole, with code-rendered, claim-tagged text; info slides keep the Factory layout',()=>{
  const plan=planSlides(FACTS,{maxScenes:0});
  for(const engine of ['hybrid','ai-creative'])for(const s of plan.slides){
    const r=composeEngineSlide(s,{facts:FACTS,art:A,sceneUri:px,direction:defaultDirection(s,engine),engine});
    const shas=[...r.bodyHtml.matchAll(/data-art="([a-f0-9]{64})"/g)].map(m=>m[1]);
    assert.ok(shas.length>0,`${engine} ${s.id}: real artwork shown`);
    assert.ok(shas.every(x=>[...Object.values(A.fronts),...A.insides,...Object.values(A.sheets)].some(a=>a.sha256===x)),`${engine} ${s.id}: only Stage 2 artwork`);
    assert.match(r.bodyHtml,/data-role="headline"/,`${s.id}: headline rendered by code`);
    if(usesEnvironment(s)){
      assert.ok(r.layout&&r.layout.min_share>=s.min_product_share,`${s.id}: layout recorded`);
      assert.match(r.bodyHtml,/class="lx-bg"/,'AI environment is the background only');
      const lead=r.bodyHtml.match(/class="lx-obj" style="left:[^;]+;top:[^;]+;width:([\d.]+)px;height:([\d.]+)px[^"]*z-index:12/);
      assert.ok(lead,`${s.id}: lead artwork placed`);
    }else{
      assert.equal(r.layout,null);assert.equal(r.bodyHtml,composeSlide(s,{facts:FACTS,art:A,sceneUri:px}).bodyHtml,`${s.id}: Factory composition reused`);
    }
  }
  // Factory engine = the existing compositions, byte for byte.
  for(const s of plan.slides)assert.equal(composeEngineSlide(s,{facts:FACTS,art:A,sceneUri:null,engine:'factory'}).bodyHtml,composeSlide(s,{facts:FACTS,art:A,sceneUri:null}).bodyHtml);
  // Headline text in the HTML is the plan's art-directed copy (never model-written).
  const hero=plan.slides[0], html=composeEngineSlide(hero,{facts:FACTS,art:A,sceneUri:px,engine:'hybrid'}).bodyHtml;
  assert.ok(html.includes(hero.copy.headline.text.split('\n').join('<br>')));
});

test('product truth: flat bright paper-like rectangles in an AI environment are detected outside the product region, and ignored inside it',async()=>{
  const dark={create:{width:1000,height:1000,channels:3,background:'#3b2a20'}};
  const withCard=await sharp(dark).composite([{input:await sharp({create:{width:260,height:380,channels:3,background:'#f4efe6'}}).png().toBuffer(),left:80,top:300}]).png().toBuffer();
  const found=await productLikeShapes(withCard);
  assert.equal(found.length,1);assert.ok(found[0].x<300&&found[0].w>400,'a fake card on the left (canvas px)');
  assert.deepEqual(await productLikeShapes(withCard,{x:100,y:500,w:700,h:900}),[],'inside the real product region it is covered, not flagged');
  assert.deepEqual(await productLikeShapes(await sharp(dark).png().toBuffer()),[],'a plain environment is clean');
  // Soft, textured light (bokeh, window glow) is not a rectangle.
  const noisy=Buffer.alloc(100*100*3);for(let i=0;i<noisy.length;i++)noisy[i]=200+((i*7919)%55);
  assert.deepEqual(await productLikeShapes(await sharp(noisy,{raw:{width:100,height:100,channels:3}}).png().toBuffer()),[]);
});

test('engine QC: region must hold the real artwork, visibility floor per engine slide, engine recorded; warnings for fake-product shapes and fallbacks',()=>{
  const plan={engine:{id:'hybrid',version:ENGINE_VERSION},slides:[{id:'01-hero',template:'hero'},{id:'02-inside',template:'inside'}]};
  const good={slide:'01-hero',width:2000,layout:{archetype:'editorial-right',fallback_from:null,region:{x:800,y:160,w:1100,h:1650},min_share:.45},artwork:[{rect:{x:790,y:150,w:1120,h:1670}}]};
  const r=engineQc({plan,renderResults:[good],productShare});
  assert.ok(r.checks.every(c=>c.ok),JSON.stringify(r.checks));
  const moved={...good,artwork:[{rect:{x:100,y:150,w:600,h:900}}]};
  const bad=engineQc({plan,renderResults:[moved],productShare,shapes:{'01-hero':[{x:0,y:0,w:400,h:500}]}});
  assert.equal(bad.checks.find(c=>c.name==='product region covered by real Stage 2 artwork').ok,false);
  assert.equal(bad.checks.find(c=>c.name==='engine product visibility floor').ok,false);
  assert.match(bad.warnings.join('\n'),/flat paper-like shape\(s\) outside the product region/);
  assert.equal(engineQc({plan:{...plan,engine:{id:'nope',version:1}},renderResults:[],productShare}).checks[0].ok,false);
});
