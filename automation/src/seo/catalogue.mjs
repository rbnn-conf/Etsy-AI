// Products eligible for an SEO audit, read from LOCAL files only (ADR-036).
// Never calls Etsy and never writes a product: each product's most
// authoritative local listing file becomes an engine listing snapshot.
//   Stage 4 Etsy payload > Stage 3 approved listing > hand-built listing.json > hand-built description.md
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateSnapshot } from '../../../seo/src/index.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const readText=p=>readFile(p,'utf8').catch(()=>null);
const readJsonIf=async p=>{const t=await readText(p);if(t===null)return null;try{return JSON.parse(t);}catch{return null;}};
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const strings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string')?v:null;

const SOURCES=[
  {file:'etsy/payload.json',kind:'Stage 4 Etsy draft payload (local copy)',read:j=>isObj(j?.listing)&&{title:j.listing.title,tags:strings(j.listing.tags),description:j.listing.description,
    price:isObj(j.listing.price)&&typeof j.listing.price.amount==='number'?{amount:j.listing.price.amount,currency:j.listing.price.currency}:null,category:j.listing.taxonomy?.path??null}},
  {file:'marketing/listing.json',kind:'Stage 3 approved listing copy',read:j=>typeof j?.title==='string'&&{title:j.title,tags:strings(j.tags),description:j.description,
    price:typeof j.suggested_price_gbp==='number'?{amount:j.suggested_price_gbp,currency:'GBP'}:null,category:j.category_suggestion??null}},
  {file:'listing/listing.json',kind:'hand-built listing file',read:j=>typeof j?.title==='string'&&{title:j.title,tags:strings(j.tags),description:j.description??null,
    page_count:Number.isInteger(j.pageCount)?j.pageCount:null,formats:strings(j.formats),category:typeof j.category==='string'?j.category:null}},
  {file:'listing/description.md',kind:'hand-built listing description',md:true}];

async function listingOf(dir){
  for(const s of SOURCES){
    const text=await readText(join(dir,s.file));
    if(text===null)continue;
    if(s.md){
      const m=/^#\s+(.+)$/m.exec(text);if(!m)continue;
      return {source:s,bytes:text,listing:{title:m[1].trim(),tags:null,description:text.slice(m.index+m[0].length).trim()||null}};
    }
    let j;try{j=JSON.parse(text);}catch{continue;}
    const listing=s.read(j);
    if(listing&&typeof listing.title==='string'&&listing.title.trim())return {source:s,bytes:text,listing};
  }
  return null;
}

/**
 * Every NNN-* product folder with a readable local listing, with what is known about its Etsy
 * listing from local state only: {known:'listing'|'none'|'unknown', listing_id, published}.
 */
export async function listSeoProducts(productsDir){
  const dirs=(await readdir(productsDir,{withFileTypes:true}).catch(()=>[])).filter(d=>d.isDirectory()&&/^\d{3}-[a-z0-9-]+$/.test(d.name)).map(d=>d.name).sort();
  const out=[];
  for(const workspace of dirs){
    const dir=join(productsDir,workspace), found=await listingOf(dir);
    if(!found)continue;
    const product=await readJsonIf(join(dir,'product.json'));
    const managed=product?.managed_by==='automation-stage-1';
    const readme=await readText(join(dir,'README.md'));
    const heading=/^#\s+(.+)$/m.exec(readme??'')?.[1]?.trim().replace(/^Product\s+#?\d{3}\s*[—–:-]\s*/i,'');
    const name=(managed&&product.name)||heading||workspace.slice(4).replace(/-/g,' ');
    const listingId=managed&&product.etsy?.mode==='live'&&product.etsy.listing_id?String(product.etsy.listing_id):null;
    out.push({product_id:workspace.slice(0,3),workspace,name,managed,status:managed?product.status:null,source:found.source.file,
      etsy:managed?{known:listingId||product.status==='PUBLISHED'?'listing':'none',listing_id:listingId,published:product.status==='PUBLISHED'}:{known:'unknown',listing_id:null,published:null}});
  }
  return out;
}

/** The product's current listing as an engine snapshot (+ the full description for a revision). Local, read-only. */
export async function productSnapshot(productsDir,item,{now=new Date()}={}){
  const dir=join(productsDir,item.workspace), found=await listingOf(dir);
  if(!found)throw new Error(`product #${item.product_id} has no readable local listing`);
  const product=item.managed?await readJsonIf(join(dir,'product.json')):null, l=found.listing;
  const snapshot={schema_version:1,mode:'EXISTING_LISTING',snapshot_id:`product-${item.product_id}`,
    listing:{owner_reference:`#${item.product_id}`,repo_product:item.workspace,etsy_listing_id:item.etsy.listing_id,live_state_read:false},
    title:l.title.trim(),tags:l.tags??null,description_excerpt:typeof l.description==='string'?l.description.slice(0,600):null,
    product_type:product?.product_type??null,page_count:product?.page_count??l.page_count??null,formats:l.formats??null,
    price:l.price&&/^[A-Z]{3}$/.test(l.price.currency??'')?l.price:null,category:l.category??null,
    performance:{views:null,favourites:null,orders:null,revenue_minor:null},
    source:{file:`products/${item.workspace}/${found.source.file}`,sha256:sha(found.bytes),kind:found.source.kind},
    captured_at:now.toISOString(),notes:'Read from the local repository file; the live Etsy listing is not read.'};
  const v=validateSnapshot(snapshot);
  if(!v.ok)throw new Error(`product #${item.product_id}: ${v.errors.join('; ')}`);
  return {snapshot,description:typeof l.description==='string'?l.description:null,warnings:v.warnings};
}
