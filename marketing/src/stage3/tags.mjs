// Stage 3 mechanical Etsy-field compliance (deterministic). The model chooses
// the search phrases; code makes them Etsy-valid. Only formatting is touched:
//   - characters: NFC, curly apostrophes -> ', dashes -> -, & -> and,
//     whitespace collapsed, lower case (tags only);
//   - length: a tiny list of meaning-preserving substitutions, applied only
//     while a tag is over the limit. A candidate that is still too long, or has
//     other characters, is DISCARDED, never sliced;
//   - duplicates (ignoring case) and extra title-only tags are skipped.
// Length and characters use the same rules as services/src/etsy/reviewed-
// product.ts (JS string length after trim; /^[\p{L}\p{N} '\-]+$/u).
// Claims are not touched here: callers claim-check every candidate first and
// reject the whole listing on an unsupported claim.
import { LISTING_LIMITS } from './claims.mjs';

const CHARS=[[/[‘’ʼ`´]/g,"'"],[/[‐-―−]/g,'-'],[/\s*&\s*/g,' and ']];
/** Whole-word, same-meaning, shorter. Applied in order, only while too long. */
export const TAG_SUBSTITUTIONS=Object.freeze([['christmas','xmas'],['greetings','greeting'],['colouring','coloring']]);

const clean=s=>{let t=String(s??'').normalize('NFC');for(const [re,to] of CHARS)t=t.replace(re,to);return t.replace(/\s+/g,' ').trim();};
const words=s=>s.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];

/** One candidate -> {ok,tag,repairs} or {ok:false,reason}. Never shortens by slicing. */
export function normaliseTag(raw){
  const L=LISTING_LIMITS;
  let t=clean(raw).toLowerCase();
  if(!t)return {ok:false,tag:t,reason:'empty'};
  if(!L.tagPattern.test(t))return {ok:false,tag:t,reason:"characters other than letters, numbers, spaces, ' and -"};
  const repairs=[];
  for(const [from,to] of TAG_SUBSTITUTIONS){
    if(t.length<=L.tagMax)break;
    const re=new RegExp(`(?<![\\p{L}\\p{N}])${from}(?![\\p{L}\\p{N}])`,'gu');
    if(re.test(t)){t=t.replace(re,to);repairs.push(`${from} -> ${to}`);}
  }
  if(t.length>L.tagMax)return {ok:false,tag:t,reason:`over ${L.tagMax} characters with no safe repair`};
  return {ok:true,tag:t,repairs};
}

/**
 * Pick the final Etsy tags from the model's candidate pool, in the model's
 * order. Returns {tags, decisions, problems}; problems is non-empty when fewer
 * than LISTING_LIMITS.tagsTarget valid tags remain (no tag is ever invented).
 */
export function selectTags(candidates,{title}){
  const L=LISTING_LIMITS, titleWords=new Set(words(String(title??'')));
  const tags=[], decisions=[], seen=new Set();let echoes=0;
  for(const candidate of candidates??[]){
    const n=normaliseTag(candidate);
    const d=(result,reason)=>decisions.push({candidate,tag:n.tag,result,...(reason?{reason}:{}),...(n.repairs?.length?{repairs:n.repairs}:{})});
    if(!n.ok){d('discarded',n.reason);continue;}
    if(seen.has(n.tag)){d('discarded','duplicate (ignoring case)');continue;}
    const echo=words(n.tag).every(w=>titleWords.has(w));
    if(echo&&echoes>=L.tagTitleEchoMax){d('discarded',`only repeats title words (at most ${L.tagTitleEchoMax} such tags)`);continue;}
    if(tags.length>=L.tagsTarget){d('unused',`${L.tagsTarget} tags already selected`);continue;}
    seen.add(n.tag);if(echo)echoes++;tags.push(n.tag);d(n.repairs.length?'repaired':'kept');
  }
  const problems=tags.length<L.tagsTarget?[`tags: only ${tags.length} valid Etsy tags from ${(candidates??[]).length} candidates (${L.tagsTarget} needed); discarded: ${decisions.filter(x=>x.result==='discarded').map(x=>`"${x.candidate}" (${x.reason})`).join(', ')||'none'}`]:[];
  return {tags,decisions,problems};
}

/** Materials: same character clean-up (case kept); invalid or over-long entries dropped, never sliced. */
export function selectMaterials(list){
  const L=LISTING_LIMITS, out=[], decisions=[], seen=new Set();
  for(const candidate of list??[]){
    const m=clean(candidate);
    const reason=!m?'empty':!L.tagPattern.test(m)?"characters other than letters, numbers, spaces, ' and -":m.length>L.materialMax?`over ${L.materialMax} characters`:
      seen.has(m.toLowerCase())?'duplicate (ignoring case)':out.length>=L.materialsMax?`${L.materialsMax} materials already selected`:null;
    if(reason){decisions.push({candidate,material:m,result:'discarded',reason});continue;}
    seen.add(m.toLowerCase());out.push(m);decisions.push({candidate,material:m,result:m===candidate?'kept':'cleaned'});
  }
  return {materials:out,decisions};
}
