// Etsy shop sections (ADR-054): which ONE shop section a listing belongs to, from
// deterministic configuration (automation/config/etsy-sections.json). No model, no
// guessing: the classifier reads only structured product metadata —
//   format  the canonical product_format of the selected concept (formatOf)
//   season  product.json `season` (matched by whole word against the config's seasons)
//   topic   product.json `product_type` (matched by whole word against the config's topics)
// Marketing copy (titles, descriptions, tags) is never read.
import { readFileSync } from 'node:fs';
import { formatOf } from '../orchestrator/book-state.mjs';

export const SECTIONS_FILE=new URL('../../config/etsy-sections.json',import.meta.url);

/** Load and check the section map: every target is a declared section, every theme is declared. */
export function loadSectionMap(file=SECTIONS_FILE){
  const m=JSON.parse(readFileSync(file,'utf8'));
  const themes=new Set([...Object.keys(m.seasons??{}),...Object.keys(m.topics??{})]);
  for(const [key,section] of Object.entries(m.map??{})){
    if(!m.sections.includes(section))throw new Error(`etsy-sections.json: "${key}" maps to "${section}", which is not in sections`);
    const theme=key.split(':')[1];
    if(theme!==undefined&&!themes.has(theme))throw new Error(`etsy-sections.json: "${key}" uses an undeclared theme "${theme}"`);
  }
  for(const s of m.sections)if(!s.trim()||s.length>24)throw new Error(`etsy-sections.json: section "${s}" must be 1-24 characters (Etsy's limit)`);
  return Object.freeze(m);
}
export const SECTION_MAP=loadSectionMap();

const words=s=>new Set(String(s??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().match(/[a-z0-9]+/g)??[]);
const themeIn=(text,dict)=>{const w=words(text);return Object.entries(dict??{}).filter(([,list])=>list.some(x=>w.has(x))).map(([k])=>k);};

/**
 * The section for a product, or {section:null, warning}. A season (from `season`) comes before a topic
 * (from `product_type`); '<format>:<theme>' before '*:<theme>' before '<format>'. Two different seasons
 * (or topics) at once are ambiguous: no section.
 */
export function resolveShopSection(product,map=SECTION_MAP){
  const format=formatOf(product)??null, seasons=themeIn(product?.season,map.seasons), topics=themeIn(product?.product_type,map.topics);
  const facts={format,season:product?.season??null,product_type:product?.product_type??null};
  const label=[format??'unknown format',seasons[0]??topics[0]??product?.season??null].filter(Boolean).join(' / ');
  if(seasons.length>1||topics.length>1)
    return {section:null,key:null,...facts,warning:`No Etsy shop-section mapping found for ${format??'unknown format'} (ambiguous: ${[...seasons,...topics].join(', ')})`,label};
  for(const theme of [seasons[0],topics[0]].filter(Boolean))
    for(const key of [`${format}:${theme}`,`*:${theme}`])if(map.map[key])return {section:map.map[key],key,theme,...facts,label};
  // A recognised season with no seasonal section is reported, never filed under the generic format section.
  if(seasons.length)return {section:null,key:null,...facts,warning:`No Etsy shop-section mapping found for ${label}`,label};
  if(format&&map.map[format])return {section:map.map[format],key:format,theme:null,...facts,label};
  return {section:null,key:null,...facts,warning:`No Etsy shop-section mapping found for ${label}`,label};
}

// Etsy may return text HTML-escaped ("Budget &amp; Finance"): decode before comparing.
const ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
const decodeEntities=s=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(parseInt(e.slice(e[1]==='x'||e[1]==='X'?2:1),e[1]==='x'||e[1]==='X'?16:10)):ENTITIES[e.toLowerCase()]??m);
/** Section titles compared safely: HTML escaping, case, spacing, accents and "&" vs "and" never make a second section. */
export const sectionKey=t=>decodeEntities(String(t??'')).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();

/** The existing shop section for a title: exact title first, then the normalised one. Several = ambiguous. */
export function matchSection(sections,title){
  const exact=sections.filter(s=>s.title===title);
  if(exact.length===1)return {section:exact[0],ambiguous:false};
  const same=sections.filter(s=>sectionKey(s.title)===sectionKey(title));
  return same.length===1?{section:same[0],ambiguous:false}:{section:null,ambiguous:same.length>1,candidates:same};
}

export const CREATE_SCOPE='shops_w';
