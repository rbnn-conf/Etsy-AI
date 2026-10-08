// Deterministic colouring-page artwork inspection (no model, no network).
//
// Stage 1 runs it as the full-book CREATIVE QC before the owner reviews a
// generated book; Stage 2 relies on its report (bound to the exact page
// checksums the owner approved). One implementation, so the two stages can
// never disagree about what a valid page is.
//
// Every measurement is taken from the decoded pixels (alpha flattened onto
// white paper). Thresholds are deliberately generous: they catch pages that
// are clearly not usable colouring pages (blank, coloured, grey-painted,
// clipped by the page edge), never matters of taste. Taste is the owner's
// review.
import { createHash } from 'node:crypto';
import { sharp, validatePngStructure } from './lib.mjs';

export const BOOK_QC_VERSION=1;
export const PAGE_ID=n=>`P${String(n).padStart(3,'0')}`;
export const LIMITS=Object.freeze({
  blankStdev:2,          // same rule as the Stage 2 adapter
  minInk:0.002,          // < 0.2% ink pixels: effectively blank
  colouredFail:0.02,     // > 2% clearly coloured pixels: not black-and-white line art
  colouredWarn:0.003,
  minWhite:0.35,         // < 35% white paper: no room to colour
  darkFail:0.40,         // > 40% near-black: heavy black fills
  darkWarn:0.25,
  greyWarn:0.30,         // > 30% mid-grey: tonal shading
  edgePx:4,              // the outermost pixels of each side
  edgeFail:0.02,         // > 2% ink along an outer edge: artwork runs off the page
  bandFrac:0.03,         // the safe band inside the edge (3% of the side length)
  bandWarn:0.12,         // > 12% ink in the safe band: crowds the margin
  styleLow:0.4,          // ink coverage outside [0.4x, 2x] of the approved style proofs: warning
  styleHigh:2.0
});
const SIDES=['top','right','bottom','left'];
const sha=b=>createHash('sha256').update(b).digest('hex');

/** Pixel statistics of one page. Throws for bytes that are not a valid PNG. */
export async function inspectArtwork(bytes){
  validatePngStructure(bytes);
  const meta=await sharp(bytes).metadata();
  const {data,info}=await sharp(bytes).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h,channels:c}=info, n=w*h;
  let white=0,dark=0,grey=0,ink=0,coloured=0,sum=0,sum2=0;
  const e=LIMITS.edgePx, bw=Math.max(e+1,Math.round(w*LIMITS.bandFrac)), bh=Math.max(e+1,Math.round(h*LIMITS.bandFrac));
  const edge={top:0,right:0,bottom:0,left:0}, band={top:0,right:0,bottom:0,left:0};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*c, r=data[i], g=data[i+1], b=data[i+2];
    const l=(r*299+g*587+b*114)/1000, chroma=Math.max(r,g,b)-Math.min(r,g,b);
    sum+=l;sum2+=l*l;
    if(l>=200)white++;else if(l<64)dark++;else grey++;
    const isInk=l<128;
    if(isInk)ink++;
    if(chroma>40&&l>30&&l<240)coloured++;
    if(!isInk)continue;
    if(y<e)edge.top++;else if(y<bh)band.top++;
    if(y>=h-e)edge.bottom++;else if(y>=h-bh)band.bottom++;
    if(x<e)edge.left++;else if(x<bw)band.left++;
    if(x>=w-e)edge.right++;else if(x>=w-bw)band.right++;
  }
  const mean=sum/n, stdev=Math.sqrt(Math.max(0,sum2/n-mean*mean));
  const area={top:e*w,bottom:e*w,left:e*h,right:e*h}, bandArea={top:(bh-e)*w,bottom:(bh-e)*w,left:(bw-e)*h,right:(bw-e)*h};
  const f=v=>+v.toFixed(5);
  return {width:w,height:h,orientation:w>h?'landscape':w<h?'portrait':'square',has_alpha:!!meta.hasAlpha,
    stdev:+stdev.toFixed(3),white:f(white/n),dark:f(dark/n),grey:f(grey/n),ink:f(ink/n),coloured:f(coloured/n),
    edge:Object.fromEntries(SIDES.map(s=>[s,f(edge[s]/area[s])])),band:Object.fromEntries(SIDES.map(s=>[s,f(band[s]/bandArea[s])])),
    pixel_key:sha(Buffer.concat([Buffer.from(`${w}x${h}x${c}`),data]))};
}

/** Problems with one inspected page: {fails, warns} (plain sentences). */
export function pageProblems(s,{expected=null}={}){
  const fails=[], warns=[], pct=v=>`${(v*100).toFixed(1)}%`;
  if(expected&&(s.width!==expected.width||s.height!==expected.height))fails.push(`is ${s.width}x${s.height} px, expected ${expected.width}x${expected.height}`);
  if(expected?.orientation&&s.orientation!==expected.orientation)fails.push(`is ${s.orientation}, the book is ${expected.orientation}`);
  if(s.stdev<LIMITS.blankStdev||s.ink<LIMITS.minInk)return {fails:[...fails,'is blank'],warns};
  if(s.coloured>LIMITS.colouredFail)fails.push(`contains colour (${pct(s.coloured)} coloured pixels); a colouring page is black line art on white`);
  else if(s.coloured>LIMITS.colouredWarn)warns.push(`has a little colour (${pct(s.coloured)} coloured pixels)`);
  if(s.white<LIMITS.minWhite)fails.push(`has too little white paper to colour (${pct(s.white)} white)`);
  if(s.dark>LIMITS.darkFail)fails.push(`has heavy black fills (${pct(s.dark)} near-black)`);
  else if(s.dark>LIMITS.darkWarn)warns.push(`is dark (${pct(s.dark)} near-black)`);
  if(s.grey>LIMITS.greyWarn)warns.push(`has grey tonal shading (${pct(s.grey)} mid-grey)`);
  const clipped=SIDES.filter(x=>s.edge[x]>LIMITS.edgeFail);
  if(clipped.length)fails.push(`artwork runs off the page edge (${clipped.join(', ')})`);
  const crowded=SIDES.filter(x=>!clipped.includes(x)&&s.band[x]>LIMITS.bandWarn);
  if(crowded.length)warns.push(`artwork crowds the safe margin (${crowded.join(', ')})`);
  return {fails,warns};
}

/** Order-sensitive digest of the book's pages: what the owner approves and Stage 2 verifies. */
export const bookPagesDigest=pages=>sha(Buffer.from(JSON.stringify(pages.map(p=>[p.page_id,p.sha256]))));

/**
 * Full-book creative QC.
 * @param manifest  {pages:[{page_id,page_number,title}]} the authoritative page manifest
 * @param pages     [{page_id,page_number,bytes|null,sha256|null,model?}] the artwork, in any order
 * @param expected  {count,width,height,orientation}
 * @param reference [stats] inspected approved style proofs (style drift warnings only)
 * @returns {version,passed,checks,warnings,pages:{[id]:{status,fails,warns,stats}},fingerprint}
 */
export async function bookArtworkQc({manifest,pages,expected,reference=[]}){
  const checks=[], warnings=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});
  const byId=new Map(pages.map(p=>[p.page_id,p])), entries=manifest.pages;
  add('page manifest complete',entries.length===expected.count,`${entries.length} of ${expected.count} pages`);
  const seqBad=entries.map((m,i)=>m.page_number===i+1&&m.page_id===PAGE_ID(i+1)?null:`${m.page_id} at position ${i+1}`).filter(Boolean);
  add(`page sequence ${PAGE_ID(1)}..${PAGE_ID(expected.count)}`,!seqBad.length&&new Set(entries.map(m=>m.page_id)).size===entries.length,seqBad.join(', ')||`${entries.length} pages in order`);
  const missing=entries.filter(m=>!byId.get(m.page_id)?.bytes).map(m=>m.page_id);
  add('all page files present',!missing.length,missing.length?`missing ${missing.join(', ')}`:`${entries.length} files`);
  const changed=entries.filter(m=>{const p=byId.get(m.page_id);return p?.bytes&&p.sha256&&sha(p.bytes)!==p.sha256;}).map(m=>m.page_id);
  add('page files match their recorded checksums',!changed.length,changed.join(', ')||'SHA-256 verified');
  const result={}, invalid=[], stats=new Map();
  for(const m of entries){
    const p=byId.get(m.page_id);
    if(!p?.bytes){result[m.page_id]={status:'fail',fails:['is missing'],warns:[],stats:null};continue;}
    try{stats.set(m.page_id,await inspectArtwork(p.bytes));}
    catch(err){invalid.push(m.page_id);result[m.page_id]={status:'fail',fails:[`is not a valid PNG (${String(err?.message??err).slice(0,80)})`],warns:[],stats:null};}
  }
  add('valid PNG files',!invalid.length,invalid.join(', ')||`${stats.size} PNG`);
  // Style reference: the approved proofs' ink coverage (warnings only; the owner judges style).
  const refInk=reference.map(r=>r.ink).filter(v=>v>0);
  const lo=refInk.length?Math.min(...refInk)*LIMITS.styleLow:null, hi=refInk.length?Math.max(...refInk)*LIMITS.styleHigh:null;
  const fam={size:[],orientation:[],blank:[],colour:[],margins:[],other:[]};
  for(const [id,s] of stats){
    const {fails,warns}=pageProblems(s,{expected});
    if(lo!==null&&(s.ink<lo||s.ink>hi))warns.push(`linework density differs from the approved style proofs (${(s.ink*100).toFixed(1)}% ink; proofs ${(Math.min(...refInk)*100).toFixed(1)}-${(Math.max(...refInk)*100).toFixed(1)}%)`);
    for(const x of fails)(/expected \d/.test(x)?fam.size:/the book is/.test(x)?fam.orientation:/blank/.test(x)?fam.blank:/colour|white paper|black fills/.test(x)?fam.colour:/edge/.test(x)?fam.margins:fam.other).push(`${id} ${x}`);
    for(const x of warns)warnings.push(`${id} ${x}`);
    result[id]={status:fails.length?'fail':warns.length?'warn':'ok',fails,warns,stats:s};
  }
  add('expected dimensions and orientation',!fam.size.length&&!fam.orientation.length,[...fam.size,...fam.orientation].join('; ')||`${expected.width}x${expected.height} px ${expected.orientation}`);
  add('no blank pages',!fam.blank.length,fam.blank.join('; '));
  const keys=new Map(), dups=[];
  for(const m of entries){const s=stats.get(m.page_id);if(!s)continue;if(keys.has(s.pixel_key))dups.push(`${m.page_id} duplicates ${keys.get(s.pixel_key)}`);else keys.set(s.pixel_key,m.page_id);}
  for(const d of dups){const id=d.slice(0,4);result[id]={...result[id],status:'fail',fails:[...result[id].fails,d.slice(5)]};}
  add('no exact duplicates',!dups.length,dups.join('; '));
  add('black-and-white colouring-page characteristics',!fam.colour.length,fam.colour.join('; ')||'line art on white');
  add('safe margins: no clipping at the page edges',!fam.margins.length,fam.margins.join('; ')||`nothing in the outer ${LIMITS.edgePx} px`);
  // ADR-067: the only owner-overridable rule (decorative artwork overflow). Detection is unchanged; it still fails the QC.
  Object.assign(checks.at(-1),{rule:'artwork-edge-overflow',overridable:true});
  if(fam.other.length)add('other page problems',false,fam.other.join('; '));
  const models=[...new Set(pages.map(p=>p.model).filter(Boolean))];
  if(models.length>1)warnings.push(`pages come from different image models (${models.join(', ')})`);
  const passed=checks.every(c=>c.ok);
  return {version:BOOK_QC_VERSION,passed,checks,warnings,pages:result,
    fingerprint:bookPagesDigest(entries.map(m=>({page_id:m.page_id,sha256:byId.get(m.page_id)?.sha256??null})))};
}

const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
/**
 * Review contact sheet for a phone: a labelled grid of pages (default 4 x 2),
 * each tile outlined in green / amber / red by its QC status.
 * @param pages [{page_id,title,bytes,status}]
 */
export async function bookContactSheet(pages,{cols=4,tile=360,title=''}={}){
  const first=pages.find(p=>p.bytes);
  const m=first?await sharp(first.bytes).metadata():{width:2,height:3};
  const th=Math.round(tile*m.height/m.width), label=34, g=18, head=title?64:0;
  const rows=Math.ceil(pages.length/cols), W=cols*tile+(cols+1)*g, H=head+rows*(th+label)+(rows+1)*g;
  const colour={ok:'#2e7d32',warn:'#c77700',fail:'#c62828'};
  const layers=[];
  for(const [i,p] of pages.entries()){
    const x=g+(i%cols)*(tile+g), y=head+g+Math.floor(i/cols)*(th+label+g);
    const img=p.bytes?await sharp(p.bytes).flatten({background:'#ffffff'}).resize(tile,th,{fit:'contain',background:'#ffffff'}).png().toBuffer()
      :await sharp({create:{width:tile,height:th,channels:3,background:'#eeeeee'}}).png().toBuffer();
    layers.push({input:img,left:x,top:y+label});
    const name=`${p.page_id}${p.title?` ${p.title}`:''}`.slice(0,30);
    layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${th+label}">`+
      `<rect x="1.5" y="${label+1.5}" width="${tile-3}" height="${th-3}" fill="none" stroke="${colour[p.status]??'#9e9e9e'}" stroke-width="3"/>`+
      `<text x="2" y="${label-10}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#1f2430">${esc(name)}${p.status==='fail'?' ✗':p.status==='warn'?' !':''}</text></svg>`),left:x,top:y});
  }
  if(title)layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${head}"><text x="${g}" y="44" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#1f2430">${esc(title)}</text></svg>`),left:0,top:0});
  return sharp({create:{width:W,height:H,channels:3,background:'#f4f1ec'}}).composite(layers).png().toBuffer();
}
