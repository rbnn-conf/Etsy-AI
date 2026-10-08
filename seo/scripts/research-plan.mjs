// Print SEO research plans for the committed fixtures (read-only).
//   node scripts/research-plan.mjs
// No network, no model, no Etsy: fixtures in, text out. No numbers are invented.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createResearchSet, validateIdea, validateProfile, createResearchPlan, researchPlanReport, planExistingListingResearch } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json'));
if(!idea.ok)throw new Error(idea.errors.join('; '));
console.log(researchPlanReport(createResearchPlan({idea:idea.idea})),'\n');

const f=await json('fixtures/marketplace-insights/manual-capture-01.json');
const research=createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by,note:f.note});
for(const id of ['004-cozy-spooky-halloween-colouring','005-cozy-autumn-adventures','006-cute-ghost-halloween','traditional-robin-christmas-card']){
  const g=planExistingListingResearch({snapshot:await json(`fixtures/listings/${id}.json`),profile:validateProfile(await json(`fixtures/profiles/${id}.json`)).profile,research});
  console.log(`EXISTING LISTING RESEARCH GAPS: ${id}\n`);
  console.log(`- already researched: ${g.existing_terms_already_researched.map(x=>x.term).join(', ')||'none'}`);
  console.log(`- needing research: ${g.existing_terms_needing_research.map(x=>x.term).join(', ')||'none'}`);
  console.log(`- new candidate queries: ${g.new_candidate_queries.map(q=>`${q.query} (${q.priority})`).join(', ')||'none'}`);
  for(const x of g.research_gaps)console.log(`- gap: ${x}`);
  console.log('');
}
