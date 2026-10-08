// Stage 4 inputs: the owner-approved Stage 2 package and Stage 3 listing +
// images, re-verified from disk (SHA-256) every time. Read only: nothing here
// writes to production/ or marketing/.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { sha256, hashOf, Stage4Error } from './common.mjs';

const PNG_SIG=Buffer.from([137,80,78,71,13,10,26,10]);
const bad=(m)=>new Stage4Error('LOCAL_ASSET_CHANGED',m,{retryable:false});

async function filesUnder(dir){
  const out=[];
  const walk=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())await walk(p);else out.push(p);}};
  await walk(dir);return out;
}

/** Stage 2: the approved customer deliverables, exactly as the build record lists them. */
export async function verifyStage2(productDir,product){
  const prod=product.production;
  if(!prod?.approved_at||!prod?.qc?.passed)throw new Stage4Error('INPUT_INVALID','Stage 2 production is not approved with a passing QC.',{retryable:false});
  for(const [label,file,expect] of [['handoff',prod.handoff.file,prod.handoff.sha256],['build record',prod.build.record,prod.build.sha256]]){
    const bytes=await readFile(join(productDir,file)).catch(()=>null);
    if(!bytes||sha256(bytes)!==expect)throw bad(`Stage 2 ${label} changed since production approval (${file}).`);
  }
  const qc=JSON.parse(await readFile(join(productDir,prod.qc.report),'utf8'));
  if(qc.passed!==true)throw bad('Stage 2 QC report no longer passes.');
  const record=JSON.parse(await readFile(join(productDir,prod.build.record),'utf8'));
  const deliverablesDir=join(productDir,'production','deliverables',record.package);
  const outputs=[];
  for(const [rel,o] of Object.entries(record.outputs)){
    const bytes=await readFile(join(deliverablesDir,rel)).catch(()=>null);
    if(!bytes||sha256(bytes)!==o.sha256)throw bad(`Stage 2 deliverable missing or changed: ${rel}`);
    // Page numbers a file carries (for delivery-file names only): a page PNG, or the pages placed in a PDF.
    const pages=Number.isInteger(o.page_number)?[o.page_number]:[...new Set((o.placements??[]).map(p=>p.page_number).filter(Number.isInteger))];
    outputs.push({rel,kind:o.kind,sha256:o.sha256,bytes:bytes.length,pages:pages.length?pages:null});
  }
  // Anything in the folder that the build record does not list is NOT customer content.
  const listed=new Set(outputs.map(o=>o.rel));
  const extras=(await filesUnder(deliverablesDir)).map(f=>relative(deliverablesDir,f).split(sep).join('/')).filter(r=>!listed.has(r));
  return {package:record.package,deliverablesDir,outputs,extras,approvedZip:record.zip??null,approvedZipParts:record.zip_parts??null,buildRecordSha:prod.build.sha256,
    fingerprint:hashOf({handoff:prod.handoff.sha256,build_record:prod.build.sha256,outputs:outputs.map(o=>[o.rel,o.sha256])})};
}

/** Stage 3: the approved listing and the approved listing images, in rank order. */
export async function verifyStage3(productDir,product){
  const m=product.marketing;
  if(!m?.approved_at||!m.qc?.passed)throw new Stage4Error('INPUT_INVALID','Stage 3 marketing is not approved with a passing QC.',{retryable:false});
  const listingBytes=await readFile(join(productDir,m.listing.file)).catch(()=>null);
  if(!listingBytes||sha256(listingBytes)!==m.listing.sha256)throw bad('The approved Stage 3 listing changed since marketing approval.');
  const planBytes=await readFile(join(productDir,m.plan.file)).catch(()=>null);
  if(!planBytes||sha256(planBytes)!==m.plan.sha256)throw bad('The approved Stage 3 image plan changed since marketing approval.');
  const render=JSON.parse(await readFile(join(productDir,m.images.dir,'render.json'),'utf8'));
  if(render.length!==m.images.count)throw bad(`Expected ${m.images.count} approved listing images, render record has ${render.length}.`);
  const images=[];
  for(const [i,r] of render.entries()){
    const rank=i+1, file=`${m.images.dir}/${r.file}`;
    if(!r.file.startsWith(String(rank).padStart(2,'0')+'-')||!r.file.endsWith('.png'))throw bad(`Listing image ${r.file} is out of rank order.`);
    const bytes=await readFile(join(productDir,file)).catch(()=>null);
    if(!bytes||!bytes.subarray(0,8).equals(PNG_SIG))throw bad(`Listing image missing or not a PNG: ${file}`);
    images.push({rank,file,sha256:sha256(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
  }
  const listing=JSON.parse(listingBytes.toString('utf8'));
  return {listing,listingSha:m.listing.sha256,planSha:m.plan.sha256,images,approvedAt:m.approved_at,
    fingerprint:hashOf({listing:m.listing.sha256,plan:m.plan.sha256,images:images.map(x=>[x.file,x.sha256])})};
}

export async function verifyApprovedInputs(productDir,product){
  return {stage2:await verifyStage2(productDir,product),stage3:await verifyStage3(productDir,product)};
}
export const statSize=async p=>(await stat(p)).size;
