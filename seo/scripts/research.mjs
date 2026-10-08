// Owner research workflow (ADR-034). Local files only.
//   npm --prefix seo run research -- <command> --dir <workspace>   (no arguments: usage)
// DISCOVERY IS NOT EVIDENCE: related Etsy terms have no market value until captured.
import { runResearchCommand } from '../src/workspace.mjs';

try{console.log(await runResearchCommand(process.argv.slice(2)));}
catch(e){console.error(`research: ${e.message}`);process.exitCode=1;}
