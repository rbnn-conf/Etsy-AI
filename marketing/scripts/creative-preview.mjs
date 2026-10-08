// Deterministic preview of a product's CREATIVE campaign (ADR-058) from the
// code baseline plan: no model call, no image generation, no network. Reads the
// approved Stage 2 package and writes ONLY to the output folder (the product's
// marketing/ folder is never touched). A card whose direction asks for an AI
// environment is shown on a labelled coded placeholder scene.
//
//   node marketing/scripts/creative-preview.mjs <productDir> <outDir>
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deriveFacts, deriveStrategy, adapterOf, prepareArt, renderSlides, runStage3Qc, engineQc, productShare, normaliseCreative, ENGINE_VERSION } from '../src/stage3/index.mjs';

const [productDir,outDir]=process.argv.slice(2).map(p=>p&&resolve(p));
if(!productDir||!outDir){console.error('usage: creative-preview.mjs <productDir> <outDir>');process.exit(2);}
if(resolve(outDir).startsWith(resolve(productDir))){console.error('The output folder must be outside the product folder.');process.exit(2);}
await mkdir(outDir,{recursive:true});

const facts=await deriveFacts(productDir), ad=adapterOf(facts);
if(!ad.creative)throw new Error(`${facts.product_format} has no creative plan yet.`);
const skeleton=ad.creative.plan(facts,{strategy:deriveStrategy(facts)});
const art=await prepareArt(facts,productDir,join(outDir,'work'));
const catalogue=ad.creative.catalogue(facts,art);
const directions=Object.fromEntries(skeleton.slides.map(s=>[s.id,normaliseCreative(null,s,{catalogue,facts})]));
const plan={...skeleton,engine:{id:'ai-creative',version:ENGINE_VERSION},directions,preview:{deterministic:true,model_calls:0,image_calls:0}};
await writeFile(join(outDir,'plan.json'),JSON.stringify(plan,null,2)+'\n');

const results=await renderSlides({facts,plan,art,outDir:join(outDir,'images'),engine:'ai-creative',directions});
const listing=JSON.parse(await readFile(join(productDir,'marketing','listing.json'),'utf8'));
const qc=await runStage3Qc({productDir,facts,plan,listing,renderResults:results,artManifest:art.manifest});
const e=engineQc({plan,renderResults:results,productShare,facts});
const checks=[...qc.checks,...e.checks];
const report={passed:checks.every(c=>c.ok),checks,warnings:e.warnings,
  cards:results.map((r,i)=>({id:r.slide,composition:r.layout?.composition,background:r.layout?.background,text_zone:r.layout?.text_zone,
    share:+productShare(r.artwork,r.width).toFixed(3),min:plan.slides[i].min_product_share,assets:r.layout?.assets,crops:r.layout?.crops,renders:r.layout?.renders})),
  contact_sheet:results[0]?.contactSheet};
await writeFile(join(outDir,'qc.json'),JSON.stringify(report,null,2)+'\n');
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}  ${c.name}  ${c.detail}`);
for(const w of e.warnings)console.log(`WARN  ${w}`);
console.log(report.cards.map(c=>`${c.id}  ${c.composition}  ${c.background}  ${c.text_zone}  share ${(c.share*100).toFixed(0)}% (min ${(c.min*100).toFixed(0)}%)`).join('\n'));
console.log(`contact sheet: ${report.contact_sheet}`);
