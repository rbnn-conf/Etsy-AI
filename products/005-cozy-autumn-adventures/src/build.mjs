import { build } from '../../004-cozy-spooky-coloring/src/build.mjs';
import { root,config } from './config.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
await mkdir(join(root,'qc'),{recursive:true});
await writeFile(join(root,'qc/production-report.json'),JSON.stringify({status:'BUILD IN PROGRESS',ready:false}));
const report=await build(root,{config});
if(report.status==='FAIL')process.exitCode=1;
