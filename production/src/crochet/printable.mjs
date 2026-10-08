// Printable characters of a crochet pattern bundle (ADR-052): the ONE source of truth for "can the
// document fonts print this text". Used by Stage 1 (pattern review, before approval) and by Stage 2
// (the final check before any document is laid out). Deterministic; no model. Never replaces text.
//
// The strings are exactly the source texts the documents print, and a character is printable when every
// document font (body, bold, display, italic) has a glyph for it. Whitespace is never checked.
import { loadFonts, missingGlyphs } from './design.mjs';

export const DOCUMENT_FONTS=Object.freeze(['body','bold','display','italic']);

/** Every text the documents take from the source, with its JSON path. */
export function printableStrings(b){
  const out=[], add=(path,v)=>{if(typeof v==='string'&&v)out.push({path,text:v});};
  const each=(path,list)=>{if(Array.isArray(list))list.forEach((v,i)=>add(`${path}[${i}]`,v));};
  const glossary=(path,g)=>{if(g&&typeof g==='object')for(const [k,v] of Object.entries(g)){add(`${path}`,k);add(`${path}.${JSON.stringify(k)}`,v);}};
  add('$.title',b?.title);add('$.theme',b?.theme);each('$.notes',b?.notes);glossary('$.abbreviations',b?.abbreviations);
  if(b?.combinations){
    add('$.combinations.title',b.combinations.title);add('$.combinations.intro',b.combinations.intro);
    (b.combinations.items??[]).forEach((x,i)=>{add(`$.combinations.items[${i}].name`,x?.name);each(`$.combinations.items[${i}].notes`,x?.notes);});
  }
  (Array.isArray(b?.patterns)?b.patterns:[]).forEach((p,i)=>{
    const P=`$.patterns[${i}]`;
    for(const k of ['name','category','finished_size','gauge'])add(`${P}.${k}`,p?.[k]);
    (p?.yarn??[]).forEach((y,j)=>{for(const k of ['description','colour','amount'])add(`${P}.yarn[${j}].${k}`,y?.[k]);});
    add(`${P}.hook_size.us`,p?.hook_size?.us);
    each(`${P}.additional_materials`,p?.additional_materials);each(`${P}.stitches_used`,p?.stitches_used);glossary(`${P}.abbreviations`,p?.abbreviations);
    (p?.instructions??[]).forEach((s,j)=>{
      add(`${P}.instructions[${j}].heading`,s?.heading);
      (s?.steps??[]).forEach((st,k)=>{add(`${P}.instructions[${j}].steps[${k}].label`,st?.label);add(`${P}.instructions[${j}].steps[${k}].text`,st?.text);});
    });
    each(`${P}.assembly`,p?.assembly);each(`${P}.finishing`,p?.finishing);each(`${P}.notes`,p?.notes);
  });
  return out;
}

/** "U+0AAC". */
export const codePoint=c=>`U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`;

/** A path as the owner reads it: "Pattern 22, Finishing 4", "Pattern 3, Section 2, Step 4". */
export function printableLocation(path){
  const m=/^\$\.patterns\[(\d+)\]\.?(.*)$/.exec(path);
  if(!m)return path.replace(/^\$\./,'Bundle ');
  const n=Number(m[1])+1, rest=m[2];
  const step=/^instructions\[(\d+)\]\.steps\[(\d+)\]\.(text|label)$/.exec(rest);
  if(step)return `Pattern ${n}, Section ${+step[1]+1}, Step ${+step[2]+1}${step[3]==='label'?' label':''}`;
  const head=/^instructions\[(\d+)\]\.heading$/.exec(rest);
  if(head)return `Pattern ${n}, Section ${+head[1]+1} heading`;
  const item=/^(assembly|finishing|notes|additional_materials|stitches_used)\[(\d+)\]$/.exec(rest);
  if(item)return `Pattern ${n}, ${{assembly:'Assembly',finishing:'Finishing',notes:'Notes',additional_materials:'Materials',stitches_used:'Stitches'}[item[1]]} ${+item[2]+1}`;
  return `Pattern ${n}, ${rest.replace(/\[(\d+)\]/g,(_,i)=>` ${+i+1}`).replace(/\./g,' ').replace(/_/g,' ')}`;
}

/** Unprintable characters with their exact paths, against already-loaded fonts. @returns [{path, location, char, code}] */
/** `faces`: the font keys that may draw source text (default: the classic document fonts). */
export function unprintableCharacters(b,fonts,faces=DOCUMENT_FONTS){
  const out=[];
  for(const {path,text} of printableStrings(b)){
    const missing=new Set(faces.flatMap(f=>missingGlyphs(fonts[f],text)));
    for(const char of [...text].filter(c=>missing.has(c)).filter((c,i,a)=>a.indexOf(c)===i))out.push({path,location:printableLocation(path),char,code:codePoint(char)});
  }
  return out;
}

/** The same, loading the document fonts. */
export async function crochetPrintability(b){
  const problems=unprintableCharacters(b,await loadFonts());
  return {ok:!problems.length,problems};
}

/** One validation line per problem (prefixed with the path, so it is assigned to its pattern). */
export const printabilityErrors=problems=>problems.map(x=>`${x.path}: "${x.char}" ${x.code} cannot be printed by the document fonts (${x.location})`);
