// Crochet pattern bundle: the deliverable model (ADR-040, built by ADR-041).
//
// The single source of the customer file names and what each file carries.
// The Stage 2 adapter (../adapters/crochet-pattern-bundle.mjs) builds exactly
// these outputs; nothing here renders. Every path follows the adapter
// contract's safe-name rule (at most one folder level).
import { assertCrochetBundle } from './bundle.mjs';
import { PAPERS } from './design.mjs';

export const CROCHET_PAPERS=PAPERS;
// Every requested deliverable kind; the plan covers each one.
export const CROCHET_DELIVERABLE_KINDS=Object.freeze(['bundle-pdf','pattern-pdf','paper-us-letter','paper-a4','guide','pattern-index',
  'materials-reference','abbreviations-reference','zip','preview']);
export const GUIDE_FILE='START-HERE-Printing-and-Crochet-Guide.pdf';
export const individualFolder=paper=>`${paper}-Individual-Patterns`;

const slug=t=>String(t).normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const pad=n=>String(n).padStart(2,'0');
/** "LumiumX-<Product-Name>", at most 48 characters (whole words), so every ZIP name fits Etsy's 70. */
export function crochetPackageName(name){
  const words=slug(name).split('-').filter(Boolean);let s='LumiumX';
  for(const w of words){if(`${s}-${w}`.length>48)break;s=`${s}-${w}`;}
  return s==='LumiumX'?'LumiumX-Crochet-Patterns':s;
}

/**
 * @param bundle  a crochet pattern bundle (validated here; throws HandoffError when incomplete)
 * @returns {packageName, papers, outputs:[{rel, kind, paper, patterns}], zips, previews:[{rel, page, purpose}], kinds}
 */
export function crochetDeliverablePlan(bundle,{productName=bundle?.title}={}){
  assertCrochetBundle(bundle);
  const packageName=crochetPackageName(productName), ids=bundle.patterns.map(p=>p.pattern_id);
  const outputs=[{rel:GUIDE_FILE,kind:'guide',paper:null,patterns:[]}];
  for(const paper of Object.keys(PAPERS)){
    outputs.push(
      {rel:`${paper}/${packageName}-Complete-Bundle-${paper}.pdf`,kind:'bundle-pdf',paper,patterns:ids},
      {rel:`${paper}/${packageName}-Pattern-Index-${paper}.pdf`,kind:'pattern-index',paper,patterns:ids},
      {rel:`${paper}/${packageName}-Materials-and-Tools-${paper}.pdf`,kind:'materials-reference',paper,patterns:ids},
      {rel:`${paper}/${packageName}-Abbreviations-${paper}.pdf`,kind:'abbreviations-reference',paper,patterns:ids},
      ...bundle.patterns.map((p,i)=>({rel:`${individualFolder(paper)}/${pad(i+1)}-${slug(p.name).slice(0,50).replace(/-+$/,'')||p.pattern_id}-${paper}.pdf`,kind:'pattern-pdf',paper,patterns:[p.pattern_id]})));
  }
  // ZIPs: one <Package>.zip when everything fits one Etsy file, else deterministic Part-N ZIPs (build.mjs);
  // Stage 4 then plans the customer delivery files (ADR-038).
  const zips=[{name:`${packageName}.zip`,includes:outputs.map(o=>o.rel),split:'Part-N ZIPs of at most 20 MB when one file would be larger'}];
  const find=k=>outputs.find(o=>o.kind===k&&o.paper==='A4').rel;
  const previews=[{rel:find('bundle-pdf'),page:1,purpose:'cover'},{rel:find('pattern-index'),page:1,purpose:'pattern-index'},
    {rel:find('pattern-pdf'),page:1,purpose:'sample-pattern-page'},{rel:find('materials-reference'),page:1,purpose:'materials-reference'}];
  const kinds=new Set([...outputs.map(o=>o.kind),'zip','preview',...outputs.filter(o=>o.paper).map(o=>o.paper==='A4'?'paper-a4':'paper-us-letter')]);
  return {packageName,papers:Object.keys(PAPERS),outputs,zips,previews,kinds:[...kinds]};
}
