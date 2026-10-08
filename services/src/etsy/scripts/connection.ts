import {createServer} from 'node:https';
import {readFile,mkdir,open} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {connectionConfig,REPO} from '../connection-config.ts';
import {EncryptedTokenStore,withConnectionLock,atomicJson} from '../secure-store.ts';
import {EtsyOAuthClient} from '../oauth.ts';
import {EtsyService} from '../etsy-service.ts';
import {callbackHandler} from '../callback-server.ts';
import {checkProduct,prepareManifest,ensure} from '../reviewed-product.ts';
import {createReviewedDraft,type Approval} from '../reviewed-draft.ts';
import type {TokenStore} from '../token-store.ts';

const [command,...args]=process.argv.slice(2);
const option=(name:string)=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
const product=resolve(option('--product') ?? join(REPO,'products/005-cozy-autumn-adventures'));
async function identity(service:EtsyService,store:TokenStore,shopId:number){
  // getShop is public; token's documented numeric prefix identifies its owner.
  // Never call users/me or request profile_r/shops_r just to check this shop.
  const token=await store.load();ensure(token,'Authorize the shop first');
  const userId=Number(token.accessToken.split('.')[0]);
  ensure(Number.isSafeInteger(userId)&&userId>0,'Invalid token owner identifier');
  const shop=await service.getShop(shopId);ensure(shop.shopId===shopId&&shop.userId===userId,'Authorized user does not own the configured shop');
  await service.getListingsByShop({shopId,state:'draft',limit:1});
  return{shopId:shop.shopId,shopName:shop.shopName,currency:shop.currencyCode,connection:'OK',mode:'read-only'};
}
/**
 * Safe one-line diagnosis of an Etsy error: operation, HTTP status, method,
 * path with numeric IDs redacted, and Etsy's short `error` text only when it
 * cannot contain credential material. Never headers, tokens, keys, cookies,
 * PKCE values, query strings or raw bodies.
 */
function etsyDiagnostic(operation:string,error:unknown):string{
  const e=error as {name?:string;status?:number;method?:string;path?:string;body?:unknown};
  const path=e.path?String(e.path).split('?')[0]!.replace(/\/\d+(?=\/|$)/g,'/{id}'):undefined;
  const raw=e.body&&typeof e.body==='object'&&typeof (e.body as {error?:unknown}).error==='string'?(e.body as {error:string}).error:undefined;
  // Withhold anything that could BE a credential value (not merely mention one).
  const text=raw===undefined?undefined:raw.length>300||/Bearer\s+\S{6,}|[A-Za-z0-9_\-]{24,}|\d+\.[A-Za-z0-9_\-]{8,}|[=:]\s*\S{16,}/i.test(raw)?'(withheld: may contain credential material)':raw;
  return `Diagnosis: operation=${operation} error=${e.name ?? 'unknown'}${e.status!==undefined?` http_status=${e.status}`:''}${e.method?` method=${e.method}`:''}${path?` path=${path}`:''}${text?` etsy_error="${text}"`:''}`;
}
try{
  if(command==='prepare'){
    const manifest=await prepareManifest(product);
    console.log(`Prepared listing/etsy-manifest.json for product ${manifest.productId}. Complete sale settings, inspect it, then explicitly approve. No Etsy calls.`);
  }else if(command==='preflight'){
    const checked=await checkProduct(product,!args.includes('--allow-unset-sale'));
    console.log(JSON.stringify({productId:checked.manifest.productId,manifestHash:checked.manifestHash,images:checked.images.length,files:checked.files.length,sourceCount:checked.manifest.sources.length,status:'PASS',ownerApproval:'not implied'},null,2));
  }else{
    const options=connectionConfig();
    if(command==='init-key'){
      await mkdir(resolve(options.keyFile,'..'),{recursive:true,mode:0o700});
      const file=await open(options.keyFile,'wx',0o600);
      try{await file.writeFile(randomBytes(32));await file.sync();}finally{await file.close();}
      console.log('Created local token encryption key. Key bytes were not printed. Back it up securely, separately from encrypted token data.');
    }else if(command==='approve'){
      const checked=await checkProduct(product),reviewer=option('--reviewer');
      ensure(args.includes('--approve')&&reviewer&&reviewer.trim().length>0,'Use --approve --reviewer <name> only after inspecting the exact manifest and artifacts');
      const approval:Approval={state:'APPROVED',productId:checked.manifest.productId,manifestHash:checked.manifestHash,reviewer,approvedAt:new Date().toISOString()};
      await withConnectionLock(options.stateDir,()=>atomicJson(join(options.stateDir,`approval-${approval.productId}.json`),approval));
      console.log('Owner approval recorded for this exact manifest. No Etsy calls.');
    }else{
      const store=new EncryptedTokenStore(options.tokenFile,await readFile(options.keyFile));
      const service=new EtsyService({config:options.config,tokenStore:store});
      if(command==='serve'){
        ensure(options.tlsCert&&options.tlsKey,'Set ETSY_TLS_CERT_FILE and ETSY_TLS_KEY_FILE to a trusted certificate/key for the callback hostname');
        const handler=callbackHandler({clientId:options.config.apiKey,redirectUri:options.redirectUri,
          oauth:new EtsyOAuthClient({clientId:options.config.apiKey,sharedSecret:options.config.sharedSecret!}),store,
          lock:fn=>withConnectionLock(options.stateDir,fn)});
        const server=createServer({cert:await readFile(options.tlsCert),key:await readFile(options.tlsKey),minVersion:'TLSv1.2'},handler);
        server.requestTimeout=30_000;server.headersTimeout=15_000;
        server.on('error',()=>{console.error('HTTPS callback server could not start. Check TLS files and listen address.');process.exitCode=1;});
        server.listen(options.port,options.host,()=>console.log(`Open ${new URL('/etsy/connect',options.redirectUri)} to authorize your shop. Exact Etsy callback: ${options.redirectUri}. No listing writes occur during connection.`));
      }else if(command==='shops'){
        // Read-only discovery of ETSY_SHOP_ID after authorization: one GET, no scope needed, no writes.
        // Prints only the shop name and numeric ID.
        const shop=await withConnectionLock(options.stateDir,async()=>{
          const token=await store.load();ensure(token,'Authorize the shop first (npm run etsy:connection -- serve)');
          const userId=Number(token.accessToken.split('.')[0]);   // Etsy tokens are "<user_id>.<secret>"
          ensure(Number.isSafeInteger(userId)&&userId>0,'Invalid token owner identifier');
          return service.getShopByOwnerUserId(userId);
        });
        ensure(shop,'The authorized Etsy user has no shop');
        console.log(`Shop name: ${shop.shopName}\nShop ID:   ${shop.shopId}`);
      }else if(command==='check'){
        ensure(Number.isSafeInteger(options.shopId)&&options.shopId!>0,'Set ETSY_SHOP_ID before checking the connection');
        const result=await withConnectionLock(options.stateDir,()=>identity(service,store,options.shopId!));
        console.log(JSON.stringify(result,null,2));
      }else if(command==='draft'){
        const checked=await checkProduct(product);
        ensure(options.shopId===checked.manifest.sale.shopId,'ETSY_SHOP_ID must match the reviewed manifest');
        const result=await withConnectionLock(options.stateDir,async()=>{
          await identity(service,store,options.shopId!);
          return createReviewedDraft(service,checked,options.stateDir);
        });
        console.log(JSON.stringify(result,null,2));
      }else throw new Error('Use prepare, preflight, init-key, serve, shops, check, approve or draft');
    }
  }
}catch(error){
  // Never stringify raw API errors, bodies, fetch causes, tokens or request URLs.
  const name=(error as Error).name;
  if(name.startsWith('Etsy')){
    console.error('Etsy request failed. Inspect local operation state and retry safely; credentials and response bodies were not logged.');
    console.error(etsyDiagnostic(command ?? '',error));
  }
  else if((error as NodeJS.ErrnoException).code)console.error('Required local configuration/state file is unavailable or locked. See docs/ETSY_CONNECTION.md.');
  else console.error((error as Error).message);
  process.exitCode=1;
}
