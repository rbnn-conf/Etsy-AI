// Shared production libraries. Stage 2 adds no dependency: like Products
// #005/#007 it reuses Product #004's installed sharp / pdf-lib / fflate and
// primitives, and Product #003's pdf.js renderer for true-render QC previews.
import { createRequire } from 'node:module';
import { mkdir, rename, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
export { hash, assert, validatePngStructure, verifyZip } from '../../products/004-cozy-spooky-coloring/src/core.mjs';

export const lib=createRequire(new URL('../../products/004-cozy-spooky-coloring/package.json',import.meta.url));
export const sharp=lib('sharp');
export const { PDFDocument, StandardFonts, rgb } = lib('pdf-lib');
export const { zipSync, unzipSync } = lib('fflate');
// Custom font embedding (brand wordmark) uses Product #003's installed fontkit.
export const fontkit=createRequire(new URL('../../products/003-midnight-seance/package.json',import.meta.url))('@pdf-lib/fontkit');

// Etsy's per-file limit, in conservative decimal MB (same as #004/#007).
export const ETSY_FILE_LIMIT=20_000_000;
// The project's safe size for ONE delivery file (ADR-066): equal to Stage 4's ETSY.fileBytesSafe (a test keeps them
// equal), so every part Stage 2 packs is a file Stage 4 accepts unchanged.
export const ETSY_FILE_SAFE=19_000_000;
// Split parts are packed on source bytes; this headroom covers the ZIP overhead Stage 4 adds when it plans a part.
export const PART_CAPACITY=ETSY_FILE_SAFE-100_000;
// Etsy's digital files per listing (a split package never needs more ZIP parts than this).
export const ETSY_FILES_MAX=5;
// Etsy digital file names: letters, digits, . _ - only, at most 70 characters.
export const ETSY_FILE_NAME=/^[A-Za-z0-9_.-]{1,70}$/;
export const mm=v=>v*72/25.4;

/** Render every page of a PDF to PNG with pdf.js (loaded lazily: it is slow to start). */
export async function renderPdf(path,{dpi=72,outPrefix}={}){
  const { inspectPdf }=await import('../../products/003-midnight-seance/src/render/pdf-preview.mjs');
  return inspectPdf(path,{dpi,outPrefix});
}
// Windows refuses to rename over (or delete) a file that another program holds open
// for a moment: an antivirus scan or the search indexer reading a file just written,
// or an editor re-reading it. Those codes are retried there with a short bounded
// backoff, then thrown unchanged. On other platforms they are real errors: no retry.
export const TRANSIENT_FS_CODES=Object.freeze(['EPERM','EBUSY','EACCES']);
export const RETRY_DELAYS_MS=Object.freeze([50,100,200,400]);   // 5 attempts in all
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function retryTransient(op,{platform=process.platform,delays=RETRY_DELAYS_MS,sleep=pause}={}){
  for(let i=0;;i++){
    try{return await op();}
    catch(e){if(platform!=='win32'||!TRANSIENT_FS_CODES.includes(e?.code)||i>=delays.length)throw e;await sleep(delays[i]);}
  }
}
/**
 * Write-then-rename so a crash never leaves a half-written output: the
 * destination is either the previous complete file or the new one. The temp
 * name is unique per write; a failed write removes its temp file.
 * `fs`/`platform`/`delays`/`sleep` are injectable for tests only.
 */
export async function atomicWrite(path,bytes,{fs={writeFile,rename,rm},...retry}={}){
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try{await fs.writeFile(tmp,bytes);await retryTransient(()=>fs.rename(tmp,path),retry);}
  catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e;}
}
/** Temp files atomicWrite makes: `<file>.tmp-<pid>` (older builds) or `<file>.tmp-<pid>-<8 hex>`. */
export const TEMP_FILE=/\.tmp-(\d+)(?:-[0-9a-f]{8})?$/;
export const STALE_TEMP_MS=10*60*1000;
/** True while `pid` is a running process (EPERM: it exists, owned by someone else). */
export const processAlive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e?.code==='EPERM';}};
/**
 * Remove abandoned atomicWrite temp files under `dir`. A temp file is removed
 * only when no writer can still own it: older than STALE_TEMP_MS (a write
 * renames within milliseconds), or made by a process that has ended. Nothing
 * else is touched; a file that cannot be removed now is left for next time.
 */
export async function removeStaleTemps(dir,{now=Date.now(),alive=processAlive,maxAgeMs=STALE_TEMP_MS}={}){
  let entries;
  try{entries=await readdir(dir,{recursive:true,withFileTypes:true});}catch(e){if(e?.code==='ENOENT')return [];throw e;}
  const removed=[];
  for(const e of entries){
    const m=e.isFile()&&TEMP_FILE.exec(e.name);
    if(!m)continue;
    const file=join(e.parentPath,e.name), info=await stat(file).catch(()=>null);
    if(!info||!(now-info.mtimeMs>maxAgeMs||!alive(Number(m[1]))))continue;
    try{await rm(file,{force:true});removed.push(file);}catch{}
  }
  return removed;
}
/** Deterministic PDF: fixed metadata and dates, so identical input gives identical bytes. */
export async function newPdf({title,date}){
  const pdf=await PDFDocument.create({updateMetadata:false});
  pdf.setTitle(title);pdf.setAuthor('LumiumX');pdf.setCreator('LumiumX production');pdf.setProducer('LumiumX production');
  pdf.setCreationDate(date);pdf.setModificationDate(date);
  return pdf;
}
export const savePdf=async pdf=>Buffer.from(await pdf.save({useObjectStreams:true}));
/** Deterministic ZIP: fixed entry times, stored in the given order. */
export function zipDeterministic(entries,date){
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([n,b])=>[n,[b,{mtime:date,level:9}]]))));
}
