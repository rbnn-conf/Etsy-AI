// Crochet VISUAL SPEC and its pattern <-> visual checks (ADR-046). Deterministic;
// no model, no image call. Lives in the production package so Stage 2 can
// re-run the checks itself before production (ADR-047); the Stage 3 prompt
// builder (marketing/src/stage3/crochet-visual-spec.mjs) re-exports it.
//
//   visual spec = {version, kind, items:[{pattern_id, quantity, features}], ornaments:[{kind, medium}], composition, status}
//
// visual_match_status:
//   derived             the spec was built from the written patterns' fingerprints
//   internally_checked  the spec passed every pattern <-> visual check below
//   physically_verified a person crocheted the pattern and confirmed the result.
//                       NEVER set by code: it needs a human testing record.

export const VISUAL_SPEC_VERSION=1;
export const VISUAL_MATCH_STATUSES=Object.freeze(['derived','internally_checked','physically_verified']);
const FEATURES=['motif_type','flower_type','petal_count','petal_layer_count','petal_shape','centre','leaves','stem','width_cm','height_cm','embellishments','colours'];
// Branding ornaments are flat decoration; a crochet "ornament" would be an untraceable crochet motif.
export const ORNAMENT_MEDIA=Object.freeze(['illustration','watercolour','line art','print','foil']);

/** The visual features a fingerprint SUPPORTS: only known values (unknowns are left out, never guessed). */
export function featuresOf(fp){
  const f={motif_type:fp.motif_type??undefined,flower_type:fp.flower_type??undefined,petal_count:fp.petal_count??undefined,
    petal_layer_count:fp.petal_layer_count??undefined,petal_shape:fp.petal_shape??undefined,
    centre:{present:fp.centre.present,...(fp.centre.type?{type:fp.centre.type}:{})},
    ...(fp.leaves?{leaves:{present:fp.leaves.present,...(fp.leaves.count!==null?{count:fp.leaves.count}:{}),...(fp.leaves.shape?{shape:fp.leaves.shape}:{})}}:{}),
    stem:{present:fp.stem.present,wired:fp.stem.wired},width_cm:fp.finished.width_cm??undefined,height_cm:fp.finished.height_cm??undefined,
    embellishments:[...fp.embellishments],colours:fp.colour_roles.map(c=>c.colour).filter(Boolean)};
  return Object.fromEntries(Object.entries(f).filter(([,v])=>v!==undefined));
}

/** A DERIVED spec: every item is an approved pattern, its features copied from its fingerprint. */
export function visualSpec({kind,items,fingerprints,ornaments=[],composition=null}){
  return {version:VISUAL_SPEC_VERSION,kind,items:items.map(({pattern_id,quantity=1})=>({pattern_id,quantity,
    features:fingerprints[pattern_id]?featuresOf(fingerprints[pattern_id]):{}})),ornaments,composition,status:'derived'};
}

const differ=(a,b)=>a!==undefined&&a!==null&&b!==undefined&&b!==null&&a!==b;
/**
 * Pattern <-> visual contradictions: [{item, attribute, pattern, visual, reason}].
 * Hard failures only where the pattern states the attribute (or the piece is a known absence);
 * an attribute the pattern does not state never fails.
 */
export function visualSpecProblems(spec,{fingerprints,approvedIds=Object.keys(fingerprints)}){
  const out=[], ids=new Set(approvedIds), add=(item,attribute,pattern,visual,reason)=>out.push({item,attribute,pattern,visual,reason});
  spec.items.forEach((it,i)=>{
    const at=`items[${i}]`;
    if(!it.pattern_id){add(at,'pattern_id',null,it.features?.flower_type??it.features?.motif_type??'unnamed motif','every visible crochet motif must map to a real pattern ID');return;}
    if(!ids.has(it.pattern_id)||!fingerprints[it.pattern_id]){add(at,'pattern_id',null,it.pattern_id,'not a pattern in the approved bundle');return;}
    if(!Number.isInteger(it.quantity)||it.quantity<1)add(at,'quantity',null,it.quantity,'quantity must be a whole number of at least 1');
    const fp=fingerprints[it.pattern_id], v=it.features??{}, P=featuresOf(fp);
    for(const k of Object.keys(v))if(!FEATURES.includes(k))add(at,k,null,v[k],'not a pattern-checkable feature: a visual may not add it');
    for(const k of ['motif_type','flower_type','petal_count','petal_layer_count','petal_shape'])if(differ(P[k],v[k]))add(at,k,P[k],v[k],`the pattern makes ${P[k]}`);
    if(v.centre?.present&&!fp.centre.present)add(at,'centre',false,true,'the pattern makes no centre piece');
    if(differ(P.centre?.type,v.centre?.type))add(at,'centre.type',P.centre.type,v.centre.type,'different centre construction');
    if(v.leaves&&fp.leaves){
      const n=v.leaves.count??(v.leaves.present?null:0);
      if((v.leaves.present||n>0)&&!fp.leaves.present)add(at,'leaves',0,n??'some','the pattern makes no leaves');
      else if(differ(P.leaves?.count,n))add(at,'leaves.count',P.leaves.count,n,'different number of leaves');
      if(differ(P.leaves?.shape,v.leaves.shape))add(at,'leaves.shape',P.leaves.shape,v.leaves.shape,'different leaf shape');
    }else if(v.leaves&&!fp.leaves&&(v.leaves.present||v.leaves.count>0))add(at,'leaves',null,v.leaves.count??'some','a foliage pattern is the leaf itself: no added leaves');
    if(v.stem?.present&&!fp.stem.present)add(at,'stem',false,true,'the pattern makes no stem');
    if(v.stem?.wired&&!fp.stem.wired)add(at,'stem.wired',false,true,'the pattern uses no wire');
    for(const [k,label] of [['width_cm','width'],['height_cm','height']])
      if(P[k]&&v[k]&&Math.abs(v[k]/P[k]-1)>0.25)add(at,k,P[k],v[k],`finished ${label} differs by more than 25%`);
    for(const e of v.embellishments??[])if(!fp.embellishments.includes(e))add(at,'embellishments',fp.embellishments,e,`the pattern uses no ${e}`);
  });
  spec.ornaments?.forEach((o,i)=>{
    if(!ORNAMENT_MEDIA.includes(o.medium))add(`ornaments[${i}]`,'medium',ORNAMENT_MEDIA.join('|'),o.medium,'a branding ornament must be flat decoration (never crochet or yarn), clearly distinct from the crochet pieces');
  });
  return out;
}
/** Colourways that differ from the pattern's yarn colours: a warning (a colour change is not a construction change). */
export function visualSpecWarnings(spec,{fingerprints}){
  return spec.items.flatMap(it=>{const fp=fingerprints[it.pattern_id];if(!fp)return [];
    const pc=fp.colour_roles.map(c=>c.colour).filter(Boolean);
    return (it.features?.colours??[]).filter(c=>pc.length&&!pc.includes(c)).map(c=>`${it.pattern_id}: colour ${c} is not one of the pattern's yarn colours (${pc.join(', ')})`);});
}
/** Check a spec: `internally_checked` when there are no problems, else it stays `derived` with its problems. Never `physically_verified`. */
export function checkVisualSpec(spec,ctx){
  const problems=visualSpecProblems(spec,ctx);
  return {...spec,status:problems.length?'derived':'internally_checked',problems,warnings:visualSpecWarnings(spec,ctx)};
}
