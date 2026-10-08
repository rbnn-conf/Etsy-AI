// Moonlit Meadow FULL scratch build for owner review (not the live Stage 2 path).
// Copies an approved crochet product to --out (sources only: no generated outputs),
// then runs the real Stage 2 build and QC there with the Moonlit adapter, and
// renders review previews and contact sheets. The product folder is only read.
// No model, no network, no image generation.
//
//   node production/scripts/moonlit-scratch-build.mjs --product products/016-… --out <dir> [--long <pattern_id>]
import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { hash, sharp, renderPdf } from '../src/lib.mjs';
import { buildProduction, runQc, BUILD_RECORD, DELIVERABLES } from '../src/index.mjs';
import { crochetPatternBundleMoonlit, layoutDocuments } from '../src/adapters/crochet-pattern-bundle.mjs';
import { moonlitLayoutProblems } from '../src/crochet/moonlit/index.mjs';

const {values:a}=parseArgs({options:{product:{type:'string'},out:{type:'string'},long:{type:'string'},dpi:{type:'string',default:'110'}}});
if(!a.product||!a.out)throw new Error('usage: --product <products/NNN-…> --out <dir> [--long <pattern_id>]');
const src=resolve(a.product), out=resolve(a.out), work=join(out,'product');
const product=JSON.parse(await readFile(join(src,'product.json'),'utf8'));
const approved=product.crochet?.approval?.source_sha256;
if(!approved||hash(await readFile(join(src,'crochet/patterns.json')))!==approved)throw new Error('crochet/patterns.json does not match the approval; refused.');
const handoffBytes=await readFile(join(src,'production/handoff.json')), handoff=JSON.parse(handoffBytes.toString('utf8'));
if(handoff.approved?.patterns?.source_sha256!==approved)throw new Error('the production handoff predates the current approval; refused.');

// Copy sources only. Generated Stage 2 outputs are left behind so the build starts clean.
const GENERATED=['production/deliverables','production/package','production/previews','production/build-record.json','production/qc-report.json','production/.build.lock'];
await mkdir(out,{recursive:true});
await cp(src,work,{recursive:true,filter:p=>{const r=relative(src,p).split(sep).join('/');return !GENERATED.some(g=>r===g||r.startsWith(g+'/'))&&!/\.tmp-\d+/.test(r);}});

const log=l=>{if(!/wrote .*Individual/.test(l))console.log(l);};
const adapter=crochetPatternBundleMoonlit;
const t0=Date.now();
const b=await buildProduction({productDir:work,handoff,handoffSha:hash(handoffBytes),force:true,log,adapter});
console.log(`build: ${b.built.length} written in ${((Date.now()-t0)/1000).toFixed(0)} s`);
const qc=await runQc({productDir:work,handoff,adapter});
const failed=qc.checks.filter(c=>!c.ok);
console.log(`QC: ${qc.checks.length-failed.length}/${qc.checks.length} passed${failed.length?`; FAILED: ${failed.map(c=>`${c.name}: ${String(c.detail).slice(0,300)}`).join(' | ')}`:''}`);

// Full layout QC of every Moonlit document (both papers): source -> layout, bounds, collisions,
// and every glyph in the face that draws it.
const layoutQc={};
for(const paper of ['A4','US-Letter']){const {docs}=await layoutDocuments(handoff,{paper,design:'moonlit'});layoutQc[paper]=moonlitLayoutProblems(docs,handoff.crochet.bundle);}
console.log(`layout QC: ${Object.entries(layoutQc).map(([k,v])=>`${k} ${v.length} problems`).join(', ')}`);
// Review previews from the built PDFs.
const record=JSON.parse(await readFile(join(work,BUILD_RECORD),'utf8')), base=join(work,DELIVERABLES,record.package);
const bundleRel=paper=>Object.entries(record.outputs).find(([,o])=>o.expect.role==='bundle-pdf'&&o.variant===paper)[0];
const bundle=handoff.crochet.bundle;
const longId=a.long??null;
const review=join(out,'review');await mkdir(review,{recursive:true});
const summary={source_sha256:approved,adapter:{format:adapter.format,version:adapter.version,design:adapter.design},qc:{passed:qc.passed,checks:qc.checks},layout_qc:layoutQc,papers:{}};
let doubledUS=[];
for(const paper of ['A4','US-Letter']){
  const rel=bundleRel(paper), file=join(base,rel);
  const pages=await renderPdf(file,{dpi:Number(a.dpi),outPrefix:join(review,`${paper}-page`)});
  doubledUS.push(...pages.filter(p=>/\bUS US\b/.test(p.text)).map(p=>`${paper} p${p.page}`));
  const individual=Object.entries(record.outputs).filter(([,o])=>o.expect.role==='pattern-pdf'&&o.variant===`${paper}-Individual-Patterns`);
  const pagesOf=Object.fromEntries(individual.map(([,o])=>[o.expect.patterns[0],o.expect.pages]));
  summary.papers[paper]={bundle:rel,bundle_pages:pages.length,individual_pdfs:individual.length,individual_pages:pagesOf,
    individual_total_pages:Object.values(pagesOf).reduce((s,n)=>s+n,0)};
  // Contact sheets of the whole bundle, 24 pages per sheet.
  const W=260, per=24, cols=6;
  for(let s=0;s*per<pages.length;s++){
    const chunk=pages.slice(s*per,(s+1)*per), tiles=await Promise.all(chunk.map(p=>sharp(p.pngPath).resize({width:W}).png().toBuffer()));
    const H=Math.max(...(await Promise.all(tiles.map(t=>sharp(t).metadata()))).map(m=>m.height)), rows=Math.ceil(chunk.length/cols);
    await sharp({create:{width:(W+12)*cols+12,height:(H+12)*rows+12,channels:3,background:'#8f8a82'}})
      .composite(tiles.map((t,i)=>({input:t,left:12+(i%cols)*(W+12),top:12+Math.floor(i/cols)*(H+12)}))).jpeg({quality:82})
      .toFile(join(review,`contact-${paper}-${String(s+1).padStart(2,'0')}.jpg`));
  }
}
summary.doubled_us=doubledUS;console.log(`'US US' in bundle text: ${doubledUS.length?doubledUS.join(', '):'none'}`);
summary.long_pattern=longId??Object.entries(summary.papers.A4.individual_pages).sort((x,y)=>y[1]-x[1])[0][0];
summary.pattern_names=Object.fromEntries(bundle.patterns.map(p=>[p.pattern_id,p.name]));
await writeFile(join(out,'review-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({papers:Object.fromEntries(Object.entries(summary.papers).map(([k,v])=>[k,{bundle_pages:v.bundle_pages,individual_pdfs:v.individual_pdfs,individual_total_pages:v.individual_total_pages}])),long_pattern:summary.long_pattern},null,1));
