import {resolve,join} from 'node:path';
import {loadEtsyConfig} from '../config/env.ts';
export const CONNECTION_SCOPES=['listings_r','listings_w'] as const;
export const LOCAL_CALLBACK='https://localhost:8443/etsy/oauth/callback';
export const REPO=resolve(import.meta.dirname,'../../..');
export function connectionConfig(env:NodeJS.ProcessEnv=process.env){
  const base=loadEtsyConfig({env});
  if(!base.sharedSecret)throw new Error('ETSY_SHARED_SECRET is required');
  if(env.ETSY_OAUTH_SCOPES?.trim() && [...base.oauthScopes].sort().join(' ')!==[...CONNECTION_SCOPES].sort().join(' '))throw new Error('This workflow permits only listings_r listings_w');
  const redirectUri=base.oauthRedirectUri ?? LOCAL_CALLBACK;
  const url=new URL(redirectUri);
  if(url.protocol!=='https:'||url.pathname!=='/etsy/oauth/callback'||url.search||url.hash||url.username||url.password)throw new Error('Callback must be https://<host>/etsy/oauth/callback with no query or fragment');
  if(base.apiBaseUrl!=='https://api.etsy.com/v3'&&base.apiBaseUrl!=='https://openapi.etsy.com/v3')throw new Error('Production Etsy API origin must be an official HTTPS endpoint');
  const stateDir=resolve(env.ETSY_STATE_DIR?.trim() || join(REPO,'services/.secrets/etsy'));
  const port=Number(env.ETSY_CALLBACK_PORT || url.port || 8443);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid callback port');
  return {config:{...base,oauthScopes:CONNECTION_SCOPES,oauthRedirectUri:redirectUri},redirectUri,stateDir,
    tokenFile:resolve(env.ETSY_TOKEN_FILE?.trim() || join(stateDir,'token.enc.json')),
    keyFile:resolve(env.ETSY_TOKEN_KEY_FILE?.trim() || join(REPO,'services/.secrets/etsy-token.key')),
    tlsCert:resolve(env.ETSY_TLS_CERT_FILE?.trim() || join(REPO,'services/.secrets/localhost.pem')),
    tlsKey:resolve(env.ETSY_TLS_KEY_FILE?.trim() || join(REPO,'services/.secrets/localhost-key.pem')),
    host:env.ETSY_CALLBACK_HOST?.trim() || '127.0.0.1',port,
    shopId:env.ETSY_SHOP_ID?.trim() ? Number(env.ETSY_SHOP_ID) : undefined};
}
