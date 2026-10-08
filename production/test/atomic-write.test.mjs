// Windows-safe atomic writes, stale temp cleanup and the per-product build lock.
// Local only: fake fs functions inject the Windows rename failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rename, rm, utimes, access } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, retryTransient, removeStaleTemps, RETRY_DELAYS_MS, TEMP_FILE } from '../src/lib.mjs';
import { withBuildLock, acquireBuildLock, releaseBuildLock, BuildLockedError, BUILD_LOCK, STALE_BUILD_LOCK_MS } from '../src/build-lock.mjs';

const scratch=async(fn)=>{const dir=await mkdtemp(join(tmpdir(),'dpf-atomic-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};
const exists=p=>access(p).then(()=>true,()=>false);
const fsErr=code=>Object.assign(new Error(`${code}: operation not permitted, rename 'x.tmp' -> 'x'`),{code});
/** A real fs whose first `n` renames fail with `code`; records each wait. */
const flaky=(code,n)=>{let left=n;const waits=[];
  return {waits,fs:{writeFile,rm,rename:async(a,b)=>{if(left>0){left--;throw fsErr(code);}return rename(a,b);}},sleep:async ms=>{waits.push(ms);}};};
const temps=async dir=>(await readdir(dir)).filter(n=>TEMP_FILE.test(n));

test('normal atomic write succeeds, replaces the destination and leaves no temp file',()=>scratch(async dir=>{
  const path=join(dir,'build-record.json');
  await atomicWrite(path,Buffer.from('{"v":1}\n'));
  await atomicWrite(path,Buffer.from('{"v":2}\n'));
  assert.equal(await readFile(path,'utf8'),'{"v":2}\n');
  assert.deepEqual(await temps(dir),[]);
}));

for(const code of ['EPERM','EBUSY','EACCES'])
  test(`Windows: first rename fails with ${code}, the retry succeeds after a short wait`,()=>scratch(async dir=>{
    const path=join(dir,'build-record.json'), f=flaky(code,1);
    await writeFile(path,'{"v":1}\n');
    await atomicWrite(path,Buffer.from('{"v":2}\n'),{fs:f.fs,platform:'win32',sleep:f.sleep});
    assert.equal(await readFile(path,'utf8'),'{"v":2}\n');
    assert.deepEqual(f.waits,[50]);
    assert.deepEqual(await temps(dir),[]);
  }));

test('Windows: backoff is 50/100/200/400 ms over 5 attempts, then the original error is thrown; destination keeps the last complete JSON',()=>scratch(async dir=>{
  const path=join(dir,'build-record.json'), f=flaky('EPERM',99);
  await writeFile(path,'{"complete":true}\n');
  await assert.rejects(atomicWrite(path,Buffer.from('{"complete":"new"}\n'),{fs:f.fs,platform:'win32',sleep:f.sleep}),e=>e.code==='EPERM'&&/rename/.test(e.message));
  assert.deepEqual(f.waits,[...RETRY_DELAYS_MS]);
  assert.deepEqual(f.waits,[50,100,200,400]);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{complete:true},'never partial or corrupt');
  assert.deepEqual(await temps(dir),[],'the failed write removes its temp file');
}));

test('Windows: four failures then success still writes the new file (attempt 5)',()=>scratch(async dir=>{
  const path=join(dir,'r.json'), f=flaky('EBUSY',4);
  await atomicWrite(path,Buffer.from('{"ok":1}\n'),{fs:f.fs,platform:'win32',sleep:f.sleep});
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{ok:1});assert.equal(f.waits.length,4);
}));

test('non-Windows platforms are unchanged: no retry, the error is thrown at once',async()=>{
  for(const platform of ['linux','darwin']){
    let calls=0;const waits=[];
    await assert.rejects(retryTransient(async()=>{calls++;throw fsErr('EPERM');},{platform,sleep:async ms=>{waits.push(ms);}}),{code:'EPERM'});
    assert.equal(calls,1);assert.deepEqual(waits,[]);
  }
});

test('other error codes are never retried, on any platform',async()=>{
  let calls=0;
  await assert.rejects(retryTransient(async()=>{calls++;throw fsErr('ENOENT');},{platform:'win32',sleep:async()=>{}}),{code:'ENOENT'});
  assert.equal(calls,1);
});

test('two overlapping writes to one file use distinct temp files and leave one complete version',()=>scratch(async dir=>{
  const path=join(dir,'build-record.json'), a=JSON.stringify({w:'a',pad:'x'.repeat(50000)}), b=JSON.stringify({w:'b',pad:'y'.repeat(50000)});
  await Promise.all([atomicWrite(path,Buffer.from(a)),atomicWrite(path,Buffer.from(b))]);
  assert.ok([a,b].includes(await readFile(path,'utf8')));
  assert.deepEqual(await temps(dir),[]);
}));

test('abandoned temp cleanup: removes old or dead-owner temps only; keeps a live writer\'s fresh temp and every other file',()=>scratch(async dir=>{
  const now=Date.now(), old=new Date(now-11*60*1000);
  const files={'build-record.json':'{}','build-record.json.tmp-18060':'old, live pid','qc-report.json.tmp-424242-0a1b2c3d':'dead pid',
    'build-record.json.tmp-777-deadbeef':'fresh, live pid','handoff.json':'{}','.build.lock':'{}','notes.tmp-x':'not ours'};
  for(const [n,c] of Object.entries(files))await writeFile(join(dir,n),c);
  await utimes(join(dir,'build-record.json.tmp-18060'),old,old);
  const alive=pid=>pid!==424242;
  const removed=(await removeStaleTemps(dir,{now,alive})).map(f=>f.split(/[\\/]/).at(-1)).sort();
  assert.deepEqual(removed,['build-record.json.tmp-18060','qc-report.json.tmp-424242-0a1b2c3d']);
  assert.deepEqual((await readdir(dir)).sort(),['.build.lock','build-record.json','build-record.json.tmp-777-deadbeef','handoff.json','notes.tmp-x']);
  assert.deepEqual(await removeStaleTemps(join(dir,'missing')),[],'a missing directory is not an error');
}));

test('build lock: a second build attempt is refused while the first holds the lock; released in finally, even on failure',()=>scratch(async dir=>{
  const lockPath=join(dir,BUILD_LOCK);
  await withBuildLock(dir,async()=>{
    assert.ok(await exists(lockPath));
    await assert.rejects(withBuildLock(dir,async()=>assert.fail('second build ran')),e=>e instanceof BuildLockedError&&e.retryable===true&&/already running/.test(e.message));
    assert.ok(await exists(lockPath),'the refused attempt never removes the active lock');
  });
  assert.ok(!await exists(lockPath),'released');
  await assert.rejects(withBuildLock(dir,async()=>{throw new Error('build failed');}),/build failed/);
  assert.ok(!await exists(lockPath),'released after a failure');
}));

test('build lock: an active lock of another live process on this host is never removed',()=>scratch(async dir=>{
  const holder={pid:process.ppid,host:hostname(),id:'other',at:new Date().toISOString()};
  await withBuildLock(dir,async()=>{}).catch(()=>{});   // creates production/
  await writeFile(join(dir,BUILD_LOCK),JSON.stringify(holder));
  await assert.rejects(acquireBuildLock(dir,{alive:()=>true}),BuildLockedError);
  assert.deepEqual(JSON.parse(await readFile(join(dir,BUILD_LOCK),'utf8')),holder);
  // Another machine's lock is not checked or stolen before it expires.
  await writeFile(join(dir,BUILD_LOCK),JSON.stringify({...holder,host:'other-host',pid:1}));
  await assert.rejects(acquireBuildLock(dir,{alive:()=>false}),BuildLockedError);
}));

test('build lock: stale locks are recovered safely (owner ended, expired, left by this process, unreadable and old)',()=>scratch(async dir=>{
  const path=join(dir,BUILD_LOCK), now=Date.now();
  await withBuildLock(dir,async()=>{});
  const cases=[
    [{pid:424242,host:hostname(),id:'dead',at:new Date(now).toISOString()},'owner process ended'],
    [{pid:process.ppid,host:hostname(),id:'old',at:new Date(now-STALE_BUILD_LOCK_MS-1000).toISOString()},'expired'],
    [{pid:process.pid,host:hostname(),id:'not-held',at:new Date(now).toISOString()},'left by this process']];
  for(const [holder,why] of cases){
    await writeFile(path,JSON.stringify(holder));
    const {lock,recovered}=await acquireBuildLock(dir,{alive:pid=>pid!==424242});
    assert.equal(recovered,why);
    assert.equal(JSON.parse(await readFile(path,'utf8')).id,lock.id,'the new lock replaced the stale one');
    await releaseBuildLock(dir,lock);assert.ok(!await exists(path));
  }
  // An unreadable lock is left alone while it may still be being written, recovered once old.
  await writeFile(path,'');
  await assert.rejects(acquireBuildLock(dir),BuildLockedError);
  const old=new Date(now-2*60*1000);await utimes(path,old,old);
  const {lock,recovered}=await acquireBuildLock(dir);assert.equal(recovered,'unreadable');await releaseBuildLock(dir,lock);
}));

test('build lock: release never removes a lock that another owner now holds',()=>scratch(async dir=>{
  const {lock}=await acquireBuildLock(dir), path=join(dir,BUILD_LOCK);
  const other={pid:process.ppid,host:hostname(),id:'other',at:new Date().toISOString()};
  await writeFile(path,JSON.stringify(other));
  await releaseBuildLock(dir,lock);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),other);
}));
