import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atomicJson} from '../src/etsy/secure-store.ts';
import {createReviewedDraft} from '../src/etsy/reviewed-draft.ts';
import type {CheckedProduct,Manifest} from '../src/etsy/reviewed-product.ts';
import type {EtsyListing} from '../src/etsy/types.ts';

test('reviewed draft retry reuses the journal and never creates or uploads twice',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lumiumx-draft-'));
  try{
    const manifestHash='a'.repeat(64),productId='005';
    const manifest={version:1,productId,productName:'Cozy Autumn Adventures',reference:'LX-005-test',
      listing:{title:'Cozy Autumn Adventures',description:'Reviewed text\n\nCollection reference: LX-005-test.',tags:['autumn activity']},
      sale:{shopId:77,price:6.5,currency:'GBP',taxonomyId:123,whoMade:'i_did',whenMade:'made_to_order'},
      evidence:[],sources:[],images:[],files:[]} satisfies Manifest;
    const checked={manifest,manifestHash,
      images:Array.from({length:10},(_,i)=>({path:`output/marketing/${String(i+1).padStart(2,'0')}-x.png`,name:`${String(i+1).padStart(2,'0')}-x.png`,rank:i+1,sha256:String(i+1).padStart(64,'0'),bytes:1,data:Buffer.from([i])})),
      files:Array.from({length:5},(_,i)=>({path:`output/etsy/f${i+1}.zip`,name:`f${i+1}.zip`,rank:i+1,sha256:String(i+11).padStart(64,'0'),bytes:2,data:Buffer.from([80,75])}))} satisfies CheckedProduct;
    await atomicJson(join(dir,'approval-005.json'),{state:'APPROVED',productId,manifestHash,reviewer:'owner',approvedAt:new Date().toISOString()});
    const listing:EtsyListing={listingId:900,shopId:77,title:manifest.listing.title,description:manifest.listing.description,state:'draft',listingType:'download',priceAmount:6.5,priceCurrencyCode:'GBP',quantity:999,taxonomyId:123,tags:manifest.listing.tags,url:'https://example.test/900'};
    let creates=0,imageUploads=0,fileUploads=0;
    const images:{listing_image_id:number;rank:number}[]=[],files:{listing_file_id:number;filename:string;rank:number;size_bytes:number}[]=[];
    const service={
      async getShop(){return{shopId:77,shopName:'Mine',userId:1,currencyCode:'GBP',isVacation:false,listingActiveCount:0,digitalListingCount:0,url:''};},
      async getSellerTaxonomyNodes(){return[{id:123,name:'Digital',level:1,parentId:undefined,path:['Digital']}];},
      async getListingsByShop(){return{count:creates?1:0,results:creates?[listing]:[]};},
      async createListing(){creates++;return listing;},async getListing(){return listing;},async setDraftDownload(){},
      async getListingImages(){return images;},async getListingFiles(){return files;},
      async uploadListingImage(input:{rank?:number}){imageUploads++;const value={listing_image_id:100+input.rank!,rank:input.rank!};images.push(value);return{listingImageId:value.listing_image_id,rank:value.rank,url:''};},
      async uploadDigitalFile(input:{rank?:number;fileName:string}){fileUploads++;const value={listing_file_id:200+input.rank!,filename:input.fileName,rank:input.rank!,size_bytes:2};files.push(value);return{listingFileId:value.listing_file_id,fileName:value.filename,rank:value.rank};}
    };
    const first=await createReviewedDraft(service as never,checked,dir);
    const second=await createReviewedDraft(service as never,checked,dir);
    assert.equal(first.listingId,900);assert.deepEqual(second,first);
    assert.equal(creates,1);assert.equal(imageUploads,10);assert.equal(fileUploads,5);
  }finally{await rm(dir,{recursive:true,force:true});}
});
