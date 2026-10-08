// Stage 4 engine (ADR-026): approved product -> verified Etsy DRAFT, and the
// separate, owner-confirmed publish. No model client ever reaches this module.
//
// Durable records (products/<id>/etsy/, or etsy/dry-run/ in dry-run mode):
//   payload.json         exact draft content (deterministic from approved inputs)
//   delivery/            the customer delivery ZIP(s) + delivery-manifest.json (one product, 1-5 delivery files)
//   draft.json           listing_id + create journal (intent written BEFORE the POST)
//   uploads.json         every property/image/file, with a pending marker before each POST
//   verification.json    remote read-back, check by check
//   section.json         the shop-section outcome (ADR-054)
//   publish-record.json  activation attempt + remote confirmation
//   api-activity.json    sanitized Etsy operation log
//   history/             superseded payloads (only before a draft exists)
//
// Writes are never blindly retried: a lost response is reconciled by reading
// Etsy first ("verify, then retry"). A known listing ID is never recreated.
import { readFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Stage4Error, sha256, definiteResponse, classify, readJsonIf, writeJsonAtomic, makeSanitizer, decodeEtsyText } from './common.mjs';
import { verifyApprovedInputs } from './inputs.mjs';
import { buildDelivery } from './delivery.mjs';
import { resolveTaxonomy, mapProperties } from './taxonomy.mjs';
import { formatOf } from '../orchestrator/book-state.mjs';
import { buildPayload } from './payload.mjs';
import { verifyRemote } from './verify.mjs';
import { withActivityLog } from './activity.mjs';
import { resolveShopSection, matchSection, CREATE_SCOPE } from './sections.mjs';

export const etsyDirFor=(productDir,mode)=>join(productDir,...(mode==='live'?['etsy']:['etsy','dry-run']));

export class Stage4{
  /**
   * @param client  Etsy client (live adapter, DryRunEtsy, or a test fake); wrapped with the activity log
   * @param config  {shopId, seller:{whoMade,whenMade,quantity}, publishEnabled, deliveryLimits?}
   *                deliveryLimits: {filesMax, safeBytes, namePattern} (default: Etsy's, delivery.mjs DELIVERY_LIMITS;
   *                tests pass stricter ones to exercise splitting with small fixtures; the 20 MB cap always applies)
   */
  constructor({productDir,product,client,mode,config,now=()=>new Date(),log=()=>{},secrets=[]}){
    if(mode!=='live'&&mode!=='dry-run')throw new Error('Stage 4 mode must be live or dry-run');
    if(mode==='dry-run'&&client?.mode!=='dry-run')throw new Stage4Error('CONFIG','Dry run must use the simulated Etsy client.',{retryable:false});
    Object.assign(this,{productDir,product,mode,config,now,log});
    this.dir=etsyDirFor(productDir,mode);
    this.sanitize=makeSanitizer(secrets);
    this.client=withActivityLog(client,{now,sanitize:this.sanitize,append:e=>this.#appendActivity(e)});
  }
  #p(name){return join(this.dir,name);}
  async #appendActivity(entry){const path=this.#p('api-activity.json');const log=(await readJsonIf(path))??[];log.push(entry);await writeJsonAtomic(path,log);}
  read(name){return readJsonIf(this.#p(name));}
  write(name,v){return writeJsonAtomic(this.#p(name),v);}

  // ---------------- 1. prepare (read-only on Etsy) ----------------
  async prepare(){
    const inputs=await verifyApprovedInputs(this.productDir,this.product);
    // The complete delivery set is built and verified BEFORE any Etsy call: a packaging problem never reaches Etsy.
    const delivery=(await buildDelivery({productDir:this.productDir,product:this.product,deliveryDir:this.#p('delivery'),now:this.now(),
      ...(this.config.deliveryLimits?{limits:this.config.deliveryLimits}:{})})).manifest;
    const auth=await this.client.checkAuth();
    if(this.mode==='live'&&auth.shopId!==this.config.shopId)throw new Stage4Error('AUTH_ERROR','The authorised Etsy shop is not ETSY_SHOP_ID.',{retryable:false});
    if(auth.currency!=='GBP')throw new Stage4Error('CONFIG',`The Etsy shop currency is ${auth.currency}; the approved price is in GBP. Nothing was created.`,{retryable:false});
    const settings=await readJsonIf(join(this.productDir,'etsy','settings.json'));
    const nodes=await this.client.getSellerTaxonomyNodes();
    const taxonomy=resolveTaxonomy({categoryPath:inputs.stage3.listing.category_suggestion,nodes,overrideId:settings?.taxonomy_id??null,simulated:this.mode!=='live',format:formatOf(this.product)??null});
    const properties=mapProperties({listing:inputs.stage3.listing,properties:await this.client.getPropertiesByTaxonomyId(taxonomy.id)});
    const {payload,payloadSha}=buildPayload({product:this.product,inputs,delivery,taxonomy,properties,seller:this.config.seller,mode:this.mode});
    const draft=await this.read('draft.json'), prev=await this.read('payload.json');
    if(prev&&prev.payload_sha256!==payloadSha){
      if(draft?.listing_id||draft?.create?.attempted)
        throw new Stage4Error('LOCAL_ASSET_CHANGED','The approved inputs or Etsy settings changed after the Etsy draft was created. Stage 4 does not rewrite drafts; nothing was changed on Etsy.',{retryable:false});
      await mkdir(this.#p('history'),{recursive:true});
      await rename(this.#p('payload.json'),this.#p(`history/payload-${prev.payload_sha256.slice(0,12)}.json`));
    }
    if(!prev||prev.payload_sha256!==payloadSha)await this.write('payload.json',{...payload,payload_sha256:payloadSha,prepared_at:this.now().toISOString()});
    return {inputs,delivery,payload,payloadSha,shop:auth};
  }

  // ---------------- 2. draft (create once) ----------------
  async ensureDraft(ctx){
    const L=ctx.payload.listing, shopId=ctx.shop.shopId;
    let d=(await this.read('draft.json'))??{schema_version:1,mode:this.mode,shop_id:shopId,payload_sha256:ctx.payloadSha,create:{attempted:false},listing_id:null};
    if(d.payload_sha256!==ctx.payloadSha)throw new Stage4Error('LOCAL_ASSET_CHANGED','The draft was created from a different payload.',{retryable:false});
    if(d.listing_id){await this.#guardDraft(d.listing_id,shopId);return d;}
    const matches=await this.#findIdenticalDrafts(shopId,L);
    if(d.create.attempted){
      // A previous POST may have created the draft without us seeing the response.
      if(matches.length===1){d={...d,listing_id:matches[0].listingId,created_at:this.now().toISOString(),adopted:'reconciled after an uncertain create response',state:'draft'};await this.write('draft.json',d);return d;}
      if(matches.length>1)throw new Stage4Error('UNCERTAIN_CREATE',`${matches.length} Etsy drafts match this product exactly. Inspect Etsy manually; nothing more will be created.`,{retryable:false});
      throw new Stage4Error('UNCERTAIN_CREATE','A previous draft creation had no confirmed outcome and no matching Etsy draft is visible yet. Nothing will be created automatically. Check your Etsy drafts; if there is none, send /etsy <id> confirm-no-draft, then RETRY.',{retryable:false});
    }
    if(matches.length)throw new Stage4Error('REMOTE_DRIFT','An Etsy draft with this exact title and description already exists but was not created by Stage 4. Nothing was created. Remove or rename it on Etsy, then retry.',{retryable:false});
    d={...d,create:{attempted:true,at:this.now().toISOString()}};
    await this.write('draft.json',d);   // durable intent BEFORE the non-idempotent POST
    let listing;
    try{
      listing=await this.client.createListing({shopId,title:L.title,description:L.description,priceAmount:L.price.amount,quantity:L.quantity,
        whoMade:L.who_made,whenMade:L.when_made,taxonomyId:L.taxonomy.id,listingType:'download',tags:L.tags,materials:L.materials,state:'draft'});
    }catch(err){
      // Etsy answered: nothing was created, so the next attempt may create. Otherwise the outcome is unknown.
      if(definiteResponse(err))await this.write('draft.json',{...d,create:{attempted:false,last_failure:{code:classify(err),status:err.status??null,at:this.now().toISOString()}}});
      throw err;
    }
    if(!Number.isSafeInteger(listing?.listingId)||listing.listingId<=0)throw new Stage4Error('UNCERTAIN_CREATE','Etsy did not return a listing ID.',{retryable:false});
    d={...d,listing_id:listing.listingId,created_at:this.now().toISOString(),state:listing.state};
    await this.write('draft.json',d);   // recorded immediately
    if(listing.state==='active')throw new Stage4Error('CRITICAL_ACTIVE','Etsy reports the new listing as ACTIVE. Stage 4 only creates drafts: inspect it on Etsy now.',{retryable:false});
    return d;
  }
  async confirmNoDraft(){
    const d=await this.read('draft.json');
    if(!d?.create?.attempted||d.listing_id)return false;
    await this.write('draft.json',{...d,create:{attempted:false,owner_confirmed_no_draft_at:this.now().toISOString()}});
    return true;
  }
  async #findIdenticalDrafts(shopId,L){
    const out=[];let offset=0;
    for(let guard=0;guard<100;guard++){
      const page=await this.client.getListingsByShop({shopId,state:'draft',limit:100,offset});
      for(const l of page.results)if(decodeEtsyText(l.title)===L.title&&decodeEtsyText(l.description)===L.description)out.push(l);
      offset+=page.results.length;
      if(!page.results.length||offset>=page.count)break;
    }
    return out;
  }
  async #guardDraft(listingId,shopId){
    const l=await this.client.getListing(listingId);
    if(l.shopId!==shopId)throw new Stage4Error('REMOTE_DRIFT','The recorded listing belongs to another shop. No writes.',{retryable:false});
    if(l.state==='active')throw new Stage4Error('CRITICAL_ACTIVE','The Etsy listing is ACTIVE although publishing was never confirmed. No further changes; inspect it on Etsy now.',{retryable:false});
    if(l.state!=='draft')throw new Stage4Error('REMOTE_DRIFT',`The Etsy listing is ${l.state}, not a draft. No writes.`,{retryable:false});
    if(l.listingType!=='download')throw new Stage4Error('REMOTE_DRIFT','The Etsy listing is not a digital download. No writes.',{retryable:false});
    return l;
  }

  // ---------------- 3. properties, images, files (journalled) ----------------
  async uploadAssets(ctx,draft){
    const shopId=ctx.shop.shopId, listingId=draft.listing_id;
    let u=(await this.read('uploads.json'))??{schema_version:1,listing_id:listingId,properties:[],images:[],files:[],pending:null};
    const save=()=>this.write('uploads.json',u);
    await this.#guardDraft(listingId,shopId);
    if(u.pending){u=await this.#reconcilePending(u,ctx,shopId,listingId);await save();}
    // Properties: idempotent PUTs, safe to repeat.
    for(const p of ctx.payload.properties.apply){
      if(u.properties.some(x=>x.property_id===p.property_id))continue;
      await this.client.updateListingProperty({shopId,listingId,propertyId:p.property_id,valueIds:p.value_ids,values:p.values});
      u.properties.push({property_id:p.property_id,values:p.values,at:this.now().toISOString()});await save();
    }
    for(const img of ctx.payload.images){
      const done=u.images.find(x=>x.rank===img.rank);
      if(done){if(done.sha256!==img.sha256)throw new Stage4Error('LOCAL_ASSET_CHANGED',`Listing image ${img.rank} changed after upload.`,{retryable:false});continue;}
      const bytes=await this.#bytes(img.file,img.sha256);
      const remote=await this.client.getListingImages(listingId);
      if(remote.some(r=>!u.images.some(x=>x.listing_image_id===r.listing_image_id)))throw new Stage4Error('REMOTE_DRIFT','The Etsy draft has images Stage 4 did not upload. No more uploads; review the draft on Etsy.',{retryable:false});
      u.pending={kind:'image',rank:img.rank,at:this.now().toISOString()};await save();
      const r=await this.client.uploadListingImage({shopId,listingId,fileName:img.file.split('/').at(-1),bytes,rank:img.rank});
      if(!(Number.isSafeInteger(r.listingImageId)&&r.listingImageId>0))throw new Stage4Error('UPLOAD_FAILED',`Image ${img.rank}: Etsy returned no image ID.`,{retryable:false});
      u.images.push({rank:img.rank,file:img.file,sha256:img.sha256,listing_image_id:r.listingImageId,uploaded_at:this.now().toISOString()});u.pending=null;await save();
    }
    for(const f of ctx.payload.files){
      const done=u.files.find(x=>x.rank===f.rank);
      if(done){if(done.sha256!==f.sha256)throw new Stage4Error('LOCAL_ASSET_CHANGED',`The customer delivery file ${f.name} changed after upload.`,{retryable:false});continue;}
      const bytes=await this.#bytes(f.file,f.sha256,true);
      const remote=await this.client.getListingFiles(shopId,listingId);
      if(remote.some(r=>!u.files.some(x=>x.listing_file_id===r.listing_file_id)))throw new Stage4Error('REMOTE_DRIFT','The Etsy draft has digital files Stage 4 did not upload. No more uploads; review the draft on Etsy.',{retryable:false});
      u.pending={kind:'file',rank:f.rank,name:f.name,bytes:f.bytes,at:this.now().toISOString()};await save();
      const r=await this.client.uploadDigitalFile({shopId,listingId,fileName:f.name,bytes,rank:f.rank});
      if(!(Number.isSafeInteger(r.listingFileId)&&r.listingFileId>0))throw new Stage4Error('UPLOAD_FAILED',`Etsy returned no file ID for the customer delivery file ${f.name}.`,{retryable:false});
      u.files.push({rank:f.rank,name:f.name,sha256:f.sha256,bytes:f.bytes,listing_file_id:r.listingFileId,uploaded_at:this.now().toISOString()});u.pending=null;await save();
    }
    return u;
  }
  /** A previous upload may have succeeded without a recorded response: read Etsy before trying again. */
  async #reconcilePending(u,ctx,shopId,listingId){
    const p=u.pending;
    if(p.kind==='image'){
      const extra=(await this.client.getListingImages(listingId)).filter(r=>!u.images.some(x=>x.listing_image_id===r.listing_image_id));
      if(extra.length===0)return {...u,pending:null};
      const img=ctx.payload.images.find(i=>i.rank===p.rank);
      // Etsy reports each image's pixel size: it must be the approved image's, not a photo added on Etsy meanwhile.
      const sameSize=r=>r.full_width===undefined||(r.full_width===img.width&&r.full_height===img.height);
      if(extra.length===1&&extra[0].rank===p.rank&&sameSize(extra[0]))return {...u,pending:null,images:[...u.images,{rank:p.rank,file:img.file,sha256:img.sha256,listing_image_id:extra[0].listing_image_id,uploaded_at:p.at,reconciled:true}]};
    }else{
      const extra=(await this.client.getListingFiles(shopId,listingId)).filter(r=>!u.files.some(x=>x.listing_file_id===r.listing_file_id));
      if(extra.length===0)return {...u,pending:null};
      const f=ctx.payload.files.find(x=>x.rank===p.rank);
      if(extra.length===1&&extra[0].filename===p.name&&Number(extra[0].size_bytes)===p.bytes)return {...u,pending:null,files:[...u.files,{rank:p.rank,name:f.name,sha256:f.sha256,bytes:f.bytes,listing_file_id:extra[0].listing_file_id,uploaded_at:p.at,reconciled:true}]};
    }
    throw new Stage4Error('REMOTE_DRIFT',`An interrupted ${p.kind} upload could not be matched to what Etsy shows. Nothing more will be uploaded; inspect the draft on Etsy.`,{retryable:false});
  }
  async #bytes(rel,expect,zip=false){
    const b=await readFile(join(this.productDir,rel)).catch(()=>null);
    if(!b||sha256(b)!==expect)throw new Stage4Error('LOCAL_ASSET_CHANGED',`${zip?'The customer ZIP':'An approved listing image'} changed or is missing: ${rel}`,{retryable:false});
    return b;
  }

  // ---------------- 3b. shop section (ADR-054; non-fatal, idempotent) ----------------
  /**
   * Put the draft in its configured shop section. Reads Etsy before every write: an existing section
   * (exact or normalised title) is reused, a missing one is created only with the shops_w scope, and a
   * listing already in it is a no-op. Never throws: the outcome is recorded in section.json (and shown to
   * the owner), and a failure is retried on its own (organiseOnly), never by re-running earlier stages.
   */
  async organise(ctx,draft){
    const shopId=ctx.shop.shopId, listingId=draft.listing_id, prev=await this.read('section.json');
    const r=resolveShopSection(this.product);
    const base={schema_version:1,listing_id:listingId,section:r.section,key:r.key,format:r.format,season:r.season,product_type:r.product_type,label:r.label};
    const done=async rec=>{rec={...base,...rec,at:this.now().toISOString()};await this.write('section.json',rec);
      this.log(`Etsy section: ${rec.status}${rec.section?` "${rec.section}"`:''}${rec.shop_section_id?` (id ${rec.shop_section_id})`:''}${rec.warning?`: ${rec.warning}`:''}${rec.error?`: ${rec.error}`:''}`);return rec;};
    if(!r.section)return done({status:'unmapped',warning:r.warning});
    let pending=null;
    try{
      const listing=await this.#guardDraft(listingId,shopId);
      const m=matchSection(await this.client.getShopSections(shopId),r.section);
      if(m.ambiguous)return done({status:'ambiguous',warning:`Several Etsy shop sections match "${r.section}" (${m.candidates.map(s=>`"${s.title}"`).join(', ')}); none was chosen`});
      // "created" survives a retry, including one after a create whose response was lost (pending intent).
      let section=m.section, created=!!(section&&((prev?.created&&prev.shop_section_id===section.shopSectionId)||prev?.pending?.create===r.section));
      if(!section){
        if(!(Array.isArray(ctx.shop.scopes)&&ctx.shop.scopes.includes(CREATE_SCOPE)))
          return done({status:'section_missing',warning:`Etsy shop section "${r.section}" does not exist yet. Create it on Etsy (or re-authorise the shop with ${CREATE_SCOPE}).`});
        pending={create:r.section,at:this.now().toISOString()};
        await this.write('section.json',{...base,status:'creating',pending});   // intent before the POST
        const c=await this.client.createShopSection({shopId,title:r.section});
        if(!(Number.isSafeInteger(c?.shopSectionId)&&c.shopSectionId>0))throw new Stage4Error('UPLOAD_FAILED','Etsy returned no shop section ID.',{retryable:true});
        section=c;created=true;
      }
      const id=section.shopSectionId;
      if(listing.shopSectionId===id)return done({status:'already_assigned',shop_section_id:id,created});
      await this.client.assignListingSection({shopId,listingId,shopSectionId:id});
      const after=await this.client.getListing(listingId);
      if(after.shopSectionId!==id)throw new Stage4Error('VERIFY_FAILED',`Etsy does not report the listing in section ${id} after the update.`,{retryable:true});
      return done({status:'assigned',shop_section_id:id,created});
    }catch(err){
      // The create intent is kept, so a create whose response was lost is recognised (and never repeated) on retry.
      return done({status:'failed',error_code:classify(err),error:this.sanitize(err?.message??String(err)),retryable:true,...(pending??prev?.pending?{pending:pending??prev.pending}:{})});
    }
  }
  /** Retry ONLY the shop-section step for the recorded draft: no prepare, no uploads, no earlier stage. */
  async organiseOnly(){
    const draft=await this.read('draft.json');
    if(!draft?.listing_id)throw new Stage4Error('VERIFY_FAILED','No Etsy draft to organise yet.',{retryable:false});
    const shop=await this.client.checkAuth();
    return this.organise({shop},draft);
  }

  // ---------------- 4. remote verification ----------------
  async verify({expectState='draft'}={}){
    const payloadRec=await this.read('payload.json'), draft=await this.read('draft.json'), uploads=await this.read('uploads.json');
    if(!payloadRec||!draft?.listing_id||!uploads)throw new Stage4Error('VERIFY_FAILED','No Etsy draft to verify yet.',{retryable:true});
    const {payload_sha256,prepared_at,...payload}=payloadRec;
    const shopId=draft.shop_id, id=draft.listing_id;
    const listing=await this.client.getListing(id).catch(e=>{if(e?.status===404)return null;throw e;});
    const remote={listing,images:listing?await this.client.getListingImages(id):[],files:listing?await this.client.getListingFiles(shopId,id):[],
      properties:listing&&payload.properties.apply.length?await this.client.getListingProperties(shopId,id):[]};
    const v=verifyRemote({payload,draft,uploads,remote,expectState});
    const record={...v,listing_id:id,shop_id:shopId,expect_state:expectState,payload_sha256,remote_url:listing?.url??null,at:this.now().toISOString()};
    await this.write('verification.json',record);
    return record;
  }

  // ---------------- 5. publish (only via the confirmed, gated path) ----------------
  /**
   * Re-read everything the owner approved and compare it with the verification
   * the PUBLISH confirmation was bound to. Any difference aborts.
   */
  async revalidateForPublish(expectedFingerprint){
    const reasons=[];
    const payloadRec=await this.read('payload.json');
    let inputs=null;
    try{inputs=await verifyApprovedInputs(this.productDir,this.product);}catch(e){reasons.push(`approved inputs: ${this.sanitize(e.message)}`);}
    if(inputs){
      if(inputs.stage2.fingerprint!==payloadRec?.sources?.stage2_fingerprint)reasons.push('Stage 2 production files changed since the draft was prepared');
      if(inputs.stage3.fingerprint!==payloadRec?.sources?.stage3_fingerprint)reasons.push('Stage 3 listing or images changed since the draft was prepared');
    }
    // Every delivery file, not just the first.
    if(!payloadRec?.files?.length)reasons.push('the customer ZIP changed or is missing');
    for(const f of payloadRec?.files??[]){
      const b=await readFile(join(this.productDir,f.file)).catch(()=>null);
      if(!b||sha256(b)!==f.sha256)reasons.push(payloadRec.files.length===1?'the customer ZIP changed or is missing':`the customer delivery file ${f.name} changed or is missing`);
    }
    const v=await this.verify({expectState:'draft'});
    if(!v.passed)reasons.push(...v.checks.filter(c=>!c.ok).map(c=>`Etsy draft: ${c.field} differs`));
    if(v.fingerprint!==expectedFingerprint)reasons.push('the Etsy draft changed since the PUBLISH button was pressed');
    return {ok:reasons.length===0,reasons:[...new Set(reasons)],verification:v};
  }
  async publish({expectedFingerprint}){
    if(this.mode!=='live')throw new Stage4Error('PUBLISH_BLOCKED','Dry run never publishes.',{retryable:false});
    if(this.config.publishEnabled!==true)throw new Stage4Error('PUBLISH_BLOCKED','Publishing is disabled on this server (ETSY_PUBLISH_ENABLED is not true).',{retryable:false});
    const check=await this.revalidateForPublish(expectedFingerprint);
    if(!check.ok)return {outcome:'aborted',reasons:check.reasons};
    const draft=await this.read('draft.json'), payloadRec=await this.read('payload.json');
    const base={schema_version:1,listing_id:draft.listing_id,shop_id:draft.shop_id,payload_sha256:payloadRec.payload_sha256,
      final_title:payloadRec.listing.title,final_price:payloadRec.listing.price,production_fingerprint:payloadRec.sources.stage2_fingerprint,
      marketing_fingerprint:payloadRec.sources.stage3_fingerprint,verification_fingerprint:check.verification.fingerprint};
    await this.write('publish-record.json',{...base,status:'activation_requested',requested_at:this.now().toISOString()});
    let response;
    try{response=await this.client.activateListing({shopId:draft.shop_id,listingId:draft.listing_id,confirmation:`ACTIVATE ${draft.listing_id}`});}
    catch(err){
      await this.write('publish-record.json',{...base,status:definiteResponse(err)?'activation_rejected':'activation_outcome_unknown',error_code:classify(err),error:this.sanitize(err.message),at:this.now().toISOString()});
      throw err;
    }
    await this.write('publish-record.json',{...base,status:'activation_returned',api_result:{state:response?.state??null},at:this.now().toISOString()});
    return this.confirmPublished(base);
  }
  /** Read Etsy back; only a remotely ACTIVE listing that still matches counts as published. */
  async confirmPublished(base){
    const v=await this.verify({expectState:'active'});
    base??=(({status,requested_at,at,api_result,error,error_code,...b})=>b)(await this.read('publish-record.json')??{});
    if(!v.passed)return {outcome:'not_active',verification:v};
    const record={...base,status:'published',published_at:this.now().toISOString(),remote_state:'active',listing_url:v.remote_url,verification:{fingerprint:v.fingerprint,at:v.at}};
    await this.write('publish-record.json',record);
    return {outcome:'published',record,verification:v};
  }
}
