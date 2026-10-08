// Relevance: how accurately a keyword describes THIS product (ADR-032 §Relevance).
//
// Deterministic, no model. The owner (or a fixture built from the product's
// own listing text) supplies a RELEVANCE PROFILE: the product's words sorted
// into facets. A keyword is classified from which facets its words fall in.
// Any word the profile does not describe makes the keyword IRRELEVANT: this is
// the distinctive-term guardrail that stops a better-selling unrelated product
// (a Christmas card) from hijacking an autumn colouring idea.
import { createHash } from 'node:crypto';
import { matchKey } from './observations.mjs';

export const RELEVANCE_CLASSES=Object.freeze(['EXACT','STRONG','SUPPORTING','WEAK','IRRELEVANT']);
export const PROFILE_SCHEMA_VERSION=1;
export const SEASONALITY=Object.freeze(['peak','in_season','approaching','evergreen','off_season','unknown']);
/**
 * central_themes  the product's subject (autumn, halloween, christmas)
 * formats         what the product IS (coloring + page/book, activity book, card)
 * components      parts the product contains (the colouring pages inside an activity book)
 * audiences       who it is for (adult, kid, family)
 * attributes      style, use and delivery words (cozy, cute, printable, digital)
 * tangential      mentioned but not central (motifs, minor themes, adjacent ideas)
 */
export const FACETS=Object.freeze(['central_themes','formats','components','audiences','attributes','tangential']);
const FIELDS=['schema_version','profile_id','describes','source','seasonality','notes',...FACETS];
// Grammar only. Everything else must be placed in a facet by the profile.
const GRAMMAR=new Set(['for','the','and','a','an','of','with','to','in','on','by','my','your','&']);
// Spelling equivalents, like colour/color in matchKey. "fall" is the US word for the season "autumn".
export const TOKEN_ALIASES=Object.freeze({cosy:'cozy',xmas:'christmas',fall:'autumn'});

/** A word's matching token: alias, then a simple plural rule (-ies → -y; trailing -s after a consonant or e). */
export function token(word){
  let t=TOKEN_ALIASES[word]??word;
  if(t.length>4&&t.endsWith('ies'))t=t.slice(0,-3)+'y';
  else if(t.length>3&&t.endsWith('s')&&!/[aiuos]s$/.test(t))t=t.slice(0,-1);
  return TOKEN_ALIASES[t]??t;
}
/** Content words of a phrase: [{word, token}], grammar words removed. */
export const words=phrase=>matchKey(phrase).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’]/g,'').split(/[^a-z0-9&]+/).filter(w=>w&&!GRAMMAR.has(w)).map(w=>({word:w,token:token(w)}));
/** Order-free identity of a phrase ("coloring pages fall" = "fall coloring page"): used for duplicate intent. */
export const signature=phrase=>[...new Set(words(phrase).map(w=>w.token))].sort().join(' ');

/** @returns {ok, errors, profile}  profile.index maps token → facet */
export function validateProfile(raw){
  const e=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,errors:['profile must be an object'],profile:null};
  for(const k of Object.keys(raw))if(!FIELDS.includes(k))e.push(`unexpected field "${k}"`);
  for(const k of FIELDS)if(!(k in raw))e.push(`${k} is required (use null or [] when unknown)`);
  if(raw.schema_version!==PROFILE_SCHEMA_VERSION)e.push('schema_version must be 1');
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(raw.profile_id??''))e.push('profile_id must be a lowercase slug');
  if(!raw.describes||!['NEW_PRODUCT','EXISTING_LISTING'].includes(raw.describes.mode)||typeof raw.describes.ref!=='string')e.push('describes must be {mode, ref}');
  if(typeof raw.source!=='string'||!raw.source.trim())e.push('source (where the profile words came from) is required');
  if(raw.seasonality!==null&&!SEASONALITY.includes(raw.seasonality))e.push(`seasonality must be one of ${SEASONALITY.join(', ')} or null (never inferred from the clock)`);
  const index=new Map();
  for(const f of FACETS){
    const v=raw[f];
    if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim())){e.push(`${f} must be a list of non-empty strings`);continue;}
    for(const phrase of v)for(const {word,token:t} of words(phrase)){
      if(index.has(t)&&index.get(t)!==f)e.push(`"${word}" is in both ${index.get(t)} and ${f}; a word may have one facet`);
      index.set(t,f);
    }
  }
  if(Array.isArray(raw.central_themes)&&!raw.central_themes.length)e.push('central_themes needs at least one word');
  if(Array.isArray(raw.formats)&&!raw.formats.length)e.push('formats needs at least one word');
  if(e.length)return {ok:false,errors:e,profile:null};
  return {ok:true,errors:[],profile:{...raw,index}};
}
/** Checksum of the profile as supplied (the index is derived, so not included). */
export const profileSha=p=>{const {index,...raw}=p;return createHash('sha256').update(JSON.stringify(raw)).digest('hex');};

const FACET_LABEL={central_themes:'central theme',formats:'product format',components:'part of the product',audiences:'audience',attributes:'attribute',tangential:'tangential theme'};
const list=ws=>ws.map(w=>`"${w.word}"`).join(', ');

/**
 * Classify one keyword against a validated profile. First matching rule wins:
 *   1. a word the profile does not describe   → IRRELEVANT
 *   2. a tangential word                      → WEAK
 *   3. central theme + format, no component    → EXACT
 *   4. central theme + component or audience   → STRONG
 *   5. format/component + audience             → STRONG
 *   6. format/component (+ attributes)         → SUPPORTING
 *   7. central theme (+ attributes)            → SUPPORTING
 *   8. only audience/attribute words           → WEAK
 *   (no content words at all                   → IRRELEVANT)
 * @returns {relevance_class, rule, words:[{word, token, facet}], reason}
 */
export function classifyKeyword(keyword,profile){
  const ws=words(keyword).map(w=>({...w,facet:profile.index.get(w.token)??null}));
  const of=f=>ws.filter(w=>w.facet===f), has=f=>of(f).length>0;
  const r=(cls,rule,reason)=>({relevance_class:cls,rule,words:ws,reason});
  if(!ws.length)return r('IRRELEVANT',0,'no descriptive words');
  const foreign=ws.filter(w=>!w.facet);
  if(foreign.length)return r('IRRELEVANT',1,`contains ${list(foreign)}, which the product profile does not describe`);
  if(has('tangential'))return r('WEAK',2,`${list(of('tangential'))} is only a tangential theme of this product`);
  const theme=has('central_themes'), format=has('formats'), part=has('components'), aud=has('audiences');
  if(theme&&format&&!part)return r('EXACT',3,`names the central theme (${list(of('central_themes'))}) and the product format (${list(of('formats'))})`);
  if(theme&&part)return r('STRONG',4,`names the central theme (${list(of('central_themes'))}) and a part of the product (${list(of('components'))}), not the whole product`);
  if(theme&&aud)return r('STRONG',4,`names the central theme (${list(of('central_themes'))}) and the audience (${list(of('audiences'))}), but not the format`);
  if((format||part)&&aud)return r('STRONG',5,`names the ${format?'product format':'part of the product'} (${list([...of('formats'),...of('components')])}) and the audience (${list(of('audiences'))}), but not the theme`);
  if(format||part)return r('SUPPORTING',6,`names the ${format?'product format':'part of the product'} (${list([...of('formats'),...of('components')])})${has('attributes')?` with ${list(of('attributes'))}`:''}, but not the theme or audience`);
  if(theme)return r('SUPPORTING',7,`names the central theme (${list(of('central_themes'))}) but not what the product is`);
  return r('WEAK',8,`only ${[...new Set(ws.map(w=>FACET_LABEL[w.facet]))].join(' and ')} words (${list(ws)})`);
}
