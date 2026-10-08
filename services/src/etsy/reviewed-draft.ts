import {join} from 'node:path';
import type {EtsyService} from './etsy-service.ts';
import type {EtsyListing,EtsyWhenMade,EtsyWhoMade} from './types.ts';
import type {CheckedProduct} from './reviewed-product.ts';
import {ensure} from './reviewed-product.ts';
import {atomicJson,readJson} from './secure-store.ts';

export interface Approval{state:'APPROVED';productId:string;manifestHash:string;reviewer:string;approvedAt:string}
interface Journal{version:1;manifestHash:string;productId:string;shopId:number;createAttempted:boolean;listingId?:number;downloadSet?:boolean;pending?:string;images:{rank:number;id:number;sha256:string}[];files:{rank:number;id:number;sha256:string}[];complete?:boolean}
type DraftService=Pick<EtsyService,'getShop'|'getListing'|'getListingsByShop'|'createListing'|'setDraftDownload'|'uploadListingImage'|'uploadDigitalFile'|'getListingImages'|'getListingFiles'|'getSellerTaxonomyNodes'>;

/** Caller holds the connection lock. There is no publish/renew API in this workflow. */
export async function createReviewedDraft(service:DraftService,checked:CheckedProduct,stateDir:string){
  const {manifest:m,manifestHash}=checked,shopId=m.sale.shopId!;
  const approval=await readJson<Approval>(join(stateDir,`approval-${m.productId}.json`));
  ensure(approval?.state==='APPROVED'&&approval.productId===m.productId&&approval.manifestHash===manifestHash,'An explicit owner approval of this exact manifest is required');
  const shop=await service.getShop(shopId);ensure(shop.shopId===shopId&&shop.currencyCode===m.sale.currency,'Shop identity or currency mismatch');
  const taxonomy=await service.getSellerTaxonomyNodes();ensure(taxonomy.some(n=>n.id===m.sale.taxonomyId),'Taxonomy is not in Etsy seller taxonomy');
  const path=join(stateDir,`draft-${shopId}-${m.productId}.json`);
  let journal=await readJson<Journal>(path);
  if(journal)ensure(journal.version===1&&journal.manifestHash===manifestHash&&journal.shopId===shopId&&journal.productId===m.productId,'This product already has a different draft operation; refusing a second draft');
  else journal={version:1,manifestHash,productId:m.productId,shopId,createAttempted:false,images:[],files:[]};
  const save=()=>atomicJson(path,journal);
  const matches=(listing:EtsyListing)=>{
    ensure(listing.shopId===shopId&&listing.state==='draft','Remote listing is not this shop’s draft; no writes allowed');
    ensure(listing.title===m.listing.title&&listing.description===m.listing.description,'Remote listing content/identity changed');
    ensure(listing.taxonomyId===m.sale.taxonomyId&&listing.priceCurrencyCode===m.sale.currency&&Math.abs(listing.priceAmount-m.sale.price!)<0.001,'Remote sale metadata changed');
    ensure(JSON.stringify([...listing.tags].sort())===JSON.stringify([...m.listing.tags].sort()),'Remote listing tags changed');
  };
  const findExisting=async()=>{
    const matches:EtsyListing[]=[];let offset=0;
    for(;;){
      const page=await service.getListingsByShop({shopId,state:'draft',limit:100,offset});
      for(const listing of page.results)if(listing.description.includes(m.reference))matches.push(listing);
      offset+=page.results.length;
      if(offset>=page.count)break;
      ensure(page.results.length>0&&offset<100_000,'Draft pagination incomplete; cannot reconcile safely');
    }return matches;
  };
  if(journal.listingId===undefined){
    const found=await findExisting();
    ensure(found.length<=1,'Multiple drafts match the operation reference; manual review required');
    if(found[0]){
      ensure(journal.createAttempted,'Unmanaged matching draft exists; refusing to create or adopt it automatically');
      const candidate=await service.getListing(found[0].listingId);matches(candidate);journal.listingId=candidate.listingId;await save();
    }else{
      ensure(!journal.createAttempted,'Previous create outcome is uncertain. No duplicate will be created; retry read-only reconciliation later');
      journal.createAttempted=true;await save(); // durable intent BEFORE the non-idempotent POST
      const listing=await service.createListing({shopId,title:m.listing.title,description:m.listing.description,tags:m.listing.tags,
        priceAmount:m.sale.price!,quantity:999,whoMade:m.sale.whoMade as EtsyWhoMade,whenMade:m.sale.whenMade as EtsyWhenMade,
        taxonomyId:m.sale.taxonomyId!,listingType:'download',state:'draft'});
      ensure(Number.isSafeInteger(listing.listingId)&&listing.listingId>0,'Create response did not contain a listing ID');
      journal.listingId=listing.listingId;await save();
    }
  }
  const listingId=journal.listingId!;
  const guard=async()=>{const current=await service.getListing(listingId);matches(current);return current;};
  await guard();
  if(!journal.downloadSet){
    // Idempotent field assignment; checked draft only. Never sets state/renewal.
    await service.setDraftDownload(shopId,listingId);journal.downloadSet=true;await save();
  }
  ensure((await guard()).listingType==='download','Listing is not a digital download');
  ensure(!journal.pending,'An upload has an uncertain outcome; inspect the saved draft before continuing. No upload will be duplicated');
  for(const image of checked.images){
    const remote=await service.getListingImages(listingId);
    ensure(remote.length===journal.images.length&&remote.every(r=>journal!.images.some(j=>j.id===r.listing_image_id&&j.rank===r.rank)),'Unexpected remote images; no writes allowed');
    const done=journal.images.find(i=>i.rank===image.rank);
    if(done){ensure(done.sha256===image.sha256,'Image changed after upload');continue;}
    await guard();journal.pending=`image:${image.rank}`;await save();
    const result=await service.uploadListingImage({shopId,listingId,fileName:image.name,bytes:image.data,rank:image.rank,altText:`${m.productName}, preview ${image.rank} of ${checked.images.length}`});
    ensure(Number.isSafeInteger(result.listingImageId)&&result.listingImageId>0&&result.rank===image.rank,'Image upload response mismatch');
    journal.images.push({rank:image.rank,id:result.listingImageId,sha256:image.sha256});delete journal.pending;await save();
  }
  for(const file of checked.files){
    const remote=await service.getListingFiles(shopId,listingId);
    ensure(remote.length===journal.files.length&&remote.every(r=>journal!.files.some(j=>j.id===r.listing_file_id&&checked.files[j.rank-1]?.name===r.filename&&checked.files[j.rank-1]?.bytes===Number(r.size_bytes))),'Unexpected remote files; no writes allowed');
    const done=journal.files.find(f=>f.rank===file.rank);
    if(done){ensure(done.sha256===file.sha256,'File changed after upload');continue;}
    await guard();journal.pending=`file:${file.rank}`;await save();
    const result=await service.uploadDigitalFile({shopId,listingId,fileName:file.name,bytes:file.data,rank:file.rank});
    ensure(Number.isSafeInteger(result.listingFileId)&&result.listingFileId>0&&result.fileName===file.name,'File upload response mismatch');
    journal.files.push({rank:file.rank,id:result.listingFileId,sha256:file.sha256});delete journal.pending;await save();
  }
  const images=await service.getListingImages(listingId),files=await service.getListingFiles(shopId,listingId);
  ensure(images.length===10&&journal.images.every(i=>images.some(r=>r.listing_image_id===i.id&&r.rank===i.rank)),'Final image count/order mismatch');
  ensure(files.length===5&&journal.files.every(f=>files.some(r=>r.listing_file_id===f.id&&r.filename===checked.files[f.rank-1]?.name&&Number(r.size_bytes)===checked.files[f.rank-1]?.bytes)),'Final file count/identity mismatch');
  ensure((await guard()).listingType==='download','Final digital type mismatch');journal.complete=true;await save();
  return{listingId,state:'draft',type:'download',url:`https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    images:journal.images.map(i=>({name:checked.images[i.rank-1]!.name,rank:i.rank,listingImageId:i.id,status:'uploaded'})),
    files:journal.files.map(f=>({name:checked.files[f.rank-1]!.name,bytes:checked.files[f.rank-1]!.bytes,listingFileId:f.id,status:'uploaded'}))};
}
