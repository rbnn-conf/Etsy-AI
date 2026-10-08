import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {EncryptedTokenStore} from '../src/etsy/secure-store.ts';

test('encrypted store does not persist OAuth tokens in plaintext and detects tampering',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lumiumx-etsy-'));
  try{
    const path=join(dir,'token.enc.json'),store=new EncryptedTokenStore(path,randomBytes(32));
    await store.save({accessToken:'123.secret-access',refreshToken:'123.secret-refresh',tokenType:'Bearer',expiresIn:3600,obtainedAt:123});
    const raw=await readFile(path,'utf8');
    assert.doesNotMatch(raw,/secret-access|secret-refresh/);
    assert.equal((await store.load())?.refreshToken,'123.secret-refresh');
    const envelope=JSON.parse(raw);envelope.data=envelope.data.slice(0,-2)+'AA';await writeFile(path,JSON.stringify(envelope));
    await assert.rejects(()=>store.load(),/cannot be authenticated/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
