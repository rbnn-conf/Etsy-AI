// Inline-keyboard callback data for Stage 1: a1|<action>|<productId>|<nonce>.
// Distinct "a1" prefix so these buttons can never be confused with the
// production review bot's "r1" buttons. Parser never throws.
import { nav, HOME, helpButton, retrySafety, L } from './ui.mjs';
import { awaitingFullArtwork } from '../orchestrator/book-state.mjs';
import { awaitingPatterns, canReopenPatterns } from '../orchestrator/crochet.mjs';

export const ACTIONS=Object.freeze(['ca','cb','cc','more','cancel','approve','regen','change','reject','retry','rstyle','papprove','prebuild','pcancel','mapprove','mcopy','mimages','mall','mcancel',
  // Stage 4: publish (asks for confirmation), confirm publish, keep as draft, refresh the draft, leave as draft.
  'epublish','econfirm','ekeep','erefresh','eleave',
  // Control panel: run the same operation as /go, /previews, /produce, /market and /etsy for this product.
  'go','prev','produce','market','edraft',
  // Stage 3 marketing engines: Factory, Hybrid, AI Creative; the hero comparison.
  'mfac','mhyb','mai','mcmp',
  // Stage 1 full book (ADR-030): generate / resume, approve the full artwork, change the book direction, stop.
  'bgen','bapprove','bdir','bstop',
  // ADR-067: accept decorative artwork overflow (the only owner-overridable creative QC rule) for this product's QC report.
  'bovr',
  // Stage 1 crochet pattern content (ADR-041): brief, draft (AI), validate a supplied source, approve,
  // revise one pattern, redraft the invalid ones, reject the candidates.
  'cbrief','cgen','cval','capprove','crev','cregen','creject',
  // Stage 1 crochet visual set (ADR-063): generate / resume, approve, restyle hero, restyle all, stop (keep every image).
  'vgen','vapprove','vrh','vra','vstop']);
// One campaign image: regenerate its scene, change its art direction, rebuild its composite (free). "mrs.04".
export const SLIDE_ACTION=/^(mrs|mrd|mrc)\.(\d{2})$/;
// One full-book page: regenerate it (same specification and style) or change its direction. "bpr.017".
export const BOOK_PAGE_ACTION=/^(bpr|bpd)\.(\d{3})$/;
// One crochet pattern preview: restyle it (1 image). "vrp.03" = the 3rd approved pattern's preview.
export const VISUAL_PREVIEW_ACTION=/^vrp\.(\d{2})$/;
const validAction=a=>ACTIONS.includes(a)||SLIDE_ACTION.test(a)||BOOK_PAGE_ACTION.test(a)||VISUAL_PREVIEW_ACTION.test(a);
const MAX=64;
export function encode(action,productId,nonce){
  if(!validAction(action)||!/^\d{3}$/.test(productId)||!/^[A-Za-z0-9]{6,16}$/.test(nonce))throw new Error('unsafe callback data');
  const s=`a1|${action}|${productId}|${nonce}`;
  if(Buffer.byteLength(s)>MAX)throw new Error('callback data too long');
  return s;
}
export function parse(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX)return null;
  const parts=raw.split('|');
  if(parts.length!==4||parts[0]!=='a1')return null;
  const [,action,productId,nonce]=parts;
  if(!validAction(action)||!/^\d{3}$/.test(productId)||!/^[A-Za-z0-9]{6,16}$/.test(nonce))return null;
  return {action,productId,nonce};
}
const btn=(text,action,p)=>({text,callback_data:encode(action,p.product_id,p.review.nonce)});
/** Guidance row under every review message: what can I do here, and home (navigation only). */
export const guideRow=p=>[helpButton(p.product_id),...HOME];

export const conceptKeyboard=(p,{canRegenerate=true}={})=>({inline_keyboard:[[btn('A','ca',p),btn('B','cb',p),btn('C','cc',p)],
  ...(canRegenerate?[[btn('REGENERATE CONCEPTS','more',p)]]:[]),[btn('CANCEL','cancel',p)],guideRow(p)]});
export const proofKeyboard=p=>({inline_keyboard:[[btn('APPROVE STYLE','approve',p)],[btn('REGENERATE PROOFS','regen',p),btn('CHANGE DIRECTION','change',p)],[btn('REJECT PRODUCT','reject',p)],guideRow(p)]});
/**
 * After a failure. RETRY appears only when the recorded state proves it safe
 * (retrySafety): free resumable steps retry directly; a step that may call
 * OpenAI goes through the cost confirmation; an uncertain Etsy creation or an
 * unexpectedly active listing gets no retry button at all.
 */
// ADR-052: re-validate an approved crochet source after it was edited (free).
export const REVALIDATE_EDITED='🔄 Re-validate edited patterns.json (free)';
export function failureKeyboard(p){
  const s=retrySafety(p);
  return {inline_keyboard:[
    ...(s.safe?[[s.paid?nav(L.retryPaid,'ask',p.product_id,'retry'):btn(L.retry,'retry',p)]]:[]),
    ...(canReopenPatterns(p)?[[btn(REVALIDATE_EDITED,'cval',p)]]:[]),
    [nav(L.details,'fail',p.product_id),nav(L.product,'prod',p.product_id)],[...HOME]]};
}
/** @deprecated name kept for callers and tests: the failure keyboard. */
export const retryKeyboard=failureKeyboard;
// Stage 2 production gate (after QC has passed).
export const productionKeyboard=p=>({inline_keyboard:[[btn('APPROVE PRODUCTION','papprove',p)],[btn('REBUILD','prebuild',p),btn('CANCEL','pcancel',p)],guideRow(p)]});
/** APPROVE PRODUCTION refused: the package was built with an older document design (labels like "Moonlit v2"). */
export const outdatedPackageText=({built,live})=>['❌ Production package is outdated','','This package was built with:',built,'','Current design:',live,'','Rebuild production before approving.'].join('\n');
export const outdatedPackageKeyboard=p=>({inline_keyboard:[[btn('🏭 Rebuild','prebuild',p)],[nav('Back','prod',p.product_id)]]});
// Stage 3 marketing gate (after QC has passed). Buttons that spend on OpenAI say so.
export const marketingKeyboard=(p,{scenes=0}={})=>{
  const imgs=scenes?` + ${scenes} AI image${scenes>1?'s':''}`:'';
  return {inline_keyboard:[[btn('APPROVE MARKETING','mapprove',p)],[btn('REGENERATE LISTING COPY (1 AI call)','mcopy',p)],
    [btn(`REGENERATE MARKETING (1 AI call${imgs})`,'mimages',p)],[btn(`REGENERATE ALL (2 AI calls${imgs})`,'mall',p)],[btn('CANCEL','mcancel',p)],
    [nav('🧩 Edit Individual Images','mslides',p.product_id)],guideRow(p)]};
};
/** After the hero comparison: which direction should I use? (each through its cost confirmation) */
export const comparisonKeyboard=p=>({inline_keyboard:[[nav('✨ AI Creative','ask',p.product_id,'mai')],[nav('🎨 Hybrid','ask',p.product_id,'mhyb')],[nav('🧱 Factory','ask',p.product_id,'mfac')],
  [nav(L.product,'prod',p.product_id),...HOME]]});
// Stage 4 draft review. PUBLISH appears only when the server allows publishing
// AND the latest remote verification passed; it never publishes by itself.
export const etsyReviewKeyboard=(p,{publishable=false,editorUrl=null}={})=>({inline_keyboard:[
  ...(publishable?[[btn('PUBLISH','epublish',p)]]:[]),...(editorUrl?[[{text:L.editor,url:editorUrl}]]:[]),[btn('REFRESH DRAFT','erefresh',p)],[btn('LEAVE AS DRAFT','eleave',p)],
  [nav(L.productCost,'pcost',p.product_id),nav(L.summary,'prod',p.product_id)],guideRow(p)]});
// The second, explicit confirmation. Only CONFIRM PUBLISH can start publishing.
export const etsyConfirmKeyboard=p=>({inline_keyboard:[[btn('CONFIRM PUBLISH','econfirm',p)],[btn('KEEP AS DRAFT','ekeep',p)]]});
/**
 * Next step after an approval: the button that starts the next stage (costly
 * or Etsy steps go through their confirmation screen), the product, home.
 */
export function nextStepKeyboard(p){
  const next={CREATIVE_APPROVED:awaitingFullArtwork(p)?[nav('🎨 Generate Full Colouring Book','ask',p.product_id,'bgen')]
    :awaitingPatterns(p)?(p.crochet?.brief?[nav('🧶 Draft Candidate Patterns','ask',p.product_id,'cgen')]:[btn('🧶 Set Pattern Count & Terms','cbrief',p)])
    :[btn('🏭 Build Production Files','produce',p)],PRODUCTION_APPROVED:[nav('🛍 Create Listing & Marketing','mmode',p.product_id)],
    MARKETING_APPROVED:[nav('🏪 Create Etsy Draft','ask',p.product_id,'edraft')]}[p.status];
  return {inline_keyboard:[...(next?[next]:[]),[nav(L.product,'prod',p.product_id),...HOME]]};
}
