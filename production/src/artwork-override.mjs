// Owner override for decorative artwork overflow (ADR-067). Pure: no I/O.
//
// The full-book creative QC (artwork-qc.mjs) still detects artwork that runs off the page edge. That ONE rule is
// owner-reviewable: the owner may accept it for the exact pages and the exact QC report they reviewed (bound by the
// report's SHA-256 and the pages fingerprint). Nothing else can be overridden: any other failing check (missing,
// blank, invalid, duplicate, wrong size or orientation, coloured, other page problems) keeps the book blocked.
// An override belongs to one product's one QC report; regenerating any page re-runs the QC and voids it.

export const OVERFLOW_RULE='artwork-edge-overflow';
export const OVERFLOW_CHECK='safe margins: no clipping at the page edges';
const EDGE=/^artwork runs off the page edge/;

/**
 * What the owner may review in a QC report.
 * @returns {reviewable, pages:[{page_id, reason}], blocking:[check names]}
 *   reviewable: the overflow check fails and it is the ONLY failing check.
 */
export function overflowReview(qc){
  const failing=(qc?.checks??[]).filter(c=>!c.ok), blocking=failing.filter(c=>c.name!==OVERFLOW_CHECK).map(c=>c.name);
  const pages=Object.entries(qc?.pages??{}).flatMap(([page_id,x])=>{const r=(x.fails??[]).filter(f=>EDGE.test(f));return r.length?[{page_id,reason:r.join('; ')}]:[];});
  return {reviewable:failing.some(c=>c.name===OVERFLOW_CHECK)&&!blocking.length&&pages.length>0,pages,blocking};
}

/** The record stored when the owner presses ✅ ACCEPT OVERFLOW. */
export function overflowOverride(qc,{qcSha256,by,at}){
  const r=overflowReview(qc);
  if(!r.reviewable)throw new Error(r.blocking.length?`other creative QC failures must be fixed first: ${r.blocking.join('; ')}`:'there is no artwork overflow to accept');
  const pages=r.pages.map(x=>x.page_id);
  return {kind:'owner-approved exception',rule:OVERFLOW_RULE,pages,reasons:Object.fromEntries(r.pages.map(x=>[x.page_id,x.reason])),
    qc_sha256:qcSha256,fingerprint:qc.fingerprint,accepted_by:by,accepted_at:at,statement:overrideStatement(pages)};
}

export const overrideStatement=pages=>`PASS WITH OWNER OVERRIDE — decorative artwork overflow accepted on pages ${pages.join(', ')}.`;

/**
 * The QC result with an override applied. Passes only when the report already passed, or when its ONLY failure is
 * the overflow rule on pages the owner accepted, for this exact report (SHA-256) and these exact pages (fingerprint).
 * @returns {passed, overridden, statement|null, problem|null}
 */
export function effectiveBookQc(qc,qcSha256,override=null){
  if(qc?.passed===true)return {passed:true,overridden:false,statement:null,problem:null};
  const r=overflowReview(qc);
  if(!override)return {passed:false,overridden:false,statement:null,problem:r.reviewable?'owner review required: decorative artwork overflow':'creative QC failed'};
  if(!r.reviewable)return {passed:false,overridden:false,statement:null,problem:`the overflow override cannot clear other creative QC failures (${r.blocking.join('; ')})`};
  if(override.rule!==OVERFLOW_RULE)return {passed:false,overridden:false,statement:null,problem:`override rule ${override.rule} is not ${OVERFLOW_RULE}`};
  if(override.qc_sha256!==qcSha256||override.fingerprint!==qc.fingerprint)return {passed:false,overridden:false,statement:null,problem:'the override was accepted for a different QC report or different pages'};
  const notAccepted=r.pages.map(x=>x.page_id).filter(id=>!override.pages.includes(id));
  if(notAccepted.length)return {passed:false,overridden:false,statement:null,problem:`overflow on ${notAccepted.join(', ')} was not accepted`};
  return {passed:true,overridden:true,statement:overrideStatement(override.pages),problem:null};
}
