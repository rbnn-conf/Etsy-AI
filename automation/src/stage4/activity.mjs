// Stage 4 Etsy API activity log (etsy/api-activity.json): one sanitized line
// per operation. Never headers, tokens, keys, request bodies or query strings.
import { classify } from './common.mjs';

export const OPERATIONS=Object.freeze({
  checkAuth:['GET','shop'],getShop:['GET','shop'],getListing:['GET','listing'],getListingsByShop:['GET','listings'],
  getListingImages:['GET','listing images'],getListingFiles:['GET','listing files'],getSellerTaxonomyNodes:['GET','seller taxonomy'],
  getPropertiesByTaxonomyId:['GET','taxonomy properties'],getListingProperties:['GET','listing properties'],
  createListing:['POST','listing (draft)'],uploadListingImage:['POST','listing image'],uploadDigitalFile:['POST','listing file'],
  updateListingProperty:['PUT','listing property'],activateListing:['PATCH','listing state=active'],
  getShopSections:['GET','shop sections'],createShopSection:['POST','shop section'],assignListingSection:['PATCH','listing shop_section_id']
});
export const WRITES=Object.freeze(['createListing','uploadListingImage','uploadDigitalFile','updateListingProperty','activateListing','createShopSection','assignListingSection']);

const remoteIdOf=v=>v?.listingImageId??v?.listingFileId??v?.propertyId??v?.listingId??v?.shopSectionId??v?.shopId??null;

/** Wrap an Etsy client so every call is recorded through `append(entry)`. */
export function withActivityLog(client,{append,now=()=>new Date(),sanitize=s=>s}){
  const out={};
  for(const [op,[method,resource]] of Object.entries(OPERATIONS)){
    if(typeof client[op]!=='function')continue;
    out[op]=async(...args)=>{
      const entry={at:now().toISOString(),operation:op,method,resource,write:WRITES.includes(op)};
      try{
        const r=await client[op](...args);
        await append({...entry,ok:true,remote_id:Array.isArray(r)?null:remoteIdOf(r),http_status:200,retry_count:0});
        return r;
      }catch(err){
        await append({...entry,ok:false,http_status:Number.isInteger(err?.status)?err.status:null,retry_count:0,error_code:classify(err),error:sanitize(err?.message??String(err),200)});
        throw err;
      }
    };
  }
  out.mode=client.mode;
  return out;
}
