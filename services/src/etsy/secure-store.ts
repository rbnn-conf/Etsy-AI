import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {TokenStore} from './token-store.ts';
import type {EtsyTokenSet} from './oauth.ts';

export async function atomicJson(path:string,value:unknown):Promise<void>{
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=`${path}.${randomBytes(12).toString('hex')}.tmp`;
  const file=await open(temp,'wx',0o600);
  try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
  try{await rename(temp,path);}catch(error){await unlink(temp).catch(()=>{});throw error;}
}
export async function readJson<T>(path:string):Promise<T|undefined>{
  try{return JSON.parse(await readFile(path,'utf8')) as T;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new Error('Local state cannot be read; refusing to reset it');}
}
// Shared by callback, connection check and draft CLI: one deployment, one state volume.
// A crashed process leaves the lock in place deliberately; never steal a live lock.
export async function withConnectionLock<T>(dir:string,run:()=>Promise<T>):Promise<T>{
  await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,'connection.lock');
  let file;
  try{file=await open(path,'wx',0o600);}catch{throw new Error('Etsy connection busy or stale lock present; see recovery documentation');}
  try{await file.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return await run();}
  finally{await file.close();await unlink(path);}
}
export class EncryptedTokenStore implements TokenStore{
  readonly path:string;readonly key:Buffer;
  constructor(path:string,key:Buffer){if(key.length!==32)throw new Error('Token encryption key must be 32 bytes');this.path=path;this.key=key;}
  async load():Promise<EtsyTokenSet|undefined>{
    const envelope=await readJson<{version:number;iv:string;tag:string;data:string}>(this.path);
    if(!envelope)return undefined;
    try{
      if(envelope.version!==1)throw new Error();
      const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(envelope.iv,'base64'));
      decipher.setAAD(Buffer.from('lumiumx-etsy-token-v1'));
      decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString()) as EtsyTokenSet;
    }catch{throw new Error('Encrypted Etsy token store cannot be authenticated; do not overwrite it');}
  }
  async save(token:EtsyTokenSet):Promise<void>{
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from('lumiumx-etsy-token-v1'));
    const data=Buffer.concat([cipher.update(JSON.stringify(token)),cipher.final()]);
    await atomicJson(this.path,{version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
  }
  async clear():Promise<void>{await unlink(this.path).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});}
}
