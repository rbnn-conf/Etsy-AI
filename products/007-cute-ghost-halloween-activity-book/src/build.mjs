// Product #007 print build. Reuses Product #004's primitives (PNG validation,
// contain placement, PDF book, lossless ZIP bundling) without modifying them;
// only the 30-page orchestration and validation are product-specific.
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FORMATS, MARGIN_MM, hash, assert, decode, validatePngStructure, placement, renderPage,
  packageForEtsy } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { book, contactSheet } from '../../004-cozy-spooky-coloring/src/documents.mjs';
import { printingGuide } from './guide.mjs';
import { root, config, ids, lib } from './config.mjs';
const sharp=lib('sharp');
const { PDFDocument, PDFName, PDFDict, PDFRawStream }=lib('pdf-lib');

async function write(path,bytes){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
// 64-bit difference hash: flags visually near-identical pages that exact
// decoded-pixel comparison would miss.
async function dhash(bytes){
  const px=await sharp(bytes).flatten({background:'#fff'}).greyscale().resize(9,8,{fit:'fill'}).raw().toBuffer();
  let bits='';for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits+=px[y*9+x]>px[y*9+x+1]?'1':'0';return bits;
}
export async function validateSources(dir,pages){
  const errors=[],notices=[],records=[];
  const names=(await readdir(dir)).filter(n=>n.toLowerCase().endsWith('.png')).sort();
  if(names.length!==config.pageCount)errors.push(`Expected ${config.pageCount} source PNGs; found ${names.length}.`);
  const numbers=names.map(n=>Number(/^(\d{2})_/.exec(n)?.[1]));
  if(numbers.join(',')!==Array.from({length:config.pageCount},(_,i)=>i+1).join(','))errors.push('Source numbering is not a complete 01-30 sequence.');
  const seen=new Map();
  for(const page of pages){
    try{
      assert(names.includes(page.source),`${page.id}: missing ${page.source}`);
      const bytes=await readFile(join(dir,page.source));
      assert(hash(bytes)===page.sha256,`${page.id}: source bytes differ from page-map.json`);
      validatePngStructure(bytes);
      const meta=await sharp(bytes,{failOn:'warning'}).metadata();
      assert(meta.format==='png'&&(meta.pages??1)===1,`${page.id}: expected a single-frame PNG`);
      assert(!meta.orientation||meta.orientation===1,`${page.id}: unsupported orientation metadata`);
      let transparentPixels=0;
      if(meta.hasAlpha){const a=await sharp(bytes).extractChannel(3).raw().toBuffer();for(const v of a)if(v<255)transparentPixels++;}
      if(transparentPixels)notices.push(`${page.id}: ${transparentPixels} transparent pixels flattened onto white`);
      const {data,info}=await decode(bytes);
      const digest=hash(Buffer.concat([Buffer.from(`${info.width}x${info.height}:`),data]));
      assert(!seen.has(digest),`${page.id}: exact duplicate of ${seen.get(digest)}`);seen.set(digest,page.id);
      let white=0,ink=0;
      for(let i=0;i<data.length;i+=3){const lo=Math.min(data[i],data[i+1],data[i+2]);if(lo>=245)white++;if(lo<220)ink++;}
      const area=info.width*info.height, stats=await sharp(data,{raw:info}).stats();
      assert(ink/area>=0.02&&stats.channels[0].stdev>10,`${page.id}: blank or almost empty page`);
      const a4=placement(info.width,info.height,'A4',config.dpi);
      records.push({id:page.id,source:page.source,title:page.title,activity:page.activity,width:info.width,height:info.height,
        aspectRatio:+(info.width/info.height).toFixed(4),orientation:info.width>info.height?'landscape':'portrait',
        sha256:page.sha256,pixelHash:digest,dhash:await dhash(bytes),whiteFraction:+(white/area).toFixed(3),inkFraction:+(ink/area).toFixed(3),
        transparentPixels,a4Scale:+a4.scale.toFixed(4),effectivePpi:Math.round(config.dpi/a4.scale),
        native300Dpi:config.dpi/a4.scale>=300,reviewNote:page.reviewNote??null});
    }catch(e){errors.push(e.message);}
  }
  // Near-duplicate report (Hamming distance on 64-bit dHash).
  const near=[];
  for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
    let d=0;for(let k=0;k<64;k++)if(records[i].dhash[k]!==records[j].dhash[k])d++;
    if(d<=6)near.push({a:records[i].id,b:records[j].id,distance:d});
  }
  return {records,errors,notices,near};
}
async function verifyPdf(bytes,format,records){
  const pdf=await PDFDocument.load(bytes);
  assert(pdf.getPageCount()===records.length,`${format} PDF expected ${records.length} pages`);
  const [w,h]=FORMATS[format].map(mm=>mm*72/25.4);
  for(const [i,page] of pdf.getPages().entries()){
    assert(Math.abs(page.getWidth()-w)<.01&&Math.abs(page.getHeight()-h)<.01,`${format} p${i+1}: page size mismatch`);
    const xo=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);
    assert(xo.entries().length===1,`${format} p${i+1}: expected exactly one image`);
    const img=pdf.context.lookup(xo.entries()[0][1]);
    assert(img instanceof PDFRawStream&&img.contents.length>0,`${format} p${i+1}: missing image stream`);
    assert(img.dict.get(PDFName.of('Width'))?.asNumber()===records[i].width&&img.dict.get(PDFName.of('Height'))?.asNumber()===records[i].height,`${format} p${i+1}: embedded image was resampled`);
  }
}
export async function build({log=console.log}={}){
  const report={product:config.productId,handoffId:config.handoffId,title:config.title,expected:config.pageCount,status:'FAIL',checks:[],errors:[],notices:[],sources:[],artifacts:[]};
  const pass=(name,detail='PASS')=>{report.checks.push({name,status:'PASS',detail});log(`${name}: ${detail}`);};
  const stage=join(root,`.build-${Date.now()}`);
  await mkdir(join(root,'qc'),{recursive:true});
  await write(join(root,'qc','build-report.json'),JSON.stringify(report,null,2));
  await write(join(root,'qc','production-report.json'),JSON.stringify({status:'BUILD IN PROGRESS',ready:false}));
  try{
    const map=JSON.parse(await readFile(config.pageMap,'utf8'));
    assert(map.pageCount===config.pageCount&&map.pages.map(p=>p.id).join('|')===ids.join('|'),'page-map.json sequence invalid');
    const v=await validateSources(join(root,'source'),map.pages);
    report.sources=v.records;report.nearDuplicates=v.near;report.notices.push(...v.notices);
    assert(!v.errors.length,v.errors.join('\n'));
    pass('Source PNGs',`${v.records.length}/${config.pageCount} decode, numbered 01-30, hashes match, no blank pages, no exact duplicates`);
    pass('Transparency',v.notices.length?v.notices.join('; '):'no alpha channels');
    pass('Near-duplicate scan',v.near.length?v.near.map(n=>`${n.a}~${n.b} (d=${n.distance})`).join(', ')+' — REVIEW':'no near-identical pairs');
    const dims=[...new Set(v.records.map(r=>`${r.width}x${r.height}`))];
    pass('Source dimensions',dims.join(', '));
    const minPpi=Math.min(...v.records.map(r=>r.effectivePpi));
    const scaled=v.records.filter(r=>r.a4Scale<1).map(r=>`${r.id} (landscape, A4 scale ${r.a4Scale}, ~${r.effectivePpi} PPI, prints smaller)`);
    report.resolution={native300Dpi:false,canvasPpi:config.dpi,minEffectivePpi:minPpi,
      status:'PASS WITH NOTICE',wording:'High-quality printable digital files',
      detail:`Portrait pages print at native pixels, ${config.dpi} PPI on paper (~185 mm wide on A4). Scaled to fit: ${scaled.join(', ')||'none'}. No upscaling; no 300-DPI claim.`};
    assert(v.records.every(r=>!r.native300Dpi),'Unexpected 300-DPI source; revisit resolution wording');
    pass('Resolution',report.resolution.detail+' PASS WITH NOTICE');
    for(const r of v.records.filter(r=>r.reviewNote))report.notices.push(`${r.id}: ${r.reviewNote}`);
    await write(join(root,'qc','page-order.md'),['# Product #007 — Cute Ghost Halloween Activity Book','','| Page | Source | Activity | Title | Size |','|---|---|---|---|---|',
      ...v.records.map(r=>`| ${r.id} | ${r.source} | ${r.activity} | ${r.title} | ${r.width}×${r.height} |`),''].join('\n'));
    await write(join(root,'qc','source-audit.json'),JSON.stringify({records:v.records,nearDuplicates:v.near,notices:v.notices},null,2));

    const natives=[];for(const r of v.records)natives.push(await readFile(join(root,'source',r.source)));
    // Placement proofs: one print-ready canvas per page per format, used for
    // clipping/margin QC and previews (not delivered; see packaging below).
    const pages=[];
    for(const format of Object.keys(FORMATS)){
      const previews=[];
      for(const [i,r] of v.records.entries()){
        const out=await renderPage(natives[i],format,{dpi:config.dpi}), p=out.placement;
        assert(p.left>=Math.ceil(MARGIN_MM*config.dpi/25.4)-1&&p.top>=Math.ceil(MARGIN_MM*config.dpi/25.4)-1&&p.left+p.iw<=p.w&&p.top+p.ih<=p.h,`${r.id} ${format}: artwork outside print-safe area`);
        assert(Math.abs(p.iw/p.ih-r.width/r.height)<0.003,`${r.id} ${format}: aspect ratio distorted`);
        if(r.orientation==='portrait')assert(p.scale===1,`${r.id} ${format}: portrait page unexpectedly resampled`);
        const preview=await sharp(out.bytes).resize({width:900}).png().toBuffer();
        await write(join(stage,'previews',format,`${r.id}.png`),preview);
        previews.push({id:r.id,bytes:preview});
        pages.push({id:r.id,format,placement:p,printMm:[+(p.iw*25.4/config.dpi).toFixed(1),+(p.ih*25.4/config.dpi).toFixed(1)]});
      }
      await write(join(stage,'qc',`${format}-layout-contact-sheet.png`),await contactSheet(previews));
      pass(`${format} placement`,`${v.records.length}/${config.pageCount} centred, aspect preserved, inside 12 mm safe margin`);
    }
    report.pages=pages;
    const sourceSheet=await contactSheet(await Promise.all(natives.map(async(b,i)=>({id:ids[i],bytes:await sharp(b).resize({width:600}).png().toBuffer()}))));
    await write(join(stage,'qc','source-contact-sheet.png'),sourceSheet);

    // Delivery: 2 PDFs + 30 original PNGs + guide, in at most five ZIPs.
    const pngEntries={};for(const [i,r] of v.records.entries())pngEntries[`PNG-Pages/${config.prefix}-${r.id}.png`]=natives[i];
    let etsy,lastError,deliverables;
    for(const quality of config.pdfQualities){
      deliverables={};
      for(const format of Object.keys(FORMATS)){
        const pdf=await book(natives,format,quality,{title:config.title,dpi:config.dpi});
        await verifyPdf(pdf,format,v.records);deliverables[`${config.prefix}-${format}.pdf`]=pdf;
      }
      const guideProbe=await printingGuide({pageCount:config.pageCount,activityCount:config.activityCount,bundleCount:5});
      const loose={...deliverables,'LumiumX-Printing-Guide.pdf':guideProbe,...pngEntries};
      log(`PDF embedding ${quality===null?'lossless PNG':`JPEG q${quality} 4:4:4`}: PDFs ${Object.values(deliverables).map(b=>(b.length/1e6).toFixed(1)+' MB').join(' / ')}`);
      try{
        etsy=packageForEtsy(loose,loose,config.limit,{prefix:config.prefix,forceBundles:true});
        // Re-render the guide with the real bundle count, then repackage.
        const guide=await printingGuide({pageCount:config.pageCount,activityCount:config.activityCount,bundleCount:Object.keys(etsy.files).length});
        loose['LumiumX-Printing-Guide.pdf']=guide;deliverables['LumiumX-Printing-Guide.pdf']=guide;
        etsy=packageForEtsy(loose,loose,config.limit,{prefix:config.prefix,forceBundles:true});
        report.pdfEmbedding=quality===null?'Lossless native PNG':`Native-size JPEG q${quality}, 4:4:4 (no resampling); PNG pages remain byte-identical to source`;
        report.pdfQuality=quality;break;
      }catch(e){lastError=e;log(`  does not fit: ${e.message.split('.')[0]}`);}
    }
    assert(etsy,lastError?.message??'Unable to package');
    pass('A4 PDF',`${config.pageCount} pages, one native image each`);pass('US-Letter PDF',`${config.pageCount} pages, one native image each`);
    pass('PDF embedding',report.pdfEmbedding);
    const files=Object.keys(etsy.files);
    assert(files.length<=5,'Too many Etsy files');
    for(const [area,set] of [['deliverables',deliverables],['etsy',etsy.files]]){
      for(const [name,bytes] of Object.entries(set)){
        const rel=`output/${area}/${name}`;await write(join(stage,rel),bytes);
        const saved=await readFile(join(stage,rel));assert(hash(saved)===hash(bytes),`${name}: write integrity`);
        if(area==='etsy')assert(saved.length<=config.limit,`${name}: exceeds ${config.limit} bytes`);
        report.artifacts.push({path:rel,bytes:saved.length,sha256:hash(saved)});
      }
    }
    pass('Etsy ZIPs',`${files.length}/5, each <= ${config.limit/1e6} MB`);
    // Re-check sources, then publish stage -> product dir.
    for(const r of v.records)assert(hash(await readFile(join(root,'source',r.source)))===r.sha256,`${r.id}: source changed during build`);
    for(const area of ['output','previews']){
      const dest=resolve(root,area);assert(dest.startsWith(resolve(root)),'Unsafe target');
      await rm(dest,{recursive:true,force:true});await cp(join(stage,area),dest,{recursive:true});
    }
    for(const n of await readdir(join(stage,'qc')))await cp(join(stage,'qc',n),join(root,'qc',n));
    for(const a of report.artifacts)assert(hash(await readFile(join(root,a.path)))===a.sha256,`${a.path}: publish integrity`);
    report.status='BUILD PASS';
  }catch(e){report.errors.push(e.message);log(`BUILD FAILED: ${e.message}`);}
  finally{
    await rm(stage,{recursive:true,force:true});
    await write(join(root,'qc','build-report.json'),JSON.stringify(report,null,2));
    await write(join(root,'qc','build-report.txt'),['PRODUCT #007 BUILD REPORT',...report.checks.map(c=>`${c.name}: ${c.detail}`),...report.notices.map(n=>`NOTICE ${n}`),...report.errors.map(e=>`FAIL: ${e}`),'',report.status,''].join('\n'));
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const r=await build();if(r.status!=='BUILD PASS')process.exitCode=1;
}
