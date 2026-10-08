// Moonlit Meadow PROTOTYPE preview (design review only; not a Stage 2 build).
// Reads an approved crochet product READ-ONLY and writes, to --out only:
// cover, pattern index, materials & tools and one pattern's pages, for A4 and
// US Letter, as PDFs and PNG renders, plus a QC report. No model, no network,
// no image generation; product files are never written.
//
//   node production/scripts/moonlit-preview.mjs --product products/016-… --pattern garden-rose --out <dir>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { hash, newPdf, savePdf, fontkit, renderPdf } from '../src/lib.mjs';
import { PAPERS } from '../src/crochet/design.mjs';
import { renderedTextProblems } from '../src/crochet/text-qc.mjs';
import { layoutMoonlit, moonlitLayoutProblems, drawMoonlit, emptySlots } from '../src/crochet/moonlit/index.mjs';

const {values:a}=parseArgs({options:{product:{type:'string'},pattern:{type:'string',default:'garden-rose'},out:{type:'string'},dpi:{type:'string',default:'110'}}});
if(!a.product||!a.out)throw new Error('usage: --product <products/NNN-…> --out <dir> [--pattern <pattern_id>] [--dpi 110]');
const dir=resolve(a.product), out=resolve(a.out);
const sourceBytes=await readFile(join(dir,'crochet/patterns.json'));
const product=JSON.parse(await readFile(join(dir,'product.json'),'utf8'));
// Only the APPROVED source is ever shown: refuse if the file differs from the approval checksum.
const approved=product.crochet?.approval?.source_sha256;
if(!approved||hash(sourceBytes)!==approved)throw new Error(`crochet/patterns.json does not match the approved checksum (${approved??'no approval'}); preview refused.`);
const src=JSON.parse(sourceBytes.toString('utf8')), bundle=src.patterns?src:src.bundle;
if(!bundle.patterns.some(p=>p.pattern_id===a.pattern))throw new Error(`no pattern ${a.pattern}`);

// Image slots: approved Stage 1 illustrations only, shown through a crop that excludes their baked-in lettering.
const handoff=JSON.parse(await readFile(join(dir,'production/handoff.json'),'utf8'));
const asset=id=>{const x=handoff.assets.find(y=>y.id===id);return x?{file:join(dir,x.file),px:[x.width,x.height],sha256:x.sha256}:null;};
const specs=JSON.parse(await readFile(join(dir,'creative/visual-specs.json'),'utf8')).specs;
const slots=emptySlots();
const cover=asset(handoff.crochet_layout.hero);
if(cover)slots.bundleHeroImage={...cover,crop:{x:0,y:0.235,w:1,h:0.6},where:'cover: approved bouquet illustration'};
// A pattern image only when the approved visual spec depicts exactly that pattern (the "detail" render).
const detailOnly=specs.detail?.items?.length===1&&specs.detail.items[0].pattern_id===a.pattern;
const detail=detailOnly?asset(handoff.crochet_layout.motif):null;
if(detail)slots.patterns[a.pattern]={patternHeroImage:{...detail,crop:{x:0.06,y:0.27,w:0.88,h:0.47},caption:'Illustration of the finished flower',where:`${a.pattern}: approved detail illustration`}};
for(const s of [slots.bundleHeroImage,slots.patterns[a.pattern]?.patternHeroImage].filter(Boolean))
  if(hash(await readFile(s.file))!==s.sha256)throw new Error(`${s.file} changed since the handoff; preview refused.`);

await mkdir(out,{recursive:true});
const report={product:product.product_id,source_sha256:approved,pattern:a.pattern,generated_at:new Date().toISOString(),papers:{}};
for(const paper of Object.keys(PAPERS)){
  const {docs,fonts}=await layoutMoonlit(bundle,{paper,slots});
  const layoutProblems=moonlitLayoutProblems(docs,bundle);
  // The prototype pages: cover, index, materials and the chosen pattern, in bundle order.
  const pick=docs.bundle.pages.filter(pg=>pg.kind==='cover'||pg.kind==='index'||pg.kind==='materials'||pg.meta.pattern_id===a.pattern);
  const numbers=pick.map(pg=>docs.bundle.pages.indexOf(pg)+1);
  const sub=Object.assign(Object.create(Object.getPrototypeOf(docs.bundle)),docs.bundle,{pages:pick});
  const pdf=await newPdf({title:`${bundle.title} (Moonlit Meadow prototype, ${PAPERS[paper].label})`,date:new Date(0)});pdf.registerFontkit(fontkit);
  const embedded={};for(const [k,f] of Object.entries(fonts))embedded[k]=await pdf.embedFont(f.bytes,{subset:true});
  const images=new Map();
  for(const s of [slots.bundleHeroImage,...Object.values(slots.patterns).flatMap(x=>Object.values(x))].filter(Boolean))images.set(s.file,await pdf.embedPng(await readFile(s.file)));
  drawMoonlit(pdf,sub,{fonts:embedded,images});
  const file=join(out,`moonlit-prototype-${paper}.pdf`);
  await writeFile(file,await savePdf(pdf));
  const pages=await renderPdf(file,{dpi:Number(a.dpi),outPrefix:join(out,`moonlit-${paper}`)});
  const renderProblems=renderedTextProblems(sub,pages);
  report.papers[paper]={pdf:file,bundle_pages:docs.bundle.pages.length,prototype_pages:numbers,
    pattern_pages:{[a.pattern]:docs.patterns.get(a.pattern).pages.length},
    pages_per_pattern:Object.fromEntries([...docs.patterns].map(([k,f])=>[k,f.pages.length])),
    previews:pages.map((p,i)=>({file:p.pngPath,bundle_page:numbers[i],kind:pick[i].kind})),
    qc:{layout_all_33:layoutProblems,rendered_prototype_pages:renderProblems}};
  console.log(`${paper}: bundle ${docs.bundle.pages.length} pages; prototype pages ${numbers.join(',')}; layout problems ${layoutProblems.length}; rendered-text problems ${renderProblems.length}`);
}
await writeFile(join(out,'qc-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`report: ${join(out,'qc-report.json')}`);
