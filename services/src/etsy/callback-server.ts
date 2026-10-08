import {timingSafeEqual,randomBytes} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createPkcePair,generateState,buildAuthorizationUrl,type EtsyOAuthClient} from './oauth.ts';
import {CONNECTION_SCOPES} from './connection-config.ts';
import type {TokenStore} from './token-store.ts';

export function constantEquals(a:string,b:string):boolean{
  const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function callbackHandler(options:{clientId:string;redirectUri:string;oauth:EtsyOAuthClient;store:TokenStore;lock:<T>(fn:()=>Promise<T>)=>Promise<T>;now?:()=>number}){
  const origin=new URL(options.redirectUri).origin,now=options.now ?? Date.now;
  // Verifier/state stay server-side. Restart invalidates pending authorization.
  let pending:{state:string;verifier:string;browser:string;expires:number}|undefined;
  let connectSession:{browser:string;expires:number}|undefined;
  return async(req:IncomingMessage,res:ServerResponse)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','text/html; charset=utf-8');
    const reply=(status:number,body:string)=>{res.statusCode=status;res.end(body);};
    try{
      if(req.headers.host!==new URL(origin).host)return reply(400,'Invalid host');
      const url=new URL(req.url ?? '/',origin);
      if(url.pathname==='/etsy/connect' && req.method==='GET'){
        connectSession={browser:randomBytes(32).toString('base64url'),expires:now()+600_000};
        res.setHeader('Set-Cookie',`__Host-etsy-connect=${connectSession.browser}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`);
        return reply(200,'<h1>Connect LumiumX to Etsy</h1><p>Requests only listings_r and listings_w. No listing is created by connecting.</p><form method="post" action="/etsy/connect"><button>Authorize my shop on Etsy</button></form>');
      }
      if(url.pathname==='/etsy/connect' && req.method==='POST'){
        const connectCookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-etsy-connect='))?.split('=')[1] ?? '';
        if(!connectSession||connectSession.expires<now()||!constantEquals(connectCookie,connectSession.browser))return reply(403,'Invalid or expired connection page. Reload it and try again.');
        connectSession=undefined;
        res.setHeader('Set-Cookie','__Host-etsy-connect=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        if(pending&&pending.expires>now())return reply(409,'Authorization already pending. Finish it or wait ten minutes.');
        if(await options.store.load())return reply(409,'A shop is already connected. Disconnect locally before reconnecting.');
        const pkce=createPkcePair(),browser=randomBytes(32).toString('base64url');
        pending={state:generateState(),verifier:pkce.codeVerifier,browser,expires:now()+600_000};
        res.setHeader('Set-Cookie',`__Host-etsy-oauth=${browser}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
        res.setHeader('Location',buildAuthorizationUrl({clientId:options.clientId,redirectUri:options.redirectUri,scopes:CONNECTION_SCOPES,state:pending.state,codeChallenge:pkce.codeChallenge}));
        return reply(303,'');
      }
      if(url.pathname==='/etsy/oauth/callback'&&req.method==='GET'){
        const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-etsy-oauth='))?.split('=')[1] ?? '';
        const state=url.searchParams.getAll('state');
        if(!pending||pending.expires<now()||state.length!==1||!constantEquals(state[0] ?? '',pending.state)||!constantEquals(cookie,pending.browser))return reply(400,'Invalid or expired authorization session. Start again.');
        const session=pending;pending=undefined; // single use, including denied/failed exchanges
        res.setHeader('Set-Cookie','__Host-etsy-oauth=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        if(url.searchParams.has('error'))return reply(400,'Etsy authorization was not granted. Start again when ready.');
        const codes=url.searchParams.getAll('code');if(codes.length!==1||!codes[0]||codes[0].length>2048)return reply(400,'Invalid authorization response');
        await options.lock(async()=>{
          if(await options.store.load())throw new Error('Already connected');
          const token=await options.oauth.exchangeAuthorizationCode({code:codes[0]!,redirectUri:options.redirectUri,codeVerifier:session.verifier});
          if(token.scopes&&[...token.scopes].sort().join(' ')!==[...CONNECTION_SCOPES].sort().join(' '))throw new Error('Unexpected scopes');
          await options.store.save(token);
        });
        res.setHeader('Location','/etsy/connected');return reply(303,'');
      }
      if(url.pathname==='/etsy/connected'&&req.method==='GET')return reply(200,'<h1>Authorization received</h1><p>Run the read-only connection check next. No listing has been created or published.</p>');
      return reply(404,'Not found');
    }catch{return reply(400,'Connection could not complete. No credentials were logged. Check server configuration and start again.');}
  };
}
