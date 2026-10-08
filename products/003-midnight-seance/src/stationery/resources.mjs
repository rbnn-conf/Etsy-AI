import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PRODUCT_ROOT,REPO_ROOT} from '../paths.mjs';
import {loadResources,sha256,jsonFile} from '../resources.mjs';
import {stationeryDefaults,stationerySchemas} from './content.mjs';
import sharp from 'sharp';
export const STATIONERY_REVIEW_ROOT=join(REPO_ROOT,'storage/products/003/prompt-04-polish-review');
export function reviewPath(...parts){
  const path=resolve(STATIONERY_REVIEW_ROOT,...parts);
  if(path!==STATIONERY_REVIEW_ROOT&&!path.startsWith(STATIONERY_REVIEW_ROOT+'\\')&&!path.startsWith(STATIONERY_REVIEW_ROOT+'/'))throw Error('Review path escapes Product 3');
  return path;
}
export async function loadStationeryResources(){
  const resources=await loadResources();
  resources.inventory=await jsonFile('content/prompt-04-inventory.json');
  resources.stationerySchemas={S01:resources.schemas.invitation,S03:resources.schemas.welcome,...stationerySchemas};
  resources.stationeryDefaults={S01:resources.defaults.invitation,S03:resources.defaults.welcome,...stationeryDefaults};
  resources.catalogue=await jsonFile('artwork/records/catalogue.json');
  const variants=await jsonFile('artwork/prompt-04-polish/manifest.json');
  resources.productionVariants=variants;
  resources.artwork={signature:{},economy:{}};
  for(const asset of resources.artworkManifest.assets){
    const bytes=await readFile(join(PRODUCT_ROOT,'artwork',asset.file));
    if(sha256(bytes)!==asset.sha256)throw Error(`Frozen artwork changed: ${asset.id}/${asset.treatment}`);
    const variant=variants.assets.find(v=>v.id===asset.id&&v.treatment===asset.treatment);
    if(variant&&variant.sourceSha256!==asset.sha256)throw Error('Stale production variant');
    const production=variant?await readFile(join(PRODUCT_ROOT,'artwork',variant.file)):bytes;
    if(variant&&sha256(production)!==variant.sha256)throw Error('Production variant changed');
    const {data,info}=await sharp(production).resize({width:128,height:128,fit:'inside'}).extractChannel('alpha').raw().toBuffer({resolveWithObject:true});
    resources.artwork[asset.treatment][asset.id]={src:`data:image/png;base64,${production.toString('base64')}`,pixels:variant?.pixels??asset.pixels,file:asset.file,productionFile:variant?.file??asset.file,mask:{width:info.width,height:info.height,data:data.toString('base64')}};
  }
  resources.stationeryHash=sha256(JSON.stringify({sourceHash:resources.sourceHash,inventory:resources.inventory,schemas:resources.stationerySchemas,defaults:resources.stationeryDefaults,productionVariants:variants.assets.map(({status,...asset})=>asset)}));
  return resources;
}
export function artworkMasks(resources){return Object.fromEntries(Object.entries(resources.artwork).map(([t,assets])=>[t,Object.fromEntries(Object.entries(assets).map(([id,a])=>[id,a.mask]))]));}
