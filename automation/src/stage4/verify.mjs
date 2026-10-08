// Stage 4 remote verification: the draft as Etsy reports it, compared with the
// approved payload and the upload journal. Every field Stage 4 manages is
// checked; any difference is DRIFT (manual Etsy edits included) and blocks
// publishing. Fields Stage 4 does not manage (views, sections, featured rank,
// timestamps) are ignored. `fingerprint` binds a later PUBLISH confirmation to
// exactly what was verified.
import { hashOf, decodeEtsyText } from './common.mjs';

const sameSet=(a,b)=>JSON.stringify([...(a??[])].map(s=>decodeEtsyText(String(s)).toLowerCase()).sort())===JSON.stringify([...(b??[])].map(s=>String(s).toLowerCase()).sort());
/** Where two texts first differ, as a short excerpt of each (for a phone screen). */
function firstDifference(want,got){
  let i=0;while(i<want.length&&i<got.length&&want[i]===got[i])i++;
  const cut=t=>JSON.stringify(t.slice(Math.max(0,i-12),i+18));
  return `differs at character ${i+1}: approved ${cut(want)}, Etsy ${cut(got)}`;
}

/**
 * @param remote {listing, images, files, properties}
 * @param expectState 'draft' (review) or 'active' (after publishing)
 */
export function verifyRemote({payload,draft,uploads,remote,expectState='draft'}){
  const L=payload.listing, r=remote.listing, checks=[];
  const add=(field,ok,expected,actual,{critical=false}={})=>checks.push({field,ok:!!ok,expected,actual,...(critical?{critical:true}:{})});
  add('listing exists',!!r,draft.listing_id,r?.listingId??null);
  if(!r)return finish(checks);
  add('listing id recorded',r.listingId===draft.listing_id,draft.listing_id,r.listingId);
  add('shop',r.shopId===draft.shop_id,draft.shop_id,r.shopId);
  if(expectState==='draft'){
    add('not live on Etsy',r.state!=='active',"not 'active'",r.state,{critical:r.state==='active'});
    add('state',r.state==='draft',"'draft'",r.state);
  }else add('state',r.state==='active',"'active'",r.state);
  // Text is compared after decoding Etsy's HTML character references only (decodeEtsyText).
  const title=decodeEtsyText(r.title), description=decodeEtsyText(String(r.description??''));
  add('title',title===L.title,L.title,title);
  add('description',description===L.description,`${L.description.length} characters (approved text)`,description===L.description?'identical':`${description.length} characters, ${firstDifference(L.description,description)}`);
  add('price',Math.abs(r.priceAmount-L.price.amount)<0.005&&r.priceCurrencyCode===L.price.currency,`${L.price.currency} ${L.price.amount.toFixed(2)}`,`${r.priceCurrencyCode} ${Number(r.priceAmount).toFixed(2)}`);
  add('digital download type',r.listingType==='download','download',r.listingType);
  add('taxonomy',r.taxonomyId===L.taxonomy.id,L.taxonomy.id,r.taxonomyId??null);
  add('tags',sameSet(r.tags,L.tags),`${L.tags.length} approved tags`,`${(r.tags??[]).length} tags${sameSet(r.tags,L.tags)?'':' (different)'}`);
  if(r.materials!==undefined)add('materials',sameSet(r.materials,L.materials),L.materials,r.materials);
  if(r.whoMade!==undefined)add('who made',r.whoMade===L.who_made,L.who_made,r.whoMade);
  if(r.whenMade!==undefined)add('when made',r.whenMade===L.when_made,L.when_made,r.whenMade);
  add('quantity',r.quantity===L.quantity,L.quantity,r.quantity);
  add('no shipping profile',r.shippingProfileId===undefined||r.shippingProfileId===null,'none',r.shippingProfileId??'none');
  // Images: exactly the uploaded ones, in the approved rank order.
  const imgs=[...(remote.images??[])].sort((a,b)=>a.rank-b.rank);
  add('listing image count',imgs.length===payload.images.length,payload.images.length,imgs.length);
  const order=payload.images.map(i=>uploads.images.find(u=>u.rank===i.rank)?.listing_image_id??null);
  add('listing image order',imgs.length===order.length&&imgs.every((x,i)=>x.listing_image_id===order[i]),order,imgs.map(x=>x.listing_image_id));
  // Digital files: exactly the verified customer ZIP.
  const files=remote.files??[];
  add('digital file count',files.length===payload.files.length,payload.files.length,files.length);
  add('digital files match the verified customer ZIP',payload.files.every(f=>files.some(x=>x.filename===f.name&&Number(x.size_bytes)===f.bytes&&uploads.files.some(u=>u.listing_file_id===x.listing_file_id))),
    payload.files.map(f=>`${f.name} (${f.bytes} bytes)`),files.map(x=>`${x.filename} (${x.size_bytes} bytes)`));
  for(const p of payload.properties?.apply??[]){
    const got=(remote.properties??[]).find(x=>x.propertyId===p.property_id);
    add(`property: ${p.property_name}`,got&&sameSet(got.valueIds.map(String),p.value_ids.map(String)),p.values,got?.values??null);
  }
  return finish(checks);
}
function finish(checks){
  return {passed:checks.every(c=>c.ok),critical:checks.some(c=>c.critical),checks,
    fingerprint:hashOf(checks.map(c=>[c.field,c.ok,c.actual]))};
}
/** Human lines for Telegram: only what differs. */
export const driftLines=v=>v.checks.filter(c=>!c.ok).map(c=>`• ${c.field}: expected ${fmt(c.expected)}, Etsy has ${fmt(c.actual)}`);
const fmt=v=>Array.isArray(v)?v.join(', ').slice(0,200):String(v).slice(0,200);
/**
 * The VERIFY_FAILED message. It ALWAYS names the mismatching field(s): on the
 * first line (which is all some screens show) and as short bullets after it.
 */
export function verifyFailedMessage(v,{max=6}={}){
  const bad=(v?.checks??[]).filter(c=>!c.ok), lines=driftLines(v??{checks:[]});
  const names=bad.length?bad.map(c=>c.field).join(', '):'unknown field (no failing check was recorded)';
  return [`The Etsy draft does not match the approved listing (${names}).`,
    ...(lines.length?lines.slice(0,max):['• no failing check was recorded: see etsy/verification.json']),
    ...(lines.length>max?[`• and ${lines.length-max} more`]:[])].join('\n');
}
