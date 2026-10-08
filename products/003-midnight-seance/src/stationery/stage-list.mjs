// Explicit milestone paths: no force-add of an entire ignored output tree.
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {PRODUCT_ROOT,REPO_ROOT} from '../paths.mjs';
import {reviewPath} from './resources.mjs';
const paths=new Set(),add=path=>paths.add(relative(REPO_ROOT,path).replaceAll('\\','/'));
const html=await readFile(reviewPath('REVIEW.html'),'utf8');
let linksChecked=0;
for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))if(!/^(?:https?:|data:|#)/.test(match[1])){await stat(reviewPath(match[1]));linksChecked++;}
if(!html.includes('Edited output checks'))throw Error('Review index omits edited PDF exports');
for(const file of ['docs/archive/product-3/PROMPT_04_POLISH_REPORT.md'])add(join(REPO_ROOT,file));
for(const entry of await readdir(join(PRODUCT_ROOT,'artwork/prompt-04-polish')))if(/\.png$|^manifest\.json$/.test(entry))add(join(PRODUCT_ROOT,'artwork/prompt-04-polish',entry));
for(const file of ['focused/index.html','FOCUSED-POLISH-REVIEW.png','BEFORE-AND-AFTER.png'])add(reviewPath(file));
for(const file of ['README.md','package.json','content/prompt-04-inventory.json','qc/prompt-04.json','tests/stationery-editing.test.mjs','tests/stationery-inventory.test.mjs'])add(join(PRODUCT_ROOT,file));
for(const entry of await readdir(join(PRODUCT_ROOT,'src/stationery')))if(entry.endsWith('.mjs'))add(join(PRODUCT_ROOT,'src/stationery',entry));
const manifest=JSON.parse(await readFile(reviewPath('page-format-manifest.json'),'utf8'));
for(const job of manifest.jobs){add(reviewPath(job.pdf));for(const p of job.pages)add(reviewPath(p.pngPath));}
const edited=JSON.parse(await readFile(reviewPath('reports/editor-export-qc.json'),'utf8'));
for(const job of edited.checks){add(reviewPath(job.pdf));for(const p of job.pages)add(reviewPath(p.pngPath));}
for(const file of ['.gitignore','REVIEW.html','EDITOR-PREVIEW.png','FULL-COLOUR-CONTACT-SHEET.png','ECONOMY-CONTACT-SHEET.png','EDITABLE-ITEMS-CONTACT-SHEET.png','SMALL-FORMAT-RELATIVE-SCALE.png','MULTI-UP-CONTACT-SHEET.png','MAXIMUM-CONTENT-CONTACT-SHEET.png','CONCEPT-COMPARISON.png','page-format-manifest.json','editor-field-manifest.json','inspection/index.json','editable/midnight-seance-stationery-editor.html','editable/editor-artwork-manifest.json','reports/committed-files.json'])add(reviewPath(file));
for(const theme of ['full-colour','economy'])for(const extension of ['png','jpg'])add(reviewPath(`S01-${theme}-digital.${extension}`));
for(const directory of ['contacts','telegram-review','reports'])for(const entry of await readdir(reviewPath(directory),{withFileTypes:true})){if(entry.isFile()&&!/failure|clearance\.png/.test(entry.name))add(reviewPath(directory,entry.name));}
const files=[...paths].sort();
await writeFile(reviewPath('reports/committed-files.json'),JSON.stringify({milestone:4,fileCount:files.length,files,note:'Explicit Product 3 milestone paths only; obsolete local editor assets, generated inspection composites, debug failures and unrelated user files are preserved but excluded.'},null,2));
let bytes=0;
for(const file of files){const size=(await stat(join(REPO_ROOT,file))).size;if(size>100*1024*1024)throw Error(`File exceeds GitHub size limit: ${file}`);bytes+=size;}
await writeFile(reviewPath('stage-paths.nul'),Buffer.from(files.join('\0')+'\0'));
console.log(JSON.stringify({files:files.length,totalMb:bytes/1024/1024,reviewLinksChecked:linksChecked,pathspec:relative(REPO_ROOT,reviewPath('stage-paths.nul')).replaceAll('\\','/')}));
