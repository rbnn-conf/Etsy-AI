// Stage 1 crochet VISUAL SET (ADR-063): pure helpers over product.json. No I/O,
// no model or image call: the workflow reads and writes files and makes the
// (paid, owner-confirmed) image calls.
//
//   APPROVE PATTERNS -> 🖼 Generate Crochet Visual Set (confirm: 1 hero + N previews, cost)
//     -> VISUALS_GENERATING (one image at a time, persisted after each; Retry resumes at the first missing one)
//     -> deterministic QC -> AWAITING_VISUALS_APPROVAL (owner sees every image)
//     -> ✅ APPROVE VISUAL SET (bound to the manifest + every file SHA-256) -> CREATIVE_APPROVED -> /produce
//   Restyle Hero / one Preview / All: only those images are archived and regenerated; patterns and their
//   fingerprints are never touched.
import { needsPatterns, patternsApproved } from './crochet.mjs';
import { HERO_ASSET, HERO_FILE, previewAsset, previewFile } from '../../../production/src/index.mjs';

export const visualsApplicable=p=>needsPatterns(p)&&patternsApproved(p);
export const visualsApproved=p=>!!p?.crochet_visuals?.approval;
/** In the visual-set phase, or FAILED during it. */
export const inVisuals=p=>['VISUALS_GENERATING','AWAITING_VISUALS_APPROVAL'].includes(p?.status)||(p?.status==='FAILED'&&p.last_error?.step==='visuals');
/** Where generation may start (or resume / restyle) from the product's current state. */
export const canStartVisuals=p=>visualsApplicable(p)&&!p.lock&&['CREATIVE_APPROVED','PRODUCTION_APPROVED','AWAITING_VISUALS_APPROVAL'].includes(p.status);

/** The asset list for a bundle, in order: the hero, then one preview per approved pattern. */
export function emptyAssets(bundle){
  const blank={status:'missing',sha256:null,width:null,height:null,size:null,model:null,generated_at:null,revision:0,prompt_sha256:null,brief_sha256:null,fingerprint_sha256:null,error:null};
  return [{id:HERO_ASSET,role:'hero',pattern_id:null,file:HERO_FILE,...blank},
    ...bundle.patterns.map((p,i)=>({id:previewAsset(p.pattern_id),role:'pattern-preview',pattern_id:p.pattern_id,file:previewFile(i+1,p.pattern_id),...blank}))];
}

/**
 * Progress from the recorded state (null before a set exists):
 * {total, done, hero, previews, missing:[ids], failed:[ids], pending:[ids], toGenerate}
 * `toGenerate` counts paid image calls still needed: missing/failed images plus a pending restyle's targets.
 */
export function visualsProgress(p){
  const v=p?.crochet_visuals;
  if(!v?.assets?.length)return null;
  const A=v.assets, have=A.filter(a=>a.status==='generated');
  const pending=v.pending_op?.targets??[];
  const missing=A.filter(a=>a.status!=='generated').map(a=>a.id);
  return {total:A.length,done:have.length,hero:A.find(a=>a.role==='hero')?.status==='generated',previews:A.filter(a=>a.role==='pattern-preview').length,
    missing,failed:A.filter(a=>a.status==='failed').map(a=>a.id),pending,toGenerate:new Set([...missing,...pending]).size};
}

/** Image calls a confirmation will cost: a fresh set = 1 + N; a resumed one = what is still missing; a restyle = its targets (+ missing). */
export function plannedVisualCalls(p,{op=null,targets=[]}={}){
  const pr=visualsProgress(p), N=p.crochet?.approval?.pattern_count??0;
  if(!pr)return {hero:1,previews:N,total:1+N,fresh:true};
  const ids=new Set([...pr.missing,...(op?targets:[])]);
  return {hero:ids.has(HERO_ASSET)?1:0,previews:[...ids].filter(id=>id!==HERO_ASSET).length,total:ids.size,fresh:false,reused:pr.total-ids.size};
}

/** Restyle targets: 'hero' -> the hero; 'all' -> every image; 'preview' + n (1-based pattern number) -> that preview. */
export function restyleTargets(p,op,n=null){
  const A=p.crochet_visuals?.assets??[];
  if(op==='restyle-hero')return A.filter(a=>a.role==='hero').map(a=>a.id);
  if(op==='restyle-all')return A.map(a=>a.id);
  if(op==='restyle-preview'){const a=A.filter(x=>x.role==='pattern-preview')[n-1];return a?[a.id]:[];}
  return [];
}

/** "01 Maple Leaf Placemat" for a preview (from the approved pattern names recorded in the briefs). */
export const previewLabel=(i,name)=>`${String(i+1).padStart(2,'0')} ${name}`;
