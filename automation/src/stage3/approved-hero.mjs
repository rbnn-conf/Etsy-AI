// Approved hero (ADR-065): the hero candidate the owner chose from the hero comparison is the hero the full
// campaign produces. The comparison entry (product.json marketing.comparison.engines[engine]) stays the single
// source of truth for the direction, campaign and paid backplate; the approval only REFERENCES it by SHA-256 and
// the plan records a LOCK of the creative decisions that must survive to the final hero.
//
// Locked: composition (page arrangement / layout family), focal page, text zone, background, scene brief (the
// environment / story), archetype (region-template engines), the route's major dimensions when it has one, and the
// exact backplate file. Free to adapt: headline and support copy, crop, supporting pages, spacing, render size.
import { createHash } from 'node:crypto';
import { MAJOR_DIMENSIONS } from '../../../marketing/src/stage3/index.mjs';

const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const LOCKED_DIRECTION=['composition','focal_asset','text_zone','background','scene_brief','archetype'];
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));

/** What is persisted when the owner chooses an engine whose comparison candidate they were shown (engine_chosen.approved_hero). */
export function approvalRecord(entry,engine,comparisonAt){
  if(!entry?.image)return null;
  return {source:'hero-comparison',engine,comparison_at:comparisonAt??null,image:{file:entry.image.file,sha256:entry.image.sha256},
    scene:entry.scene?{file:entry.scene.file,sha256:entry.scene.sha256}:null,direction_sha256:entry.direction?sha(entry.direction):null,route:entry.route??null};
}

/**
 * The approved hero for a run, or null when the owner never chose from a comparison for this engine.
 *  - New approvals carry engine_chosen.approved_hero; it must still match the comparison entry exactly.
 *  - LEGACY approvals (before ADR-065) carry only {by, at}: the candidate counts as approved when the comparison
 *    was shown BEFORE the choice (comparison.at <= engine_chosen.at). Nothing is invented: the comparison entry
 *    already holds the full validated direction and the paid backplate.
 * Throws (not retryable) when the approved candidate changed after the choice: the owner must reselect.
 */
export function approvedHeroFor(p,engine){
  const cmp=p.marketing?.comparison, e=cmp?.engines?.[engine], ch=p.marketing?.engine_chosen;
  if(!e?.image||!ch)return null;
  const rec=ch.approved_hero??null;
  if(rec){
    if(rec.engine!==engine)return null;
    const now=approvalRecord(e,engine,cmp.at);
    if(now.image.sha256!==rec.image.sha256||(now.scene?.sha256??null)!==(rec.scene?.sha256??null)||now.direction_sha256!==rec.direction_sha256)
      throw integrityError([`the ${engine} comparison candidate changed after it was approved`]);
  }else if(!(cmp.at&&Date.parse(cmp.at)<=Date.parse(ch.at)))return null;
  return {engine,legacy:!rec,direction:e.direction??null,campaign:e.campaign??null,scene:e.scene??null,image:e.image,route:e.route??e.direction?.route??null,
    record:rec??approvalRecord(e,engine,cmp.at)};
}

/** The plan's approval lock (plan.approved_hero). */
export function approvalLock(a,heroId){
  return {source:'hero-comparison',engine:a.engine,legacy:a.legacy,slide:heroId,image:a.image,
    locked:{direction:a.direction?pick(a.direction,LOCKED_DIRECTION):null,route:a.route?pick(a.route,MAJOR_DIMENSIONS):null,
      scene:a.scene?{file:a.scene.file,sha256:a.scene.sha256}:null}};
}

/**
 * Colouring creative hero card rebuilt around the APPROVED direction: its composition (and only it) is allowed, and
 * a composition that shows the coloured example gets the example of its own page. Copy, jobs and claims stay code's.
 */
export function approvedHeroSlide(slide,d){
  const page=/^page-(\d+)$/.exec(String(d.focal_asset))?.[1], {example:_,...rest}=slide;
  const withExample=d.composition==='cb-lifestyle-hero'&&page;
  return {...rest,...(withExample?{example:`example-p${page}`}:{}),
    creative:{...slide.creative,composition:d.composition,allowed_compositions:[d.composition],focal_asset:d.focal_asset,supporting_assets:d.supporting_assets??slide.creative.supporting_assets,
      background:d.background??slide.creative.background,text_zone:d.text_zone??slide.creative.text_zone,scene_brief:d.scene_brief??'',props:d.props??slide.creative.props,
      route:d.route??null,claims_used:d.claims_used??slide.creative.claims_used}};
}

/** Deterministic integrity check of a plan against its approval lock: [] when the approved direction is intact. */
export function approvalProblems(plan){
  const a=plan.approved_hero;
  if(!a||a.superseded)return [];
  const out=[], d=plan.directions?.[a.slide]??null, L=a.locked;
  for(const [k,v] of Object.entries(L.direction??{}))if(JSON.stringify(d?.[k]??null)!==JSON.stringify(v??null))out.push(`${k}: approved ${JSON.stringify(v)}, plan has ${JSON.stringify(d?.[k]??null)}`);
  if(L.route&&d?.route)for(const [k,v] of Object.entries(L.route))if(d.route[k]!==v)out.push(`route ${k}: approved ${v}, plan has ${d.route[k]}`);
  if(L.scene){const hero=plan.slides.find(s=>s.id===a.slide), sc=plan.scenes.find(x=>x.slide===a.slide)??plan.scenes.find(x=>x.id===hero?.scene);
    if(!sc||sc.file!==L.scene.file||sc.sha256!==L.scene.sha256)out.push(`hero backplate: approved ${L.scene.file} (${L.scene.sha256.slice(0,12)}), plan has ${sc?`${sc.file} (${String(sc.sha256).slice(0,12)})`:'none'}`);}
  return out;
}

export function integrityError(problems){
  return Object.assign(new Error(`Approved hero integrity: the final hero would differ from the hero chosen in the comparison (${problems.join('; ')}). Nothing was generated. Reselect the hero from a new comparison, or regenerate it deliberately in review.`),
    {name:'ApprovalIntegrityError',retryable:false});
}
