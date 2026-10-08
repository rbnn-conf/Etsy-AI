// Stage 3 adapter: crochet pattern bundle (ADR-041). Consumes the approved
// Stage 2 package (handoff with the approved pattern source, build record with
// its stage3_handoff, QC report) and never creates or modifies it: every file
// is only read and SHA-verified. Marketing integrity (crochet-integrity.mjs) is
// enforced through the shared claim checks (claims.mjs) and the model rules.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Stage3Error } from '../errors.mjs';
import { sha, exists, readJson, verifyPackage, verifyPreviews } from '../shared.mjs';
import { planSlides, composeSlide as compose, crochetCampaign, heroBenefits } from '../crochet.mjs';
import { crochetModelRules } from '../crochet-integrity.mjs';
import { crochetMarketingDirection } from '../crochet-visual-direction.mjs';
import { fromPng, fromPdf } from '../art.mjs';
import { deriveStrategy } from '../strategy.mjs';
import { planCreative, crochetCreativeDirection, collectionNoun } from '../crochet.mjs';
import { sharp } from '../../../../production/src/lib.mjs';
import { MOONLIT_MEADOW } from '../../../../production/src/crochet/moonlit/theme.mjs';

const LABEL={'A4':'A4','US-Letter':'US Letter'};
const LEVEL={beginner:'Beginner',easy:'Easy',intermediate:'Intermediate',experienced:'Experienced'};
const pad=n=>String(n).padStart(2,'0');
const spread=(list,k)=>{const n=list.length;if(!n)return [];if(k>=n)return [...list];return [...new Set(Array.from({length:k},(_,i)=>list[Math.round(i*(n-1)/Math.max(1,k-1))]))];};
// The buyer's own making is the product's purpose: these process words describe what the BUYER makes, never the files.
const PROCESS_CLAIMS=['handmade','handcrafted','made by hand'];
// ADR-058: the approved renders marketing may show, each with the checked visual spec it was made from
// (ADR-046/047). Stage 1 proofs carry their lettering in a top band; text_free is the region below it
// (the same display crops as the Moonlit documents, ADR-056). A render is only ever shown through a crop
// inside text_free, so its baked-in lettering never reaches a listing image.
const RENDER_ROLES=[['bouquet','cover','hero'],['overview','overview','overview'],['detail','detail','detail']];
const SHOWABLE=['internally_checked','physically_verified'];
export async function approvedRenders(productDir,handoff,patternIds){
  const v=handoff.crochet?.visuals, L=handoff.crochet_layout;
  if(!v?.specs||!L)return [];
  const assetOf={cover:L.hero,overview:L.overview,detail:handoff.pages?.find(p=>/detail/i.test(p.page_type??''))?.asset??null}, out=[];
  for(const [role,spec,crop] of RENDER_ROLES){
    const s=v.specs[spec], id=assetOf[spec];
    if(!s?.items?.length||!SHOWABLE.includes(s.status)||!id||!(L.used??[]).includes(id))continue;
    const a=handoff.assets.find(x=>x.id===id);
    if(!a||!await exists(join(productDir,a.file))||sha(await readFile(join(productDir,a.file)))!==a.sha256)
      throw new Stage3Error(`The approved ${role} render (${id}) is missing or changed since production approval.`);
    const unknown=s.items.filter(i=>!patternIds.includes(i.pattern_id)).map(i=>i.pattern_id);
    if(unknown.length)throw new Stage3Error(`The ${role} render's visual spec names patterns that are not approved: ${unknown.join(', ')}.`);
    const c=MOONLIT_MEADOW.crops?.[crop]??{y:0};
    out.push({role,asset:id,file:a.file,sha256:a.sha256,width:a.width,height:a.height,kind:'illustration',photographic_evidence:false,
      depicts:s.items.map(i=>({pattern_id:i.pattern_id,pattern_name:v.fingerprints?.[i.pattern_id]?.pattern_name??i.pattern_id,quantity:i.quantity})),
      text_free:{x:0,y:c.y,w:1,h:+(1-c.y).toFixed(4)}});
  }
  return out;
}

async function facts({productDir,product,prod,handoff,record,files}){
  const qc=await readJson(join(productDir,prod.qc.report));
  if(!qc.passed)throw new Stage3Error('Stage 2 QC report does not pass.');
  await verifyPackage(productDir,record);
  const s3=record.stage3_handoff, b=handoff.crochet?.bundle;
  if(!s3||s3.product_format!=='crochet-pattern-bundle'||!b)throw new Stage3Error('The Stage 2 records have no crochet pattern metadata (stage3_handoff / approved pattern source).');
  if(s3.pattern_count!==b.patterns.length||handoff.approved?.patterns?.pattern_count!==b.patterns.length)
    throw new Stage3Error(`Stage 2 records disagree on the pattern count: stage3_handoff ${s3.pattern_count}, source ${b.patterns.length}, approval ${handoff.approved?.patterns?.pattern_count}.`);
  const outputs=Object.entries(record.outputs), doc=(role,paper='A4')=>{const [rel,o]=outputs.find(([,x])=>x.expect.role===role&&(paper===null||x.variant===paper))??[];
    return rel?{file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256,pages:o.expect.pages}:null;};
  const list=b.patterns.map((p,i)=>{const [rel,o]=outputs.find(([,x])=>x.expect.role==='pattern-pdf'&&x.variant==='A4-Individual-Patterns'&&x.expect.patterns[0]===p.pattern_id)??[];
    if(!rel)throw new Stage3Error(`Stage 2 has no A4 PDF for pattern ${p.pattern_id}.`);
    return {pattern_id:p.pattern_id,number:i+1,name:p.name,category:p.category,level:LEVEL[p.difficulty],file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256};});
  const documents={bundle:doc('bundle-pdf'),index:doc('pattern-index'),materials:doc('materials-reference'),abbreviations:doc('abbreviations-reference'),guide:doc('guide',null)};
  for(const [k,v] of Object.entries(documents))if(!v)throw new Stage3Error(`Stage 2 has no ${k} document to show in marketing.`);
  const ids=list.map(p=>p.pattern_id), collage=spread(ids,Math.min(6,ids.length));
  const heroAsset=handoff.assets.find(a=>a.id===handoff.crochet_layout.hero);
  if(!heroAsset||!await exists(join(productDir,heroAsset.file))||sha(await readFile(join(productDir,heroAsset.file)))!==heroAsset.sha256)
    throw new Stage3Error('The approved cover illustration is missing or changed since production approval.');
  const levels=b.skill_level.map(l=>LEVEL[l]);
  const renders=await approvedRenders(productDir,handoff,ids);
  const single=renders.find(r=>r.role==='detail'&&r.depicts.length===1)?.depicts[0].pattern_id??null;
  const formats=['A4','US-Letter'].filter(k=>outputs.some(([,o])=>o.variant===k)).map(k=>({key:k,label:LABEL[k],files:outputs.filter(([,o])=>o.variant===k||o.variant===`${k}-Individual-Patterns`).length}));
  const zips=record.zip?[record.zip]:record.zip_parts;
  const concept=product.concepts?.batches?.find(x=>x.batch===product.concepts.selected?.batch)?.concepts.find(c=>c.concept_id===product.concepts.selected.concept_id);
  const direction=product.visual_direction?.file&&await exists(join(productDir,product.visual_direction.file))?await readJson(join(productDir,product.visual_direction.file)):null;
  const f={schema_version:1,product_id:product.product_id,product_name:product.name,product_type:product.product_type,product_format:handoff.product_format,
    season:product.season??null,target_customer:product.target_customer??null,theme:b.theme,
    patterns:{count:b.patterns.length,list,categories:[...new Set(b.patterns.map(p=>p.category))]},
    terminology:b.terminology,skill_levels:levels,skill_text:levels.length>1?`${levels[0]} to ${levels.at(-1)}`:levels[0],
    combinations:b.combinations?.items?.length?`${b.combinations.title}: ${b.combinations.items.length} combination idea${b.combinations.items.length>1?'s':''}`:null,
    documents,formats,printing_guide:true,individual_pattern_pdfs:true,
    selection:{inside:collage[0],collage,detail:single,feature:collage.find(id=>id!==single&&id!==collage[0])??collage[0]},
    renders,
    // Every pattern gives stitch counts somewhere in its instructions (a feature claim only when all do).
    stitch_counts:b.patterns.every(p=>p.instructions.some(s=>s.steps.some(t=>t.stitch_count!=null))),
    illustration:{asset:heroAsset.id,file:heroAsset.file,sha256:heroAsset.sha256,width:heroAsset.width,height:heroAsset.height},
    // Marketing integrity (crochet-integrity.mjs reads these three).
    integrity:s3.integrity,artwork:s3.artwork,deliverables:s3.deliverables,
    // ADR-047: approved pattern facts and the checked visuals (null for packages built before the visual gate).
    visuals:s3.visuals??null,
    process_claims:PROCESS_CLAIMS,
    // "N pages" = the complete A4 collection's pages; "N designs" = the pattern count; "N patterns" is checked separately.
    page_quantity:{total_pages:documents.bundle.pages,content_pages:b.patterns.length,content:'pattern'},
    item_quantity:{count:b.patterns.length,noun:'pattern'},
    digital_download:true,physical_item:false,editable:false,
    package:{name:record.package,parts:zips.length,zip_mb:+(zips.reduce((s,z)=>s+z.bytes,0)/1e6).toFixed(1)},
    previews:await verifyPreviews(productDir,qc),
    style:{subject:concept?.visual_route?.primary_subject??null,palette:direction?.palette??null,mood:direction?.mood??product.visual_direction?.summary?.mood??null},
    sources:{handoff:prod.handoff,build_record:files.build,qc_report:{file:prod.qc.report,sha256:sha(await readFile(join(productDir,prod.qc.report)))}}};
  return f;
}

function claimIndex(f){
  const N=f.patterns.count, both=f.formats.length===2, noun=collectionNoun(f);
  return {
    'product-title':[f.product_name],
    'pattern-count':[`${N} crochet patterns`,`${N} patterns`,`${N} crochet patterns in one collection`,String(N),...(noun?[`${N} crochet ${noun} patterns`]:[])],
    'pattern-number':f.patterns.list.map(p=>`Pattern ${pad(p.number)} of ${N}`),
    'pattern-name':f.patterns.list.map(p=>p.name),
    'skill':[...new Set([...f.skill_levels,f.skill_text])],
    'terms':[`${f.terminology} crochet terms`],
    'format':[...f.formats.map(x=>x.label),...(both?['A4 + US Letter','A4 and US Letter','A4 + US Letter PDFs']:[]),'PDF','PDF patterns'],
    'digital':['Digital download','Instant digital download','No physical item is shipped','No physical item will be shipped','Print at home','Instant access after purchase','Instant download','Digital PDF pattern download'],
    // ADR-058: an approved render is always an illustration (never a photograph of a made item).
    'render':['Illustrated example','Illustration','Illustrations, not photos','Rendered example of the finished crochet design'],
    'delivery':['No yarn or hook included','No yarn, hook or kit included'],
    'features':['Skill level on every pattern','Materials listed for every pattern',...(f.stitch_counts?['Stitch counts']:[])],
    'printing-guide':['Printing guide','Printing guide included'],
    'included':['Complete pattern collection PDF'],
    'individual':['Each pattern as its own PDF','Individual pattern PDFs'],
    'references':['Materials and abbreviations reference','Materials and tools reference','Abbreviations reference'],
    'pattern-index':['Pattern index'],
    'process':['Download','Print','Crochet','Print at home'],
    ...(f.deliverables.step_by_step_instructions?{instructions:['Step-by-step instructions','Written step-by-step instructions']}:{}),
    ...(f.combinations?{combinations:[f.combinations]}:{})};
}

/** What the model may know: production facts only (no file paths or hashes). */
function modelFacts(f){
  const i=f.integrity;
  return {product_name:f.product_name,product_type:f.product_type,target_customer:f.target_customer,theme:f.theme,
    product_quantity:{note:'AUTHORITATIVE. The only source for any number in the listing.',crochet_patterns:f.patterns.count,pages_in_complete_collection_pdf:f.page_quantity.total_pages},
    patterns:f.patterns.list.map(p=>({number:p.number,name:p.name,category:p.category,level:p.level})),
    categories:f.patterns.categories,skill_levels:f.skill_levels,crochet_terminology:f.terminology,
    what_you_receive:{complete_collection_pdf:true,each_pattern_as_its_own_pdf:true,pattern_index:true,materials_and_tools_reference:true,abbreviations_reference:true,
      printing_and_crochet_guide:true,paper_sizes:f.formats.map(x=>x.label),step_by_step_written_instructions:f.deliverables.step_by_step_instructions,combination_ideas:f.combinations},
    delivery:`Instant digital download (${f.package.parts>1?`${f.package.parts} ZIP files`:'a ZIP file'} of PDF files). No physical item is shipped. No yarn, hook or kit.`,
    editable:false,
    verification:{all_patterns_tested:i.all_tested,tested_patterns:i.verification.tested,note:i.all_tested?'Every pattern has testing evidence.':'The patterns are NOT tested. Owner approval for production is not testing.'},
    images:'The product images show the real pattern pages and the approved cover artwork, whose crochet pieces are a rendered visualisation of what can be made from the patterns. It is never a photograph of an item crocheted from these patterns, and nothing physical is shipped.',
    product_name_note:'product_name is the internal collection name: use it in the description if you like, never in the title.',
    presentation_note:'Introduce a few highlight patterns by name; do not list all of them.',
    style:{mood:f.style.mood},
    ...(f.visuals?{
      pattern_facts:{note:'AUTHORITATIVE, from the approved written patterns (the source of truth). A null number or "not stated" means the pattern does not establish it: never state, estimate or imply a value for it. Never describe a feature that is not listed.',
        patterns:f.visuals.pattern_facts},
      pictured:{note:'The hero artwork is a rendered example made ONLY of these approved patterns, in these quantities (checked against the patterns). Branding ornaments (moons, botanical sprigs) are decoration, never part of the product.',
        combination:f.visuals.pictured.combination,items:f.visuals.pictured.items},
      visual_match_status:{value:f.visuals.visual_match_status,note:f.visuals.physically_verified?'A person crocheted these patterns and confirmed the result.':'Checked against the written patterns only. NOT physically verified: nobody has crocheted these pieces for this record.'}}:{})};
}

function modelRules(f){
  return [...crochetModelRules(f),...crochetMarketingDirection(),
    `State the quantity as "${f.patterns.count} crochet patterns" (base patterns). Never inflate it with colour, size or arrangement variations, and never invent bonus or extra patterns.`,
    'Never say the patterns are handmade: the BUYER makes handmade pieces from them.',
    ...(f.visuals?['PATTERN DATA (pattern_facts) is the source of truth; the CHECKED VISUAL (pictured) is the only allowed representation of it; BRANDING is decoration only, never a product feature.',
      'State a petal, layer or leaf count, a size, a stem, wire or any embellishment only when pattern_facts gives it for that pattern. Never write e.g. "18-petal rose" unless pattern_facts says 18 petals.',
      f.visuals.physically_verified?'The pieces were physically verified by a person; still never say "exactly as pictured".':'Never say physically verified, tested, photographed, a finished sample, or exactly as pictured.']:[])];
}

/** No flowers and no crocheted or knitted item may appear in an AI environment (never a "photo of a finished piece"). */
function sceneExclusions(){
  return ['flowers of any kind','bouquets','crocheted or knitted items','amigurumi','finished handmade objects','anything made of yarn except plain skeins',
    'patterns','charts','printed pages','paper','books','notebooks','screens','text','letters','numbers','words','logos','watermarks','people','hands','animals'];
}

async function prepareArt(facts,productDir,workDir){
  await mkdir(workDir,{recursive:true});
  const d=facts.documents, pages={};
  const cover=await fromPdf(productDir,workDir,d.bundle.file,d.bundle.sha256,1,'Complete collection cover (A4)','doc-cover');
  const index=await fromPdf(productDir,workDir,d.index.file,d.index.sha256,1,'Pattern index (A4)','doc-index');
  const materials=await fromPdf(productDir,workDir,d.materials.file,d.materials.sha256,1,'Materials and tools reference (A4)','doc-materials');
  const abbreviations=await fromPdf(productDir,workDir,d.abbreviations.file,d.abbreviations.sha256,1,'Abbreviations reference (A4)','doc-abbreviations');
  const guide=await fromPdf(productDir,workDir,d.guide.file,d.guide.sha256,1,'Printing and crochet guide','doc-guide',100);
  for(const id of new Set([facts.selection.inside,...facts.selection.collage,facts.selection.detail,facts.selection.feature].filter(Boolean))){
    const p=facts.patterns.list.find(x=>x.pattern_id===id);
    pages[id]=await fromPdf(productDir,workDir,p.file,p.sha256,1,`Pattern ${pad(p.number)}: ${p.name} (A4)`,`pattern-${pad(p.number)}`);
  }
  const illustration=await fromPng(productDir,facts.illustration.file,facts.illustration.sha256,'Approved cover illustration (illustration, not a photograph)','illustration');
  // ADR-058: the approved renders, each with the approved pattern IDs it depicts and its lettering-free region.
  const renders={};
  for(const r of facts.renders??[]){
    const a=await fromPng(productDir,r.file,r.sha256,`Approved ${r.role} render (illustration, not a photograph)`,`render-${r.role}`);
    renders[r.role]={...a,role:r.role,depicts:r.depicts,text_free:r.text_free,ground:await groundOf(a,r.text_free)};
  }
  const all=[cover,index,materials,abbreviations,guide,...Object.values(pages),illustration,...Object.values(renders)];
  const manifest=all.map(({uri,...rest})=>rest);
  await writeFile(join(workDir,'art-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {cover,index,materials,abbreviations,guide,pages,illustration,renders,lead:cover,manifest};
}
/** The render's own background colour (mean of the plain strip right below its lettering), for a seamless full-bleed ground. */
async function groundOf(a,tf){
  const W=a.width,H=a.height, box={left:Math.round(W*0.3),top:Math.round(H*(tf.y+0.002)),width:Math.round(W*0.4),height:Math.max(4,Math.round(H*0.008))};
  // stats() reads the whole input, so the patch is extracted to its own image first.
  const st=await sharp(await sharp(Buffer.from(a.uri.split(',')[1],'base64')).extract(box).png().toBuffer()).stats();
  return '#'+st.channels.slice(0,3).map(c=>Math.round(c.mean).toString(16).padStart(2,'0')).join('');
}

// ---------- creative direction (ADR-058) ----------
/**
 * The assets a creative direction may use, by id: the approved renders (illustrations
 * with baked lettering above text_free, each tied to approved pattern IDs), the real
 * customer documents and the real pattern pages. Nothing else can be placed.
 */
function creativeCatalogue(facts,A){
  const c={}, doc=(id,a,shows)=>{if(a)c[id]={art:a,kind:'document',shows};};
  for(const [role,a] of Object.entries(A.renders??{}))c[`render-${role}`]={art:a,kind:'render',baked_text:true,text_free:a.text_free,depicts:a.depicts,
    shows:`Approved ${role} render (illustration, not a photograph) of ${a.depicts.map(d=>`${d.quantity} × ${d.pattern_name}`).join(', ')}`};
  doc('doc-cover',A.cover,'Complete collection PDF, cover page');
  doc('doc-index',A.index,'Pattern index PDF, first page');
  doc('doc-materials',A.materials,'Materials and tools reference PDF, first page');
  doc('doc-abbreviations',A.abbreviations,'Abbreviations reference PDF, first page');
  doc('doc-guide',A.guide,'Printing and crochet guide, first page');
  for(const [id,a] of Object.entries(A.pages??{})){const p=facts.patterns.list.find(x=>x.pattern_id===id);c[`page-${id}`]={art:a,kind:'page',pattern_id:id,shows:`Pattern ${pad(p.number)} ${p.name}, first page of its PDF`};}
  return c;
}

// ---------- engine hooks (Hybrid, AI Creative) ----------
function slideArtwork(slide,facts,A){
  if(slide.template==='hero')return [A.cover,A.pages[facts.selection.inside]].filter(Boolean);
  if(slide.template==='interior')return [A.pages[slide.pattern]];
  return [A.cover];
}
const composeSlide=(slide,ctx)=>compose(slide,{...ctx,campaign:crochetCampaign(ctx.facts,deriveStrategy(ctx.facts))});

// The canonical Etsy category (ADR-059): code sets listing.category_suggestion to it. Stage 4 resolves the FORMAT to its fixed
// owner-approved taxonomy ID (automation/config/etsy-taxonomy-map.json format_mappings; a test keeps the two paths equal).
export const CROCHET_PATTERN_CATEGORY='Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints';
export const crochetPatternBundle=Object.freeze({format:'crochet-pattern-bundle',version:1,etsyCategory:CROCHET_PATTERN_CATEGORY,
  facts,claimIndex,planSlides,composeSlide,prepareArt,modelFacts,modelRules,sceneExclusions,campaign:crochetCampaign,
  // ADR-058: the niche's creative direction (every engine prompt) and the creative plan (Hybrid / AI Creative).
  creativeDirection:crochetCreativeDirection,
  creative:{plan:planCreative,catalogue:creativeCatalogue},
  engines:{regionTemplates:['hero','interior','lifestyle'],minShare:{hero:0.45,interior:0.45,lifestyle:0.35},decor:['none','bokeh'],
    slideArtwork,heroBenefits,representative:(facts,A)=>A.cover}});
