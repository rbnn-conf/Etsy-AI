// Stage 4 (ADR-026) shared helpers: typed errors, secret-safe messages,
// atomic JSON records. No network, no model client.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const sha256=b=>createHash('sha256').update(b).digest('hex');
/** Stable JSON (sorted keys) so hashes of records never depend on key order. */
export function canonical(v){
  if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;
  if(v&&typeof v==='object')return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const hashOf=v=>sha256(Buffer.from(canonical(v)));

/**
 * Error codes (stored on disk and shown in Telegram, always sanitized):
 * AUTH_ERROR · RATE_LIMIT · ETSY_VALIDATION_ERROR · ETSY_SERVER_ERROR · NETWORK_ERROR ·
 * REMOTE_DRIFT · LOCAL_ASSET_CHANGED · UPLOAD_FAILED · VERIFY_FAILED · PUBLISH_FAILED ·
 * PUBLISH_BLOCKED · CRITICAL_ACTIVE · UNCERTAIN_CREATE · CONFIG · TAXONOMY_UNRESOLVED ·
 * PAYLOAD_INVALID · DELIVERY_INVALID · INPUT_INVALID
 */
export class Stage4Error extends Error{
  constructor(code,message,{retryable=true}={}){super(message);this.name='Stage4Error';this.code=code;this.retryable=retryable;}
}

/** Map any thrown error (Etsy client or local) to a Stage 4 code. */
export function classify(err){
  if(err instanceof Stage4Error)return err.code;
  const n=err?.name??'', s=err?.status;
  if(n==='EtsyAuthError')return 'AUTH_ERROR';
  if(n==='EtsyRateLimitError')return 'RATE_LIMIT';
  if(n==='EtsyNetworkError')return 'NETWORK_ERROR';
  if(n==='EtsyPublishBlockedError')return 'PUBLISH_BLOCKED';
  if(n==='EtsyApiError')return s>=500?'ETSY_SERVER_ERROR':'ETSY_VALIDATION_ERROR';
  return 'UNKNOWN';
}
/**
 * Etsy stores the text we send verbatim but returns title, description, tags and
 * materials HTML-encoded on read ("Ghost's" comes back as "Ghost&#39;s"). Decode
 * ONLY character references, in ONE pass (so the literal text "&amp;#39;" stays
 * "&#39;"), before comparing with the approved text. Anything else that differs
 * is still a real difference.
 */
const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
export const decodeEtsyText=s=>typeof s!=='string'?s:s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g,(m,dec,hex,name)=>{
  if(name)return NAMED[name];
  const cp=dec!==undefined?Number(dec):parseInt(hex,16);
  return cp>0&&cp<=0x10FFFF&&!(cp>=0xD800&&cp<=0xDFFF)?String.fromCodePoint(cp):m;
});
/** True when Etsy definitely answered (so a write definitely did or did not happen). */
export const definiteResponse=err=>['EtsyAuthError','EtsyRateLimitError','EtsyApiError'].includes(err?.name)&&Number.isInteger(err?.status??429);

/**
 * Remove anything credential-like from text that may be stored or sent:
 * bearer tokens, Etsy token shapes (userId.secret), keystring:secret pairs,
 * JSON token fields, query strings, plus any known secret value.
 */
export function makeSanitizer(secrets=[]){
  const known=secrets.filter(s=>typeof s==='string'&&s.length>=6);
  return (text,max=400)=>{
    let t=String(text??'');
    for(const s of known)t=t.split(s).join('[redacted]');
    t=t.replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [redacted]')
      .replace(/\b\d{3,}\.[A-Za-z0-9_\-]{16,}\b/g,'[redacted-token]')
      .replace(/\b[a-z0-9]{16,}:[a-z0-9]{6,}\b/gi,'[redacted-key]')
      .replace(/("?(access_token|refresh_token|client_secret|shared_secret|x-api-key|code_verifier)"?\s*[:=]?\s*)"?[^",\s}]+"?/gi,'$1[redacted]')
      .replace(/(https?:\/\/[^\s?"]+)\?[^\s"]*/gi,'$1?[query-redacted]');
    return t.length>max?`${t.slice(0,max)}…`:t;
  };
}

export async function writeJsonAtomic(path,value){
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp,JSON.stringify(value,null,2)+'\n');
  try{await rename(tmp,path);}catch(e){await rm(tmp,{force:true});throw e;}
}
export async function writeBytesAtomic(path,bytes){
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp,bytes);
  try{await rename(tmp,path);}catch(e){await rm(tmp,{force:true});throw e;}
}
export async function readJsonIf(path){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e.code==='ENOENT')return null;throw new Stage4Error('INPUT_INVALID',`Stage 4 record cannot be read (${path.split(/[\\/]/).slice(-2).join('/')}); it is never reset automatically`,{retryable:false});}
}

// Etsy constraints verified against the official Open API v3 spec
// (https://www.etsy.com/openapi/generated/oas/3.0.0.json, fetched 2026-09-28)
// and Etsy Help "How to Manage Your Digital Listings".
export const ETSY=Object.freeze({
  titleMax:140,titlePattern:/[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/u,titleOnce:['%',':','&','+'],
  tagsMax:13,tagMax:20,tagPattern:/[^\p{L}\p{Nd}\p{Zs}\-'™©®]/u,
  materialPattern:/[^\p{L}\p{Nd}\p{Zs}]/u,
  whoMade:['i_did','someone_else','collective'],
  whenMade:['made_to_order','2020_2026','2010_2019','2007_2009','before_2007','2000_2006','1990s','1980s','1970s','1960s','1950s','1940s','1930s','1920s','1910s','1900s','1800s','1700s','before_1700'],
  quantityMax:999,
  // Digital files: up to 5 per listing, 20 MB each, names of at most 70 letters/digits/._- (Etsy Help).
  filesMax:5,fileBytesMax:20_000_000,fileNamePattern:/^[A-Za-z0-9_.-]{1,70}$/,
  // Delivery planning target: 5% headroom below the hard per-file cap (the cap itself is still enforced).
  fileBytesSafe:19_000_000,
  imagesMax:20
});
