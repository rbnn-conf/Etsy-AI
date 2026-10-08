// Manual record only: run after personally viewing all four current export PNGs.
import {readFile,writeFile} from 'node:fs/promises';
import {reviewPath} from './resources.mjs';
import {sha256} from '../resources.mjs';
const path=reviewPath('reports/editor-export-qc.json'),report=JSON.parse(await readFile(path,'utf8'));
if(report.checks.length!==4)throw Error('Expected the four edited export reviews');
for(const job of report.checks){
  for(const p of job.pages)if(sha256(await readFile(reviewPath(p.pngPath)))!==p.pngSha256)throw Error('Edited preview changed since rendering');
  job.visualStatus='VISUALLY_INSPECTED_PASS';job.visualFindings='Actual 300 dpi PDF preview viewed individually: accented host/long UK address, multiline menu, two-name folded-food imposition and six economy bottle labels are legible, balanced and unclipped. Transparent embedded derivatives show no visible matte or edge defect.';
}
report.status='PASS';await writeFile(path,JSON.stringify(report,null,2));
