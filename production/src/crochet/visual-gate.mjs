// Stage 2 gate for crochet visuals (ADR-047). Deterministic; no model.
//
// A crochet product enters production only when its ACTIVE product visuals
// are pattern-derived and checked against the APPROVED patterns:
//   - creative/visual-specs.json exists and parses;
//   - its patterns_sha256 is the approved pattern source's SHA-256 (stale -> refused);
//   - its fingerprints equal the fingerprints recomputed now from the approved patterns;
//   - visual_match_status and every required spec (cover, overview, detail) are
//     internally_checked or physically_verified, and re-running the checks finds nothing;
//   - the latest Restyle produced it, and the approved style proofs were made after that
//     Restyle (direction version), so the approved artwork IS the checked visuals.
// physically_verified is never required (internally_checked is enough) and never set here.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../lib.mjs';
import { bundleFingerprints } from './fingerprint.mjs';
import { visualSpecProblems } from './visual-spec.mjs';

export const VISUAL_SPECS_FILE='creative/visual-specs.json';
export const ACCEPTED_MATCH=Object.freeze(['internally_checked','physically_verified']);
export const REQUIRED_SPECS=Object.freeze(['cover','overview','detail']);
export const VISUALS_UNCHECKED='CROCHET_VISUALS_UNCHECKED';
const canon=v=>Array.isArray(v)?`[${v.map(canon).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`:JSON.stringify(v);

/** The approved proof attempt Stage 2 takes artwork from (same rule as createHandoff). */
export const approvedAttempt=product=>product.proofs?.attempts?.filter(a=>a.status==='complete'&&(!product.creative_approved_at||a.finished_at<=product.creative_approved_at)).at(-1)??null;

/**
 * @param bundle     the APPROVED pattern bundle (already SHA-verified by the caller)
 * @param sourceSha  its SHA-256 (= product.crochet.approval.source_sha256)
 * @returns {ok, reasons:string[], visuals}  `visuals` is the compact record carried into the handoff and Stage 3.
 */
export async function crochetVisualsCheck(product,productDir,{bundle,sourceSha,attempt=approvedAttempt(product)}){
  const reasons=[], R=m=>reasons.push(m);
  let bytes=null, doc=null;
  try{bytes=await readFile(join(productDir,VISUAL_SPECS_FILE));}catch{R(`${VISUAL_SPECS_FILE} is missing: no Restyle since the patterns were approved`);}
  if(bytes){try{doc=JSON.parse(bytes);}catch{R(`${VISUAL_SPECS_FILE} is not valid JSON`);}}
  if(doc){
    if(doc.patterns_sha256!==sourceSha)R(`stale: the visual specs were made for patterns ${String(doc.patterns_sha256).slice(0,12)}…, the approved patterns are ${sourceSha.slice(0,12)}…`);
    if(!ACCEPTED_MATCH.includes(doc.visual_match_status))R(`visual_match_status is ${doc.visual_match_status??'missing'}, not internally_checked`);
    const fingerprints=bundleFingerprints(bundle);
    if(canon(doc.fingerprints)!==canon(fingerprints))R('stale: the recorded fingerprints differ from the approved patterns');
    for(const k of REQUIRED_SPECS){
      const s=doc.specs?.[k];
      if(!s){R(`the ${k} visual spec is missing`);continue;}
      if(!ACCEPTED_MATCH.includes(s.status))R(`the ${k} visual spec is ${s.status}, not internally_checked`);
      const problems=visualSpecProblems(s,{fingerprints,approvedIds:bundle.patterns.map(p=>p.pattern_id)});
      if(problems.length)R(`the ${k} visual spec fails the pattern check now: ${problems.map(p=>`${p.item} ${p.attribute}: ${p.reason}`).join(', ')}`);
    }
    // ACTIVE: the latest Restyle wrote these specs, and the approved proofs were made under it.
    const r=product.restyles?.at(-1);
    if(!r||r.visual_specs!==VISUAL_SPECS_FILE)R('no Restyle record points at these visual specs');
    else{
      if(reboundSha(r.patterns_sha256,doc.rebinds)!==sourceSha)R('stale: the latest Restyle was for different patterns');
      if(!attempt||attempt.direction_version<r.direction_version||attempt.finished_at<r.at)R('the approved style proofs predate the latest Restyle: generate and approve the new proofs');
    }
  }
  const visuals=doc&&!reasons.length?{file:VISUAL_SPECS_FILE,sha256:hash(bytes),patterns_sha256:doc.patterns_sha256,visual_match_status:doc.visual_match_status,
    combination:doc.combination??null,fingerprints:doc.fingerprints,
    specs:Object.fromEntries(REQUIRED_SPECS.map(k=>[k,{kind:doc.specs[k].kind,status:doc.specs[k].status,items:doc.specs[k].items.map(i=>({pattern_id:i.pattern_id,quantity:i.quantity}))}]))}:null;
  return {ok:!reasons.length,reasons,visuals};
}

// A Restyle's patterns SHA followed through the recorded rebinds (ADR-052).
const reboundSha=(sha,rebinds)=>(Array.isArray(rebinds)?rebinds:[]).reduce((cur,x)=>x?.from===cur?x.to:cur,sha);

/**
 * Re-bind checked visual specs to a corrected pattern source WITHOUT new images (ADR-052): only when the
 * specs belong to the previously approved source, the pattern fingerprints recomputed from the new source
 * are IDENTICAL to the recorded ones, and every required spec still passes the pattern check. Anything else
 * (a changed count, colour, piece, pattern ID ...) needs a Restyle. The recorded fingerprints, specs and
 * status are never changed; a rebind record is appended.
 * @returns {ok, reasons, doc}  doc: the specs to write (null when not ok)
 */
export function rebindVisualSpecs(doc,{bundle,fromSha,toSha,at,by}){
  const reasons=[], R=m=>reasons.push(m);
  if(!doc||typeof doc!=='object')R('there are no visual specs to re-bind');
  else{
    if(doc.patterns_sha256!==fromSha)R('the visual specs were not made for the previously approved patterns');
    if(!ACCEPTED_MATCH.includes(doc.visual_match_status))R(`visual_match_status is ${doc.visual_match_status??'missing'}`);
    const fingerprints=bundleFingerprints(bundle);
    if(canon(doc.fingerprints)!==canon(fingerprints))R('the pattern fingerprints changed (counts, colours, pieces or IDs): run Restyle');
    for(const k of REQUIRED_SPECS){
      const s=doc.specs?.[k];
      if(!s){R(`the ${k} visual spec is missing`);continue;}
      if(visualSpecProblems(s,{fingerprints,approvedIds:bundle.patterns.map(p=>p.pattern_id)}).length)R(`the ${k} visual spec fails the pattern check`);
    }
  }
  if(reasons.length)return {ok:false,reasons,doc:null};
  return {ok:true,reasons,doc:{...doc,patterns_sha256:toSha,
    rebinds:[...(Array.isArray(doc.rebinds)?doc.rebinds:[]),{from:fromSha,to:toSha,at,by,reason:'pattern text corrected; fingerprints identical; no new images'}]}};
}

/** The same check for a product as it stands (reads and SHA-checks the approved patterns). For the /produce pre-check. */
export async function crochetProductionReadiness(product,productDir){
  const a=product.crochet?.approval;
  if(!a)return {ok:false,reasons:['patterns are not approved'],visuals:null};
  let bytes;try{bytes=await readFile(join(productDir,'crochet/patterns.json'));}catch{return {ok:false,reasons:['crochet/patterns.json is missing'],visuals:null};}
  if(hash(bytes)!==a.source_sha256)return {ok:false,reasons:['crochet/patterns.json changed after APPROVE PATTERNS'],visuals:null};
  return crochetVisualsCheck(product,productDir,{bundle:JSON.parse(bytes),sourceSha:a.source_sha256});
}
