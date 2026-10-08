import { mkdir, readFile, writeFile, readdir, rename, rm, open, copyFile, cp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import { COUNT, IDS, FORMATS, PREFIX, DPI, LIMIT, hash, pixels, pngName, assert,
  decode, validatePngStructure, validateSources, renderPage, zip, verifyZip, packageForEtsy } from './core.mjs';
import { book, printingGuide, contactSheet } from './documents.mjs';

const PRODUCT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function write(path, bytes) { await mkdir(dirname(path),{recursive:true}); await writeFile(path, bytes); }
async function verifyPdf(bytes, count, format='A4', illustrations=null) {
  const pdf = await PDFDocument.load(bytes);
  assert(pdf.getPageCount() === count, `PDF expected ${count} pages`);
  const [w,h]=FORMATS[format].map(mm=>mm*72/25.4);
  for (const [index,page] of pdf.getPages().entries()) {
    assert(Math.abs(page.getWidth()-w)<.01 && Math.abs(page.getHeight()-h)<.01, 'PDF page dimensions mismatch');
    if(illustrations) {
      const objects=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);
      assert(objects.entries().length===1,'PDF page must contain exactly one illustration');
      const image=pdf.context.lookup(objects.entries()[0][1]);
      assert(image instanceof PDFRawStream && image.contents.length>0 && image.dict.get(PDFName.of('Subtype'))?.toString()==='/Image','Missing PDF illustration stream');
      const {width:pw,height:ph}=illustrations[index];
      assert(image.dict.get(PDFName.of('Width'))?.asNumber()===pw && image.dict.get(PDFName.of('Height'))?.asNumber()===ph,'PDF image resolution mismatch');
    }
  }
}
export async function build(root=PRODUCT, { log=console.log, config={} }={}) {
  const productId=config.productId ?? '004';
  const prefix=config.prefix ?? PREFIX;
  const dpi=config.dpi ?? DPI;
  const limit=config.limit ?? LIMIT;
  const pageName=config.pngName ?? pngName;
  const toPixels=mm=>Math.round(mm*dpi/25.4);
  const reportTitle=`PRODUCT #${productId} BUILD REPORT`;
  await mkdir(root,{recursive:true});
  const lockPath=join(root,'.build.lock');
  const lock=await open(lockPath,'wx').catch(()=>{throw new Error('Build lock exists. Another build may be running; inspect .build.lock before removing it.');});
  await lock.writeFile(String(process.pid));
  const run=`${Date.now()}-${process.pid}`, stage=join(root,`.build-${run}`);
  const report={ product:productId, expected:COUNT, status:'FAIL', checks:[], errors:[], sources:[], artifacts:[], run };
  const pass=(name, detail='PASS')=>{report.checks.push({name,status:'PASS',detail});log(`${name}: ${detail}`);};
  try {
    await mkdir(join(root,'qc'),{recursive:true});
    // Invalidate the old readiness marker before doing any work. Old files are
    // not evidence of this run; consumers must check this report and its hashes.
    await write(join(root,'qc','build-report.json'),JSON.stringify(report,null,2));
    await write(join(root,'qc','build-report.txt'),reportTitle+'\nBUILD IN PROGRESS - NOT READY FOR ETSY REVIEW\n');
    log('Validating 20 approved source PNGs...');
    const story=JSON.parse(await readFile(config.storyPath ?? join(PRODUCT,'story-order.json'),'utf8'));
    assert(story.pageCount===COUNT && story.pages.map(p=>p.id).join('|')===IDS.join('|') && new Set(story.pages.map(p=>p.sourceId)).size===COUNT,'Invalid story sequence');
    const validation=await validateSources(join(root,'source'),story.pages,config);
    report.sources=validation.records;
    assert(!validation.errors.length,validation.errors.join('\n'));
    const ordered=story.pages.map(page=>({...validation.records.find(r=>r.id===page.sourceId),id:page.id,sourceId:page.sourceId,title:page.title}));
    report.sources=ordered;
    pass('Source illustrations',`${COUNT}/${COUNT} PASS`);
    const resolutions=[...new Set(ordered.map(r=>`${r.width} x ${r.height} px`))];
    const native300=ordered.every(r=>r.native300Dpi);
    pass('Source resolution',`${resolutions.join(', ')} — ${native300?'PASS':'PASS WITH NOTICE'}`);
    pass('Estimated full-page A4 print density',`~${Math.min(...ordered.map(r=>r.fullPageA4Dpi))} DPI`);
    pass('Native 300-DPI source',native300?'YES':'NO');
    report.resolutionNotice='Suitable for standard home printing and colouring at the approved source quality; a test print is recommended. PNG canvas density is not additional source detail.';
    report.sourceReview=ordered.filter(r=>r.sourceEdgeReview).map(r=>({id:r.id,source:r.name,whiteFraction:r.whiteFraction,sourceEdgeInk:r.sourceEdgeInk,review:r.sourceEdgeReview}));
    log('Story order: '+ordered.map(r=>`${r.id} <- ${r.name} (${r.title})`).join('; '));
    await write(join(root,'qc','page-order.md'),[`# Product ${productId} — ${config.title ?? '20 connected Halloween adventures'}`,'','| Page | Original source | Scene |','|---|---|---|',...ordered.map(r=>`| ${r.id} | ${r.name} | ${r.title} |`),''].join('\n'));
    const canonical={}, loose={}, previewItems=[], pageRecords=[];
    const nativePages=[];
    for(const record of ordered)nativePages.push(await readFile(join(root,'source',record.name)));
    for (const format of Object.keys(FORMATS)) {
      log(`Generating ${format} with preserved source pixels on a ${dpi}-PPI canvas...`);
      const entries={}, seen=new Set();
      for (const record of ordered) {
        const source=await readFile(join(root,'source',record.name));
        assert(hash(source)===record.sha256,`${record.id}: source changed during build`);
        const rendered=await renderPage(source,format,{dpi}), name=pageName(record.id,format);
        const path=join(stage,'output','png',format,name);
        await write(path,rendered.bytes);
        const saved=await readFile(path);validatePngStructure(saved);
        const meta=await sharp(saved,{failOn:'warning'}).metadata(), decoded=await decode(saved);
        const [w,h]=FORMATS[format].map(toPixels);
        assert(meta.width===w && meta.height===h && meta.density===dpi,`${name}: size/density mismatch`);
        assert(hash(decoded.data)===rendered.pixelHash,`${name}: rendered pixels changed during encoding`);
        assert(!seen.has(rendered.pixelHash),`${name}: duplicate rendered page`);seen.add(rendered.pixelHash);
        const p=rendered.placement;
        assert(p.left>=0 && p.top>=0 && p.left+p.iw<=w && p.top+p.ih<=h,`${name}: placement clips artwork`);
        const margin=Math.ceil(12*dpi/25.4);
        for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
          if(x>=margin && x<w-margin && y>=margin && y<h-margin) continue;
          const at=(y*w+x)*3;
          assert(decoded.data[at]===255 && decoded.data[at+1]===255 && decoded.data[at+2]===255,`${name}: non-white print margin`);
        }
        if(p.scale===1) {
          const crop=await sharp(saved).extract({left:p.left,top:p.top,width:p.iw,height:p.ih}).removeAlpha().raw().toBuffer();
          assert(crop.equals((await decode(source)).data),`${name}: native artwork pixels changed`);
        }
        entries[name]=saved; loose[`${format}/${name}`]=saved;
        pageRecords.push({id:record.id,source:record.name,title:record.title,format,name,sha256:hash(saved),pixelHash:rendered.pixelHash,placement:p,actualPrintDpi:dpi/p.scale});
        if(format==='A4') {
          const preview=await sharp(saved).resize({width:900}).png().toBuffer();
          await write(join(stage,'listing','source-previews','pages',`${record.id}.png`),preview);
          previewItems.push({id:record.id,bytes:preview});
        }
      }
      const names=await readdir(join(stage,'output','png',format));
      assert(names.sort().join('|')===IDS.map(id=>pageName(id,format)).sort().join('|'),`${format}: output filename integrity failed`);
      pass(`${format} pages`,`${COUNT}/${COUNT} PASS`);
      const archive=zip(entries);verifyZip(archive,entries);
      canonical[`${prefix}-${format}-PNG.zip`]=archive;pass(`${format} ZIP`);
    }
    const guide=await printingGuide(config.guide);await verifyPdf(guide,1);
    canonical['LumiumX-Printing-Guide.pdf']=guide;loose['LumiumX-Printing-Guide.pdf']=guide;pass('Printing Guide');
    assert(previewItems.map(p=>p.id).join('|')===IDS.join('|'),'Contact sheet page ID/count mismatch');
    const sheet=await contactSheet(previewItems);await decode(sheet);
    await write(join(stage,'qc','contact-sheet.png'),sheet);
    await write(join(stage,'listing','source-previews','.gitkeep'),'');
    await write(join(stage,'listing','source-previews','contact-sheet.png'),sheet);
    const heroIds=['P001','P007','P014','P020'];
    for(const id of heroIds) await write(join(stage,'listing','source-previews','heroes',`${id}.png`),previewItems.find(p=>p.id===id).bytes);
    pass('Contact Sheet');
    report.pages=pageRecords;report.heroIds=heroIds;
    report.reviewAssets=[{path:'qc/contact-sheet.png',sha256:hash(sheet)},...heroIds.map(id=>({path:`listing/source-previews/heroes/${id}.png`,sha256:hash(previewItems.find(p=>p.id===id).bytes)}))];
    log('Checking Etsy attachment sizes and package contents...');
    let etsy, packagingError;
    // Keep PNGs pixel-exact. Try lossless PDF embedding first, then the highest
    // high-quality JPEG setting that fits the attachment budget (no resampling).
    for(const quality of [null,98,95,92,90,88,85]) {
      for(const format of Object.keys(FORMATS)) {
        const pdfName=`${prefix}-${format}.pdf`, pdf=await book(nativePages,format,quality,{title:config.title,dpi});
        await verifyPdf(pdf,COUNT,format,ordered);canonical[pdfName]=pdf;loose[pdfName]=pdf;
      }
      log(`PDF embedding ${quality===null?'lossless PNG':`JPEG ${quality}, 4:4:4`}; checking package fit...`);
      try {etsy=packageForEtsy(canonical,loose,limit,{prefix,forceBundles:config.forceBundles});report.pdfEmbedding=quality===null?'Lossless native PNG':`Native-size JPEG, quality ${quality}, 4:4:4; customer PNGs remain pixel-exact`;break;}
      catch(e) {packagingError=e;log(e.message);}
    }
    assert(etsy,packagingError?.message??'Unable to package');
    for(const format of Object.keys(FORMATS))pass(`${format} PDF`);
    report.packaging=etsy.mode;
    assert(Object.keys(etsy.files).length<=5,'Too many Etsy attachments');
    for(const [area,files] of Object.entries({deliverables:canonical,etsy:etsy.files})) {
      for(const [name,bytes] of Object.entries(files)) {
        const relative=`output/${area}/${name}`;
        await write(join(stage,relative),bytes);
        const saved=await readFile(join(stage,relative));assert(hash(saved)===hash(bytes),`${name}: saved-file integrity failed`);
        if(area==='etsy') assert(saved.length<=limit,`${name}: exceeds Etsy size limit`);
        report.artifacts.push({path:relative,bytes:saved.length,sha256:hash(saved)});
      }
    }
    pass('Etsy attachments',`${Object.keys(etsy.files).length}/5; each <= 20 MB PASS`);
    report.notes=[
      'Clipping detection checks source-edge ink and output placement; it cannot detect every pre-existing crop. Review all thumbnails and full-size pages manually.',
      'Hero pages are deterministic selections, not an aesthetic ranking. No marketing artwork is generated.',
      'Upload only the files listed in output/etsy. Canonical requested deliverables remain in output/deliverables.'
    ];
    // Re-check originals before publishing any successful build.
    for(const record of validation.records) assert(hash(await readFile(join(root,'source',record.name)))===record.sha256,`${record.id}: source changed before publication`);
    for(const area of ['output','listing/source-previews']) {
      const dest=resolve(root,area);
      assert(dest.startsWith(resolve(root)+ '\\') || dest.startsWith(resolve(root)+'/'),'Unsafe output target');
      await rm(dest,{recursive:true,force:true});
      await mkdir(dirname(dest),{recursive:true});
      try { await rename(join(stage,area),dest); }
      catch(error) {
        if(process.platform!=='win32' || !['EPERM','EACCES'].includes(error.code))throw error;
        // Windows can deny a directory rename while a scanner holds a handle.
        // Readiness remains invalid until every published file is verified.
        await cp(join(stage,area),dest,{recursive:true,errorOnExist:true,force:false});
        async function verifyPublished(source,target) {
          for(const entry of await readdir(source,{withFileTypes:true})) {
            if(entry.isDirectory())await verifyPublished(join(source,entry.name),join(target,entry.name));
            else assert(hash(await readFile(join(source,entry.name)))===hash(await readFile(join(target,entry.name))),'Published copy integrity failure');
          }
        }
        await verifyPublished(join(stage,area),dest);
        report.notes.push(`Windows directory rename unavailable; ${area} published by verified copy.`);
      }
    }
    await copyFile(join(stage,'qc','contact-sheet.png'),join(root,'qc','contact-sheet.png'));
    report.status='READY FOR ETSY REVIEW';
  } catch(e) {report.errors.push(e.message);log(`BUILD FAILED: ${e.message}`);}
  finally {
    const text=[reportTitle,...report.checks.map(c=>`${c.name}: ${c.detail}`),report.resolutionNotice??'',report.pdfEmbedding??'',...report.errors.map(e=>`FAIL: ${e}`),'',report.status==='FAIL'?'NOT READY FOR ETSY REVIEW':report.status,''].join('\n');
    await write(join(root,'qc','build-report.json'),JSON.stringify(report,null,2));
    await write(join(root,'qc','build-report.txt'),text);
    assert(resolve(stage).startsWith(resolve(root)+ (process.platform==='win32'?'\\':'/')),'Unsafe staging target');
    await rm(stage,{recursive:true,force:true});await lock.close();await rm(lockPath,{force:true});
    log(text);
  }
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  build().then(report=>{if(report.status==='FAIL')process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
