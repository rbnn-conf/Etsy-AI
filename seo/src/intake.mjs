// Relevance profile from an owner-confirmed STRUCTURED idea (ADR-036), so a
// Telegram research session needs no hand-written profile file.
//
// Mapping (nothing else is inferred):
//   themes                       → central_themes
//   formats (+ format family)    → formats        (planner FORMAT_FAMILIES, ADR-033)
//   audiences (except "general") → audiences
//   styles + delivery words      → attributes     (digital, printable, editable)
//   components, tangential       → empty          (the owner can edit the profile later)
//   seasonality                  → null           (never inferred)
// A word may belong to one facet only: a later facet drops a phrase whose
// word is already used by an earlier facet (themes > formats > audiences > attributes).
// Exception (ADR-040): when that would drop EVERY format (e.g. themes
// "crochet flowers" + format "crochet pattern bundle"), formats go first
// instead, since a profile needs a format. Ideas that already had a
// format are unaffected.
import { FORMAT_FAMILIES, normaliseQuery } from './planner.mjs';
import { validateProfile, words } from './relevance.mjs';

const DELIVERY_WORDS=Object.freeze(['digital','printable','editable']);
const familyOf=f=>FORMAT_FAMILIES.find(fam=>fam.some(x=>normaliseQuery(x)===normaliseQuery(f)))??[];

/**
 * @param idea  a validated idea with structured themes, formats, audiences, delivery and styles
 * @returns {profile (raw, valid), dropped:[{phrase, facet, reason}]}
 */
export function profileFromIdea(idea,{profile_id,describes}){
  const facets={central_themes:idea.themes??[],formats:[...(idea.formats??[]),...(idea.formats??[]).flatMap(familyOf)],
    audiences:(idea.audiences??[]).filter(a=>normaliseQuery(a)!=='general'),
    attributes:[...(idea.styles??[]),...(idea.delivery??[]).filter(d=>DELIVERY_WORDS.includes(d))]};
  const assign=order=>{
    const owner=new Map(), dropped=[], out={};
    for(const facet of order){
      out[facet]=[];
      for(const phrase of facets[facet]){
        const toks=words(phrase).map(w=>w.token);
        if(!toks.length)continue;
        const clash=toks.find(t=>owner.has(t)&&owner.get(t)!==facet);
        if(clash){dropped.push({phrase,facet,reason:`"${clash}" is already a ${owner.get(clash).replace('_',' ')} word`});continue;}
        if(out[facet].some(p=>normaliseQuery(p)===normaliseQuery(phrase)))continue;
        toks.forEach(t=>owner.set(t,facet));out[facet].push(phrase);
      }
    }
    return {out,dropped};
  };
  let {out,dropped}=assign(['central_themes','formats','audiences','attributes']);
  if(!out.formats.length&&facets.formats.length)({out,dropped}=assign(['formats','central_themes','audiences','attributes']));
  const profile={schema_version:1,profile_id,describes,
    source:'Derived from the owner-confirmed structured idea: themes → central themes; formats and their format family → formats; audiences; styles and delivery words → attributes. Nothing else inferred.',
    seasonality:null,notes:dropped.length?`Not used (one facet per word): ${dropped.map(d=>`${d.phrase} (${d.reason})`).join('; ')}.`:null,
    central_themes:out.central_themes,formats:out.formats,components:[],audiences:out.audiences,attributes:out.attributes,tangential:[]};
  const v=validateProfile(profile);
  if(!v.ok)throw new Error(`the answers do not make a usable relevance profile: ${v.errors.join('; ')}`);
  return {profile,dropped};
}
