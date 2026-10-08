// One Stage 2 writer per product, across processes. Inside one bot the
// persisted product lock and the one-update-at-a-time loop already serialise
// steps; this file lock also covers a second bot process started mid-build
// (its restart recovery clears the product lock) or any other caller.
// The lock names its owner (pid, host, id); a lock whose owner can no longer
// be building is recovered, an active one is never removed.
import { open, readFile, rm, stat, mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { processAlive, retryTransient } from './lib.mjs';

export const BUILD_LOCK='production/.build.lock';
// A build takes minutes; an older lock is expired even if its pid was reused.
export const STALE_BUILD_LOCK_MS=2*60*60*1000;
// A lock file is written right after it is created; an empty or unreadable one younger than this may still be mid-write.
const UNREADABLE_GRACE_MS=60*1000;
const held=new Set();   // ids of the locks this process holds now

/** Another process is building this product now. Retry after it finishes; nothing was changed. */
export class BuildLockedError extends Error{
  constructor(holder){super(`Production is already running for this product (process ${holder?.pid??'unknown'} since ${holder?.at??'unknown'}).`);this.name='BuildLockedError';this.retryable=true;this.holder=holder;}
}

async function readLock(path){
  const info=await stat(path).catch(()=>null);
  if(!info)return null;
  let holder=null;
  try{const h=JSON.parse(await readFile(path,'utf8'));if(Number.isInteger(h?.pid)&&h.id&&h.at&&h.host)holder=h;}catch{}
  return {holder,mtimeMs:info.mtimeMs};
}

/** Why an existing lock no longer protects a build, or null while it is active. */
export function staleReason(lock,{now=Date.now(),alive=processAlive,host=hostname()}={}){
  const h=lock?.holder;
  if(!h)return now-(lock?.mtimeMs??0)>UNREADABLE_GRACE_MS?'unreadable':null;
  if(now-Date.parse(h.at)>STALE_BUILD_LOCK_MS)return 'expired';
  if(h.host!==host)return null;   // cannot check another machine's processes: wait for expiry
  if(h.pid===process.pid)return held.has(h.id)?null:'left by this process';
  return alive(h.pid)?null:'owner process ended';
}

/**
 * Take the product's build lock or throw BuildLockedError. A stale lock is
 * removed only if it is still the same lock that was judged stale.
 * Returns {lock, recovered} (recovered: the reason a stale lock was replaced).
 */
export async function acquireBuildLock(productDir,{now=()=>Date.now(),alive=processAlive,host=hostname()}={}){
  const path=join(productDir,BUILD_LOCK);
  await mkdir(dirname(path),{recursive:true});
  let recovered=null;
  for(let attempt=0;attempt<3;attempt++){
    const lock={pid:process.pid,host,id:randomUUID(),at:new Date(now()).toISOString()};
    try{
      const fh=await open(path,'wx');
      try{await fh.writeFile(`${JSON.stringify(lock)}\n`);}finally{await fh.close();}
      held.add(lock.id);
      return {lock,recovered};
    }catch(e){if(e?.code!=='EEXIST')throw e;}
    const cur=await readLock(path);
    if(!cur)continue;   // released meanwhile
    const why=staleReason(cur,{now:now(),alive,host});
    if(!why)throw new BuildLockedError(cur.holder);
    const again=await readLock(path);
    if(JSON.stringify(again?.holder)!==JSON.stringify(cur.holder))continue;   // replaced meanwhile: judge again
    await retryTransient(()=>rm(path,{force:true}));
    recovered=why;
  }
  throw new BuildLockedError((await readLock(path))?.holder);
}

/** Release only our own lock; a lock that cannot be removed now is recovered by the next build. */
export async function releaseBuildLock(productDir,lock){
  held.delete(lock.id);
  const path=join(productDir,BUILD_LOCK), cur=await readLock(path);
  if(cur?.holder?.id===lock.id)await retryTransient(()=>rm(path,{force:true})).catch(()=>{});
}

/** Run `fn` holding the product's build lock; always released in finally. */
export async function withBuildLock(productDir,fn,opts){
  const {lock,recovered}=await acquireBuildLock(productDir,opts);
  try{return await fn({lock,recovered});}
  finally{await releaseBuildLock(productDir,lock);}
}
