import {createHash} from 'node:crypto';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,basename,join} from 'node:path';
import {atomicJson} from './secure-store.ts';

export const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function ensure(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
export interface Asset{path:string;sha256:string;bytes:number;rank:number;name:string}
export interface Manifest{
  version:1;productId:string;productName:string;reference:string;
  listing:{title:string;description:string;tags:string[]};
  sale:{shopId:number|null;price:number|null;currency:string|null;taxonomyId:number|null;whoMade:string|null;whenMade:string|null};
  evidence:{path:string;sha256:string}[];sources:Asset[];images:Asset[];files:Asset[];
}
export interface CheckedProduct{manifest:Manifest;manifestHash:string;images:(Asset&{data:Buffer})[];files:(Asset&{data:Buffer})[]}
export async function contained(root:string,path:string):Promise<string>{
  ensure(!isAbsolute(path),'Manifest paths must be product-relative');
  const base=await realpath(root),target=await realpath(resolve(base,path)),rel=relative(base,target);
  ensure(rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel),'Path escapes product directory');return target;
}
async function read(root:string,path:string){return readFile(await contained(root,path));}
async function json(root:string,path:string){return JSON.parse((await read(root,path)).toString());}
function productId(root:string){const id=basename(resolve(root)).split('-')[0];ensure(id&&/^\d{3}$/.test(id),'Expected products/NNN-name directory');return id;}
export function validateListing(value:Manifest['listing']){
  ensure(typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=140,'Invalid listing title');
  ensure(typeof value.description==='string'&&value.description.trim().length>0&&value.description.length<=10000,'Invalid listing description');
  ensure(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.title+value.description),'Control characters in listing');
  ensure(Array.isArray(value.tags)&&value.tags.length>0&&value.tags.length<=13&&new Set(value.tags.map(t=>t.toLowerCase())).size===value.tags.length&&value.tags.every(t=>typeof t==='string'&&t.trim().length>0&&t.length<=20&&/^[\p{L}\p{N} '\-]+$/u.test(t)),'Invalid Etsy tags');
}
export async function prepareManifest(root:string):Promise<Manifest>{
  const id=productId(root),build=await json(root,'qc/build-report.json'),qc=await json(root,'qc/production-report.json'),metadata=await json(root,'listing/listing.json');
  ensure(build.product===id&&build.status==='READY FOR ETSY REVIEW'&&qc.ready===true&&qc.status==='READY FOR ETSY REVIEW','Current product QC is not ready');
  ensure(qc.visualInspection?.status==='PASS'&&qc.tests?.passed===qc.tests?.total&&qc.tests?.total>0,'Visual inspection/tests missing');
  ensure(build.expected===20&&build.sources?.length===20&&metadata.pageCount===20&&metadata.digital===true,'Product/page identity mismatch');
  const evidence=[];
  for(const path of ['listing/listing.json','story-order.json','qc/build-report.json','qc/production-report.json','qc/VISUAL_QA.md'])evidence.push({path,sha256:digest(await read(root,path))});
  // Revalidate the QC-bound listing text, marketing and customer packages.
  for(const a of [...build.artifacts,...qc.artifacts])ensure(digest(await read(root,a.path))===a.sha256,'QC artifact changed: '+a.path);
  ensure(qc.artifacts.some((a:{path:string})=>a.path==='listing/listing.json'),'Listing metadata is not bound to QC');
  const collect=async(path:string,rank:number,expected:string):Promise<Asset>=>{const bytes=await read(root,path);ensure(digest(bytes)===expected,'Changed artifact: '+path);return{path,rank,name:basename(path),sha256:expected,bytes:bytes.length};};
  const sources:Asset[]=[],images:Asset[]=[],files:Asset[]=[];
  for(const [i,s]of build.sources.entries()){
    const expected=`P${String(i+1).padStart(3,'0')}`;
    ensure(s.id===expected&&s.sourceId===expected&&s.name===expected+'.png','Source identity/order mismatch');
    sources.push(await collect('source/'+s.name,i+1,s.sha256));
  }
  for(const [i,name]of (await readdir(join(root,'output/marketing'))).filter(n=>n.endsWith('.png')).sort().entries()){
    ensure(name.startsWith(String(i+1).padStart(2,'0')+'-'),'Marketing sequence must be numbered 01 through 10');
    const path='output/marketing/'+name,a=qc.artifacts.find((a:{path:string})=>a.path===path);ensure(a,'Unreviewed marketing image');images.push(await collect(path,i+1,a.sha256));
  }
  for(const [i,name]of (await readdir(join(root,'output/etsy'))).sort().entries()){
    const path='output/etsy/'+name,a=build.artifacts.find((a:{path:string})=>a.path===path);ensure(a&&name.endsWith('.zip'),'Unreviewed customer ZIP');files.push(await collect(path,i+1,a.sha256));
  }
  const reference=`LX-${id}-${digest(JSON.stringify({metadata,sources})).slice(0,20)}`;
  const m:Manifest={version:1,productId:id,productName:'Cozy Autumn Adventures',reference,
    listing:{title:metadata.title,description:metadata.description+`\n\nCollection reference: ${reference}.`,tags:metadata.tags},
    sale:{shopId:null,price:null,currency:null,taxonomyId:null,whoMade:null,whenMade:null},evidence,sources,images,files};
  validateListing(m.listing);ensure(images.length===10&&files.length===5,'Expected ten marketing images and five ZIPs');
  const target=join(root,'listing/etsy-manifest.json');
  // Never overwrite an operator's sale settings or an approved manifest.
  const existing=await readFile(target).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;return undefined;});
  ensure(!existing,'Manifest already exists; inspect it before preparing a replacement');
  await atomicJson(target,m);return m;
}
export async function checkProduct(root:string,requireSale=true):Promise<CheckedProduct>{
  const manifestBytes=await read(root,'listing/etsy-manifest.json'),m=JSON.parse(manifestBytes.toString()) as Manifest;
  ensure(m.version===1&&m.productId===productId(root),'Manifest product identity mismatch');validateListing(m.listing);
  ensure(m.sources.length===20&&m.images.length===10&&m.files.length===5,'Incorrect source/image/delivery count');
  ensure(new Set(m.sources.map(s=>s.sha256)).size===20,'Duplicate sources');
  const required=['listing/listing.json','story-order.json','qc/build-report.json','qc/production-report.json','qc/VISUAL_QA.md'];
  ensure(required.every(p=>m.evidence.some(e=>e.path===p)),'Missing QC evidence');
  for(const e of m.evidence)ensure(digest(await read(root,e.path))===e.sha256,'QC/metadata changed since preparation');
  const build=await json(root,'qc/build-report.json'),qc=await json(root,'qc/production-report.json'),metadata=await json(root,'listing/listing.json'),story=await json(root,'story-order.json');
  ensure(build.product===m.productId&&build.status==='READY FOR ETSY REVIEW'&&qc.ready===true&&qc.status==='READY FOR ETSY REVIEW'&&qc.visualInspection?.status==='PASS','QC no longer passes');
  ensure(qc.tests?.total>0&&qc.tests.passed===qc.tests.total&&qc.checks?.every((c:{status:string})=>c.status==='PASS'),'QC contains failures');
  ensure(m.listing.title===metadata.title&&JSON.stringify(m.listing.tags)===JSON.stringify(metadata.tags)&&m.listing.description===metadata.description+`\n\nCollection reference: ${m.reference}.`,'Manifest listing differs from reviewed metadata');
  ensure(m.reference===`LX-${m.productId}-${digest(JSON.stringify({metadata,sources:m.sources})).slice(0,20)}`,'Product reference mismatch');
  const assets=async(items:Asset[],kind:'sources'|'images'|'files')=>{
    const result=[];
    ensure(new Set(items.map(a=>a.path)).size===items.length,'Duplicate asset paths');
    for(const [i,a]of items.entries()){
      ensure(a.rank===i+1&&a.name===basename(a.path),'Asset order/name mismatch');
      const data=await read(root,a.path);ensure(data.length===a.bytes&&digest(data)===a.sha256,'Asset bytes changed: '+a.path);
      if(kind==='sources'){
        const id=`P${String(i+1).padStart(3,'0')}`;
        ensure(a.path===`source/${id}.png`&&build.sources[i]?.sha256===a.sha256&&story.pages[i]?.approvedSha256===a.sha256&&story.pages[i]?.id===id&&story.pages[i]?.sourceId===id,'Unapproved source identity');
      }else if(kind==='images'){
        ensure(a.path.startsWith('output/marketing/')&&a.name.startsWith(String(i+1).padStart(2,'0')+'-')&&a.name.endsWith('.png'),'Invalid marketing order');
        ensure(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.readUInt32BE(16)===2000&&data.readUInt32BE(20)===2000,'Invalid marketing PNG');
        ensure(qc.artifacts.some((r:{path:string;sha256:string})=>r.path===a.path&&r.sha256===a.sha256),'Marketing not QC-bound');
      }else{
        ensure(a.path.startsWith('output/etsy/')&&/^[A-Za-z0-9_.-]{3,70}$/.test(a.name)&&a.name.endsWith('.zip')&&a.bytes>0&&a.bytes<19_000_000,'Invalid ZIP filename/size');
        ensure(data.readUInt32LE(0)===0x04034b50,'Invalid ZIP signature');
        ensure(build.artifacts.some((r:{path:string;sha256:string})=>r.path===a.path&&r.sha256===a.sha256)&&qc.bundles.some((r:{name:string;bytes:number})=>r.name===a.name&&r.bytes===a.bytes),'ZIP not QC-bound');
      }
      result.push({...a,data});
    }return result;
  };
  await assets(m.sources,'sources');const images=await assets(m.images,'images'),files=await assets(m.files,'files');
  if(requireSale){
    ensure(Number.isSafeInteger(m.sale.shopId)&&m.sale.shopId!>0,'Set sale.shopId');
    ensure(typeof m.sale.price==='number'&&Number.isFinite(m.sale.price)&&m.sale.price>0&&Math.abs(m.sale.price*100-Math.round(m.sale.price*100))<1e-6,'Set a positive two-decimal sale.price');
    ensure(typeof m.sale.currency==='string'&&/^[A-Z]{3}$/.test(m.sale.currency),'Set sale.currency');
    ensure(Number.isSafeInteger(m.sale.taxonomyId)&&m.sale.taxonomyId!>0,'Set sale.taxonomyId');
    ensure(['i_did','collective','someone_else'].includes(m.sale.whoMade ?? ''),'Set truthful sale.whoMade');
    ensure(typeof m.sale.whenMade==='string'&&/^(made_to_order|2020_2026|2020_2025|2010_2019|2007_2009|before_2007|2000_2006|1990s|1980s|1970s|1960s|1950s|1940s|1930s|1920s|1910s|1900s|1800s|1700s|before_1700)$/.test(m.sale.whenMade),'Set Etsy-supported sale.whenMade');
  }
  return{manifest:m,manifestHash:digest(manifestBytes),images,files};
}
