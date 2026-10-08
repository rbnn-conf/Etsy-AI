// Canonical product formats and their owner-facing aliases (ADR-040).
//
// A canonical format id (e.g. "colouring-book") is what every stage records
// in product_format and what the Stage 2/3 adapter registries are keyed by.
// resolveFormat() turns the owner's words into that id, or null: it never
// guesses a nearby format.
//
// Where each format is supported:
//   stage1  Stage 1 may propose it (PAGE_RULES + the concepts schema enum, sent to OpenAI)
//   stage2  a Stage 2 production adapter is registered (production ADAPTERS)
// A format may be offered to Stage 1 before Stage 2 can produce it (e.g.
// activity-book); formatSupport() says which. Crochet pattern bundles are
// supported by both since ADR-041.
import { PAGE_RULES } from './page-rules.mjs';
import { ADAPTERS, CROCHET_FORMAT } from '../../../production/src/index.mjs';

export const CANONICAL_FORMATS=Object.freeze(Object.keys(PAGE_RULES));

// Owner-facing alternative names. The canonical id itself (with spaces or
// hyphens) always resolves and is not repeated here.
export const FORMAT_ALIASES=Object.freeze({
  [CROCHET_FORMAT]:Object.freeze(['crochet pattern','crochet-pattern','crochet bundle','crochet pattern bundle','crochet flower pattern','crochet flower bouquet pattern'])
});

/** Lowercase, accents removed, - _ and spacing unified, simple plural (-s) dropped per word. */
export function normaliseFormat(text){
  return String(text??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
    .split(' ').filter(Boolean).map(w=>w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w).join(' ');
}
const INDEX=(()=>{
  const m=new Map();
  for(const f of CANONICAL_FORMATS)m.set(normaliseFormat(f),f);
  for(const [f,list] of Object.entries(FORMAT_ALIASES))for(const a of list){
    const k=normaliseFormat(a);
    if(m.has(k)&&m.get(k)!==f)throw new Error(`format alias "${a}" is ambiguous (${m.get(k)} and ${f})`);
    m.set(k,f);
  }
  return m;
})();

/** The canonical format for the owner's words, or null (never a guess). */
export const resolveFormat=text=>INDEX.get(normaliseFormat(text))??null;

/** Which stages support a canonical format today. */
export function formatSupport(format){
  const f=resolveFormat(format);
  return {format:f,known:!!f,stage1:!!f&&f in PAGE_RULES,stage2:!!f&&f in ADAPTERS};
}
