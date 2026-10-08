// Explicit, persisted workflow state. State is never inferred from which
// files exist: every change goes through transition(), which records history.
import { randomBytes, randomUUID } from 'node:crypto';

export const STATES=Object.freeze(['DRAFT','REFERENCES_RECEIVED','IDEAS_READY','CONCEPT_PREVIEWS_GENERATING','AWAITING_CONCEPT_SELECTION',
  'CONCEPT_SELECTED','SPEC_READY','PROOFS_GENERATING','AWAITING_CREATIVE_APPROVAL','CREATIVE_APPROVED',
  // Stage 1 full-book artwork (ADR-030): a colouring book's every page, generated after the style is approved.
  'BOOK_GENERATING','AWAITING_BOOK_APPROVAL',
  // Stage 1 crochet pattern content (ADR-041): candidate patterns, validated, then APPROVE PATTERNS.
  'PATTERNS_GENERATING','AWAITING_PATTERN_APPROVAL',
  // Stage 1 crochet visual set (ADR-063): collection hero + one finished-item preview per approved pattern.
  'VISUALS_GENERATING','AWAITING_VISUALS_APPROVAL',
  // Stage 2 (deterministic production, ADR-024).
  'PRODUCTION_READY','PRODUCTION_BUILDING','PRODUCTION_QC','AWAITING_PRODUCTION_APPROVAL','PRODUCTION_APPROVED',
  // Stage 3 (listing + marketing, ADR-025). Never publishes.
  'MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL','MARKETING_APPROVED',
  // Stage 4 (Etsy draft, then an owner-confirmed publish, ADR-026).
  'ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','AWAITING_ETSY_PUBLISH_APPROVAL','PUBLISHING','PUBLISHED',
  'REJECTED','FAILED']);
export const TERMINAL=Object.freeze(['PUBLISHED','REJECTED']);
// Stage 4 states. Never rejected and never rolled back into Stage 3; the Etsy draft is never deleted automatically.
export const ETSY=Object.freeze(['ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','AWAITING_ETSY_PUBLISH_APPROVAL','PUBLISHING']);
// States that do work in steps; a failure or restart resumes from the state before them.
export const GENERATING=Object.freeze(['CONCEPT_PREVIEWS_GENERATING','PROOFS_GENERATING','BOOK_GENERATING','PATTERNS_GENERATING','VISUALS_GENERATING','PRODUCTION_BUILDING','PRODUCTION_QC','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC',
  'ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','PUBLISHING']);
// Stage 2 states. A creatively approved product is never rejected from here: CANCEL returns it to CREATIVE_APPROVED.
export const PRODUCTION=Object.freeze(['CREATIVE_APPROVED','PRODUCTION_READY','PRODUCTION_BUILDING','PRODUCTION_QC','AWAITING_PRODUCTION_APPROVAL']);
// Stage 3 states. CANCEL returns the product to PRODUCTION_APPROVED; it is never rejected from here.
export const MARKETING=Object.freeze(['PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL']);
const ACTIVE=STATES.filter(s=>!TERMINAL.includes(s));
// The crochet visual gate: approved patterns are never rejected from here (Stop keeps every file).
const VISUALS=['VISUALS_GENERATING','AWAITING_VISUALS_APPROVAL'];

// event -> allowed source states -> target (a function when it depends on context)
export const TRANSITIONS=Object.freeze({
  reference_added:{from:['DRAFT','REFERENCES_RECEIVED'],to:'REFERENCES_RECEIVED'},
  // IDEAS_READY = structured concepts saved, no previews yet for that batch.
  ideas_ready:{from:['DRAFT','REFERENCES_RECEIVED','IDEAS_READY','AWAITING_CONCEPT_SELECTION'],to:'IDEAS_READY'},
  // Gate 1 (which idea?): one preview image per concept, then the owner picks visually.
  previews_started:{from:['IDEAS_READY'],to:'CONCEPT_PREVIEWS_GENERATING'},
  previews_ready:{from:['CONCEPT_PREVIEWS_GENERATING'],to:'AWAITING_CONCEPT_SELECTION'},
  concept_selected:{from:['AWAITING_CONCEPT_SELECTION'],to:'CONCEPT_SELECTED'},
  spec_ready:{from:['CONCEPT_SELECTED'],to:'SPEC_READY'},
  proofs_started:{from:['SPEC_READY','AWAITING_CREATIVE_APPROVAL'],to:'PROOFS_GENERATING'},
  proofs_ready:{from:['PROOFS_GENERATING'],to:'AWAITING_CREATIVE_APPROVAL'},
  creative_approved:{from:['AWAITING_CREATIVE_APPROVAL'],to:'CREATIVE_APPROVED'},
  // Full-book artwork (colouring books): the style is approved (CREATIVE_APPROVED), then every page is
  // generated page by page, QC'd and reviewed. APPROVE FULL BOOK returns to CREATIVE_APPROVED with
  // product.book.approval recorded, which is what Stage 2 requires. Stop / change direction keeps every page.
  book_started:{from:['CREATIVE_APPROVED','AWAITING_BOOK_APPROVAL'],to:'BOOK_GENERATING'},
  book_ready:{from:['BOOK_GENERATING'],to:'AWAITING_BOOK_APPROVAL'},
  book_approved:{from:['AWAITING_BOOK_APPROVAL'],to:'CREATIVE_APPROVED'},
  book_stopped:{from:['AWAITING_BOOK_APPROVAL','FAILED'],to:'CREATIVE_APPROVED'},
  // Crochet pattern content (ADR-041), a separate gate from creative approval: candidate patterns are
  // drafted (or an owner-supplied source is read), validated and reviewed. APPROVE PATTERNS returns to
  // CREATIVE_APPROVED with product.crochet.approval bound to the source's SHA-256, which Stage 2 requires.
  // Reject keeps every file (archived) and returns to CREATIVE_APPROVED.
  patterns_started:{from:['CREATIVE_APPROVED','AWAITING_PATTERN_APPROVAL'],to:'PATTERNS_GENERATING'},
  patterns_ready:{from:['PATTERNS_GENERATING'],to:'AWAITING_PATTERN_APPROVAL'},
  patterns_approved:{from:['AWAITING_PATTERN_APPROVAL'],to:'CREATIVE_APPROVED'},
  patterns_stopped:{from:['AWAITING_PATTERN_APPROVAL','FAILED'],to:'CREATIVE_APPROVED'},
  // ADR-052: an approved source edited afterwards is re-validated; its approval is superseded first.
  patterns_reopened:{from:['CREATIVE_APPROVED','FAILED'],to:'CREATIVE_APPROVED'},
  // RESTYLE (crochet, ADR-044): only the style approval is cleared; the product returns to the style-proof gate
  // with rebuilt briefs. Proofs are generated only when the owner confirms them (proofs_started from SPEC_READY).
  restyle_started:{from:['CREATIVE_APPROVED'],to:'SPEC_READY'},
  // Crochet VISUAL SET (ADR-063), after APPROVE PATTERNS: paid, confirmed, image by image, resumable; then QC and the
  // owner's review. APPROVE VISUAL SET returns to CREATIVE_APPROVED with product.crochet_visuals.approval (bound to
  // the files' SHA-256), which Stage 2 then requires. Restyling hero/previews re-enters VISUALS_GENERATING.
  visuals_started:{from:['CREATIVE_APPROVED','AWAITING_VISUALS_APPROVAL'],to:'VISUALS_GENERATING'},
  visuals_ready:{from:['VISUALS_GENERATING'],to:'AWAITING_VISUALS_APPROVAL'},
  visuals_approved:{from:['AWAITING_VISUALS_APPROVAL'],to:'CREATIVE_APPROVED'},
  visuals_stopped:{from:['AWAITING_VISUALS_APPROVAL','FAILED'],to:'CREATIVE_APPROVED'},
  // A production-approved crochet product whose visuals the owner chooses to (re)make goes back to the approved
  // style first (recorded; the package must then be rebuilt, free). Only before marketing has started.
  production_reopened:{from:['PRODUCTION_APPROVED'],to:'CREATIVE_APPROVED'},
  // Stage 2: handoff -> build -> QC -> owner review. Only a QC pass reaches review.
  production_ready:{from:['CREATIVE_APPROVED'],to:'PRODUCTION_READY'},
  production_started:{from:['PRODUCTION_READY'],to:'PRODUCTION_BUILDING'},
  production_built:{from:['PRODUCTION_BUILDING'],to:'PRODUCTION_QC'},
  production_qc_passed:{from:['PRODUCTION_QC'],to:'AWAITING_PRODUCTION_APPROVAL'},
  production_rebuild:{from:['AWAITING_PRODUCTION_APPROVAL'],to:'PRODUCTION_READY'},
  production_approved:{from:['AWAITING_PRODUCTION_APPROVAL'],to:'PRODUCTION_APPROVED'},
  production_cancelled:{from:['PRODUCTION_READY','AWAITING_PRODUCTION_APPROVAL','FAILED'],to:'CREATIVE_APPROVED'},
  // Stage 3: plan (paid text) -> generate (paid scenes + free renders) -> QC -> owner review. Only a QC pass reaches review.
  marketing_started:{from:['PRODUCTION_APPROVED','AWAITING_MARKETING_APPROVAL'],to:'MARKETING_PLANNING'},
  marketing_planned:{from:['MARKETING_PLANNING'],to:'MARKETING_GENERATING'},
  marketing_generated:{from:['MARKETING_GENERATING'],to:'MARKETING_QC'},
  marketing_qc_passed:{from:['MARKETING_QC'],to:'AWAITING_MARKETING_APPROVAL'},
  marketing_approved:{from:['AWAITING_MARKETING_APPROVAL'],to:'MARKETING_APPROVED'},
  marketing_cancelled:{from:['AWAITING_MARKETING_APPROVAL','FAILED'],to:'PRODUCTION_APPROVED'},
  // Stage 4: prepare -> create draft (once) -> upload -> remote verify -> owner review.
  etsy_started:{from:['MARKETING_APPROVED'],to:'ETSY_PREPARING'},
  etsy_draft_created:{from:['ETSY_PREPARING'],to:'ETSY_DRAFT_CREATED'},
  etsy_uploading:{from:['ETSY_DRAFT_CREATED'],to:'ETSY_ASSETS_UPLOADING'},
  etsy_verifying:{from:['ETSY_ASSETS_UPLOADING'],to:'ETSY_DRAFT_VERIFYING'},
  etsy_draft_ready:{from:['ETSY_DRAFT_VERIFYING'],to:'AWAITING_ETSY_PUBLISH_APPROVAL'},
  // Publishing: only after PUBLISH + CONFIRM PUBLISH, revalidation, and a remote read-back showing ACTIVE.
  etsy_publishing:{from:['AWAITING_ETSY_PUBLISH_APPROVAL'],to:'PUBLISHING'},
  etsy_publish_aborted:{from:['PUBLISHING'],to:'AWAITING_ETSY_PUBLISH_APPROVAL'},
  etsy_published:{from:['PUBLISHING'],to:'PUBLISHED'},
  // Only a DRY-RUN Stage 4 record may be discarded (no real Etsy object exists); guarded in the workflow.
  etsy_dry_run_reset:{from:['AWAITING_ETSY_PUBLISH_APPROVAL','FAILED'],to:'MARKETING_APPROVED'},
  rejected:{from:ACTIVE.filter(s=>!PRODUCTION.includes(s)&&!MARKETING.includes(s)&&s!=='MARKETING_APPROVED'&&!ETSY.includes(s)&&!VISUALS.includes(s)),to:'REJECTED'},
  // A failed step parks the product in FAILED and remembers where to resume.
  failed:{from:ACTIVE.filter(s=>s!=='FAILED'),to:'FAILED'},
  retry:{from:['FAILED'],to:p=>p.resume_state}
});

export class TransitionError extends Error{
  constructor(event,from){super(`Cannot apply "${event}" in state ${from}`);this.name='TransitionError';this.event=event;this.from=from;}
}
export class BusyError extends Error{
  constructor(op){super(`Another action (${op}) is already running for this product`);this.name='BusyError';this.op=op;}
}

export const newNonce=()=>randomBytes(6).toString('hex');
// A product that reached marketing approval (or Stage 4) is never rejected, even from FAILED:
// an Etsy failure must not discard approved work or orphan an Etsy draft.
const NEVER_REJECT=['MARKETING_APPROVED',...ETSY,'PUBLISHED'];
const blocked=(p,event)=>event==='rejected'&&p.status==='FAILED'&&NEVER_REJECT.includes(p.resume_state);
export const canApply=(p,event)=>!blocked(p,event)&&(TRANSITIONS[event]?.from.includes(p.status)??false);
/** In Stage 2, or FAILED during it. */
export const inProduction=p=>PRODUCTION.includes(p.status)||(p.status==='FAILED'&&PRODUCTION.includes(p.resume_state)&&!['book','patterns','visuals'].includes(p.last_error?.step));
/** In Stage 3, or FAILED during it. */
export const inMarketing=p=>MARKETING.includes(p.status)||(p.status==='FAILED'&&MARKETING.includes(p.resume_state));
/** In Stage 4, or FAILED during it (including a Stage 4 failure before its first state change). */
export const inEtsy=p=>ETSY.includes(p.status)||(p.status==='FAILED'&&(ETSY.includes(p.resume_state)||(p.resume_state==='MARKETING_APPROVED'&&String(p.last_error?.step??'').startsWith('etsy'))));

/** Returns an updated copy; throws TransitionError for an illegal event. */
export function transition(p,event,{actor='system',now=new Date(),resumeState=null}={}){
  const t=TRANSITIONS[event];
  if(!t)throw new Error(`Unknown event ${event}`);
  if(!t.from.includes(p.status)||blocked(p,event))throw new TransitionError(event,p.status);
  const to=typeof t.to==='function'?t.to(p):t.to;
  if(!STATES.includes(to))throw new TransitionError(event,p.status);
  const at=now.toISOString();
  return {...p,status:to,
    resume_state:event==='failed'?(resumeState??p.status):event==='retry'?null:p.resume_state,
    status_history:[...p.status_history,{from:p.status,to,event,at,actor}],
    // Every state change invalidates any keyboard already on screen.
    review:{...p.review,nonce:newNonce()},
    updated_at:at};
}

const STALE_LOCK_MS=45*60*1000;
export function acquireLock(p,op,now=new Date()){
  if(p.lock&&now-new Date(p.lock.at)<STALE_LOCK_MS)throw new BusyError(p.lock.op);
  return {...p,lock:{op,id:randomUUID(),at:now.toISOString()}};
}
export const releaseLock=p=>({...p,lock:null});
