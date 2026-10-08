// Stage 1 -> Stage 2 handoff contract. A small manifest of immutable
// references: which concept and proof attempt were approved, and every
// approved creative ASSET (each proof image, by path + SHA-256; for a
// full-book format such as a colouring book, each page of the owner-approved
// full book instead, see approvedBook()). Assets are
// not pages: the adapter's manifest (e.g. greeting-card `card_variants`)
// decides each asset's customer-facing role, optionally from an
// owner-authored production-plan.json. Nothing is copied, redrawn or
// regenerated here.
import { readFile, access, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, sharp, validatePngStructure, atomicWrite } from './lib.mjs';
import { adapterFor } from './adapters/index.mjs';
import { bookPagesDigest, PAGE_ID } from './artwork-qc.mjs';
import { effectiveBookQc } from './artwork-override.mjs';
import { HandoffError } from './errors.mjs';
import { assertCrochetBundle, PATTERN_SOURCE } from './crochet/bundle.mjs';
import { crochetVisualsCheck, VISUALS_UNCHECKED } from './crochet/visual-gate.mjs';
import { approvedVisualSet } from './crochet/visual-set.mjs';
export { HandoffError };

export const HANDOFF_FILE='production/handoff.json';
// Owner decisions about customer-facing roles (optional, per product).
export const PLAN_FILE='production-plan.json';
// Stage 1 full-book artwork (colouring books): the page manifest and the creative QC report.
export const BOOK_MANIFEST='book/manifest.json', BOOK_QC='book/qc.json';
const exists=p=>access(p).then(()=>true,()=>false);
// Proof roles that show a real page (variation roles are extra renders of a page).
const PAGE_ROLES=new Set(['main-style','different-composition','consistency-check','primary']);
// Exact text the specification asks to be printed: every quoted phrase in the page prompt.
const quoted=t=>[...String(t??'').matchAll(/[“"]([^”"]{2,200})[”"]/g)].map(m=>m[1].trim());
const ranges=ns=>ns.reduce((r,n)=>{const l=r.at(-1);if(l&&n===l[1]+1)l[1]=n;else r.push([n,n]);return r;},[]).map(([a,b])=>a===b?`${a}`:`${a}-${b}`).join(', ');
const assetId=file=>/proof-(\d+)\.png$/.exec(file)?.[0].replace(/\.png$/,'');

/** Build the handoff from product.json. Throws HandoffError when the product cannot enter Stage 2. */
export async function createHandoff(product,productDir){
  if(product.status!=='CREATIVE_APPROVED')throw new HandoffError(`Stage 2 needs a CREATIVE_APPROVED product; #${product.product_id} is ${product.status}.`);
  const sel=product.concepts?.selected;
  const concept=sel&&product.concepts.batches.find(b=>b.batch===sel.batch)?.concepts.find(c=>c.concept_id===sel.concept_id);
  if(!concept)throw new HandoffError('No selected concept recorded.');
  const format=concept.product_format;
  const adapter=adapterFor(format);   // throws for a format without a Stage 2 adapter yet
  // The approved attempt is the last complete proof attempt before approval.
  const attempt=product.proofs.attempts.filter(a=>a.status==='complete'&&(!product.creative_approved_at||a.finished_at<=product.creative_approved_at)).at(-1);
  if(!attempt)throw new HandoffError('No complete proof attempt to take approved artwork from.');
  // A full-book format takes its artwork from the owner-approved full book, never from the style proofs.
  const book=adapter.artwork==='full-book'?await approvedBook(product,productDir):null;
  // A crochet pattern bundle also needs its owner-approved pattern source (APPROVE PATTERNS, ADR-041).
  const patterns=adapter.content==='crochet-patterns'?await approvedPatterns(product,productDir):null;
  // ...and its active product visuals checked against those approved patterns (ADR-047). internally_checked is enough.
  const visuals=patterns?await checkedVisuals(product,productDir,patterns,attempt):null;
  // ...and, once the product has a crochet visual set (ADR-063), exactly the owner-approved hero and previews.
  const visualSet=patterns?await approvedSet(product,productDir,patterns):null;
  const assets=book?book.assets:[], artwork=book?book.artwork:new Map();
  // Otherwise every image of the approved attempt is an approved creative asset.
  if(!book)for(const [i,image] of attempt.images.entries()){
    const path=join(productDir,image.file);
    if(!await exists(path))throw new HandoffError(`Approved artwork missing on disk: ${image.file}`);
    const bytes=await readFile(path);
    validatePngStructure(bytes);
    const meta=await sharp(bytes).metadata();
    const n=Number(/proof-(\d+)\.png$/.exec(image.file)?.[1]??i+1);
    artwork.set(assetId(image.file)??`proof-${String(n).padStart(2,'0')}`,bytes);
    assets.push({id:assetId(image.file)??`proof-${String(n).padStart(2,'0')}`,file:image.file,page_number:image.page_number,
      proof_role:product.proofs.selected_pages[n-1]?.role??null,sha256:hash(bytes),width:meta.width,height:meta.height,
      density_metadata:meta.density??null,generated_size:image.size??null,model:image.model});
  }
  // The approved crochet visual set: approved assets with no specification page (placed by the adapter by role).
  if(visualSet)for(const a of visualSet.assets){
    const meta=await sharp(visualSet.bytes.get(a.id)).metadata();
    artwork.set(a.id,visualSet.bytes.get(a.id));
    assets.push({id:a.id,file:a.file,page_number:null,proof_role:null,source:a.source,role:a.role,pattern_id:a.pattern_id,kind:a.kind,sha256:a.sha256,
      width:meta.width,height:meta.height,density_metadata:meta.density??null,generated_size:null,model:a.model,fingerprint_sha256:a.fingerprint_sha256});
  }
  // Each specification page with its primary approved asset. Every missing page is named (never repaired).
  const primary=page=>assets.find(a=>a.page_number===page.page_number&&(book?a.source==='full-book':PAGE_ROLES.has(a.proof_role)));
  const missing=product.pages.filter(p=>!primary(p)), covered=[...new Set(assets.map(a=>a.page_number))].join(', ');
  if(missing.length===1)throw new HandoffError(`No approved artwork for page ${missing[0].page_number} (${missing[0].page_type}): the approved proofs cover pages ${covered}. Stage 2 never generates artwork.`);
  if(missing.length)throw new HandoffError(`No approved artwork for ${missing.length} of ${product.pages.length} pages (${ranges(missing.map(p=>p.page_number))}): the approved proofs cover pages ${covered}. Stage 2 never generates artwork; every page needs approved Stage 1 artwork first (Stage 1 currently approves ${assets.length} style proofs, not the whole product).`);
  const pages=product.pages.map(page=>{
    const asset=primary(page);
    return {page_number:page.page_number,page_type:page.page_type,title:page.title,asset:asset.id,
      approved_text:quoted(page.generation_prompt),production_notes:page.production_notes};
  });
  const planPath=join(productDir,PLAN_FILE);
  const planBytes=await exists(planPath)?await readFile(planPath):null;
  let plan=null;
  if(planBytes){try{plan=JSON.parse(planBytes);}catch{throw new HandoffError(`${PLAN_FILE} is not valid JSON.`);}}
  if(plan&&plan.product_id!==product.product_id)throw new HandoffError(`${PLAN_FILE} is for product ${plan.product_id}, not ${product.product_id}.`);
  const direction=product.visual_direction?.file&&await exists(join(productDir,product.visual_direction.file))?await readFile(join(productDir,product.visual_direction.file)):null;
  const draft={schema_version:2,product_id:product.product_id,product_name:product.name,slug:product.slug,
    product_type:product.product_type,product_format:format,page_count:product.page_count,
    orientation:product.canvas?.orientation??concept.orientation??null,canvas:product.canvas??null,
    approved:{creative_approved_at:product.creative_approved_at,concept:{batch:sel.batch,concept_id:sel.concept_id,proposed_name:concept.proposed_name},
      proof_attempt:{attempt:attempt.attempt,dir:attempt.dir,direction_version:attempt.direction_version},
      ...(book?{full_artwork:book.approval}:{}),...(patterns?{patterns:patterns.approval}:{})},
    sources:{specification:{file:'product.json',pointer:'/pages',sha256:hash(Buffer.from(JSON.stringify(product.pages)))},
      ...(book?{book_manifest:book.manifest,book_qc:book.qc}:{}),
      ...(patterns?{crochet_patterns:patterns.source}:{}),
      creative_direction:direction?{file:product.visual_direction.file,version:product.visual_direction.version,sha256:hash(direction)}:null,
      production_plan:planBytes?{file:PLAN_FILE,sha256:hash(planBytes),decided_by:plan.decided_by??null,reason:plan.reason??null}:null},
    // Stage 1 artwork is image-model output: any lettering is part of the pixels, not editable text.
    text_rendering:'baked-into-artwork',
    // Approved content files re-verified by SHA-256 on every run (verifyHandoffSources).
    ...(patterns?{content_sources:[patterns.source,{file:visuals.file,sha256:visuals.sha256},...(visualSet?[visualSet.manifest]:[])],
      crochet:{source:patterns.source,bundle:patterns.bundle,visuals,...(visualSet?{visual_set:{manifest:visualSet.manifest,approval:visualSet.approval,hero:visualSet.hero,previews:visualSet.previews}}:{})}}:{}),
    assets,pages,
    adapter:{format:adapter.format,version:adapter.version}};
  const manifest=await adapter.manifest(draft,plan,{artwork});
  return {...draft,...manifest,review_notes:adapter.reviewNotes(draft,manifest)};
}

/**
 * Write production/handoff.json. It is immutable once production is under way
 * and re-verified on every run. When production starts again from
 * CREATIVE_APPROVED (after CANCEL), only the owner's production plan may have
 * changed; the old handoff is archived and a new one written. Changed
 * approved artwork or specification always stops production.
 */
export async function writeHandoff(product,productDir){
  const path=join(productDir,HANDOFF_FILE);
  if(await exists(path)){
    const bytes=await readFile(path), saved=JSON.parse(bytes);
    // A crochet handoff superseded by a NEWER owner pattern approval (ADR-053), found before a build starts
    // (CREATIVE_APPROVED, or PRODUCTION_READY on a retry): its pattern sources are not re-checked against the OLD
    // approval; the fresh handoff below is built from the current approval with every check (approved SHA =
    // patterns.json, validator, visual gate; the printable check runs at build). Approved artwork and the specification are
    // still verified against the old handoff, and an edit WITHOUT re-approval is still refused.
    const superseded=['CREATIVE_APPROVED','PRODUCTION_READY'].includes(product.status)&&!!saved.crochet&&!!product.crochet?.approval
      &&product.crochet.approval.source_sha256!==saved.crochet.source?.sha256;
    await verifyHandoffSources(saved,productDir,product,{patterns:!superseded});
    if(product.status!=='CREATIVE_APPROVED'&&!superseded){
      if(saved.sources?.production_plan?.sha256!==await planSha(productDir))throw new HandoffError(`${PLAN_FILE} changed during production. CANCEL, then /produce again to use it.`);
      return {handoff:saved,sha256:hash(bytes),created:false};
    }
    // A superseded handoff found at PRODUCTION_READY (a retry) is rebuilt from the same approved state.
    const fresh=await createHandoff(superseded?{...product,status:'CREATIVE_APPROVED'}:product,productDir), freshBytes=Buffer.from(JSON.stringify(fresh,null,2)+'\n');
    if(freshBytes.equals(bytes))return {handoff:saved,sha256:hash(bytes),created:false};
    let v=1;while(await exists(join(productDir,`production/handoff.v${String(v).padStart(2,'0')}.json`)))v++;
    await rename(path,join(productDir,`production/handoff.v${String(v).padStart(2,'0')}.json`));
    await atomicWrite(path,freshBytes);
    return {handoff:fresh,sha256:hash(freshBytes),created:true,archived:`production/handoff.v${String(v).padStart(2,'0')}.json`};
  }
  const handoff=await createHandoff(product,productDir);
  const bytes=Buffer.from(JSON.stringify(handoff,null,2)+'\n');
  await atomicWrite(path,bytes);
  return {handoff,sha256:hash(bytes),created:true};
}
const planSha=async dir=>await exists(join(dir,PLAN_FILE))?hash(await readFile(join(dir,PLAN_FILE))):undefined;

/**
 * A full-book format (colouring book) enters Stage 2 only when Stage 1 has an
 * authoritative page manifest, artwork for every page, a passing creative QC
 * report over exactly those pages, and the owner's explicit full-artwork
 * approval bound to the same manifest, page checksums and QC report. The
 * style-proof approval alone is never enough. Nothing is repaired here.
 */
async function approvedBook(product,productDir){
  const N=product.pages.length, b=product.book;
  const have=(b?.pages??[]).filter(p=>p.file&&p.sha256&&['generated','reused'].includes(p.status)).map(p=>p.page_number);
  const missing=product.pages.map(p=>p.page_number).filter(n=>!have.includes(n));
  if(!b?.approval)throw new HandoffError(`Full artwork for this colouring book is not approved yet: ${have.length} of ${N} pages have artwork${missing.length?` (missing ${ranges(missing)})`:''}. `+
    'Stage 1 must generate the full book and the owner must press ✅ Approve Full Book before production (the style-proof approval is not enough). Stage 2 never generates artwork.');
  const a=b.approval, fail=m=>{throw new HandoffError(`Approved full book is not consistent: ${m}. Review and approve the full book again in Stage 1.`);};
  // The authoritative page manifest: present, unchanged, and still the specification.
  const mPath=join(productDir,BOOK_MANIFEST);
  if(!await exists(mPath))fail(`${BOOK_MANIFEST} is missing`);
  const mBytes=await readFile(mPath), mSha=hash(mBytes);
  if(mSha!==b.manifest?.sha256||mSha!==a.manifest_sha256)fail(`${BOOK_MANIFEST} changed since it was approved`);
  const manifest=JSON.parse(mBytes);
  if(manifest.product_id!==product.product_id)fail(`the page manifest is for product ${manifest.product_id}`);
  if(manifest.source?.specification_sha256!==hash(Buffer.from(JSON.stringify(product.pages))))fail('the specification changed after the page manifest was made');
  if(manifest.pages.length!==N||N!==product.page_count)fail(`the page manifest lists ${manifest.pages.length} pages; the specification has ${N} (page_count ${product.page_count})`);
  const seq=manifest.pages.filter((m,i)=>m.page_id!==PAGE_ID(i+1)||m.page_number!==i+1||m.title!==product.pages[i].title).map(m=>m.page_id);
  if(seq.length)fail(`page manifest entries out of sequence or not matching the specification (${seq.join(', ')})`);
  if(missing.length)fail(`${missing.length} of ${N} pages have no artwork (${ranges(missing)})`);
  // Every page file, by checksum, exactly as approved.
  const assets=[], artwork=new Map(), digestPages=[];
  for(const m of manifest.pages){
    const e=b.pages.find(p=>p.page_number===m.page_number), path=join(productDir,e.file);
    if(!await exists(path))fail(`approved artwork missing on disk: ${e.file}`);
    const bytes=await readFile(path);
    if(hash(bytes)!==e.sha256)fail(`${e.file} changed since it was generated`);
    validatePngStructure(bytes);
    const meta=await sharp(bytes).metadata();
    artwork.set(m.page_id,bytes);digestPages.push({page_id:m.page_id,sha256:e.sha256});
    assets.push({id:m.page_id,file:e.file,page_number:m.page_number,proof_role:null,source:'full-book',origin:e.source,sha256:e.sha256,width:meta.width,height:meta.height,
      density_metadata:meta.density??null,generated_size:e.size??null,model:e.model??null});
  }
  const digest=bookPagesDigest(digestPages);
  if(digest!==a.pages_sha256)fail('the page checksums differ from the ones the owner approved');
  // The creative QC report the owner saw: passed, over exactly these pages.
  const qPath=join(productDir,BOOK_QC);
  if(!await exists(qPath))fail(`${BOOK_QC} is missing`);
  const qBytes=await readFile(qPath), qc=JSON.parse(qBytes);
  if(hash(qBytes)!==a.qc_sha256)fail(`${BOOK_QC} changed since approval`);
  // ADR-067: a failed creative QC passes ONLY through the owner's artwork-overflow override recorded in this approval,
  // for this exact report and these exact pages; every other failure still blocks.
  const eff=effectiveBookQc(qc,a.qc_sha256,a.override??null);
  if(!eff.passed)fail(`creative QC did not pass${a.override?` (${eff.problem})`:''}`);
  if(qc.fingerprint!==digest)fail('creative QC was run on different pages');
  return {assets,artwork,manifest:{file:BOOK_MANIFEST,sha256:mSha},qc:{file:BOOK_QC,sha256:a.qc_sha256},
    approval:{approved_at:a.approved_at,approved_by:a.by,manifest_sha256:a.manifest_sha256,pages_sha256:a.pages_sha256,qc_sha256:a.qc_sha256,
      ...(eff.overridden?{override:a.override}:{})}};
}

/**
 * A crochet pattern bundle (ADR-041) enters Stage 2 only with the owner's
 * APPROVE PATTERNS record, bound to the exact bytes of the pattern source.
 * The source must still hash to the approved SHA-256 and still pass the
 * validator; a changed source must be revalidated and approved again in
 * Stage 1. Nothing is repaired or written here.
 */
async function approvedPatterns(product,productDir){
  const c=product.crochet, a=c?.approval;
  if(!a)throw new HandoffError(`Crochet patterns for #${product.product_id} are not approved yet${c?.validation?` (last validation: ${c.validation.ok?'passed':`${c.validation.errors.length} problem(s)`})`:''}. `+
    `Stage 1 must validate ${PATTERN_SOURCE} and the owner must press ✅ Approve Patterns before production (creative approval is not pattern approval). Stage 2 never writes crochet instructions.`);
  const path=join(productDir,PATTERN_SOURCE);
  if(!await exists(path))throw new HandoffError(`Approved pattern source ${PATTERN_SOURCE} is missing.`);
  const bytes=await readFile(path), sha=hash(bytes);
  if(sha!==a.source_sha256)throw new HandoffError(`${PATTERN_SOURCE} changed after APPROVE PATTERNS (approved ${a.source_sha256.slice(0,12)}…, now ${sha.slice(0,12)}…). Production refuses it: revalidate and approve the patterns again in Stage 1.`);
  let bundle;try{bundle=JSON.parse(bytes);}catch{throw new HandoffError(`${PATTERN_SOURCE} is not valid JSON.`);}
  assertCrochetBundle(bundle);
  if(bundle.patterns.length!==a.pattern_count)throw new HandoffError(`${PATTERN_SOURCE} has ${bundle.patterns.length} patterns; ${a.pattern_count} were approved.`);
  return {bundle,source:{file:PATTERN_SOURCE,sha256:sha},
    approval:{approved_at:a.approved_at,approved_by:a.by,source_sha256:a.source_sha256,pattern_count:a.pattern_count,origin:a.origin,verification:a.verification}};
}

/** The crochet visual gate (ADR-047): the checked visuals, or a HandoffError coded 'CROCHET_VISUALS_UNCHECKED' with every reason. */
async function checkedVisuals(product,productDir,patterns,attempt){
  const v=await crochetVisualsCheck(product,productDir,{bundle:patterns.bundle,sourceSha:patterns.source.sha256,attempt});
  if(!v.ok)throw Object.assign(new HandoffError(`${VISUALS_UNCHECKED}: crochet visuals are not checked against the approved patterns: ${v.reasons.join('; ')}. Run Restyle and approve the new proofs first.`),{code:VISUALS_UNCHECKED,reasons:v.reasons});
  return v.visuals;
}

/** The approved crochet visual set (ADR-063), or null when the product has none; a HandoffError with every reason otherwise. */
async function approvedSet(product,productDir,patterns){
  const v=await approvedVisualSet(product,productDir,{bundle:patterns.bundle});
  if(v&&!v.ok)throw Object.assign(new HandoffError(`CROCHET_VISUAL_SET_UNAPPROVED: the crochet visual set cannot enter production: ${v.reasons.join('; ')}. Stage 2 never generates or repairs images.`),{code:'CROCHET_VISUAL_SET_UNAPPROVED',reasons:v.reasons});
  return v?.set??null;
}

/** The approved originals, content sources and specification must still be exactly what was handed off. */
export async function verifyHandoffSources(handoff,productDir,product=null,{patterns=true}={}){
  for(const a of handoff.assets){
    const path=join(productDir,a.file);
    if(!await exists(path))throw new HandoffError(`Approved artwork missing: ${a.file}`);
    if(hash(await readFile(path))!==a.sha256)throw new HandoffError(`Approved artwork changed since handoff: ${a.file}`);
  }
  for(const c of patterns?handoff.content_sources??[]:[]){
    const path=join(productDir,c.file);
    if(!await exists(path))throw new HandoffError(`Approved content missing: ${c.file}`);
    if(hash(await readFile(path))!==c.sha256)throw new HandoffError(`Approved content changed since handoff: ${c.file}. Production refuses it: revalidate and approve it again in Stage 1.`);
  }
  if(patterns&&product?.crochet?.approval&&handoff.crochet&&product.crochet.approval.source_sha256!==handoff.crochet.source.sha256)
    throw new HandoffError('The crochet pattern approval changed since the production handoff. CANCEL, then /produce again.');
  if(product&&hash(Buffer.from(JSON.stringify(product.pages)))!==handoff.sources.specification.sha256)
    throw new HandoffError('The specification changed since the production handoff.');
}
