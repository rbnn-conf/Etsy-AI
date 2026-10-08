// Stage 2 QC. Re-verifies everything from the files on disk (not from what
// the build believes it wrote) and renders every PDF page with pdf.js, so the
// blank-page check and the owner's previews come from the real customer
// files. The adapter adds its own product-type checks.
import { readFile, access, rm, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, sharp, PDFDocument, unzipSync, renderPdf, atomicWrite, ETSY_FILE_LIMIT, ETSY_FILE_SAFE, ETSY_FILES_MAX, ETSY_FILE_NAME } from './lib.mjs';
import { verifyHandoffSources } from './handoff.mjs';
import { adapterFor } from './adapters/index.mjs';
import { BUILD_RECORD, DELIVERABLES } from './build.mjs';

export const QC_REPORT='production/qc-report.json';
export const PREVIEWS='production/previews';
const exists=p=>access(p).then(()=>true,()=>false);
const SAFE=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PT_PER_MM=72/25.4;
const stemOf=rel=>rel.split('/').at(-1).replace(/\.pdf$/,'');

export async function runQc({productDir,handoff,now=new Date(),adapter:override=null}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
  const record=JSON.parse(await readFile(join(productDir,BUILD_RECORD),'utf8'));
  const base=join(productDir,DELIVERABLES,record.package), outputs=Object.entries(record.outputs);
  const files=new Map();
  for(const [rel] of outputs)if(await exists(join(base,rel)))files.set(rel,await readFile(join(base,rel)));

  try{await verifyHandoffSources(handoff,productDir);add('approved artwork unchanged',true,`${handoff.assets.length} approved assets match the handoff SHA-256`);}
  catch(e){add('approved artwork unchanged',false,e.message);}

  const missing=outputs.filter(([rel,o])=>!files.has(rel)||hash(files.get(rel))!==o.sha256).map(([rel])=>rel);
  add('expected files present',!missing.length,missing.length?`missing or changed: ${missing.join(', ')}`:`${outputs.length} files`);
  const variantsFound=new Set(outputs.map(([,o])=>o.variant)), absent=record.variants.filter(v=>!variantsFound.has(v));
  add('print variants complete',!absent.length,absent.length?`missing: ${absent.join(', ')}`:record.variants.join(', '));
  const zips=record.zip_parts??(record.zip?[record.zip]:[]);
  const names=[...outputs.map(([rel])=>rel),...(zips.length?zips.map(z=>z.file.split('/').at(-1)):[''])].flatMap(r=>r.split('/'));
  const unsafe=names.filter(n=>!SAFE.test(n));
  add('filenames safe',!unsafe.length,unsafe.join(', '));
  const dupes=outputs.filter(([rel,o])=>outputs.some(([r2,o2])=>r2!==rel&&o2.sha256===o.sha256)).map(([rel])=>rel);
  add('no duplicate outputs',!dupes.length,dupes.length?`identical files: ${dupes.join(', ')}`:'');

  // Originals: byte-identical to the approved assets. Everything else: traceable to them.
  const byAsset=new Map(handoff.assets.map(a=>[a.id,a]));
  const originals=outputs.filter(([,o])=>o.kind==='original');
  if(originals.length)add('card artwork identical to approved originals',originals.every(([rel,o])=>files.has(rel)&&hash(files.get(rel))===byAsset.get(o.expect.identical_to)?.sha256),'');
  const untraceable=outputs.filter(([,o])=>o.sources.some(s=>byAsset.get(s.asset)?.sha256!==s.sha256)).map(([rel])=>rel);
  add('derived files traceable to approved artwork',!untraceable.length,untraceable.join(', '));
  const placements=outputs.flatMap(([,o])=>o.placements??[]).filter(p=>p.source_aspect);
  const distorted=placements.filter(p=>Math.abs(p.placed_aspect-p.source_aspect)/p.source_aspect>0.005);
  const clipped=placements.filter(p=>p.visible_mm).length;
  add('aspect ratio preserved',!distorted.length,distorted.length?distorted.map(p=>p.where).join(', '):`${placements.length} placements, no stretch${clipped?`; ${clipped} shown through a frame (display crop only; the approved files are unchanged)`:', no crop'}`);

  // PDFs: readable, page count, size and orientation; every page rendered and not blank.
  await rm(join(productDir,PREVIEWS),{recursive:true,force:true});await mkdir(join(productDir,PREVIEWS),{recursive:true});
  const wanted=record.previews??[], previewRels=new Set(wanted.map(p=>p.rel)), pdfProblems=[], blank=[], rendered=new Map(), kept=new Map();
  for(const [rel,o] of outputs.filter(([,o])=>o.kind==='pdf'||o.kind==='guide')){
    if(!files.has(rel))continue;
    try{
      const pdf=await PDFDocument.load(files.get(rel)), pages=pdf.getPages();
      if(pages.length!==o.expect.pages)pdfProblems.push(`${rel}: ${pages.length} pages, expected ${o.expect.pages}`);
      for(const [i,pg] of pages.entries()){
        const {width,height}=pg.getSize(), [ew,eh]=o.expect.size_mm, w=width/PT_PER_MM, h=height/PT_PER_MM;
        const orient=o.expect.orientation==='landscape'?w>h:o.expect.orientation==='portrait'?h>w:true;
        const fits=(Math.abs(w-ew)<0.5&&Math.abs(h-eh)<0.5)||(Math.abs(w-eh)<0.5&&Math.abs(h-ew)<0.5);
        if(!fits||!orient)pdfProblems.push(`${rel} page ${i+1}: ${w.toFixed(1)} x ${h.toFixed(1)} mm`);
      }
      const prefix=join(productDir,PREVIEWS,stemOf(rel));
      const pages2=await renderPdf(join(base,rel),{dpi:previewRels.has(rel)?72:24,outPrefix:prefix});
      rendered.set(rel,pages2.map(r=>({page:r.page,text:r.text,textItems:r.textItems})));
      for(const r of pages2){
        const stats=await sharp(await readFile(r.pngPath)).stats();
        if(!o.expect.minimal_pages?.includes(r.page)&&Math.max(...stats.channels.slice(0,3).map(c=>c.stdev))<2)blank.push(`${rel} page ${r.page}`);
        if(wanted.some(p=>p.rel===rel&&p.page===r.page))kept.set(`${rel}#${r.page}`,r.pngPath);
        else await rm(r.pngPath,{force:true});
      }
    }catch(e){pdfProblems.push(`${rel}: unreadable (${e.message})`);}
  }
  add('PDFs valid: page counts, sizes and orientation',!pdfProblems.length,pdfProblems.join('; '));
  add('no blank pages',!blank.length,blank.join(', '));
  // Owner previews in the adapter's order, named for what they show.
  const previews=[];
  for(const [i,p] of wanted.entries()){
    const src=kept.get(`${p.rel}#${p.page}`);if(!src)continue;
    const file=join(productDir,PREVIEWS,`preview-${String(i+1).padStart(2,'0')}-${stemOf(p.rel)}-p${p.page}.png`);
    await rename(src,file);
    previews.push({file:file.slice(productDir.length+1).replaceAll('\\','/'),source:p.rel,page:p.page,label:p.label});
  }
  add('owner previews rendered',previews.length===wanted.length,`${previews.length} of ${wanted.length}`);

  // ZIP: exact entries, exact bytes, one file within the limit. A split package:
  // every part verified, parts together hold every deliverable exactly once.
  if(!record.zip_parts){
  try{
    const bytes=await readFile(join(productDir,record.zip.file));
    const entries=unzipSync(bytes), expected=outputs.map(([rel])=>`${record.package}/${rel}`).sort();
    const same=Object.keys(entries).sort().join('|')===expected.join('|')&&outputs.every(([rel,o])=>hash(Buffer.from(entries[`${record.package}/${rel}`]))===o.sha256);
    add('ZIP package verified',same&&hash(bytes)===record.zip.sha256,same?`${expected.length} entries`:'entries differ from the deliverables');
    add('file sizes fit Etsy',bytes.length<=ETSY_FILE_LIMIT,`${(bytes.length/1e6).toFixed(1)} MB (limit ${ETSY_FILE_LIMIT/1e6} MB)`);
  }catch(e){add('ZIP package verified',false,e.message);}
  }else{
    const problems=[], seen=new Map(), sizes=[];
    for(const z of record.zip_parts){
      try{
        const bytes=await readFile(join(productDir,z.file));
        if(hash(bytes)!==z.sha256)problems.push(`${z.name}: changed since the build`);
        const entries=unzipSync(bytes);
        if(Object.keys(entries).sort().join('|')!==[...z.entries].sort().join('|'))problems.push(`${z.name}: entries differ from the manifest`);
        for(const [name,data] of Object.entries(entries)){
          const rel=name.slice(record.package.length+1), o=record.outputs[rel];
          if(!name.startsWith(`${record.package}/`)||!o)problems.push(`${z.name}: unexpected ${name}`);
          else if(hash(Buffer.from(data))!==o.sha256)problems.push(`${z.name}: ${rel} bytes differ`);
          if(seen.has(name))problems.push(`${name} is in ${seen.get(name)} and ${z.name}`);
          seen.set(name,z.name);
        }
        sizes.push([z.name,bytes.length]);
      }catch(e){problems.push(`${z.name}: ${e.message}`);}
    }
    const missingFromZips=outputs.map(([rel])=>`${record.package}/${rel}`).filter(n=>!seen.has(n));
    if(missingFromZips.length)problems.push(`not in any part: ${missingFromZips.join(', ')}`);
    add('ZIP package verified',!problems.length,problems.length?problems.slice(0,6).join('; '):`${record.zip_parts.length} ZIP part${record.zip_parts.length>1?'s':''}, ${seen.size} entries, each deliverable exactly once`);
    // ADR-066: a split part must be a file Stage 4 delivers unchanged: at most the safe size, and at most ETSY_FILES_MAX parts.
    const over=sizes.filter(([,b])=>b>ETSY_FILE_SAFE), badNames=record.zip_parts.filter(z=>!ETSY_FILE_NAME.test(z.name)).map(z=>z.name);
    add('file sizes fit Etsy',!over.length&&record.zip_parts.length<=ETSY_FILES_MAX&&!badNames.length,
      `${sizes.map(([n,b])=>`${n} ${(b/1e6).toFixed(1)} MB`).join(', ')} (limit ${ETSY_FILE_SAFE/1e6} MB each, ${ETSY_FILES_MAX} files)${badNames.length?`; bad names: ${badNames.join(', ')}`:''}`);
  }

  // Product-type checks (e.g. greeting-card variants, backs, guide claims).
  const adapter=override??adapterFor(handoff.product_format);
  if(adapter.format!==handoff.product_format)throw new Error(`adapter ${adapter.format} cannot check a ${handoff.product_format} product`);
  if(adapter.qcChecks){
    const artwork=new Map();
    for(const a of handoff.assets)artwork.set(a.id,await readFile(join(productDir,a.file)));
    const writePreview=async(name,bytes,label)=>{const file=join(productDir,PREVIEWS,name);await atomicWrite(file,bytes);return {file:`${PREVIEWS}/${name}`,source:null,page:null,label};};
    const r=await adapter.qcChecks({handoff,record,rendered,files,productDir,artwork,writePreview});
    checks.push(...(Array.isArray(r)?r:r.checks));
    if(!Array.isArray(r)&&r.previews)previews.push(...r.previews);
  }

  // Resolution: report what the pixels support; never claim more.
  const byVariant={};
  for(const [,o] of outputs)for(const p of o.placements??[])if(p.effective_ppi)byVariant[o.variant]=Math.min(byVariant[o.variant]??Infinity,p.effective_ppi);
  const guideText=[...rendered.entries()].filter(([rel])=>/Guide/.test(rel)).flatMap(([,p])=>p.map(x=>x.text)).join(' ');
  const minPpi=Math.min(...Object.values(byVariant));
  add('no unsupported resolution claim',!(/\b300\s*(dpi|ppi)\b/i.test(guideText)&&minPpi<300),`effective print resolution ${Object.entries(byVariant).map(([k,v])=>`${k} ${v} ppi`).join(', ')}`);

  // ADR-067: an owner-approved artwork-overflow exception is stated in the report (it never turns a failing check here into a pass).
  const ov=handoff.approved?.full_artwork?.override??null;
  if(ov)add('creative QC: owner-approved artwork overflow exception',true,`${ov.statement} Accepted by ${ov.accepted_by} at ${ov.accepted_at}.`);
  const report={product_id:handoff.product_id,passed:checks.every(c=>c.ok),at:now.toISOString(),checks,
    ...(ov?{status:null,owner_overrides:[{kind:ov.kind,rule:ov.rule,pages:ov.pages,reasons:ov.reasons,accepted_by:ov.accepted_by,accepted_at:ov.accepted_at}]}:{}),
    resolution:{effective_ppi:byVariant,source_px:[...new Set(handoff.assets.map(a=>`${a.width}x${a.height}`))],
      density_metadata:[...new Set(handoff.assets.map(a=>a.density_metadata))],
      note:'Effective ppi = source pixels / printed size. PNG density metadata is not used when printing the PDFs.'},
    image_encoding:record.image_encoding,zip:record.zip&&{file:record.zip.file,bytes:record.zip.bytes},
    ...(record.zip_parts?{zip_parts:record.zip_parts.map(z=>({name:z.name,file:z.file,bytes:z.bytes}))}:{}),previews};
  // The statement only when the whole report passes: the exception never stands in for another failure.
  if(ov)report.status=report.passed?ov.statement:'FAIL: the owner-approved artwork overflow exception does not cover the failing checks.';
  await atomicWrite(join(productDir,QC_REPORT),Buffer.from(JSON.stringify(report,null,2)+'\n'));
  return report;
}
