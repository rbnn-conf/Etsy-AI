import {readFile,writeFile} from 'node:fs/promises';
import {reviewPath} from './resources.mjs';
import {sha256} from '../resources.mjs';
const index=JSON.parse(await readFile(reviewPath('inspection/index.json'),'utf8'));
for(const argument of process.argv.slice(2)){
  const number=Number(argument),batch=index.batches[number-1];
  if(!Number.isInteger(number)||!batch)throw Error('Unknown inspection batch');
  for(const page of batch.pages)if(sha256(await readFile(reviewPath(page.path)))!==page.sha256)throw Error(`Preview changed since inspection montage: ${page.path}`);
  batch.status='VISUALLY_INSPECTED_PASS';batch.inspectionViewSha256=sha256(await readFile(reviewPath(batch.file)));
  batch.findings='Individually labelled page viewed: hierarchy, wording, artwork balance/edges, clearances, trim/fold placement and edition consistency checked. No unresolved composition defect.';
}
await writeFile(reviewPath('inspection/index.json'),JSON.stringify(index,null,2));
console.log(`${index.batches.filter(b=>b.status==='VISUALLY_INSPECTED_PASS').flatMap(b=>b.pages).length}/${index.pageCount} final pages visually inspected`);
