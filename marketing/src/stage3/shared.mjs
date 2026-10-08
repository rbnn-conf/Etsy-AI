// Stage 3 helpers shared by the facts core and every product adapter:
// SHA-256 re-verification of the approved Stage 2 package (read only) and the
// authorship/process scrub for descriptive text.
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Stage3Error } from './errors.mjs';

export const sha=b=>createHash('sha256').update(b).digest('hex');
export const exists=p=>access(p).then(()=>true,()=>false);
export const readJson=async p=>JSON.parse(await readFile(p,'utf8'));

/**
 * Every Stage 2 deliverable and the customer ZIP(s) exactly as approved: one
 * ZIP (record.zip) or, for a split package, every part (record.zip_parts).
 */
export async function verifyPackage(productDir,record){
  const base=join(productDir,'production/deliverables',record.package);
  for(const [rel,o] of Object.entries(record.outputs)){
    const path=join(base,rel);
    if(!await exists(path)||sha(await readFile(path))!==o.sha256)throw new Stage3Error(`Stage 2 deliverable missing or changed: ${rel}`);
  }
  if(record.zip){
    const zipPath=join(productDir,record.zip.file);
    if(!await exists(zipPath)||sha(await readFile(zipPath))!==record.zip.sha256)throw new Stage3Error('Stage 2 ZIP missing or changed.');
    return;
  }
  if(!record.zip_parts?.length)throw new Stage3Error('Stage 2 build record lists no customer ZIP.');
  for(const z of record.zip_parts){
    const path=join(productDir,z.file);
    if(!await exists(path)||sha(await readFile(path))!==z.sha256)throw new Stage3Error(`Stage 2 ZIP part ${z.part} of ${z.of} missing or changed: ${z.file}`);
  }
}

/** Stage 2's true renders of the customer files (owner previews), each hashed. */
export async function verifyPreviews(productDir,qc){
  const previews=[];
  for(const p of qc.previews){
    const path=join(productDir,p.file);
    if(!await exists(path))throw new Stage3Error(`Stage 2 preview missing: ${p.file}`);
    previews.push({file:p.file,label:p.label,source:p.source,page:p.page,sha256:sha(await readFile(path))});
  }
  return previews;
}

// Authorship / process words the metadata cannot prove (the artwork is generated, not made by hand).
export const PROCESS_WORDS=/\b(?:hand[- ]?(?:made|painted|drawn|illustrated|crafted|lettered|finished|sketched|inked|rendered)|handcrafted|made by hand|artisan(?:al)?|painted by hand)\b/gi;
/** Remove process claims from descriptive text; a medium becomes a style ("watercolour" -> "watercolour-style"). */
export function scrubProcess(s){
  if(!s)return s??null;
  return String(s).replace(PROCESS_WORDS,'').replace(/\bwatercolou?r\b(?!-style)/gi,m=>`${m}-style`)
    .replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').replace(/\ba\s+(?=[aeiou])/gi,'an ').trim();
}
