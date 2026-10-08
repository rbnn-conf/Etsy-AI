// Human-readable diagnostic report of a scoring result: raw Marketplace
// Insights values beside every calculated component, so the owner can see why
// one keyword beat another without reading code. Presentation rounds to one
// decimal place; the data keeps full precision.
import { WEIGHTS } from './scoring.mjs';

const f1=x=>x===null||x===undefined?'—':x.toFixed(1);
const raw=x=>x===null||x===undefined?'—':String(x);
const COLS=['#','keyword','relevance','searches_30d','search_results','conversion','trend %','demand','competition','conversion score','trend','relevance score','seasonality','FINAL','eligible','role'];

/** Markdown table: one row per evaluated keyword, raw data then calculated scores then decision. */
export function diagnosticsTable(result){
  const rows=result.diagnostics.map(r=>[r.rank??'',r.keyword,r.relevance_class,raw(r.searches_30d),raw(r.search_results),raw(r.conversion_label),raw(r.trend_percent),
    f1(r.demand_score),f1(r.competition_score),f1(r.conversion_score),`${f1(r.trend_score)}${r.trend_missing?'*':''}`,f1(r.relevance_score),
    `${f1(r.seasonality_score)}${r.seasonality_missing?'*':''}`,f1(r.final_opportunity_score),r.eligible_for_primary?'yes':'no',r.selected_role]);
  return [`| ${COLS.join(' | ')} |`,`|${COLS.map(()=>'---').join('|')}|`,...rows.map(c=>`| ${c.join(' | ')} |`)].join('\n');
}

/** Full plain-text report: table, decision reasons, selection, confidence and warnings. */
export function opportunityReport(result,{title='Opportunity analysis'}={}){
  const w=Object.entries(WEIGHTS).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(' · ');
  const out=[`## ${title}`,'',`> ${result.disclaimer}`,'',`Formula: ${result.formula.final} (weights: ${w}).`,
    '`*` = value not supplied, scored as neutral 50 (affects confidence, not the score).','',diagnosticsTable(result),'','### Why',''];
  for(const r of result.diagnostics)out.push(`- **${r.keyword}** (${r.selected_role}): ${r.decision_reasons.join('; ')}${r.market_weaknesses.length?`. Market signals: ${r.market_weaknesses.join('; ')}`:''}`);
  const cc=result.close_competition_detail;
  out.push('','### Selection','',
    `- PRIMARY: ${result.primary_keyword??'none (research_required)'}`,
    `- SECONDARY: ${result.secondary_keywords.join(', ')||'none'}`,
    `- SUPPORTING: ${result.supporting_keywords.join(', ')||'none'}`,
    `- REJECTED: ${result.rejected_keywords.map(x=>`${x.keyword} (${x.reasons.join(', ')})`).join('; ')||'none'}`,
    `- CLOSE COMPETITION: ${result.close_competition}${cc?` (#1 ${cc.first} ${f1(cc.first_score)} vs #2 ${cc.second} ${f1(cc.second_score)}: ${f1(cc.difference)} points; threshold ${cc.threshold.toFixed(1)})`:' (fewer than two eligible candidates)'}`,
    `- CONFIDENCE: ${result.confidence.toUpperCase()} (in this recommendation, from evidence completeness; not an Etsy prediction)`,
    ...result.confidence_triggers.map(t=>`  - ${t.level.toUpperCase()}: ${t.condition}: ${t.detail}`));
  if(result.warnings.length)out.push('','### Warnings','',...result.warnings.map(x=>`- ${x}`));
  return out.join('\n');
}
