// The ONLY automation module that imports the services Etsy client (enforced
// by test). Loaded by bot.mjs only when ETSY_STAGE4_DRY_RUN=false and
// ETSY_DRAFT_WRITES_ENABLED=true. Reuses the existing connection config
// (scopes pinned to listings_r listings_w), the AES-GCM encrypted token store
// with refresh, and the single-process connection lock.
import { readFile } from 'node:fs/promises';
import { connectionConfig } from '../../../services/src/etsy/connection-config.ts';
import { EncryptedTokenStore, withConnectionLock } from '../../../services/src/etsy/secure-store.ts';
import { EtsyService } from '../../../services/src/etsy/etsy-service.ts';
import { Stage4Error } from './common.mjs';

const REQUIRED_SCOPES=['listings_r','listings_w'];

export async function createLiveEtsy({env=process.env,shopId}){
  const options=connectionConfig(env);                // throws on missing secret / wrong scopes / non-Etsy origin
  const key=await readFile(options.keyFile).catch(()=>null);
  if(!key)throw new Stage4Error('AUTH_ERROR','The Etsy token encryption key file is missing. Run the connection setup (docs/ETSY_CONNECTION.md).',{retryable:false});
  const store=new EncryptedTokenStore(options.tokenFile,key);
  const service=new EtsyService({config:options.config,tokenStore:store});
  const bind=m=>service[m].bind(service);
  const client={mode:'live',
    /** Before any write: a stored token, the right scopes, and a token owner who owns ETSY_SHOP_ID. */
    async checkAuth(){
      const token=await store.load();
      if(!token)throw new Stage4Error('AUTH_ERROR','This Etsy shop is not connected yet (no stored OAuth token). Run the one-time connection (docs/ETSY_CONNECTION.md). Nothing was created.',{retryable:false});
      if(token.scopes&&!REQUIRED_SCOPES.every(s=>token.scopes.includes(s)))
        throw new Stage4Error('AUTH_ERROR',`The Etsy authorisation lacks ${REQUIRED_SCOPES.filter(s=>!token.scopes.includes(s)).join(' and ')}. Reconnect the shop granting listings_r and listings_w. Nothing was created.`,{retryable:false});
      const ownerId=Number(String(token.accessToken).split('.')[0]);   // Etsy tokens are "<user_id>.<secret>"
      const shop=await service.getShop(shopId);
      if(!(Number.isSafeInteger(ownerId)&&ownerId===shop.userId))throw new Stage4Error('AUTH_ERROR','The authorised Etsy user does not own ETSY_SHOP_ID. Nothing was created.',{retryable:false});
      await service.getListingsByShop({shopId,state:'draft',limit:1});   // proves listings_r with this token
      return {shopId:shop.shopId,shopName:shop.shopName,currency:shop.currencyCode,scopes:token.scopes??null,identity:'token owner owns the shop'};
    },
    getShop:bind('getShop'),getListing:bind('getListing'),getListingsByShop:bind('getListingsByShop'),
    createListing:bind('createListing'),uploadListingImage:bind('uploadListingImage'),uploadDigitalFile:bind('uploadDigitalFile'),
    getListingImages:bind('getListingImages'),getListingFiles:bind('getListingFiles'),getSellerTaxonomyNodes:bind('getSellerTaxonomyNodes'),
    getPropertiesByTaxonomyId:bind('getPropertiesByTaxonomyId'),getListingProperties:bind('getListingProperties'),
    updateListingProperty:bind('updateListingProperty'),activateListing:bind('activateListing'),
    // Shop sections (ADR-054): read, create (shops_w only), and the listing's shop_section_id via updateListing.
    getShopSections:bind('getShopSections'),createShopSection:bind('createShopSection'),
    assignListingSection:({shopId,listingId,shopSectionId})=>service.updateListing({shopId,listingId,shopSectionId}),
    /** One Etsy process per state directory (shared with the connection CLI). */
    withLock:fn=>withConnectionLock(options.stateDir,fn),
    secrets:[options.config.apiKey,options.config.sharedSecret].filter(Boolean)};
  return client;
}
