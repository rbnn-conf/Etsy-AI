// Stage 4 payload: the exact Etsy draft, derived deterministically from the
// approved Stage 3 listing + images and the Stage 4 customer ZIP. No model
// call. Nothing required by Etsy is invented: seller declarations (who made
// it, when) come from explicit configuration, or Stage 4 stops.
import { ETSY, Stage4Error, hashOf } from './common.mjs';
import { pence } from '../../../marketing/src/stage3/index.mjs';

/** Problems with the approved values under Etsy's CURRENT rules; [] when valid. Values are never altered. */
export function etsyProblems(l){
  const e=[];
  if(!l.title||l.title.length>ETSY.titleMax)e.push(`title must be 1-${ETSY.titleMax} characters`);
  if(ETSY.titlePattern.test(l.title??''))e.push('title has characters Etsy does not allow');
  for(const c of ETSY.titleOnce)if((l.title??'').split(c).length-1>1)e.push(`title may use "${c}" only once`);
  if(!Array.isArray(l.tags)||l.tags.length<1||l.tags.length>ETSY.tagsMax)e.push(`1-${ETSY.tagsMax} tags required`);
  for(const t of l.tags??[])if(t.length>ETSY.tagMax||ETSY.tagPattern.test(t))e.push(`tag "${t}" breaks Etsy's tag rules`);
  if(new Set((l.tags??[]).map(t=>t.toLowerCase())).size!==(l.tags??[]).length)e.push('tags must be unique');
  for(const m of l.materials??[])if(ETSY.materialPattern.test(m))e.push(`material "${m}" has characters Etsy does not allow (letters, digits and spaces only)`);
  if(!l.description?.trim())e.push('description is empty');
  const p=l.price?.amount;
  // Whole pence, float-safe (price.mjs): 8.95 is valid; 8.955 or a string never is.
  if(!(pence(p)!==null&&pence(p)>0))e.push('price must be a positive amount with at most 2 decimals');
  if(!ETSY.whoMade.includes(l.who_made))e.push('who_made is not set to a valid Etsy value (ETSY_SELLER_WHO_MADE)');
  if(!ETSY.whenMade.includes(l.when_made))e.push('when_made is not set to a valid Etsy value (ETSY_SELLER_WHEN_MADE)');
  if(!(Number.isInteger(l.quantity)&&l.quantity>=1&&l.quantity<=ETSY.quantityMax))e.push(`quantity must be 1-${ETSY.quantityMax}`);
  if(l.type!=='download')e.push('type must be download');
  return e;
}

/**
 * @param inputs     verifyApprovedInputs() result
 * @param delivery   buildDelivery().manifest (one or more delivery files; see delivery.mjs)
 * @param taxonomy   resolveTaxonomy() result
 * @param properties mapProperties() result
 * @param seller     {whoMade, whenMade, quantity, currency}
 */
export function buildPayload({product,inputs,delivery,taxonomy,properties,seller,mode}){
  const L=inputs.stage3.listing;
  const listing={
    title:L.title,description:L.description,tags:[...L.tags],materials:[...(L.materials??[])],
    price:{amount:L.suggested_price_gbp,currency:'GBP',source:'approved Stage 3 suggested_price_gbp'},
    quantity:seller.quantity,who_made:seller.whoMade??null,when_made:seller.whenMade??null,
    is_supply:false,should_auto_renew:false,type:'download',
    taxonomy:{id:taxonomy.id,path:taxonomy.path,source:taxonomy.source,approved_category:L.category_suggestion}};
  const problems=etsyProblems({...listing,price:listing.price});
  if(problems.length)throw new Stage4Error(problems.some(p=>/who_made|when_made/.test(p))?'CONFIG':'PAYLOAD_INVALID',`The Etsy draft cannot be prepared: ${problems.join('; ')}.`,{retryable:false});
  if(inputs.stage3.images.length<1||inputs.stage3.images.length>ETSY.imagesMax)throw new Stage4Error('PAYLOAD_INVALID',`Etsy accepts 1-${ETSY.imagesMax} listing images.`,{retryable:false});
  const payload={schema_version:1,product_id:product.product_id,product_name:product.name,mode,
    listing,properties,
    images:inputs.stage3.images.map(i=>({rank:i.rank,file:i.file,sha256:i.sha256,bytes:i.bytes,format:'png',width:i.width,height:i.height,conversion:'none (uploaded exactly as approved)'})),
    // Every delivery file of the ONE product, in rank order (a single-file product: exactly the former one-ZIP payload).
    files:delivery.packages.map(p=>({rank:p.rank,name:p.name,file:p.file,sha256:p.sha256,bytes:p.bytes})),
    sources:{stage2_fingerprint:inputs.stage2.fingerprint,stage3_fingerprint:inputs.stage3.fingerprint,listing_sha256:inputs.stage3.listingSha,
      delivery_sha256:delivery.packages.length===1?delivery.packages[0].sha256:hashOf(delivery.packages.map(p=>[p.name,p.sha256])),marketing_approved_at:inputs.stage3.approvedAt}};
  if(payload.files.length<1||payload.files.length>ETSY.filesMax)throw new Stage4Error('DELIVERY_INVALID',`Etsy accepts 1-${ETSY.filesMax} digital files per listing; the delivery has ${payload.files.length}.`,{retryable:false});
  return {payload,payloadSha:hashOf(payload)};
}
