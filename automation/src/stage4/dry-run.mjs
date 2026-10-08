// Stage 4 dry run (ETSY_STAGE4_DRY_RUN=true, the default): a simulated Etsy
// that makes ZERO network requests. It persists its simulated remote state in
// etsy/dry-run/remote.json so restarts behave like the real thing. It can
// never activate a listing. Taxonomy IDs here are SIMULATED, never real.
import { join } from 'node:path';
import { readJsonIf, writeJsonAtomic } from './common.mjs';

const TAXONOMY=[
  {id:990001,name:'Paper & Party Supplies',level:1,parentId:undefined},
  {id:990002,name:'Paper',level:2,parentId:990001},
  {id:990003,name:'Greeting Cards',level:3,parentId:990002},
  {id:990004,name:'Art & Collectibles',level:1,parentId:undefined},
  {id:990005,name:'Prints',level:2,parentId:990004}];
const PROPERTIES=[
  {propertyId:46803063641,name:'occasion',displayName:'Occasion',isMultivalued:false,possibleValues:['Christmas','Birthday','Halloween','Thanksgiving','Wedding'].map((n,i)=>({valueId:1000+i,name:n}))},
  {propertyId:200,name:'color',displayName:'Primary color',isMultivalued:false,possibleValues:['White','Green','Red','Gold','Blue','Brown'].map((n,i)=>({valueId:2000+i,name:n}))},
  {propertyId:52047899002,name:'secondary color',displayName:'Secondary color',isMultivalued:false,possibleValues:['White','Green','Red','Gold','Blue','Brown'].map((n,i)=>({valueId:3000+i,name:n}))}];

const blocked=m=>Object.assign(new Error(m),{name:'EtsyPublishBlockedError'});

export class DryRunEtsy{
  constructor({dir,shopId=12345678,currency='GBP'}){this.path=join(dir,'remote.json');this.shopId=shopId;this.currency=currency;this.mode='dry-run';}
  async #load(){const s=(await readJsonIf(this.path))??{next_id:1,listings:{},images:{},files:{},properties:{}};s.sections??=[];return s;}
  async #save(s){await writeJsonAtomic(this.path,s);}
  async checkAuth(){return {shopId:this.shopId,shopName:'DRY RUN SHOP',currency:this.currency,scopes:['listings_r','listings_w'],identity:'simulated'};}
  async getShop(){return {shopId:this.shopId,shopName:'DRY RUN SHOP',currencyCode:this.currency};}
  async getSellerTaxonomyNodes(){return TAXONOMY;}
  async getPropertiesByTaxonomyId(){return PROPERTIES;}
  async getListingsByShop({state='draft'}){const s=await this.#load();const r=Object.values(s.listings).filter(l=>l.state===state);return {count:r.length,results:r};}
  async getListing(id){const s=await this.#load();const l=s.listings[id];if(!l)throw Object.assign(new Error('Etsy API error: GET listing -> HTTP 404'),{name:'EtsyApiError',status:404});return l;}
  async createListing(i){
    const s=await this.#load();const id=900000000+s.next_id++;
    s.listings[id]={listingId:id,shopId:i.shopId,title:i.title,description:i.description,state:'draft',listingType:i.listingType??'download',
      priceAmount:i.priceAmount,priceCurrencyCode:this.currency,quantity:i.quantity,taxonomyId:i.taxonomyId,tags:[...(i.tags??[])],materials:[...(i.materials??[])],
      whoMade:i.whoMade,whenMade:i.whenMade,shippingProfileId:null,url:`dry-run://listing/${id}`};
    s.images[id]=[];s.files[id]=[];s.properties[id]=[];await this.#save(s);return s.listings[id];
  }
  async uploadListingImage(i){const s=await this.#load();const id=800000000+s.next_id++;s.images[i.listingId].push({listing_image_id:id,rank:i.rank});await this.#save(s);return {listingImageId:id,rank:i.rank,url:''};}
  async uploadDigitalFile(i){const s=await this.#load();const id=700000000+s.next_id++;s.files[i.listingId].push({listing_file_id:id,filename:i.fileName,rank:i.rank??1,size_bytes:i.bytes.length});await this.#save(s);return {listingFileId:id,fileName:i.fileName,rank:i.rank??1};}
  async getListingImages(id){return (await this.#load()).images[id]??[];}
  async getListingFiles(shopId,id){return (await this.#load()).files[id]??[];}
  async updateListingProperty(i){const s=await this.#load();const list=s.properties[i.listingId].filter(p=>p.propertyId!==i.propertyId);
    const v={propertyId:i.propertyId,propertyName:'',valueIds:[...i.valueIds],values:[...i.values]};list.push(v);s.properties[i.listingId]=list;await this.#save(s);return v;}
  async getListingProperties(shopId,id){return (await this.#load()).properties[id]??[];}
  // Shop sections (ADR-054), simulated. The dry run has the live default scopes (no shops_w), so a missing
  // section is reported exactly as it would be live; existing simulated sections are reused and assigned.
  async getShopSections(){return (await this.#load()).sections.map(s=>({...s}));}
  async createShopSection({title}){throw Object.assign(new Error('Dry run: shops_w is not granted; the section "'+title+'" would be created live only with that scope.'),{name:'EtsyAuthError',status:403});}
  async assignListingSection({listingId,shopSectionId}){const s=await this.#load();s.listings[listingId].shopSectionId=shopSectionId;await this.#save(s);return s.listings[listingId];}
  async activateListing(){throw blocked('Dry run: activation is never simulated or performed.');}
}
