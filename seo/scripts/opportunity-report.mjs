// Print the opportunity diagnostics for the committed fixtures (read-only).
//   node scripts/opportunity-report.mjs [profile-id ...]
// No network, no model, no Etsy: fixtures in, text out.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createResearchSet, validateProfile, validateIdea, scoreOpportunities, opportunityReport, scoreBrief, createListingRecommendation } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const f=await json('fixtures/marketplace-insights/manual-capture-01.json');
const research=createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by,note:f.note});
const ids=process.argv.slice(2);
const all=['cozy-autumn-colouring-adults','004-cozy-spooky-halloween-colouring','005-cozy-autumn-adventures','006-cute-ghost-halloween','traditional-robin-christmas-card'];
for(const id of ids.length?ids:all){
  const v=validateProfile(await json(`fixtures/profiles/${id}.json`));
  if(!v.ok)throw new Error(`${id}: ${v.errors.join('; ')}`);
  const idea=v.profile.describes.mode==='NEW_PRODUCT'?validateIdea(await json(v.profile.describes.ref)).idea:null;
  console.log(opportunityReport(scoreOpportunities({profile:v.profile,research,extra_keywords:idea?.candidate_keywords??[]}),{title:id}));
  const show=(label,x)=>console.log(`- ${label}: ${typeof x==='string'?x:JSON.stringify(x)}`);
  if(idea){
    const b=scoreBrief({idea,profile:v.profile,research});
    console.log('\n### Positioning (NEW_PRODUCT brief)\n');
    show('POSITIONING',b.positioning?.statement??null);show('TITLE DIRECTION',b.title_direction);show('TAG CANDIDATES',b.tag_candidates.map(t=>t.tag));
    show('DESCRIPTION PLAN',b.description_keywords);show('THUMBNAIL INTENT',b.thumbnail_search_intent);show('STATUS',b.approval_status);
  }else{
    const r=createListingRecommendation({snapshot:await json(v.profile.describes.ref),profile:v.profile,research});
    console.log('\n### Existing listing recommendation (proposal only; product_action none, etsy_action none)\n');
    for(const k of ['current_primary_intent','recommended_primary_intent','primary_keyword_change','retained_terms','terms_to_add','terms_to_deemphasise','reasoning','title_direction',
      'description_keyword_plan','pricing_evidence','thumbnail_marketing_search_intent'])show(k,r[k]);
    show('tag_candidates',r.tag_candidates.map(t=>t.tag));
  }
  console.log('');
}
