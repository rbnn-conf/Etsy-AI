// Stage 4 customer download: the DELIVERY SET for one product (ADR-038).
// The planner (delivery-plan.mjs) turns the approved Stage 2 deliverables into
// one ZIP when it fits, or several customer-named ZIPs (logical groups) when it
// does not. Each ZIP is deterministic and contains exactly files the Stage 2
// build record lists (never an arbitrary recursive zip). Every ZIP is reopened
// and every entry compared byte-for-byte (SHA-256) with its approved source,
// and the whole set is proved complete: every approved file exactly once, no
// extra, internal or changed file, every ZIP within the limits. All of this
// happens before Stage 4 makes any Etsy call. Stage 2 files are only read.
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { zipDeterministic, unzipSync } from '../../../production/src/lib.mjs';
import { sha256, hashOf, ETSY, Stage4Error, writeBytesAtomic, writeJsonAtomic, readJsonIf } from './common.mjs';
import { verifyStage2 } from './inputs.mjs';
import { planDelivery, DeliveryPlanError } from './delivery-plan.mjs';

// Fixed ZIP timestamp: identical inputs always give an identical ZIP.
const ZIP_DATE=new Date(2000,0,1,0,0,0);
// Never customer content, whatever the build record says.
const INTERNAL=/(^|\/)\.|__MACOSX|thumbs\.db$|\.(json|md|mjs|js|ts|log|tmp)$|(^|\/)(qc|marketing|proofs?|prompts?|references?|creative|src|test)(\/|$)/i;
const MB=b=>`${(b/1e6).toFixed(2)} MB`;
export const DELIVERY_LIMITS=Object.freeze({filesMax:ETSY.filesMax,safeBytes:ETSY.fileBytesSafe,namePattern:ETSY.fileNamePattern});

/**
 * @returns {{zipPath, manifest, reused}} manifest = etsy/delivery/delivery-manifest.json
 *   (zipPath: the single ZIP, or null when the product is delivered as several files)
 */
export async function buildDelivery({productDir,product,deliveryDir,now=new Date(),limits=DELIVERY_LIMITS}){
  const s2=await verifyStage2(productDir,product);
  const bad=s2.outputs.filter(o=>INTERNAL.test(o.rel));
  if(bad.length)throw new Stage4Error('DELIVERY_INVALID',`Build record lists internal files as deliverables: ${bad.map(o=>o.rel).join(', ')}`,{retryable:false});
  let plan;
  // Stage 2's parts, as deliverable paths (ADR-066): used only when whole logical groups cannot meet Etsy's file count.
  const productionParts=s2.approvedZipParts?.map(z=>z.entries.map(e=>e.slice(s2.package.length+1)))??null;
  try{plan=planDelivery({packageName:s2.package,outputs:s2.outputs,limits,productionParts});}
  catch(e){if(e instanceof DeliveryPlanError)throw new Stage4Error('DELIVERY_INVALID',e.message,{retryable:false});throw e;}
  for(const p of plan.packages)if(!ETSY.fileNamePattern.test(p.name))
    throw new Stage4Error('DELIVERY_INVALID',`ZIP name "${p.name}" breaks Etsy's file-name rule (at most 70 letters, digits, ., _ or -).`,{retryable:false});
  const manifestPath=join(deliveryDir,'delivery-manifest.json');
  const entryOf=o=>({entry:`${s2.package}/${o.rel}`,source:`production/deliverables/${s2.package}/${o.rel}`,sha256:o.sha256,bytes:o.bytes});
  const expected=s2.outputs.map(entryOf);
  const byRel=new Map(s2.outputs.map(o=>[o.rel,entryOf(o)]));
  const planned=plan.packages.map((p,i)=>({...p,rank:i+1,path:join(deliveryDir,p.name),expected:p.rels.map(r=>byRel.get(r))}));

  // Reuse when the approved sources, the plan and every ZIP are exactly what the manifest recorded.
  const prev=await readJsonIf(manifestPath);
  if(prev?.schema_version===2&&prev.source_fingerprint===s2.fingerprint&&prev.verification?.passed&&prev.plan_sha256===hashOf(plan)){
    const files=await Promise.all(planned.map(p=>readFile(p.path).catch(()=>null)));
    if(files.every((b,i)=>b&&sha256(b)===prev.packages[i]?.sha256)){
      const set=verifyDeliverySet({files,planned,expected,s2,limits});
      if(set.passed)return {zipPath:planned.length===1?planned[0].path:null,manifest:prev,reused:true};
    }
  }
  const files=[];
  for(const p of planned){
    const entries={};
    for(const e of p.expected)entries[e.entry]=await readFile(join(productDir,e.source));
    const bytes=zipDeterministic(entries,ZIP_DATE);
    if(bytes.length>ETSY.fileBytesMax)
      throw new Stage4Error('DELIVERY_INVALID',`${planned.length===1?'The customer ZIP':`Delivery file ${p.name}`} is ${MB(bytes.length)}, over Etsy's ${ETSY.fileBytesMax/1e6} MB per-file limit. Nothing was removed or recompressed.`,{retryable:false});
    files.push(bytes);
  }
  const verification=verifyDeliverySet({files,planned,expected,s2,limits});
  if(!verification.passed)throw new Stage4Error('DELIVERY_INVALID',`Customer delivery failed verification: ${verification.checks.filter(c=>!c.ok).map(c=>`${c.name}${c.detail?` (${c.detail})`:''}`).join('; ')}`,{retryable:false});
  // Stage 2 must be byte-for-byte unchanged after the build.
  const after=await verifyStage2(productDir,product);
  if(after.fingerprint!==s2.fingerprint)throw new Stage4Error('LOCAL_ASSET_CHANGED','Stage 2 deliverables changed while the ZIP was being built.',{retryable:false});
  for(const [i,p] of planned.entries())await writeBytesAtomic(p.path,files[i]);
  const rel=p=>relative(productDir,p).split(sep).join('/');
  const packages=planned.map((p,i)=>({rank:p.rank,name:p.name,file:rel(p.path),sha256:sha256(files[i]),bytes:files[i].length,size:MB(files[i].length),
    purpose:p.purpose,label:p.label,contents:p.expected}));
  const manifest={schema_version:2,source_deliverables_dir:`production/deliverables/${s2.package}`,source_fingerprint:s2.fingerprint,
    build_record_sha256:s2.buildRecordSha,
    note:'PRODUCT vs DELIVERY FILE: one approved product (one Etsy listing) delivered as these ZIP files; together they hold every approved customer file exactly once.',
    strategy:plan.strategy,plan_sha256:hashOf(plan),
    limits:{files_max:limits.filesMax,file_bytes_max:ETSY.fileBytesMax,safe_bytes:limits.safeBytes},
    packages,
    // Single-file products keep the original record shape.
    zip:packages.length===1?{file:packages[0].file,name:packages[0].name,sha256:packages[0].sha256,bytes:packages[0].bytes,timestamp_in_zip:'2000-01-01T00:00:00 (fixed)'}:null,
    entries:expected,excluded_extras:s2.extras,verification,built_at:now.toISOString()};
  await writeJsonAtomic(manifestPath,manifest);
  return {zipPath:packages.length===1?planned[0].path:null,manifest,reused:false};
}

/**
 * The whole delivery set against the approved deliverables: every ZIP opens,
 * holds exactly its planned entries with identical bytes, stays within the
 * limits; and together the ZIPs hold every approved file exactly once, nothing
 * else (by path AND SHA-256, not by count).
 */
export function verifyDeliverySet({files,planned,expected,s2,limits=DELIVERY_LIMITS}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});
  const seen=new Map(), unexpected=[], changed=[], broken=[], misplaced=[];
  const want=new Map(expected.map(e=>[e.entry,e]));
  files.forEach((bytes,i)=>{
    const p=planned[i];
    let z;
    try{z=unzipSync(new Uint8Array(bytes));}catch(e){broken.push(`${p.name}: ${e.message}`);return;}
    const names=Object.keys(z).filter(n=>!n.endsWith('/'));
    const mine=new Set(p.expected.map(e=>e.entry));
    for(const n of names){
      seen.set(n,[...(seen.get(n)??[]),p.name]);
      const e=want.get(n);
      if(!e||INTERNAL.test(n.slice(n.indexOf('/')+1)))unexpected.push(`${p.name}: ${n}`);
      else if(sha256(Buffer.from(z[n]))!==e.sha256||z[n].length!==e.bytes)changed.push(n);
      if(!mine.has(n))misplaced.push(`${p.name}: ${n}`);
    }
  });
  add('every delivery ZIP opens',!broken.length,broken.join('; '));
  add('every approved customer file present',expected.every(e=>seen.has(e.entry)),expected.filter(e=>!seen.has(e.entry)).map(e=>e.entry).join(', '));
  add('every approved customer file exactly once',[...seen].every(([,where])=>where.length===1),[...seen].filter(([,w])=>w.length>1).map(([n,w])=>`${n} in ${w.join(' and ')}`).join('; '));
  add('no extra or internal files',!unexpected.length,unexpected.join(', '));
  add('entry bytes identical to approved sources (SHA-256)',!changed.length,changed.join(', '));
  add('each ZIP holds exactly its planned files',!misplaced.length&&planned.every(p=>p.expected.every(e=>seen.get(e.entry)?.includes(p.name))),misplaced.join(', '));
  add('single top-level customer folder',[...seen.keys()].every(n=>n.startsWith(`${s2.package}/`)));
  // The same customer files as the approved Stage 2 package (one ZIP or its parts).
  const approved=s2.approvedZip?.entries??(s2.approvedZipParts?s2.approvedZipParts.flatMap(z=>z.entries):null);
  if(approved)add('same entries as the approved Stage 2 package',JSON.stringify([...seen.keys()].sort())===JSON.stringify([...approved].sort()));
  add(`within Etsy's ${ETSY.fileBytesMax/1e6} MB file limit`,files.every(b=>b.length<=ETSY.fileBytesMax),files.map((b,i)=>`${planned[i].name} ${b.length} bytes`).join(', '));
  if(planned.length>1)add(`within the ${MB(limits.safeBytes)} delivery headroom`,files.every(b=>b.length<=limits.safeBytes),files.map((b,i)=>`${planned[i].name} ${MB(b.length)}`).join(', '));
  add(`at most ${limits.filesMax} digital files per listing`,files.length>=1&&files.length<=limits.filesMax,`${files.length} file${files.length>1?'s':''}`);
  add('delivery file names unique and valid',new Set(planned.map(p=>p.name.toLowerCase())).size===planned.length&&planned.every(p=>ETSY.fileNamePattern.test(p.name)),planned.map(p=>p.name).join(', '));
  return {passed:checks.every(c=>c.ok),checks};
}

/** One ZIP (kept for callers and tests of the single-file path). */
export function verifyZip(bytes,expected,s2){
  return verifyDeliverySet({files:[bytes],planned:[{name:`${s2.package}.zip`,expected}],expected,s2});
}
