// Stage 4 category and attribute resolution. Deterministic, never guessed
// (ADR-039). Priority:
//   1. the product's owner-set taxonomy_id (products/<id>/etsy/settings.json),
//      which must exist in Etsy's current seller taxonomy;
//   1b. the FORMAT's fixed owner-approved mapping (format_mappings, ADR-059): the free-text category
//      suggestion is never consulted; Etsy's live node with that ID must still have the approved path;
//   2. an explicit owner-approved mapping (automation/config/etsy-taxonomy-map.json):
//      the approved category path equals a mapped canonical path EXACTLY, and
//      Etsy's live node with that ID still has that path;
//   3. an EXACT, unique match of Stage 3's category path against the seller
//      taxonomy returned by Etsy (getSellerTaxonomyNodes);
//   4. otherwise TAXONOMY_UNRESOLVED, listing candidates with the same leaf name.
// "Exact" ignores only case and repeated spaces: punctuation and wording count,
// so "Books Movies & Music" never matches "Books, Movies & Music". No fuzzy
// matching. Nothing is created on Etsy before this resolves.
import { readFileSync } from 'node:fs';
import { Stage4Error } from './common.mjs';

const norm=s=>String(s??'').toLowerCase().replace(/\s+/g,' ').trim();
const normPath=s=>String(s??'').split('>').map(norm).join(' > ');

/** The committed owner-approved mappings ([{path, taxonomy_id, approved}]). */
export function loadTaxonomyMap(url=new URL('../../config/etsy-taxonomy-map.json',import.meta.url)){
  const m=JSON.parse(readFileSync(url,'utf8'));
  if(m.schema_version!==1||!Array.isArray(m.mappings))throw new Stage4Error('CONFIG','etsy-taxonomy-map.json is not a schema_version 1 mapping list.',{retryable:false});
  const seen=new Set();
  for(const x of m.mappings){
    if(typeof x.path!=='string'||!x.path.includes('>')||!Number.isSafeInteger(x.taxonomy_id)||x.taxonomy_id<=0)throw new Stage4Error('CONFIG',`etsy-taxonomy-map.json has an invalid mapping: ${JSON.stringify(x)}`,{retryable:false});
    if(seen.has(normPath(x.path)))throw new Stage4Error('CONFIG',`etsy-taxonomy-map.json maps "${x.path}" twice.`,{retryable:false});
    seen.add(normPath(x.path));
  }
  return m.mappings;
}
export const TAXONOMY_MAP=Object.freeze(loadTaxonomyMap());

/**
 * Formats whose Etsy category is explicitly UNRESOLVED ([{format, category, reason, resolve_by}], ADR-041):
 * no verified taxonomy ID exists locally, so only the product's own etsy/settings.json taxonomy_id
 * (verified against Etsy) may resolve it. Nothing is matched by path and nothing is guessed.
 */
export function loadUnresolvedFormats(url=new URL('../../config/etsy-taxonomy-map.json',import.meta.url)){
  const list=JSON.parse(readFileSync(url,'utf8')).unresolved??[];
  if(!Array.isArray(list))throw new Stage4Error('CONFIG','etsy-taxonomy-map.json unresolved must be a list.',{retryable:false});
  for(const x of list)if(typeof x.format!=='string'||!x.format||typeof x.category!=='string'||!x.category)throw new Stage4Error('CONFIG',`etsy-taxonomy-map.json has an invalid unresolved entry: ${JSON.stringify(x)}`,{retryable:false});
  return list;
}
export const UNRESOLVED_FORMATS=Object.freeze(loadUnresolvedFormats());

/**
 * Fixed per-format mappings ([{format, path, taxonomy_id}], ADR-059): a format with one resolves to that ID whatever
 * category the listing text suggests. Malformed entries, duplicates and a format that is also unresolved are CONFIG errors.
 */
export function loadFormatMappings(url=new URL('../../config/etsy-taxonomy-map.json',import.meta.url)){
  const m=JSON.parse(readFileSync(url,'utf8')), list=m.format_mappings??[];
  if(!Array.isArray(list))throw new Stage4Error('CONFIG','etsy-taxonomy-map.json format_mappings must be a list.',{retryable:false});
  const seen=new Set(), open=new Set((m.unresolved??[]).map(u=>u.format));
  for(const x of list){
    if(typeof x.format!=='string'||!x.format||typeof x.path!=='string'||!x.path.includes('>')||!Number.isSafeInteger(x.taxonomy_id)||x.taxonomy_id<=0)
      throw new Stage4Error('CONFIG',`etsy-taxonomy-map.json has an invalid format mapping: ${JSON.stringify(x)}`,{retryable:false});
    if(seen.has(x.format)||open.has(x.format))throw new Stage4Error('CONFIG',`etsy-taxonomy-map.json maps format "${x.format}" twice (or also lists it as unresolved).`,{retryable:false});
    seen.add(x.format);
  }
  return list;
}
export const FORMAT_MAPPINGS=Object.freeze(loadFormatMappings());

/** Every node with its full name path, e.g. "Paper & Party Supplies > Paper > Greeting Cards". */
export function taxonomyPaths(nodes){
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const pathOf=n=>{const names=[];let cur=n,guard=0;while(cur&&guard++<20){names.unshift(cur.name);cur=cur.parentId!==undefined&&cur.parentId!==null?byId.get(cur.parentId):null;}return names.join(' > ');};
  return nodes.map(n=>({id:n.id,path:pathOf(n)}));
}

export function resolveTaxonomy({categoryPath,nodes,overrideId=null,simulated=false,mappings=TAXONOMY_MAP,format=null,unresolved=UNRESOLVED_FORMATS,formatMappings=FORMAT_MAPPINGS}){
  if(!nodes?.length)throw new Stage4Error('TAXONOMY_UNRESOLVED','Etsy seller taxonomy is unavailable; the category cannot be verified.',{retryable:true});
  const paths=taxonomyPaths(nodes);
  const source=simulated?'DRY RUN: simulated taxonomy (not an Etsy ID)':null;
  if(overrideId!==null&&overrideId!==undefined){
    const hit=paths.find(p=>p.id===Number(overrideId));
    if(!hit)throw new Stage4Error('TAXONOMY_UNRESOLVED',`Owner taxonomy_id ${overrideId} (etsy/settings.json) is not in Etsy's seller taxonomy.`,{retryable:false});
    return {id:hit.id,path:hit.path,source:source??'owner setting (etsy/settings.json), verified in Etsy seller taxonomy'};
  }
  // The format's fixed approved mapping (ADR-059). Real Etsy IDs only (the dry run's simulated taxonomy has none).
  const fixed=format&&!simulated?formatMappings.find(f=>f.format===format):null;
  if(fixed){
    const node=paths.find(p=>p.id===fixed.taxonomy_id);
    if(!node||normPath(node.path)!==normPath(fixed.path))
      throw new Stage4Error('TAXONOMY_UNRESOLVED',`The approved ${format} category mapping "${fixed.path}" -> ${fixed.taxonomy_id} (automation/config/etsy-taxonomy-map.json) no longer matches Etsy: ${node?`${node.id} is now "${node.path}"`:`${fixed.taxonomy_id} is not in Etsy's seller taxonomy`}. Nothing was created; update the mapping or set taxonomy_id in etsy/settings.json.`,{retryable:false});
    return {id:node.id,path:node.path,source:`owner-approved ${format} mapping (automation/config/etsy-taxonomy-map.json), verified in Etsy seller taxonomy`};
  }
  // A format whose category is explicitly unresolved: only the owner's verified taxonomy_id above may resolve it.
  const open=format?unresolved.find(u=>u.format===format):null;
  if(open){
    // Verified candidates (owner still chooses): each is shown only if Etsy's live node still has that path.
    const live=(open.verified_candidates??[]).filter(c=>normPath(paths.find(p=>p.id===c.taxonomy_id)?.path)===normPath(c.path));
    throw new Stage4Error('TAXONOMY_UNRESOLVED',`The Etsy category for ${format} is unresolved: "${open.category}" has no owner-approved Etsy taxonomy ID. ${open.reason??''}${live.length?` Verified candidates: ${live.map(c=>`${c.taxonomy_id} = ${c.path}`).join(' | ')}.`:''} ${open.resolve_by??'Set taxonomy_id in etsy/settings.json.'} Nothing was created on Etsy.`.replace(/\s+/g,' ').trim(),{retryable:false});
  }
  const want=normPath(categoryPath);
  // 2. Owner-approved mapping: exact path, and Etsy's node with that ID must still be exactly that path.
  // (The dry run's simulated taxonomy has no real IDs: a mapping only applies to Etsy's own taxonomy.)
  const mapped=simulated?null:mappings.find(m=>normPath(m.path)===want);
  if(mapped){
    const node=paths.find(p=>p.id===mapped.taxonomy_id);
    if(!node||normPath(node.path)!==normPath(mapped.path))
      throw new Stage4Error('TAXONOMY_UNRESOLVED',`The approved mapping "${mapped.path}" -> ${mapped.taxonomy_id} (automation/config/etsy-taxonomy-map.json) no longer matches Etsy: ${node?`${node.id} is now "${node.path}"`:`${mapped.taxonomy_id} is not in Etsy's seller taxonomy`}. Nothing was created; update the mapping or set taxonomy_id in etsy/settings.json.`,{retryable:false});
    return {id:node.id,path:node.path,source:'owner-approved mapping (automation/config/etsy-taxonomy-map.json), verified in Etsy seller taxonomy'};
  }
  const exact=paths.filter(p=>norm(p.path)===want);
  if(exact.length===1)return {id:exact[0].id,path:exact[0].path,source:source??'Etsy seller taxonomy: exact path match of the approved category'};
  const leaf=want.split(' > ').at(-1);
  const near=paths.filter(p=>norm(p.path).split(' > ').at(-1)===leaf).slice(0,6).map(p=>`${p.id}: ${p.path}`);
  throw new Stage4Error('TAXONOMY_UNRESOLVED',exact.length>1
    ?`Category "${categoryPath}" matches ${exact.length} Etsy taxonomy nodes; set taxonomy_id in etsy/settings.json.`
    :`Category "${categoryPath}" is not an exact Etsy seller-taxonomy path.${near.length?` Candidates: ${near.join(' | ')}.`:''} Set taxonomy_id in etsy/settings.json after checking it.`,{retryable:false});
}

// Approved Stage 3 fields that correspond to Etsy taxonomy properties.
const FIELDS=[['occasion',['occasion']],['primary_colour',['primary color','primary colour']],['secondary_colour',['secondary color','secondary colour']]];

/**
 * Map approved listing attributes to Etsy properties for this taxonomy. Only
 * an exact (case-insensitive) value match is applied; anything else is
 * recorded as skipped with a reason (these properties are optional on Etsy).
 */
export function mapProperties({listing,properties}){
  const apply=[], skipped=[];
  for(const [field,names] of FIELDS){
    const value=listing[field];
    if(!value){skipped.push({field,value:null,reason:'not in the approved listing'});continue;}
    const prop=properties.find(p=>names.includes(norm(p.name))||names.includes(norm(p.displayName)));
    if(!prop){skipped.push({field,value,reason:'no such property for this category'});continue;}
    const v=prop.possibleValues.find(x=>norm(x.name)===norm(value));
    if(!v){skipped.push({field,value,reason:`"${value}" is not one of Etsy's values for ${prop.displayName}`});continue;}
    apply.push({field,property_id:prop.propertyId,property_name:prop.displayName,value_ids:[v.valueId],values:[v.name]});
  }
  return {apply,skipped};
}
