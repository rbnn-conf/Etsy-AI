import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createRequire} from 'node:module';
import {inspectPdf} from '../../003-midnight-seance/src/render/pdf-preview.mjs';
import {IDS,FORMATS,hash,assert,decode} from '../../004-cozy-spooky-coloring/src/core.mjs';
import {contactSheet} from '../../004-cozy-spooky-coloring/src/documents.mjs';
import {root,config} from './config.mjs';
const require=createRequire(new URL('../../004-cozy-spooky-coloring/package.json',import.meta.url));
const sharp=require('sharp');
const {PDFDocument,PDFName,PDFDict,PDFRawStream}=require('pdf-lib');
const {unzipSync}=require('fflate');

const checks=[],artifacts=[];
const pass=(name,detail='PASS')=>{checks.push({name,status:'PASS',detail});console.log(name+': '+detail);};
const report={status:'FAIL',checks,artifacts,errors:[]};
await writeFile(join(root,'qc/production-report.json'),JSON.stringify(report,null,2));
try{
 const build=JSON.parse(await readFile(join(root,'qc/build-report.json'),'utf8'));
 assert(build.status==='READY FOR ETSY REVIEW','Print build did not pass');
 assert((await readdir(join(root,'source'))).sort().join('|')===IDS.map(id=>id+'.png').join('|'),'Source count/names mismatch');
 for(const r of build.sources)assert(hash(await readFile(join(root,'source',r.name)))===r.sha256,'Source changed since build');
 assert(build.sources.map(r=>r.id).join('|')===IDS.join('|')&&build.sources.every(r=>r.id===r.sourceId),'Page order mismatch');
 pass('Approved source count, order and hashes','20/20');
 for(const r of build.artifacts)assert(hash(await readFile(join(root,r.path)))===r.sha256,'Artifact changed: '+r.path);
 pass('Build artifact hashes');
 await mkdir(join(root,'qc/pdf-previews'),{recursive:true});
 const imageQuality=[];
 for(const format of Object.keys(FORMATS)){
  const pdfPath=join(root,`output/deliverables/${config.prefix}-${format}.pdf`);
  const pdf=await PDFDocument.load(await readFile(pdfPath));
  assert(pdf.getPageCount()===20,'PDF page count');
  for(const [i,page] of pdf.getPages().entries()){
   const dict=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);
   const img=pdf.context.lookup(dict.entries()[0][1]);
   assert(img instanceof PDFRawStream,'Invalid image stream');
   const dims=FORMATS[format].map(mm=>mm*72/25.4);
   assert(Math.abs(page.getWidth()-dims[0])<.01&&Math.abs(page.getHeight()-dims[1])<.01,'PDF dimensions');
   if(img.dict.get(PDFName.of('Filter'))?.toString()==='/DCTDecode'){
    const actual=await decode(img.contents), original=await decode(await readFile(join(root,'source',IDS[i]+'.png')));
    assert(actual.info.width===original.info.width&&actual.info.height===original.info.height,'Embedded image resampled');
    let mse=0,white=0,whiteError=0;for(let j=0;j<actual.data.length;j++){const delta=actual.data[j]-original.data[j];mse+=delta*delta;if(original.data[j]>=250){white++;whiteError+=Math.abs(delta);}}
    const psnr=10*Math.log10(255*255/(mse/actual.data.length));
    assert(psnr>38,'PDF compression deviates from approved art');
    assert(whiteError/white<2,'PDF background contamination');
    imageQuality.push({format,id:IDS[i],psnr,meanNearWhiteError:whiteError/white});
   }
  }
  const rendered=await inspectPdf(pdfPath,{dpi:100,outPrefix:join(root,`qc/pdf-previews/${format}`)});
  assert(rendered.length===20,'PDF rendering count');
  const items=[];
  for(const [i,p]of rendered.entries()){
   const stats=await sharp(p.pngPath).stats();assert(stats.channels[0].stdev>10,'Blank rendered PDF page');
   items.push({id:IDS[i],bytes:await readFile(p.pngPath)});
  }
  await writeFile(join(root,`qc/${format}-pdf-contact-sheet.png`),await contactSheet(items));
  pass(`${format} PDF render and embedded artwork`,'20/20');
  const files=await readdir(join(root,'output/png',format));
  assert(files.sort().join('|')===IDS.map(id=>config.pngName(id,format)).sort().join('|'),'PNG set incorrect');
  for(const id of IDS){
   const original=await decode(await readFile(join(root,'source',id+'.png')));
   const pageRecord=build.pages.find(p=>p.id===id&&p.format===format),p=pageRecord.placement;
   assert(p.scale===1&&p.iw===1254&&p.ih===1254,'Source was resampled');
   const bytes=await readFile(join(root,'output/png',format,config.pngName(id,format)));
   const extracted=await sharp(bytes).extract({left:p.left,top:p.top,width:p.iw,height:p.ih}).removeAlpha().raw().toBuffer();
   assert(extracted.equals(original.data),'Source pixels changed in PNG');
  }
  pass(`${format} PNG count and pixel preservation`,'20/20');
 }
 report.pdfCompression=imageQuality;
 const guide=await inspectPdf(join(root,'output/deliverables/LumiumX-Printing-Guide.pdf'),{dpi:100,outPrefix:join(root,'qc/pdf-previews/guide')});
 assert(guide.length===1,'Guide page count');
 for(const phrase of ['Cozy Autumn Adventures','No physical item','A4','US Letter','100%','print service'])assert(guide[0].text.includes(phrase),'Guide missing '+phrase);
 pass('Printing guide render and content');
 const recovered={},bundles=[];
 const zipNames=(await readdir(join(root,'output/etsy'))).sort();
 assert(zipNames.length<=5&&zipNames.every(n=>n.endsWith('.zip')),'Invalid Etsy attachment set');
 for(const name of zipNames){
  const bytes=await readFile(join(root,'output/etsy',name));assert(bytes.length<=config.limit,'Attachment exceeds headroom limit');
  const entries=unzipSync(bytes);
  for(const [n,b]of Object.entries(entries)){assert(!recovered[n],'Duplicate packaged entry');recovered[n]=b;assert(/\.(png|pdf)$/.test(n),'Unexpected packaged file');}
  bundles.push({name,bytes:bytes.length,contents:Object.keys(entries)});
 }
 const expected=['LumiumX-Printing-Guide.pdf',...Object.keys(FORMATS).flatMap(format=>[`${config.prefix}-${format}.pdf`,...IDS.map(id=>`${format}/${config.pngName(id,format)}`)])];
 assert(Object.keys(recovered).sort().join('|')===expected.sort().join('|'),'Missing or extra delivery content');
 for(const [name,bytes]of Object.entries(recovered)){
  const path=name.includes('/')?join(root,'output/png',name):join(root,'output/deliverables',name);
  assert(hash(bytes)===hash(await readFile(path)),'Packaged bytes changed');
 }
 report.bundles=bundles;
 pass('ZIP integrity, exact contents and headroom',`${bundles.length} bundles; 43 customer files`);
 const listing=JSON.parse(await readFile(join(root,'listing/listing.json'),'utf8'));
 assert(listing.title.length<=140,'Title exceeds limit');
 assert(listing.tags.length===13&&new Set(listing.tags).size===13&&listing.tags.every(t=>t.length<=20),'Invalid tags');
 assert(listing.pageCount===20&&listing.formats.join('|')==='A4|US-Letter'&&listing.digital,'Listing claims mismatch');
 assert(!/300\s*[- ]?dpi|therap|heal|cure/i.test(listing.description+listing.title),'Unsupported listing claims');
 assert(listing.description.includes(`all ${['zero','one','two','three','four','five'][bundles.length]} ZIP`),'Bundle count in copy mismatch');
 const md=`# Cozy Autumn Adventures\n\n## Etsy title\n\n${listing.title}\n\n## Description\n\n${listing.description}\n\n## Tags\n\n${listing.tags.join(', ')}\n\n## Upload files\n\n${bundles.map(b=>`- ${b.name} (${(b.bytes/1e6).toFixed(2)} MB)`).join('\n')}\n\n## Seller notes\n\nUpload only output/etsy ZIPs. Use output/marketing/01-hero.png first, then 02 through 10. Review only; nothing has been published. No new license terms have been invented.\n\nEtsy limits checked 2026-09-26: [digital files](https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings), [tags](https://help.etsy.com/hc/en-us/articles/360000336307-How-to-Use-Tags-to-Get-Found-in-Search).\n`;
 await writeFile(join(root,'listing/LISTING.md'),md);
 pass('Listing title, description and tags','13 valid tags');
 const marketing=JSON.parse(await readFile(join(root,'qc/marketing-report.json'),'utf8'));
 const layouts=JSON.parse(await readFile(join(root,'qc/marketing-layout.json'),'utf8'));
 assert(layouts.length===10&&layouts.every(r=>r.errors.length===0),'Marketing layout checks did not pass');
 const pngs=(await readdir(join(root,'output/marketing'))).filter(n=>n.endsWith('.png'));
 assert(pngs.length===10&&marketing.renders.length===10,'Marketing count');
 for(const r of marketing.renders){
  const m=await sharp(r.outPath).metadata();assert(m.width===2000&&m.height===2000,'Marketing dimensions');
  assert(!r.overflowPx&&!r.blocked.length&&r.hasBranding&&r.minFontPx>=24,'Marketing render QC');
  for(const c of r.claimTokens){const known={'product-title':config.title,'page-count':'20','paper-sizes':'A4,US-Letter'};assert(known[c.claim]===c.value,'Unsupported marketing claim');}
  artifacts.push({path:relative(root,r.outPath).replaceAll('\\','/'),sha256:hash(await readFile(r.outPath))});
 }
 pass('Marketing dimensions and factual claims','10/10');
 pass('Marketing overlap, footer clearance, fonts and images','10/10');
 report.status='AUTOMATED QC PASS';
 report.resolution='PASS WITH NOTICE: native 1254 x 1254; actual artwork density 180 PPI; no upscaling or 300-DPI claim.';
}catch(e){report.errors.push(e.stack);console.error(e.message);process.exitCode=1;}
await writeFile(join(root,'qc/production-report.json'),JSON.stringify(report,null,2));
console.log(report.status);
