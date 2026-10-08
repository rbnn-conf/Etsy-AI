// Stage 4 delivery planner (ADR-038): ONE product -> one or more Etsy
// DELIVERY FILES (customer ZIPs). Pure and deterministic: no I/O, no network.
//
// PRODUCT vs DELIVERY FILE: the product is the approved Stage 2 deliverable
// set (one listing, one product ID). A delivery file is one ZIP uploaded to
// that listing's digital files. Etsy allows a few files per listing and caps
// each one, so a large product is delivered as several ZIPs; its contents are
// never removed, recompressed or altered.
//
// Plan, in order of preference:
//   1. everything in ONE ZIP when it fits the safe size (named `${package}.zip`,
//      exactly as before for products that fit);
//   2. otherwise one ZIP per logical group: each top-level folder of the
//      deliverables (A4/, US-Letter/, PNG pages …); top-level files (the
//      printing guide) travel with the first group;
//   3. a group over the safe size is split into the fewest contiguous parts,
//      balanced, in the build record's order (so page ranges stay together);
//   4. while there are more ZIPs than Etsy allows, the two smallest that fit
//      together are merged (smallest first, earliest on ties);
//   4b. (ADR-066) whole groups still cannot meet the file count: adopt Stage 2's
//      own packaging (build record zip_parts, at most `filesMax` parts) when it
//      holds every approved file exactly once within the safe size;
//   5. still too many ZIPs, or any single file over the safe size: a clear
//      error. Nothing is ever dropped or degraded to make it fit.
// Products that fit in steps 1-4 are planned exactly as before.
// Sizes are planned from the source bytes plus ZIP overhead (ZIP output never
// exceeds that for stored or deflated entries), with headroom below Etsy's cap.

/** Local-file header + central-directory record + data descriptor, generous. */
export const ZIP_ENTRY_OVERHEAD=512;
export const ZIP_ARCHIVE_OVERHEAD=1024;

export class DeliveryPlanError extends Error{constructor(m){super(m);this.name='DeliveryPlanError';}}

const human=b=>b>=1e6?`${(b/1e6).toFixed(2)} MB`:`${(b/1e3).toFixed(1)} KB`;
const pad=n=>String(n).padStart(2,'0');
const words=s=>String(s).split(/[-_\s]+/).filter(Boolean);

/**
 * @param packageName  Stage 2 package folder name (the customer's top-level folder)
 * @param outputs      [{rel, bytes, sha256, kind, pages:[page numbers]|null}] in build-record order
 * @param limits       {filesMax, safeBytes, namePattern}
 * @returns {packages:[{name,label,purpose,rels,planned_bytes}], strategy}
 */
export function planDelivery({packageName,outputs,limits,productionParts=null}){
  const {filesMax,safeBytes,namePattern}=limits;
  if(!outputs.length)throw new DeliveryPlanError('The approved Stage 2 package lists no customer files.');
  const cost=list=>ZIP_ARCHIVE_OVERHEAD+list.reduce((s,o)=>s+o.bytes+ZIP_ENTRY_OVERHEAD+2*(packageName.length+o.rel.length+1),0);
  const tooBig=outputs.filter(o=>cost([o])>safeBytes);
  if(tooBig.length)throw new DeliveryPlanError(`${tooBig.map(o=>`${o.rel} (${human(o.bytes)})`).join(', ')} ${tooBig.length>1?'are':'is'} larger than the safe delivery size of ${human(safeBytes)} on its own. It is never split, removed or recompressed; Stage 2 must deliver it in smaller files.`);

  // 1. One ZIP.
  if(cost(outputs)<=safeBytes)return {strategy:'single',packages:[{name:`${packageName}.zip`,label:null,purpose:'Complete download',rels:outputs.map(o=>o.rel),planned_bytes:cost(outputs)}]};

  // 2. Logical groups: top-level folders in order; top-level files join the first group.
  const groups=[], loose=[];
  for(const o of outputs){
    const top=o.rel.includes('/')?o.rel.split('/')[0]:null;
    if(!top){loose.push(o);continue;}
    let g=groups.find(x=>x.folder===top);
    if(!g)groups.push(g={folder:top,files:[]});
    g.files.push(o);
  }
  if(!groups.length)groups.push({folder:null,files:[]});
  // 3. Split an oversize group into the fewest balanced contiguous parts.
  let pkgs=[];
  for(const [gi,g] of groups.entries()){
    const extra=gi===0?loose:[];
    const parts=balancedParts(g.files,f=>cost([...f,...extra]),safeBytes);
    parts.forEach((files,i)=>pkgs.push({folders:[g.folder],part:parts.length>1?i+1:null,parts:parts.length,files:[...(i===0?extra:[]),...files]}));
  }
  // 4. Merge the two smallest that fit together until Etsy's file count is met.
  while(pkgs.length>filesMax){
    let best=null;
    for(let i=0;i<pkgs.length;i++)for(let j=i+1;j<pkgs.length;j++){
      const c=cost([...pkgs[i].files,...pkgs[j].files]);
      if(c<=safeBytes&&(!best||c<best.c))best={i,j,c};
    }
    if(!best){
      // 4b (ADR-066). Whole groups cannot meet Etsy's file count, but Stage 2 may already have packed the product into
      // at most `filesMax` parts (build record zip_parts): adopt that production packaging, after proving it covers every
      // approved file exactly once, within the safe size. Stage 4 never invents its own split here.
      const adopted=productionParts?fromProductionParts({outputs,productionParts,cost,filesMax,safeBytes}):null;
      if(adopted?.packages)return name(adopted.packages.map(files=>({folders:[...new Set(files.map(topOf))],part:null,parts:1,mixed:true,files})),'production-parts');
      throw new DeliveryPlanError(`The product needs ${pkgs.length} delivery files of at most ${human(safeBytes)}, but Etsy allows ${filesMax} per listing.${adopted?.why?` Stage 2's own packaging cannot be used either: ${adopted.why}.`:''} Nothing was removed or recompressed.`);
    }
    // The merged ZIP takes the later member's place (e.g. after both main volumes it completes).
    const a=pkgs[best.i], b=pkgs[best.j];
    pkgs[best.j]={folders:[...a.folders,...b.folders],part:null,parts:1,merged:[a,b],files:[...a.files,...b.files]};
    pkgs.splice(best.i,1);
  }
  return name(pkgs,'grouped');

  // 5. Customer-facing names: product + content (folder, page range), unique, within Etsy's name rule.
  function name(list,strategy){
    const base=words(packageName).filter((w,i)=>!(i===0&&/^lumiumx$/i.test(w)));
    const used=new Set();
    const packages=list.map((p,i)=>{
      const label=p.mixed?mixedLabel(p.files,outputs,base):labelOf(p,base);
      const name=fitName(base,label,namePattern,used,i+1);
      used.add(name.toLowerCase());
      return {name,label,purpose:purposeOf(p),rels:p.files.map(o=>o.rel),planned_bytes:cost(p.files)};
    });
    return {strategy,packages};
  }
}

const topOf=o=>o.rel.includes('/')?o.rel.split('/')[0]:null;
/**
 * Stage 2's parts (lists of deliverable rels, in part order) as delivery packages, or {why} when they cannot be used:
 * more parts than Etsy allows, a part over the safe size, or not every approved file exactly once.
 */
function fromProductionParts({outputs,productionParts,cost,filesMax,safeBytes}){
  const byRel=new Map(outputs.map(o=>[o.rel,o])), seen=new Map();
  if(!productionParts.length||productionParts.length>filesMax)return {why:`it has ${productionParts.length} parts`};
  const packages=[];
  for(const [i,rels] of productionParts.entries()){
    const files=[];
    for(const r of rels){
      if(!byRel.has(r))return {why:`part ${i+1} lists ${r}, which is not an approved deliverable`};
      if(seen.has(r))return {why:`${r} is in parts ${seen.get(r)} and ${i+1}`};
      seen.set(r,i+1);files.push(byRel.get(r));
    }
    if(cost(files)>safeBytes)return {why:`part ${i+1} is ${human(cost(files))}, over ${human(safeBytes)}`};
    packages.push(files);
  }
  const missing=outputs.filter(o=>!seen.has(o.rel)).map(o=>o.rel);
  if(missing.length)return {why:`${missing.join(', ')} ${missing.length>1?'are':'is'} in no part`};
  return {packages};
}
/**
 * Label of a part that mixes folders: each folder it carries, in order; a folder that is split across parts gets the
 * page range this part holds. Loose top-level files (the printing guide) are named only when alone.
 */
function mixedLabel(files,outputs,base){
  const folders=[...new Set(files.map(topOf))], named=folders.filter(Boolean);
  if(!named.length)return 'Guide';
  return named.map(f=>{
    const here=files.filter(o=>topOf(o)===f), whole=outputs.filter(o=>topOf(o)===f).length===here.length, l=folderLabel(f,base);
    if(whole)return l;
    const r=range(here);return r?`${l}-${r.replace(/^Pages?-/,'')}`:l;
  }).join('-and-');
}

/** Fewest contiguous parts (in order) whose cost fits, then balanced so no part is needlessly large. */
function balancedParts(files,costOf,limit){
  if(costOf(files)<=limit)return [files];
  for(let k=2;k<=files.length;k++){
    // Smallest achievable maximum for k contiguous parts (binary search on the cap).
    const fits=cap=>{const parts=[];let cur=[];for(const f of files){if(cur.length&&costOf([...cur,f])>cap){parts.push(cur);cur=[];}cur.push(f);}parts.push(cur);return parts.length<=k&&parts.every(p=>costOf(p)<=cap)?parts:null;};
    if(!fits(limit))continue;
    let lo=Math.max(...files.map(f=>costOf([f]))), hi=limit;
    while(hi-lo>1024){const mid=Math.floor((lo+hi)/2);if(fits(mid))hi=mid;else lo=mid;}
    return fits(hi);
  }
  return files.map(f=>[f]);
}

const pagesOf=files=>files.flatMap(f=>f.pages??[]);
const range=files=>{const p=pagesOf(files);if(!p.length)return null;const a=Math.min(...p),b=Math.max(...p);return a===b?`Page-${pad(a)}`:`Pages-${pad(a)}-${pad(b)}`;};
/** A folder name without the words the product name already says ("Colouring-Pages-PNG" in "…-Colouring-Pages" -> "PNG"). */
const folderLabel=(folder,base)=>{if(!folder)return 'Guide';const w=words(folder).filter(x=>!base.some(b=>b.toLowerCase()===x.toLowerCase()));return (w.length?w:words(folder)).join('-');};
function labelOf(p,base){
  if(p.merged){
    const ranges=p.merged.map(m=>range(m.files));
    if(ranges.every(r=>r&&r===ranges[0]))return `${p.merged.flatMap(m=>m.folders).map(f=>folderLabel(f,base)).join('-and-')}-${ranges[0]}`;
    return p.merged.map(m=>labelOf(m,base)).join('-and-');
  }
  const f=folderLabel(p.folders[0],base);
  if(!p.part)return f;
  return `${f}-${range(p.files.filter(x=>x.rel.includes('/')))??`Part-${p.part}`}`;
}
function purposeOf(p){
  const kinds=[...new Set(p.files.map(f=>f.kind))];
  const pages=pagesOf(p.files);
  return `${p.files.length} file${p.files.length>1?'s':''} (${kinds.join(', ')})${pages.length?`, pages ${Math.min(...pages)}-${Math.max(...pages)}`:''}`;
}
/** `${product}-${label}.zip`, shortening the product words (never the content label) to fit Etsy's 70-character rule. */
function fitName(base,label,pattern,used,n){
  for(let k=base.length;k>=1;k--){
    const name=`${base.slice(0,k).join('-')}-${label}.zip`;
    if(pattern.test(name)&&!used.has(name.toLowerCase()))return name;
  }
  const fallback=`${base.slice(0,2).join('-')}-Download-${n}.zip`;
  if(!pattern.test(fallback))throw new DeliveryPlanError(`Cannot name delivery file ${n} within Etsy's file-name rule.`);
  return fallback;
}
