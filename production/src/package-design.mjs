// Which document design a production package was built with, and whether it is
// the live one. APPROVE PRODUCTION only accepts a package whose RECORDED build
// metadata (build-record.json `adapter`: format, design, design_name, version)
// equals the live adapter for its format. Missing metadata never passes;
// nothing is inferred from file names. Generic: every format, every upgrade.
import { adapterFor, ADAPTERS } from './adapters/index.mjs';
import { crochetPatternBundle, crochetPatternBundleMoonlit } from './adapters/crochet-pattern-bundle.mjs';

// Every design each format has shipped, by version, for naming a package built before
// design metadata was recorded. Display only: such a package is never approved.
const HISTORY=[...Object.values(ADAPTERS),crochetPatternBundle,crochetPatternBundleMoonlit];

/** The design a build record says its package was built with, or null when it is not recorded. */
export function packageDesign(record){
  const a=record?.adapter;
  if(!a||typeof a.format!=='string'||typeof a.design!=='string'||!a.design||!Number.isInteger(a.version))return null;
  return {format:a.format,design:a.design,name:typeof a.design_name==='string'&&a.design_name?a.design_name:a.design,version:a.version};
}
/** The live design for a format (throws for a format without an adapter). */
export function liveDesign(format,{adapter=adapterFor(format)}={}){
  return {format:adapter.format,design:adapter.design,name:adapter.designName??adapter.design,version:adapter.version};
}
/**
 * {ok, built, live}. ok only when the record names the same format, design and
 * version as the live adapter for `format` (the product's own format).
 */
export function packageDesignCheck(record,format,{adapter}={}){
  let live=null;
  try{live=liveDesign(format,adapter?{adapter}:{});}catch{return {ok:false,built:packageDesign(record),live:null};}
  const built=packageDesign(record);
  const ok=!!built&&built.format===live.format&&built.design===live.design&&built.version===live.version;
  return {ok,built,live};
}
/** How to name a package for the owner: its recorded design, else the design its recorded format/version shipped as. */
export function describePackage(record){
  const d=packageDesign(record);
  if(d)return d;
  const a=record?.adapter, known=a&&HISTORY.find(x=>x.format===a.format&&x.version===a.version);
  return known?{format:known.format,design:known.design,name:known.designName,version:known.version,recorded:false}:null;
}
/** "Moonlit v2" (or "Unknown design" when nothing is known). */
export const designLabel=d=>d?`${d.name} v${d.version}`:'Unknown design';
/**
 * The two names on the refusal screen. A refused package never reads the same as
 * the live design: when its design was not recorded and its version matches the
 * live one, it is "Unknown design".
 */
export function refusalLabels(record,check){
  const live=designLabel(check.live), built=designLabel(describePackage(record));
  return {built:built===live?'Unknown design':built,live};
}
