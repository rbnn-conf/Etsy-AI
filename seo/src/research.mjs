// Research sets: versioned, immutable collections of accepted observations.
//
// A new capture never edits an old one: it becomes the next version, which
// records its parent's checksum. Briefs cite (research_id, version, sha256),
// so every number in a brief can be traced to exactly what was captured.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestObservations } from './observations.mjs';

export const RESEARCH_SCHEMA_VERSION=1;
const sha=s=>createHash('sha256').update(s).digest('hex');
const ID=/^[a-z0-9][a-z0-9-]{1,62}$/;
/** Canonical bytes of a research set (stable key order, sorted observations). */
export const canonical=set=>Buffer.from(JSON.stringify(set,null,2)+'\n');

/**
 * Build research version N+1 from raw rows. Throws if any row is rejected, so
 * a partly wrong capture is never stored as if complete.
 * @param previous  the prior version (or null for v1)
 */
export function createResearchSet({research_id,rows,recorded_at,recorded_by,note=null,previous=null}){
  if(!ID.test(research_id??''))throw new Error(`research_id must match ${ID}`);
  if(!recorded_at||Number.isNaN(Date.parse(recorded_at)))throw new Error('recorded_at (when the data was entered) is required');
  if(!recorded_by)throw new Error('recorded_by is required');
  if(previous&&previous.research_id!==research_id)throw new Error('previous version belongs to another research set');
  const r=ingestObservations(rows);
  if(r.rejected.length)throw Object.assign(new Error(`${r.rejected.length} observation(s) rejected: ${r.rejected.map(x=>`row ${x.index}${x.keyword?` (${x.keyword})`:''}: ${x.errors.join('; ')}`).join(' | ')}`),{rejected:r.rejected});
  const set={schema_version:RESEARCH_SCHEMA_VERSION,research_id,version:(previous?.version??0)+1,parent:previous?{version:previous.version,sha256:researchSha(previous)}:null,
    recorded_at,recorded_by,note,kind:'raw_observations',
    observations:[...r.accepted].sort((a,b)=>a.keyword.localeCompare(b.keyword)),missing_values:r.missing};
  return set;
}
export const researchSha=set=>sha(canonical(set));
/** Look up the observation for a keyword (exact, normalised), or null. */
export const observationFor=(set,keyword)=>set.observations.find(o=>o.keyword===keyword)??null;

/** File-backed store: research/<id>/vNNN.json, write-once. */
export class ResearchStore{
  constructor(dir){this.dir=dir;}
  #path(id,v){return join(this.dir,id,`v${String(v).padStart(3,'0')}.json`);}
  async versions(id){
    const files=await readdir(join(this.dir,id)).catch(()=>[]);
    return files.map(f=>/^v(\d{3})\.json$/.exec(f)?.[1]).filter(Boolean).map(Number).sort((a,b)=>a-b);
  }
  async save(set){
    const existing=await this.versions(set.research_id), latest=existing.at(-1)??0;
    if(set.version!==latest+1)throw new Error(`research ${set.research_id}: version ${set.version} cannot follow v${latest} (versions are write-once and sequential)`);
    if(latest){const prev=await this.load(set.research_id,latest);if(set.parent?.sha256!==researchSha(prev))throw new Error(`research ${set.research_id} v${set.version}: parent checksum does not match v${latest}`);}
    await mkdir(join(this.dir,set.research_id),{recursive:true});
    await writeFile(this.#path(set.research_id,set.version),canonical(set),{flag:'wx'});   // never overwrites
    return {research_id:set.research_id,version:set.version,sha256:researchSha(set)};
  }
  async load(id,version){
    const v=version??(await this.versions(id)).at(-1);
    if(!v)return null;
    return JSON.parse(await readFile(this.#path(id,v),'utf8'));
  }
}
