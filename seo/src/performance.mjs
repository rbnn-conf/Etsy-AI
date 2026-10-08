// FUTURE performance feedback (foundation for SEO Engine v1.1): LumiumX's
// own listing results beside Marketplace Insights. v1 only VALIDATES and
// stores the shape. Nothing here feeds the opportunity score; scoring
// weights never change from performance data in v1 (tested).
//
// Nothing is fabricated: a value not captured is null. Derived metrics exist
// only when the raw values they need exist:
//   ctr             = clicks / views        (views > 0)
//   conversion_rate = orders / clicks       (clicks > 0)
//   roas            = revenue / spend       (spend > 0, same currency)
// "views" are listing views/impressions as reported by the source for the period.

export const PERFORMANCE_SCHEMA_VERSION=1;
export const PERFORMANCE_SOURCES=Object.freeze(['etsy_shop_stats','etsy_ads','manual']);
const RAW=['listing_id','period_start','period_end','views','clicks','orders','revenue','spend','currency','search_terms','captured_at','source'];
const DERIVED=['ctr','conversion_rate','roas'];
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)&&!Number.isNaN(Date.parse(v));
const div=(a,b)=>a!==null&&b!==null&&b>0?a/b:null;

/** @returns {ok, errors, observation}  observation has the derived metrics computed (or null) */
export function validatePerformance(raw){
  const e=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,errors:['performance observation must be an object'],observation:null};
  for(const k of Object.keys(raw))if(![...RAW,...DERIVED].includes(k))e.push(`unexpected field "${k}"`);
  for(const k of RAW)if(!(k in raw))e.push(`${k} is required (use null when not captured)`);
  if(typeof raw.listing_id!=='string'||!/^\d{6,15}$/.test(raw.listing_id))e.push('listing_id must be an Etsy listing id (digits, as a string)');
  for(const k of ['period_start','period_end'])if(!isDate(raw[k]))e.push(`${k} must be an ISO date`);
  if(isDate(raw.period_start)&&isDate(raw.period_end)&&Date.parse(raw.period_end)<Date.parse(raw.period_start))e.push('period_end is before period_start');
  for(const k of ['views','clicks','orders'])if(raw[k]!==null&&(!Number.isInteger(raw[k])||raw[k]<0))e.push(`${k} must be a whole number >= 0 or null`);
  for(const k of ['revenue','spend'])if(raw[k]!==null&&(typeof raw[k]!=='number'||!Number.isFinite(raw[k])||raw[k]<0))e.push(`${k} must be a number >= 0 or null`);
  if((raw.revenue!==null||raw.spend!==null)&&!/^[A-Z]{3}$/.test(raw.currency??''))e.push('currency (ISO 4217) is required when revenue or spend is recorded');
  if(raw.search_terms!==null&&(!Array.isArray(raw.search_terms)||raw.search_terms.some(t=>typeof t?.term!=='string'||!t.term.trim()||(t.count!==null&&(!Number.isInteger(t.count)||t.count<0)))))
    e.push('search_terms must be null or a list of {term, count} (count a whole number or null)');
  if(raw.captured_at!==null&&!isDate(raw.captured_at))e.push('captured_at must be an ISO date or null');
  if(!PERFORMANCE_SOURCES.includes(raw.source?.type)||typeof raw.source?.captured_by!=='string')e.push(`source must be {type: ${PERFORMANCE_SOURCES.join('|')}, captured_by}`);
  if(e.length)return {ok:false,errors:e,observation:null};
  const derived={ctr:div(raw.clicks,raw.views),conversion_rate:div(raw.orders,raw.clicks),roas:div(raw.revenue,raw.spend)};
  for(const k of DERIVED){
    if(raw[k]===undefined||raw[k]===null)continue;
    if(derived[k]===null)e.push(`${k} was supplied but the raw values it needs are missing: a derived metric cannot exist without its inputs`);
    else if(Math.abs(raw[k]-derived[k])>1e-9)e.push(`${k} is ${raw[k]} but its raw values give ${derived[k]}`);
  }
  if(e.length)return {ok:false,errors:e,observation:null};
  return {ok:true,errors:[],observation:{schema_version:PERFORMANCE_SCHEMA_VERSION,...Object.fromEntries(RAW.map(k=>[k,raw[k]])),...derived}};
}
