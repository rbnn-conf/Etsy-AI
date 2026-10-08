// In-memory Etsy for Stage 4 tests: behaves like the live client (mode 'live')
// but never touches the network. Failures can be injected per operation,
// before or AFTER the remote effect (a lost response), to prove that Stage 4
// reconciles instead of duplicating.
export const SECRET_TOKEN='98765432.S3cr3tAcc3ssT0kenValue_abcdefghijklmnop';
export const SECRET_KEY='keystring123456789abc:sharedsecretXYZ';
const NODES=[
  {id:1,name:'Paper & Party Supplies',level:1,parentId:undefined},
  {id:2,name:'Paper',level:2,parentId:1},
  {id:1296,name:'Greeting Cards',level:3,parentId:2},
  {id:66,name:'Art & Collectibles',level:1,parentId:undefined},
  {id:67,name:'Greeting Cards',level:2,parentId:66}];
const PROPS=[
  {propertyId:46803063641,name:'occasion',displayName:'Occasion',isMultivalued:false,possibleValues:[{valueId:19,name:'Christmas'},{valueId:20,name:'Birthday'}]},
  {propertyId:200,name:'color',displayName:'Primary color',isMultivalued:false,possibleValues:[{valueId:1,name:'Red'},{valueId:2,name:'Green'},{valueId:3,name:'White'}]},
  {propertyId:52047899002,name:'secondary color',displayName:'Secondary color',isMultivalued:false,possibleValues:[{valueId:1,name:'Red'},{valueId:2,name:'Green'}]}];

const err=(kind,op,status=400)=>kind==='network'
  ?Object.assign(new Error(`Network failure calling ${op} (Authorization: Bearer ${SECRET_TOKEN}; x-api-key ${SECRET_KEY})`),{name:'EtsyNetworkError'})
  :kind==='auth'?Object.assign(new Error('Etsy authentication failed (HTTP 403)'),{name:'EtsyAuthError',status:403})
  :Object.assign(new Error(`Etsy API error: ${op} -> HTTP ${status} token=${SECRET_TOKEN}`),{name:'EtsyApiError',status});

// Real Etsy stores text verbatim but READS it back HTML-encoded (Product #019: "Ghost's" -> "Ghost&#39;s").
export const etsyEncode=s=>String(s).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export class FakeEtsy{
  constructor({shopId=4242,currency='GBP',nodes=NODES,serverPublishEnabled=false,sections=[],scopes=['listings_r','listings_w'],encodeReads=true}={}){
    Object.assign(this,{shopId,currency,nodes,serverPublishEnabled,mode:'live',secrets:[SECRET_KEY],scopes,encodeReads});
    this.sections=sections.map(s=>({...s}));
    this.calls=[];this.fail={};this.listings=new Map();this.images=new Map();this.files=new Map();this.props=new Map();this.next=1;
  }
  /** One-shot failure: {kind:'network'|'http'|'auth', status?, after:true = remote effect happens, response is lost}. */
  failOnce(op,f){this.fail[op]=f;}
  #take(op,when){const f=this.fail[op];if(f&&(!!f.after)===(when==='after')){delete this.fail[op];throw err(f.kind,op,f.status);}}
  #rec(op){this.calls.push(op);}
  count(op){return this.calls.filter(c=>c===op).length;}
  get writes(){return this.calls.filter(c=>['createListing','uploadListingImage','uploadDigitalFile','updateListingProperty','activateListing','createShopSection','assignListingSection'].includes(c));}
  withLock(fn){return fn();}
  async checkAuth(){this.#rec('checkAuth');this.#take('checkAuth','before');return {shopId:this.shopId,shopName:'Test Shop',currency:this.currency,scopes:[...this.scopes],identity:'fake'};}
  async getSellerTaxonomyNodes(){this.#rec('getSellerTaxonomyNodes');return this.nodes;}
  async getPropertiesByTaxonomyId(){this.#rec('getPropertiesByTaxonomyId');return PROPS;}
  #read(l){const e=this.encodeReads?etsyEncode:s=>s;return {...l,title:e(l.title),description:e(l.description),tags:l.tags.map(e),materials:l.materials.map(e)};}
  async getListingsByShop({state='draft'}){this.#rec('getListingsByShop');const r=[...this.listings.values()].filter(l=>l.state===state).map(l=>this.#read(l));return {count:r.length,results:r};}
  async getListing(id){this.#rec('getListing');const l=this.listings.get(id);if(!l)throw err('http','GET listing',404);return this.#read(l);}
  async createListing(i){
    this.#rec('createListing');this.#take('createListing','before');
    if(i.state&&i.state!=='draft')throw new Error('fake: only drafts');
    const id=5000+this.next++;
    this.listings.set(id,{listingId:id,shopId:i.shopId,title:i.title,description:i.description,state:'draft',listingType:i.listingType,priceAmount:i.priceAmount,
      priceCurrencyCode:this.currency,quantity:i.quantity,taxonomyId:i.taxonomyId,tags:[...i.tags],materials:[...i.materials],whoMade:i.whoMade,whenMade:i.whenMade,
      shippingProfileId:null,url:`https://www.etsy.com/listing/${id}/robin-cards`});
    this.images.set(id,[]);this.files.set(id,[]);this.props.set(id,[]);
    this.#take('createListing','after');
    return this.getListing(id);
  }
  async uploadListingImage(i){
    this.#rec('uploadListingImage');this.#take('uploadListingImage','before');
    // Like Etsy, report the stored image's pixel size (read from the PNG header).
    const b=Buffer.from(i.bytes);
    const id=7000+this.next++;this.images.get(i.listingId).push({listing_image_id:id,rank:i.rank,full_width:b.readUInt32BE(16),full_height:b.readUInt32BE(20)});
    this.#take('uploadListingImage','after');return {listingImageId:id,rank:i.rank,url:''};
  }
  async uploadDigitalFile(i){
    this.#rec('uploadDigitalFile');this.#take('uploadDigitalFile','before');
    const id=9000+this.next++;this.files.get(i.listingId).push({listing_file_id:id,filename:i.fileName,rank:i.rank??1,size_bytes:i.bytes.length});
    this.#take('uploadDigitalFile','after');return {listingFileId:id,fileName:i.fileName,rank:i.rank??1};
  }
  async getListingImages(id){this.#rec('getListingImages');return (this.images.get(id)??[]).map(x=>({...x}));}
  async getListingFiles(shopId,id){this.#rec('getListingFiles');return (this.files.get(id)??[]).map(x=>({...x}));}
  async updateListingProperty(i){this.#rec('updateListingProperty');this.#take('updateListingProperty','before');
    const list=this.props.get(i.listingId).filter(p=>p.propertyId!==i.propertyId);const v={propertyId:i.propertyId,propertyName:'',valueIds:[...i.valueIds],values:[...i.values]};
    list.push(v);this.props.set(i.listingId,list);return v;}
  async getListingProperties(shopId,id){this.#rec('getListingProperties');return this.props.get(id)??[];}
  async activateListing({shopId,listingId,confirmation}){
    this.#rec('activateListing');
    if(!this.serverPublishEnabled)throw Object.assign(new Error('Publishing is disabled on this server'),{name:'EtsyPublishBlockedError'});
    if(confirmation!==`ACTIVATE ${listingId}`)throw Object.assign(new Error('bad confirmation'),{name:'EtsyPublishBlockedError'});
    this.#take('activateListing','before');
    const l=this.listings.get(listingId);if(l.shopId!==shopId||l.state!=='draft')throw new Error('fake: not an eligible draft');
    l.state='active';this.#take('activateListing','after');return {...l};
  }
  // Shop sections (ADR-054). Like Etsy, createShopSection needs shops_w.
  async getShopSections(shopId){this.#rec('getShopSections');this.#take('getShopSections','before');return this.sections.map(s=>({...s}));}
  async createShopSection({shopId,title}){
    this.#rec('createShopSection');this.#take('createShopSection','before');
    if(!this.scopes.includes('shops_w'))throw err('auth','POST shop section');
    const s={shopSectionId:3000+this.next++,title};this.sections.push(s);this.#take('createShopSection','after');return {...s};
  }
  async assignListingSection({shopId,listingId,shopSectionId}){
    this.#rec('assignListingSection');this.#take('assignListingSection','before');
    const l=this.listings.get(listingId);if(!l||l.shopId!==shopId)throw err('http','PATCH listing',404);
    l.shopSectionId=shopSectionId;this.#take('assignListingSection','after');return {...l};
  }
  /** Simulate the owner editing the draft on Etsy. */
  edit(listingId,changes){Object.assign(this.listings.get(listingId),changes);}
}
