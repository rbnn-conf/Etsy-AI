// Stage 3 claim QC for model-written text (listing copy and image headlines).
// Deterministic: anything the production package does not prove is rejected.
//   - never-proven claims (editable, Canva, physical/shipped, DPI, file types
//     not delivered, extras like envelopes or frames, personalisation);
//   - numbers that disagree with production (design count, sizes, paper);
//   - fake urgency.
// Negated statements ("No physical item is shipped") are allowed.

// Etsy constraints already enforced by services/src/etsy/reviewed-product.ts
// (title <= 140; 1-13 unique tags, each <= 20 chars, letters/numbers/space/'/-).
// Kept in step by a test that reads that file.
import { crochetClaimProblems } from './crochet-integrity.mjs';
import { priceProblem } from './price.mjs';

export const LISTING_LIMITS=Object.freeze({
  titleMax:140,tagsMin:1,tagsMax:13,tagMax:20,tagPattern:/^[\p{L}\p{N} '\-]+$/u,
  // Local, conservative limits (not in the repo's Etsy layer yet): Stage 4 maps these.
  materialsMax:13,materialMax:45,descriptionMax:5000,priceMinGbp:0.5,priceMaxGbp:100,
  // Stage 3 tag selection (tags.mjs): final count, title-only tags allowed, model candidate pool.
  tagsTarget:13,tagTitleEchoMax:6,tagCandidatesMin:13,tagCandidatesMax:30
});

const FILE_WORDS=/\b(pdfs?|pngs?|jpe?gs?|zip|a4|a5|us letter|letter size|files?|formats?|dpi|4\s*[x×]\s*6)\b/i;
const DIGITAL=/\bdigital (download|product|files?)\b|\binstant download\b/i;
const NO_SHIP=/\b(no|not|nothing|never)\b[^.!?\n]{0,60}\b(physical|shipped|ship|posted|mailed|delivered by post)\b/i;
const NEGATION=/\b(no|not|nothing|never|without|isn'?t|won'?t|aren'?t)\b/i;
const NUMBER_WORDS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
// Pattern -> reason. `negatable`: acceptable inside a negated sentence.
const NEVER=[
  [/\bcanva\b/i,'no Canva template is delivered'],
  [/\bcustomi[sz](e|able|ed|ation)\b|\bpersonali[sz](e|ed|able|ation)\b|\byour name\b/i,'no personalisation is offered'],
  [/\b\d{2,4}\s*(dpi|ppi)\b|\bhigh[- ]?res(olution)?\b|\bhd\b/i,'print resolution is not claimed'],
  [/\b(svg|eps|jpe?g|word|docx|psd|ai files?)\b/i,'only PDF and PNG files are delivered'],
  [/\benvelopes?\b[^.!?]{0,40}\b(included|comes? with|provided)\b|\b(includes?|with)\b[^.!?]{0,20}\benvelopes?\b/i,'no envelope is included'],
  [/\bframes?\b[^.!?]{0,40}\b(included|comes? with)\b|\b(includes?|with)\b[^.!?]{0,20}\bframes?\b/i,'no frame is included'],
  [/\bphysical (card|product|item|print|copy)s?\b|\bprinted (and|&) (shipped|posted|mailed)\b/i,'no physical item exists',true],
  [/\b(we|will) (ship|post|mail)\b|\b(shipped|posted|mailed) to you\b|\bfree shipping\b/i,'nothing is shipped',true],
  [/\b(ships|shipped|shipping|dispatch(?:ed|es)?|next[- ]day delivery|delivered to your door)\b/i,'nothing is shipped',true],
  [/\bhurry\b|\blimited[- ]time\b|\bonly today\b|\bact now\b|\blast chance\b|\bsale ends\b|\bwhile stocks? last\b|\bselling fast\b/i,'fake urgency'],
  [/\b(A3|A5|A6|5\s*[x×]\s*7|legal size|tabloid)\b/i,'paper size not produced'],
  [/\bhand[- ]?(made|painted|drawn|illustrated|crafted|lettered|finished|sketched|inked|rendered)\b|\bhandcrafted\b|\bmade by hand\b|\bpainted by hand\b|\bartisan(al)?\b|\boriginal (painting|watercolou?r painting)s?\b/i,'authorship or making process not proven','process']
];

// ---------- editable / delivered-version claims (ADR-064) ----------
// "editable" in any form, and "edit the/your/this … text/file/source/template/design".
const EDIT_CLAIM=/\b(?:non-?)?editable\b|\bedit(?:ing)?\s+(?:the|your|this|these|any|its)\s+(?:included\s+)?(?:text|wording|files?|source(?:\s+files?)?|templates?|pdfs?|designs?)\b/gi;
// A coloured version presented as part of what is delivered (colouring books deliver line art only).
const COLOURED_INCLUDED=/\b(?:pre-?colou?red|colou?red\s+(?:versions?|copies|pages|examples?|artwork|images?|pictures?))\b[^.!?;]{0,40}\b(?:included|provided|supplied|delivered)\b|\b(?:includes?|including|comes?\s+with|plus|you(?:'ll)?\s+(?:get|receive))\b[^.!?;]{0,30}\b(?:pre-?colou?red|colou?red\s+(?:versions?|copies|pages|examples?|artwork))\b/i;
const NEG_BEFORE=/\b(?:no|not|non|never|without|nor|isn'?t|aren'?t|cannot|can'?t|won'?t)\b(?:[\s-]+[\p{L}'’-]+){0,4}[\s-]*$/iu;
const NEG_AFTER=/^[^.!?;,]{0,40}?\b(?:(?:is|are)\s+not|isn'?t|aren'?t|not\s+(?:included|provided|supplied|available|delivered))\b/i;
/**
 * Is the phrase at [i, i+len) negated within its own clause? A negator up to four words before it ("no editable
 * files", "not an editable template", "non-editable"), or a negated verb shortly after it ("editable files are not
 * included"). A negator further away, or in another clause, does not count ("No shipping, fully editable").
 */
export function negatedAt(sentence,i,len){
  const before=sentence.slice(0,i).split(/[;:,]|\b(?:but|and|so|while)\b/i).at(-1), after=sentence.slice(i+len);
  const span=sentence.slice(i,i+len);
  return /^non-?/i.test(span)||/\b(?:not|never)\b|n't\b/i.test(span)||NEG_BEFORE.test(before)||NEG_AFTER.test(after);
}

// Nouns that stay TRUE when the unsupported qualifier "editable" is removed in front of them (the noun itself is
// validated again afterwards like any other claim). Never: template, text, a file you customise, … (ambiguous).
const SAFE_NOUN=String.raw`(?:printables?|pdfs?|pngs?|files?|pages?|colou?ring\s+(?:pages?|book)|digital\s+(?:download|files?)|downloads?|sheets?|designs?|illustrations?|patterns?)`;
const EDIT_BEFORE_NOUN=new RegExp(String.raw`\b(?:(?:fully|completely|easily|instantly)\s+)?editable(?:\s*(?:,|and|&|\+|/)\s*|\s+)(?=(?:printable\s+)?${SAFE_NOUN}\b)`,'giu');
// A sentence that talks about changing the product (customise, personalise, edit, modify, type your …) is never
// corrected: removing one word would still leave an unsupported promise, so it is left for the validator.
const EDIT_VERB=/\b(?:customi[sz]\w*|personali[sz]\w*|edit(?:s|ed|ing)?|modify|modified|change|adjust|tweak|type|add your)\b/i;
const EDIT_AFTER_PRINTABLE=/\b(printable)\s*(?:,|and|&|\+|\/)\s*(?:(?:fully|completely|easily|instantly)\s+)?editable\b/gi;
const sentenceAt=(s,i)=>{const stops=['.','!','?','\n'], a=Math.max(...stops.map(c=>s.lastIndexOf(c,i-1)))+1, ends=stops.map(c=>s.indexOf(c,i)).filter(x=>x>=0);return s.slice(a,ends.length?Math.min(...ends):s.length);};
/**
 * Narrow deterministic correction of an unambiguous factual contradiction (ADR-064), run BEFORE validation:
 * when production delivers no editable files, the qualifier "editable" is DELETED where it only qualifies a
 * deliverable that exists ("editable printable pages" -> "printable pages", "printable & editable PDF" ->
 * "printable PDF"). Nothing is ever substituted or added; a negated mention is left alone; anything else
 * ("editable template", "edit the included source file") is left for the validator to reject.
 * @returns {text, changes:[{from,to}]}
 */
export function correctUnsupported(text,facts){
  const src=String(text??'');
  if(facts?.editable===true||!/editable/i.test(src))return {text:src,changes:[]};
  const changes=[];
  const fix=(s,re,rep)=>{let out='', at=0;
    for(const m of s.matchAll(re)){
      if(negatedAt(s,m.index,m[0].length)||EDIT_VERB.test(sentenceAt(s,m.index)))continue;
      let to=rep(...m), rest=s.slice(m.index+m[0].length);
      // A removed capitalised word ("Editable printable pages") hands its capital to the next word.
      if(!to&&/^\p{Lu}/u.test(m[0]))rest=rest.replace(/^\p{Ll}/u,c=>c.toUpperCase());
      out+=s.slice(at,m.index)+to;s=s.slice(0,m.index+m[0].length)+rest;at=m.index+m[0].length;
      changes.push({from:m[0].trim(),to:to.trim()||'(removed)'});}
    return out+s.slice(at);};
  let out=fix(src,EDIT_AFTER_PRINTABLE,(m,p)=>p);
  out=fix(out,EDIT_BEFORE_NOUN,()=>'');
  return {text:out,changes};
}

// ---------- page quantity (colouring books and other page-based products) ----------
const QTY_WORDS={...NUMBER_WORDS,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
  thirty:30,forty:40,fifty:50,sixty:60,single:1};
const QTY=new RegExp(String.raw`\b(\d+|${Object.keys(QTY_WORDS).join('|')})(?:([- ])page\b|\s+((?:(?!(?:of|the|a|an|your|each|per|in|on|for|to|and|or|with|every|this|that|these|those|our|my)\b)[\p{L}'’-]+\s+){0,3}?)(pages?|sheets?|designs?|illustrations?|drawings?|pictures?)\b)`,'giu');
// Printing / layout wording, not a product quantity: a rate or pace after the phrase, or an action verb before it.
const QTY_RATE=/^\s*(?:at a time|per\b|each\b|for (?:each|every)\b|(?:printing\s+)?guide\b)/i;
const QTY_ACTION=/\b(?:print|printing|colou?r|colou?ring in|choose|pick|select|start with)\s+(?:a\s+|the\s+|your\s+)?$/i;
// Only a SINGULAR phrase can also be positional ("each design fits on one page", "onto a single sheet").
const QTY_PLACE=/\b(?:on|onto|to|per|each|every|any|its own)\s+(?:a\s+|its own\s+|the\s+)?$/i;
const EXTRAS=/\b(?:bonus|extra|additional|free)\s+(?:colou?ring\s+|printable\s+)?(?:pages?|sheets?|designs?|activit(?:y|ies)|files?|printables?|worksheets?)\b/i;
/**
 * Product-quantity claims about a page-based product, from the authoritative
 * page facts {total_pages, content_pages, content ('colouring')}:
 *   - "C colouring pages", "C designs/illustrations" (and "N pages to colour"): only C;
 *   - "N pages" / "N-page": the total N, or C;
 *   - "one page" / "a single page" / "1 page": rejected unless the product really has one page,
 *     except as printing or layout wording ("print one page at a time", "fits on one page", "one design per page");
 *   - bonus / extra / additional pages or files: never produced (negations allowed).
 */
export function pageQuantityProblems(s,q,where='text'){
  const out=[], C=q.content_pages, N=q.total_pages, content=new RegExp(String.raw`\bcolou?r`,'i');
  const label=`${N} page${N>1?'s':''} (${C} ${q.content??'content'} page${C>1?'s':''})`;
  for(const m of s.matchAll(QTY)){
    const w=m[1].toLowerCase(), k=/^\d+$/.test(w)?Number(w):QTY_WORDS[w], before=s.slice(0,m.index), after=s.slice(m.index+m[0].length);
    if(QTY_RATE.test(after)||QTY_ACTION.test(before)||(k===1&&QTY_PLACE.test(before)))continue;
    const noun=m[4]?.toLowerCase()??'page';
    const colouring=/^(?:designs?|illustrations?|drawings?|pictures?)$/.test(noun)||content.test(m[3]??'')||/^\s+(?:to|for)\s+colou?r/i.test(after);
    const allowed=colouring?[C]:[N,C];
    if(!allowed.includes(k))out.push(`${where}: "${m[0]}" (production has ${label})`);
  }
  for(const sentence of s.split(/(?<=[.!?\n])\s+/)){const m=EXTRAS.exec(sentence);if(m&&!NEGATION.test(sentence))out.push(`${where}: "${m[0]}" (no bonus or extra content is produced)`);}
  return out;
}

/**
 * Items counted in something other than pages (crochet patterns, ADR-041):
 * "N (up to four words) patterns" must be the production count. Printing and
 * rate wording ("one pattern at a time", "print one pattern") is not a count.
 * Bonus / extra patterns are never produced (negations allowed).
 */
export function itemQuantityProblems(s,q,where='text'){
  const out=[], noun=q.noun??'pattern';
  const re=new RegExp(String.raw`\b(\d+|${Object.keys(QTY_WORDS).join('|')})\s+((?:(?!(?:of|the|a|an|your|each|per|in|on|for|to|and|or|with|every|this|that|these|those|our|my)\b)[\p{L}'’&-]+\s+){0,4}?)${noun}s?\b`,'giu');
  for(const m of s.matchAll(re)){
    const w=m[1].toLowerCase(), k=/^\d+$/.test(w)?Number(w):QTY_WORDS[w], before=s.slice(0,m.index), after=s.slice(m.index+m[0].length);
    if(k===1&&(QTY_RATE.test(after)||QTY_ACTION.test(before)||QTY_PLACE.test(before)))continue;
    if(k!==q.count)out.push(`${where}: "${m[0]}" (production has ${q.count} ${noun}s)`);
  }
  const extra=new RegExp(String.raw`\b(?:bonus|extra|additional|free)\s+(?:\p{L}+\s+){0,2}?${noun}s?\b`,'iu');
  for(const sentence of s.split(/(?<=[.!?\n])\s+/)){const m=extra.exec(sentence);if(m&&!NEGATION.test(sentence))out.push(`${where}: "${m[0]}" (no bonus or extra ${noun}s are produced)`);}
  return out;
}

/** Problems in one piece of model-written text; [] when every claim is supported. */
// A size written in words or with "by" ("four by six card", "4-by-6 print"). It is read as a size only in a size
// context: a size noun follows (optionally after a unit), or a size word precedes. Anything else is left for the
// count rules, so "four cards" or "4 card bundle" are still quantity claims.
const DIM_NUM=String.raw`(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const DIM_UNIT=String.raw`(?:\s*(?:-\s*)?(?:inches|inch|in\b|"|mm|cm))?`;
// Lookahead only: the size noun (and the space before it) is never consumed.
const DIM_NOUN=String.raw`(?=\s*-?\s*(?:(?:post)?cards?|prints?|photos?|frames?|panels?|sheets?|inserts?|invitations?|paper|sizes?)\b)`;
const DIM_AFTER=new RegExp(String.raw`\b${DIM_NUM}\s*(?:-\s*)?(?:by|x|×)\s*(?:-\s*)?${DIM_NUM}(${DIM_UNIT})${DIM_NOUN}`,'giu');
const DIM_BEFORE=new RegExp(String.raw`(\b(?:sized?|measures?|measuring)\s+(?:of\s+|at\s+)?)${DIM_NUM}\s*(?:-\s*)?(?:by|x|×)\s*(?:-\s*)?${DIM_NUM}\b`,'giu');
const dimValue=w=>/^\d/.test(w)?w:String(NUMBER_WORDS[w.toLowerCase()]??{eleven:11,twelve:12}[w.toLowerCase()]);
/** Size expressions in a size context, rewritten to the canonical "4x6" form the size check verifies. */
export function normaliseDimensions(s){
  return String(s).replace(DIM_AFTER,(m,a,b,unit)=>`${dimValue(a)}x${dimValue(b)}${unit}`)
    .replace(DIM_BEFORE,(m,pre,a,b)=>`${pre}${dimValue(a)}x${dimValue(b)}`);
}

export function claimProblems(text,facts,{where='text'}={}){
  const out=[], s=normaliseDimensions(String(text??''));
  for(const sentence of s.split(/(?<=[.!?\n])\s+/)){
    // Editable (ADR-064): an AFFIRMATIVE claim is rejected unless production delivers editable files; a truthful
    // negation ("No editable source files are included") is not a claim.
    if(facts.editable!==true)for(const m of sentence.matchAll(EDIT_CLAIM))if(!negatedAt(sentence,m.index,m[0].length))out.push(`${where}: "${m[0]}" (editable files are not delivered)`);
    if(facts.product_format==='colouring-book'&&!facts.coloured_versions_delivered){const m=COLOURED_INCLUDED.exec(sentence);
      if(m&&!negatedAt(sentence,m.index,m[0].length))out.push(`${where}: "${m[0]}" (the coloured example is an illustration; only the line-art pages are delivered)`);}
    for(const [re,reason,negatable] of NEVER){
      const m=re.exec(sentence);
      // Process claims pass only if production metadata explicitly proves them (facts.process_claims).
      if(m&&negatable==='process'&&(facts.process_claims??[]).some(p=>m[0].toLowerCase().replace(/[- ]/g,'').includes(String(p).toLowerCase().replace(/[- ]/g,''))))continue;
      if(m&&!(negatable===true&&NEGATION.test(sentence)))out.push(`${where}: "${m[0]}" (${reason})`);
    }
  }
  // Crochet marketing integrity (ADR-041): never "tested" without evidence, never a photo of a finished piece, …
  if(facts.product_format==='crochet-pattern-bundle')for(const p of crochetClaimProblems(s,facts))out.push(`${where}: "${p.sentence}" (${p.reason})`);
  if(facts.item_quantity)out.push(...itemQuantityProblems(s,facts.item_quantity,where));
  // Counts must match production. Page-based products (facts.page_quantity, e.g. colouring books) have
  // their own quantity check; by default: the number of card designs.
  if(facts.page_quantity)out.push(...pageQuantityProblems(s,facts.page_quantity,where));
  else{
    const n=facts.designs.length;
    // Up to three describing words may sit between the number and "designs/cards" ("three robin designs").
    // Not counted: a dimension ("4×6 card"), phrases like "one of the", and choosing/sending one card.
    for(const m of s.matchAll(/(?<![\d.]\s*(?:in|inch|inches|mm|cm|")?\s*[x×]\s*)(?<!\b(?:choose|pick|select|print|send|give|any|each|which|every|just)\s+)\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?!(?:of|the|a|an|your|each|per|in|on|for|to|and|or|with|every|this|that|these|those|our|my|page|pages|sheet|sheets|panel|panels)\b)[\p{L}'’-]+\s+){0,3}?(designs?|cards?)\b/giu)){
      const k=/^\d+$/.test(m[1])?Number(m[1]):NUMBER_WORDS[m[1].toLowerCase()];
      if(k!==n)out.push(`${where}: "${m[0]}" (production has ${n} card design${n>1?'s':''})`);
    }
  }
  // Every dimension must be one production made.
  const ok=new Set(['4x6','6x4','8.5x11','11x8.5','210x297','297x210','279.4x215.9','215.9x279.4',
    ...Object.values(facts.card_size_mm??{}).flatMap(([w,h])=>[`${w}x${h}`,`${h}x${w}`])]);
  for(const m of s.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:in|inch|inches|mm|cm|")?\s*[x×]\s*(\d+(?:\.\d+)?)\b/gi))
    if(!ok.has(`${m[1]}x${m[2]}`))out.push(`${where}: "${m[0]}" (size not produced)`);
  return [...new Set(out)];
}

/**
 * Title SEO rule, applied when a listing is generated (not retroactively in
 * QC): the internal collection name is not a search phrase, so it must not
 * take title space; it can appear in the description.
 */
export function titleProblems(l,facts){
  const internal=String(facts.product_name??'').trim();
  return internal.split(/\s+/).length>=2&&String(l.title??'').toLowerCase().includes(internal.toLowerCase())
    ?[`title: uses the internal product name "${internal}"; lead with search phrases (it can appear in the description)`]:[];
}

/** Local Etsy/listing validation: limits, uniqueness, claims, price, style. */
export function listingProblems(l,facts){
  const L=LISTING_LIMITS, e=[];
  if(!l.title||l.title.length>L.titleMax)e.push(`title: 1-${L.titleMax} characters (has ${l.title?.length??0})`);
  if(l.title&&l.title===l.title.toUpperCase())e.push('title: not all capitals');
  const tags=l.tags??[];
  if(tags.length<L.tagsMin||tags.length>L.tagsMax)e.push(`tags: ${L.tagsMin}-${L.tagsMax} (has ${tags.length})`);
  for(const t of tags){if(t.length>L.tagMax)e.push(`tag "${t}": over ${L.tagMax} characters`);if(!L.tagPattern.test(t))e.push(`tag "${t}": letters, numbers, spaces, ' and - only`);}
  if(new Set(tags.map(t=>t.toLowerCase().trim())).size!==tags.length)e.push('tags: must be unique');
  // Not the title repeated thirteen times: most tags must add a word the title lacks.
  const titleWords=new Set(String(l.title).toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]);
  const echoes=tags.filter(t=>(t.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).every(w=>titleWords.has(w)));
  if(echoes.length>L.tagTitleEchoMax)e.push(`tags: ${echoes.length} tags only repeat title words (${echoes.join(', ')})`);
  if((l.materials??[]).length>L.materialsMax)e.push(`materials: at most ${L.materialsMax}`);
  for(const m of l.materials??[])if(m.length>L.materialMax||!L.tagPattern.test(m))e.push(`material "${m}": ${L.materialMax} plain characters max`);
  if(!l.description||l.description.length>L.descriptionMax)e.push(`description: 1-${L.descriptionMax} characters`);
  // Sales presentation: open with the reason to buy, not the file inventory; always disclose the digital nature.
  const first=String(l.description??'').trim().split(/(?<=[.!?])\s+|\n+/).find(x=>/[\p{L}\p{N}]/u.test(x))??'';
  const inventory=FILE_WORDS.exec(first);
  if(inventory)e.push(`description: opens with the file inventory ("${inventory[0]}"); lead with why the buyer wants it`);
  for(const [k,v] of [['description',l.description],['digital_download_disclaimer',l.digital_download_disclaimer]])
    if(!DIGITAL.test(String(v??''))||!NO_SHIP.test(String(v??'')))e.push(`${k}: must say it is a digital download and that no physical item is shipped`);
  const dashes=(String(l.description).match(/—/g)??[]).length;
  if(dashes>2)e.push(`description: ${dashes} em dashes (use at most 2)`);
  // The price contract (price.mjs): a number, £0.50-£100.00, at most 2 decimals, checked in whole pence (float-safe).
  const price=priceProblem(l.suggested_price_gbp,{min:L.priceMinGbp,max:L.priceMaxGbp});
  if(price)e.push(`suggested_price_gbp: ${price}`);
  const keys=new Set(Object.keys(facts.claims));
  for(const c of l.listing_claims??[])if(!keys.has(c.key))e.push(`listing_claims: "${c.key}" is not a production fact`);
  for(const [k,v] of Object.entries({title:l.title,description:l.description,hook:l.hook,customer_summary:l.customer_summary,
    what_you_receive:(l.what_you_receive??[]).join('\n'),printing_summary:l.printing_summary,disclaimer:l.digital_download_disclaimer,tags:tags.join('. '),
    claims:(l.listing_claims??[]).map(c=>c.text).join('\n')}))
    e.push(...claimProblems(v,facts,{where:k}));
  return e;
}
