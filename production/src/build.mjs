// Stage 2 build: deterministic and resumable. Every output is recorded in
// production/build-record.json with its SHA-256 and source-asset hashes,
// right after it is written; a later run skips any output that is already on
// disk with the recorded hash. Approved originals are only ever read.
import { readFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, atomicWrite, removeStaleTemps, verifyZip, zipDeterministic, ETSY_FILE_LIMIT, ETSY_FILES_MAX, PART_CAPACITY } from './lib.mjs';
import { adapterFor } from './adapters/index.mjs';
import { verifyHandoffSources } from './handoff.mjs';

export const BUILD_RECORD='production/build-record.json';
export const DELIVERABLES='production/deliverables';
export const PACKAGE_DIR='production/package';
// Lossless PNG first; high-quality JPEG copies inside the PDFs only if the
// package would not fit one 20 MB file (same ladder idea as Product #007).
export const ENCODING_LADDER=Object.freeze(['png',95,92,90,88]);
const exists=p=>access(p).then(()=>true,()=>false);

async function loadArtwork(handoff,productDir){
  const artwork=new Map();
  for(const a of handoff.assets)artwork.set(a.id,await readFile(join(productDir,a.file)));
  return artwork;
}
/**
 * Deterministic ZIP parts for a split adapter: outputs in plan order, next-fit
 * into parts that each stay within one Etsy file. One part when it all fits.
 */
// Split parts are packed to the project's safe delivery size (ADR-066), so Stage 4 can deliver them as they are.
export function packParts(outputs,sizeOf,capacity=PART_CAPACITY){
  const parts=[];let cur=[],bytes=0;
  for(const o of outputs){
    const b=sizeOf(o);
    if(cur.length&&bytes+b>capacity){parts.push(cur);cur=[];bytes=0;}
    cur.push(o);bytes+=b;
  }
  if(cur.length)parts.push(cur);
  return parts;
}
const fits=(adapter,plan,built)=>{
  const sizes=plan.outputs.map(o=>built.get(o.rel).bytes.length), total=sizes.reduce((s,v)=>s+v,0);
  if(!adapter.packaging?.split)return total<=ETSY_FILE_LIMIT*0.98;   // one ZIP (greeting card)
  if(sizes.some(v=>v>PART_CAPACITY))return false;
  return packParts(plan.outputs,o=>built.get(o.rel).bytes.length).length<=ETSY_FILES_MAX;
};
/** First encoding whose files fit Etsy. Returns the built outputs so they are not built twice. */
async function chooseEncoding(adapter,handoff,artwork,log){
  const ladder=adapter.encodingLadder??ENCODING_LADDER;
  for(const enc of ladder){
    const plan=await adapter.plan(handoff,{imageEncoding:enc,artwork}), built=new Map();
    let total=0;
    for(const o of plan.outputs){const r=await o.build(artwork);built.set(o.rel,r);total+=r.bytes.length;}
    log(`production: PDF image encoding ${JSON.stringify(enc)}: package about ${(total/1e6).toFixed(1)} MB`);
    if(fits(adapter,plan,built))return {encoding:enc,built};
  }
  throw new Error(adapter.packaging?.split
    ?`The package does not fit Etsy's ${ETSY_FILES_MAX} files of ${ETSY_FILE_LIMIT/1e6} MB even at the last encoding step (${JSON.stringify(ladder.at(-1))}).`
    :`The package does not fit one ${ETSY_FILE_LIMIT/1e6} MB file even with JPEG quality ${ENCODING_LADDER.at(-1)} inside the PDFs.`);
}

/**
 * Build (or finish building) the customer package.
 * force: rebuild every output even if a recorded copy exists (REBUILD button).
 */
export async function buildProduction({productDir,handoff,handoffSha,force=false,log=()=>{},adapter=adapterFor(handoff.product_format)}){
  // `adapter`: a design variant of the handoff's own format (scratch reviews); never another format.
  if(adapter.format!==handoff.product_format)throw new Error(`adapter ${adapter.format} cannot build a ${handoff.product_format} product`);
  // Temp files left by an interrupted or failed write; never one a live writer may still own.
  for(const f of await removeStaleTemps(join(productDir,'production')))log(`production: removed abandoned temp file ${f.split(/[\\/]/).at(-1)}`);
  await verifyHandoffSources(handoff,productDir);
  const artwork=await loadArtwork(handoff,productDir);
  const recordPath=join(productDir,BUILD_RECORD);
  let record=!force&&await exists(recordPath)?JSON.parse(await readFile(recordPath,'utf8')):null;
  if(record&&(record.handoff_sha256!==handoffSha||record.adapter.version!==adapter.version||record.adapter.design!==adapter.design))record=null;   // inputs or design changed
  if(!record){
    // Starting over: clear previous generated files so no stale deliverable survives. Sources are never here.
    for(const d of [DELIVERABLES,PACKAGE_DIR])await rm(join(productDir,d),{recursive:true,force:true});
  }
  let encoding=record?.image_encoding, prebuilt=new Map();
  if(encoding===undefined){({encoding,built:prebuilt}=await chooseEncoding(adapter,handoff,artwork,log));}
  const plan=await adapter.plan(handoff,{imageEncoding:encoding,artwork});
  // `adapter` is the package's design identity: APPROVE PRODUCTION compares it with the live adapter (package-design.mjs).
  record??={schema_version:2,product_id:handoff.product_id,
    handoff_sha256:handoffSha,adapter:{format:adapter.format,design:adapter.design,design_name:adapter.designName,version:adapter.version},
    image_encoding:encoding,package:plan.packageName,variants:plan.variants,card_variants:plan.card_variants??null,previews:plan.previews,outputs:{},zip:null,
    ...(plan.book?{book:plan.book,volumes:plan.volumes}:{}),...(plan.record??{}),...(adapter.stage3Metadata?{stage3_handoff:adapter.stage3Metadata(handoff,plan)}:{})};
  const save=()=>atomicWrite(recordPath,Buffer.from(JSON.stringify(record,null,2)+'\n'));
  const assetOf=id=>handoff.assets.find(a=>a.id===id);
  const built=[], skipped=[];
  for(const o of plan.outputs){
    const path=join(productDir,DELIVERABLES,plan.packageName,o.rel), prev=record.outputs[o.rel];
    if(prev&&await exists(path)&&hash(await readFile(path))===prev.sha256){skipped.push(o.rel);continue;}
    const r=prebuilt.get(o.rel)??await o.build(artwork);
    await atomicWrite(path,r.bytes);
    record.outputs[o.rel]={kind:o.kind,variant:o.variant,card_variant:o.card_variant??null,...(o.volume?{volume:o.volume}:{}),...(o.page_number?{page_number:o.page_number}:{}),sha256:hash(r.bytes),bytes:r.bytes.length,
      sources:o.sources.map(id=>({asset:id,file:assetOf(id).file,sha256:assetOf(id).sha256})),expect:o.expect,placements:r.placements};
    await save();built.push(o.rel);
    log(`production: wrote ${o.rel}`);
  }
  if(adapter.packaging?.split){await zipParts({productDir,plan,record,save,built,skipped,log});}
  else{
  // One ZIP (a single upload of at most 20 MB), with the customer folder structure inside.
  const zipName=`${plan.packageName}.zip`, zipPath=join(productDir,PACKAGE_DIR,zipName);
  const entriesDigest=hash(Buffer.from(JSON.stringify(plan.outputs.map(o=>[o.rel,record.outputs[o.rel].sha256]))));
  if(!(record.zip?.entries_digest===entriesDigest&&await exists(zipPath)&&hash(await readFile(zipPath))===record.zip.sha256)){
    const entries={};
    for(const o of plan.outputs)entries[`${plan.packageName}/${o.rel}`]=await readFile(join(productDir,DELIVERABLES,plan.packageName,o.rel));
    const bytes=zipDeterministic(entries,plan.date);
    verifyZip(bytes,entries);
    await atomicWrite(zipPath,bytes);
    record.zip={file:`${PACKAGE_DIR}/${zipName}`,sha256:hash(bytes),bytes:bytes.length,entries_digest:entriesDigest,entries:Object.keys(entries)};
    await save();built.push(zipName);log(`production: wrote ${zipName} (${(bytes.length/1e6).toFixed(1)} MB)`);
  }else skipped.push(zipName);
  }
  const recordBytes=await readFile(recordPath);
  return {record,recordSha:hash(recordBytes),built,skipped,plan};
}

/**
 * Split packaging: the authoritative list of customer ZIPs in record.zip_parts
 * (each entry list is exactly its share of the deliverables). A single part
 * keeps the plain <Package>.zip name and is also recorded as record.zip, the
 * same shape a one-ZIP adapter records, so Stage 4 reads it unchanged.
 */
async function zipParts({productDir,plan,record,save,built,skipped,log}){
  const parts=packParts(plan.outputs,o=>record.outputs[o.rel].bytes);
  const names=parts.length===1?[`${plan.packageName}.zip`]:parts.map((_,i)=>`${plan.packageName}-Part-${i+1}.zip`);
  const want=parts.map((list,i)=>({part:i+1,of:parts.length,name:names[i],entries_digest:hash(Buffer.from(JSON.stringify(list.map(o=>[o.rel,record.outputs[o.rel].sha256])))),list}));
  const prev=record.zip_parts??[];
  const same=prev.length===want.length&&(await Promise.all(want.map(async(w,i)=>prev[i].name===w.name&&prev[i].entries_digest===w.entries_digest
    &&await exists(join(productDir,prev[i].file))&&hash(await readFile(join(productDir,prev[i].file)))===prev[i].sha256))).every(Boolean);
  if(same){skipped.push(...names);return;}
  await rm(join(productDir,PACKAGE_DIR),{recursive:true,force:true});   // no stale part may survive a re-split
  const out=[];
  for(const w of want){
    const entries={};
    for(const o of w.list)entries[`${plan.packageName}/${o.rel}`]=await readFile(join(productDir,DELIVERABLES,plan.packageName,o.rel));
    const bytes=zipDeterministic(entries,plan.date);
    verifyZip(bytes,entries);
    await atomicWrite(join(productDir,PACKAGE_DIR,w.name),bytes);
    out.push({part:w.part,of:w.of,name:w.name,file:`${PACKAGE_DIR}/${w.name}`,sha256:hash(bytes),bytes:bytes.length,entries_digest:w.entries_digest,entries:Object.keys(entries)});
    built.push(w.name);log(`production: wrote ${w.name} (${(bytes.length/1e6).toFixed(1)} MB)`);
  }
  record.zip_parts=out;
  record.zip=out.length===1?(({part,of,name,...z})=>z)(out[0]):null;
  await save();
}
