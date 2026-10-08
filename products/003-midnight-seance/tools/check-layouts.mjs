import {chromium} from 'playwright';
import {loadResources} from '../src/resources.mjs';
import {renderDocument} from '../src/render/document.mjs';
import {preflight} from '../src/render/preflight.mjs';
import {fixtureValues} from '../src/edit/validation.mjs';
const r=await loadResources(),browser=await chromium.launch({headless:true});
let failures=0;
try{for(const kind of ['invitation','welcome','word-search'])for(const size of (kind==='invitation'?['5x7','a4','us-letter']:kind==='welcome'?['8x10','a4','us-letter']:['a4','us-letter']))for(const scenario of (kind==='word-search'?['default']:['default','maximum-wide'])){
 const values=kind==='word-search'?null:fixtureValues(r.schemas,kind,scenario,r.defaults),page=await browser.newPage();
 await page.setContent(renderDocument({kind,theme:'full-colour',size,values},r));
 const probe=await preflight(page,r);await page.close();
 console.log(JSON.stringify({kind,size,scenario,issues:probe.issues}));if(probe.issues.length)failures++;
}}finally{await browser.close();}
if(failures)process.exitCode=1;
