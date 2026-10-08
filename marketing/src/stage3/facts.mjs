// Stage 3 source of truth: facts derived ONLY from the approved Stage 2
// production package (handoff, build record, QC report, deliverables), all
// re-verified by SHA-256. Listing claims and marketing images may state these
// facts and nothing else. Production files are only ever read.
//
// The checks every format shares live here; what a format's facts ARE (and
// its claim allow-list) comes from its Stage 3 adapter (adapters/index.mjs).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Stage3Error } from './errors.mjs';
import { sha, exists, readJson } from './shared.mjs';
import { stage3AdapterFor, adapterOf } from './adapters/index.mjs';

export { Stage3Error };
export { PROCESS_WORDS, scrubProcess } from './shared.mjs';

/** Verify the approved Stage 2 package and derive the facts Stage 3 may use. */
export async function deriveFacts(productDir){
  const product=await readJson(join(productDir,'product.json'));
  const allowed=['PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL','MARKETING_APPROVED'];
  const stage=product.status==='FAILED'?product.resume_state:product.status;
  if(!allowed.includes(stage))throw new Stage3Error(`Stage 3 needs a PRODUCTION_APPROVED product; #${product.product_id} is ${product.status}.`);
  const prod=product.production;
  if(!prod?.qc?.passed||!prod.approved_at)throw new Stage3Error('Production has no passing QC or owner approval.');
  // Every Stage 2 record must be exactly what the owner approved.
  const files={handoff:prod.handoff,build:{file:prod.build.record,sha256:prod.build.sha256}};
  for(const [k,ref] of Object.entries(files)){
    const path=join(productDir,ref.file);
    if(!await exists(path)||sha(await readFile(path))!==ref.sha256)throw new Stage3Error(`Stage 2 ${k} record changed since production approval: ${ref.file}`);
  }
  const handoff=await readJson(join(productDir,prod.handoff.file)), record=await readJson(join(productDir,prod.build.record));
  // The adapter is chosen before any format-specific read (e.g. a split colouring-book package has no single ZIP).
  const adapter=stage3AdapterFor(handoff.product_format,{recorded:!!record.stage3_handoff});
  const facts=await adapter.facts({productDir,product,prod,handoff,record,files});
  facts.claims=adapter.claimIndex(facts);
  return facts;
}

/** Claim allow-list: every factual phrase an image or listing may state, from production only. */
export const claimIndex=f=>adapterOf(f).claimIndex(f);
