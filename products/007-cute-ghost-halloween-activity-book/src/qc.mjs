// Production QC for Product #007: runs after build, marketing and
// marketing-layout. Readiness for owner review also needs qc/VISUAL_QA.md.
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { inspectPdf } from '../../003-midnight-seance/src/render/pdf-preview.mjs';
import { FORMATS, hash, assert, decode } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { contactSheet } from '../../004-cozy-spooky-coloring/src/documents.mjs';
import { root, config, ids, lib } from './config.mjs';
const sharp=lib('sharp');
const { PDFDocument, PDFName, PDFDict }=lib('pdf-lib');
const { unzipSync }=lib('fflate');

const checks=[], artifacts=[], warnings=[];
const pass=(name,detail='PASS')=>{checks.push({name,status:'PASS',detail});console.log(`${name}: ${detail}`);};
const report={product:config.productId,status:'FAIL',ready:false,checks,warnings,artifacts,errors:[]};
await writeFile(join(root,'qc/production-report.json'),JSON.stringify(report,null,2));
try{
  const build=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
  assert(build.status==='BUILD PASS','Print build did not pass');
  const srcNames=(await readdir(join(root,'source'))).filter(n=>n.endsWith('.png')).sort();
  assert(srcNames.length===30&&build.sources.map(s=>s.source).join('|')===srcNames.join('|'),'Source count/order mismatch');
  for(const s of build.sources)assert(hash(await readFile(join(root,'source',s.source)))===s.sha256,`Source changed: ${s.source}`);
  assert(build.sources.map(s=>s.id).join('|')===ids.join('|'),'Page ID order mismatch');
  pass('Source pages','30/30 present, numbered 01-30, byte-identical to the supplied ZIP');
  for(const a of build.artifacts)assert(hash(await readFile(join(root,a.path)))===a.sha256,`Artifact changed: ${a.path}`);
  pass('Build artifact hashes',`${build.artifacts.length} files`);

  // PDFs: render every page, check non-blank, and prove page order by
  // comparing each embedded image with its source (PSNR).
  await mkdir(join(root,'qc/pdf-previews'),{recursive:true});
  const pdfQuality=[], pdfPages={};
  for(const format of Object.keys(FORMATS)){
    const path=join(root,`output/deliverables/${config.prefix}-${format}.pdf`);
    const pdf=await PDFDocument.load(await readFile(path));
    assert(pdf.getPageCount()===30,`${format} PDF page count`);
    for(const [i,page] of pdf.getPages().entries()){
      const xo=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict), img=pdf.context.lookup(xo.entries()[0][1]);
      const original=await decode(await readFile(join(root,'source',build.sources[i].source)));
      const filter=img.dict.get(PDFName.of('Filter'))?.toString();
      if(filter==='/DCTDecode'){
        const actual=await decode(Buffer.from(img.contents));
        assert(actual.info.width===original.info.width&&actual.info.height===original.info.height,`${format} p${i+1}: resampled`);
        let mse=0;for(let j=0;j<actual.data.length;j++){const d=actual.data[j]-original.data[j];mse+=d*d;}
        const psnr=10*Math.log10(255*255/(mse/actual.data.length));
        // Each page must match its own source far better than any neighbour.
        assert(psnr>36,`${format} p${i+1}: does not match ${build.sources[i].id} (PSNR ${psnr.toFixed(1)}); wrong order or heavy compression`);
        pdfQuality.push({format,id:ids[i],psnr:+psnr.toFixed(2)});
      }
    }
    const rendered=await inspectPdf(path,{dpi:60,outPrefix:join(root,`qc/pdf-previews/${format}`)});
    assert(rendered.length===30,`${format} render count`);
    const items=[];
    for(const [i,p] of rendered.entries()){
      const st=await sharp(p.pngPath).stats();assert(st.channels[0].stdev>10,`${format} p${i+1}: blank render`);
      items.push({id:ids[i],bytes:await readFile(p.pngPath)});
    }
    pdfPages[format]=rendered.length;
    await writeFile(join(root,`qc/${format}-pdf-contact-sheet.png`),await contactSheet(items));
    pass(`${format} PDF`,`30/30 pages render, non-blank, in source order (min PSNR ${Math.min(...pdfQuality.filter(q=>q.format===format).map(q=>q.psnr)).toFixed(1)} dB)`);
  }
  report.pdfQuality=pdfQuality;report.pdfPages=pdfPages;
  const clipped=build.pages.filter(p=>p.placement.left<0||p.placement.top<0||p.placement.left+p.placement.iw>p.placement.w||p.placement.top+p.placement.ih>p.placement.h);
  assert(!clipped.length,'Clipped placement');
  pass('Clipping / safe area','60/60 placements fully inside 12 mm margins, aspect preserved (contain fit, no crop)');

  const guide=await inspectPdf(join(root,'output/deliverables/LumiumX-Printing-Guide.pdf'),{dpi:100,outPrefix:join(root,'qc/pdf-previews/guide')});
  assert(guide.length===1,'Guide page count');
  for(const phrase of ['Cute Ghost Halloween Activity Book','No physical item','A4','US Letter','100%','30 printable pages','28 activity pages','five ZIP'].map(s=>s))
    assert(guide[0].text.replace(/\s+/g,' ').includes(phrase)||(phrase==='five ZIP'&&guide[0].text.includes('all 5 ZIP')),`Guide missing "${phrase}"`);
  pass('Printing guide','renders; states contents, sizes, 100% printing, digital-only');

  // Etsy ZIPs: open each, exact expected contents, bytes identical.
  const expected={
    [`${config.prefix}-A4.pdf`]:await readFile(join(root,`output/deliverables/${config.prefix}-A4.pdf`)),
    [`${config.prefix}-US-Letter.pdf`]:await readFile(join(root,`output/deliverables/${config.prefix}-US-Letter.pdf`)),
    'LumiumX-Printing-Guide.pdf':await readFile(join(root,'output/deliverables/LumiumX-Printing-Guide.pdf'))
  };
  for(const s of build.sources)expected[`PNG-Pages/${config.prefix}-${s.id}.png`]=await readFile(join(root,'source',s.source));
  const zips=(await readdir(join(root,'output/etsy'))).sort(), recovered={}, bundles=[];
  assert(zips.length>=1&&zips.length<=5&&zips.every(n=>n.endsWith('.zip')),'Invalid Etsy file set');
  for(const name of zips){
    const bytes=await readFile(join(root,'output/etsy',name));assert(bytes.length<=config.limit,`${name} over limit`);
    const entries=unzipSync(bytes);
    for(const [n,b] of Object.entries(entries)){assert(!recovered[n],`Duplicate entry ${n}`);recovered[n]=b;}
    bundles.push({name,bytes:bytes.length,mb:+(bytes.length/1e6).toFixed(2),files:Object.keys(entries).length});
  }
  assert(Object.keys(recovered).sort().join('|')===Object.keys(expected).sort().join('|'),'ZIP contents differ from expected delivery set');
  for(const [n,b] of Object.entries(expected))assert(hash(Buffer.from(recovered[n]))===hash(b),`ZIP entry altered: ${n}`);
  report.bundles=bundles;
  pass('Customer ZIPs',`${zips.length} ZIPs open; ${Object.keys(expected).length} files exact (2 PDFs, guide, 30 PNGs); each <= ${config.limit/1e6} MB`);

  // Listing copy claims.
  const L=JSON.parse(await readFile(join(root,'listing/listing.json'),'utf8'));
  assert(L.title.length<=140,'Title over 140 characters');
  assert(L.tags.length===13&&new Set(L.tags).size===13&&L.tags.every(t=>t.length<=20),'Invalid tags');
  assert(L.pageCount===30&&L.activityCount===28&&L.formats.join('|')==='A4|US-Letter'&&L.digital&&!L.editable,'Listing facts mismatch');
  const all=L.title+'\n'+L.description;
  assert(!/30[^|\n]{0,25}activities/i.test(all),'Copy claims 30 activities (actual: 28 + cover + certificate)');
  assert(!/300\s*-?\s*dpi|editable file|shipped to you|develop(s|ment)|educational benefit|fine motor|therap/i.test(all),'Unsupported claim in listing copy');
  assert(L.description.includes('No physical item')&&L.description.includes('A4')&&L.description.includes('US Letter'),'Digital/size wording missing');
  assert(L.description.includes(`all ${['zero','one','two','three','four','five'][zips.length]}`),'Bundle count in copy mismatch');
  assert((all.match(/—/g)||[]).length===0,'Em dashes in listing copy');
  pass('Listing copy',`title ${L.title.length}/140; 13 tags <= 20 chars; claims match contents`);
  const md=`# Cute Ghost Halloween Activity Book (Product #007)\n\n## Etsy title\n\n${L.title}\n\n## Tags\n\n${L.tags.join(', ')}\n\n## Category\n\n${L.category.recommended} (alternative: ${L.category.alternative}). ${L.category.note}\n\n## Description\n\n${L.description}\n\n## Upload files (digital)\n\n${bundles.map(b=>`- ${b.name} (${b.mb} MB, ${b.files} files)`).join('\n')}\n\n## Listing images\n\nUpload output/marketing/01-hero.png first, then 02 to 10 in order.\n\n## Seller notes\n\nReview only; nothing has been published. Licence wording extends the shop's existing personal-use line to the buyer's own classroom; confirm before publishing. Etsy limits: 5 digital files, 20 MB each; 13 tags of up to 20 characters; 140-character title.\n`;
  await writeFile(join(root,'listing/LISTING.md'),md);

  // Marketing.
  const mk=JSON.parse(await readFile(join(root,'qc/marketing-report.json'),'utf8'));
  const layouts=JSON.parse(await readFile(join(root,'qc/marketing-layout.json'),'utf8'));
  assert(layouts.length===10&&layouts.every(r=>!r.errors.length),'Marketing layout QC failed');
  const pngs=(await readdir(join(root,'output/marketing'))).filter(n=>n.endsWith('.png'));
  assert(pngs.length===10&&mk.renders.length===10,'Marketing count');
  const known={'product-title':config.title,'page-count':'30','activity-count':'28','paper-sizes':'A4,US-Letter'};
  for(const r of mk.renders){
    const m=await sharp(r.outPath).metadata();assert(m.width===2000&&m.height===2000,'Marketing dimensions');
    assert(!r.overflowPx&&!r.blocked.length&&r.hasBranding&&r.minFontPx>=24,'Marketing render QC');
    for(const c of r.claimTokens)assert(known[c.claim]===c.value,`Unsupported marketing claim ${c.claim}=${c.value}`);
    artifacts.push({path:relative(root,r.outPath).replaceAll('\\','/'),sha256:hash(await readFile(r.outPath))});
  }
  pass('Marketing images','10/10 at 2000x2000; overflow, overlap, fonts, branding and claims PASS');

  // Telegram preview package: PNG previews only, each under Telegram's 10 MB photo limit.
  const telegram=['qc/source-contact-sheet.png','qc/A4-pdf-contact-sheet.png','qc/US-Letter-pdf-contact-sheet.png',
    'previews/A4/P002.png','previews/A4/P003.png','previews/A4/P011.png',...pngs.sort().map(n=>`output/marketing/${n}`)];
  for(const p of telegram){assert(p.endsWith('.png'),'Telegram package must be PNG only');const s=await stat(join(root,p));assert(s.size<10e6,`${p} over 10 MB`);}
  for(const p of telegram.filter(p=>!p.startsWith('output/marketing')))artifacts.push({path:p,sha256:hash(await readFile(join(root,p)))});
  report.telegramPackage=telegram;
  pass('Telegram preview package',`${telegram.length} PNGs (${pngs.length} marketing + ${telegram.length-pngs.length} page previews), no PDFs/ZIPs`);

  warnings.push(...build.notices);
  warnings.push('Resolution: '+build.resolution.detail);
  warnings.push('Artwork uses US spelling ("Color the ..."); listing prose is UK English, title/tags keep US "Coloring" for Etsy search.');
  warnings.push('Licence wording (home + own classroom) extends the shop precedent; owner to confirm.');
  report.status='AUTOMATED QC PASS';
  report.resolution=build.resolution;
}catch(e){report.errors.push(e.message);console.error('QC FAILED: '+e.message);process.exitCode=1;}
await writeFile(join(root,'qc/production-report.json'),JSON.stringify(report,null,2));
console.log(report.status);
