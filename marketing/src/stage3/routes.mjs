// Stage 3 ROUTE CONTRACTS (ADR-064): what makes a Factory, Hybrid or AI Creative hero structurally different.
//
// A route is a creative composition contract owned by code, not an adjective in a prompt. Each engine's hero
// gets a structured route (composition family, camera, page arrangement, environment, lighting, prop strategy,
// visual story, product focus, colour strategy, transformation demo). The route decides the backplate prompt's
// camera / environment / lighting / props lines and, for colouring books, the hero's code-built composition.
//
// Before any PAID hero environment image, routeGate compares the candidate route (and its scene brief) with the
// routes already produced for the same product. Deterministic: no model call, no image similarity. A brief that
// only repeats another route's motifs is redirected ONCE to the route's own code-written brief; a route that is
// still too similar is refused before the image call.
//
// Truth is unchanged: a route never adds a deliverable. The transformation demo shows a LABELLED coloured example
// next to the real line art; the example is never product art and never claimed as included.

/** Every structured dimension of a route. */
export const ROUTE_DIMENSIONS=Object.freeze(['composition_family','camera_angle','page_arrangement','environment','lighting','prop_strategy','visual_story','product_focus','colour_strategy','transformation_demo']);
/** The dimensions that make two routes materially different (lighting / colour / focus alone never do). */
export const MAJOR_DIMENSIONS=Object.freeze(['composition_family','camera_angle','page_arrangement','environment','prop_strategy','visual_story','transformation_demo']);
/** A route must differ from every other produced route on at least this many major dimensions. */
export const MIN_MAJOR_DIFFERENCES=3;
export const TRANSFORMATION_DEMO='line_art_plus_coloured_example';

// Motif groups a scene brief can use. Two briefs that share most of their motifs describe the same scene, whatever
// the wording: swapping tea for coffee, adding a blanket or moving leaves changes no group.
export const MOTIFS=Object.freeze({
  wood_surface:/\b(walnut|oak|wood(?:en)?|timber|desk|tabletop)\b/i,
  knit_textile:/\b(knit(?:ted)?|throw|blankets?|wool(?:len)?|cardigan|sweater)\b/i,
  hot_drink:/\b(mugs?|tea|coffee|cocoa|cups?)\b/i,
  seasonal_scatter:/\b(leaves|leaf|foliage|greenery|sprigs?|acorns?|pine ?cones?|pumpkins?|gourds?|petals?)\b/i,
  fairy_lights:/\b(string[- ]lights?|fairy[- ]lights?|bokeh)\b/i,
  candle:/\b(candles?|candlelit|candlelight|candlesticks?|flames?)\b/i,
  art_tools:/\b(pencils?|pens?|markers?|fine-?liners?|brushes?|crayons?)\b/i,
  window:/\b(window|daylight)\b/i,
  drape:/\b(velvet|drapes?|drapery|curtains?|fabric)\b/i,
  wall:/\b(plaster|walls?|backdrop)\b/i,
  stone:/\b(stone|marble|slate|concrete|terrazzo)\b/i,
  linen:/\blinen\b/i,
  metal:/\b(brass|bronze|pewter|gilded|tarnished)\b/i});
/** The default cosy-desk scene every route used to fall into. AI Creative must not use two or more of these together. */
export const COSY_DESK=Object.freeze(['wood_surface','knit_textile','hot_drink','fairy_lights']);
/** Briefs sharing at least this many motifs, at this Jaccard overlap or more, are the same scene. */
export const BRIEF_SHARED_MIN=3, BRIEF_JACCARD_MAX=0.6;

const seasonal=facts=>facts?.season?` with a few ${String(facts.season).toLowerCase()} touches`:'';

/**
 * The structured route contract of an engine's hero for this product. Code-owned and deterministic.
 * Colouring books: Hybrid demonstrates the transformation (real line art + labelled coloured example); AI Creative
 * is a single real page revealed in an editorial set; Factory is a clean catalogue presentation.
 */
export function routeContract(engine,facts={}){
  const colouring=facts.product_format==='colouring-book', s=seasonal(facts);
  if(engine==='factory')return {route:'factory',composition_family:'catalogue-flat-lay',camera_angle:'top-down',
    page_arrangement:'organised-catalogue',environment:'plain-neutral-surface',lighting:'even-soft-daylight',prop_strategy:'minimal',
    visual_story:'none',product_focus:'product-dominant',colour_strategy:'neutral-ground',transformation_demo:'none',
    prompt:{camera:'Seen from directly above (top-down flat lay), square to the surface, no perspective drama.',
      environment:'A plain, pale, matte surface (smooth pale stone), clean and uncluttered.',
      lighting:'Even, soft studio light with very light shadows, like a clean catalogue photograph.',
      props:'At most two small, restrained props at one edge; no narrative styling.',
      style:'Photographic and realistic: clean commercial catalogue photography, practical and repeatable, no clutter.'},
    // Motif-disjoint from the Hybrid brief (stone + studio light vs wood, linen and window light), so the brief gate never trips on code's own routes.
    brief:`Clean catalogue flat lay seen from directly above: a plain, pale stone surface, even soft studio light, ${colouring?'one coloured pencil':'one small plant sprig'} at one edge and nothing else.`,
    avoid_motifs:['knit_textile','hot_drink','fairy_lights','candle'],max_props:2};
  if(engine==='hybrid')return {route:'hybrid',composition_family:'styled-lifestyle',camera_angle:'three-quarter-overhead',
    page_arrangement:colouring?'line-art-beside-coloured-example':'product-in-styled-context',environment:'styled-home-surface',lighting:'warm-directional',
    prop_strategy:'tasteful-lifestyle',visual_story:'customer-use-moment',product_focus:'product-clear-in-context',colour_strategy:'campaign-palette',
    transformation_demo:colouring?TRANSFORMATION_DEMO:'none',
    prompt:{camera:'An overhead three-quarter view of the surface with gentle natural depth.',
      environment:`A styled home surface${s}: warm natural materials, tidy and inviting, a real moment of use.`,
      lighting:'Warm directional window or lamp light with soft shadows.',
      props:'A few tasteful lifestyle props at the edges (at most four); the centre stays clear.',
      style:'Photographic and realistic: shallow depth of field, warm natural light, restrained premium lifestyle styling, no clutter.'},
    brief:`Styled home tabletop${s}: warm wood, a folded linen cloth at one edge, ${colouring?'a few coloured pencils in a jar':'a small ceramic vase with a sprig'}, warm directional window light with soft shadows and gentle depth.`,
    avoid_motifs:[],max_props:4};
  if(engine==='ai-creative')return {route:'ai-creative',composition_family:'editorial-cinematic',camera_angle:'low-eye-level-depth',
    page_arrangement:colouring?'single-page-reveal':'product-reveal-with-depth',environment:'narrative-editorial-set',lighting:'dramatic-low-key',
    prop_strategy:'story-staging',visual_story:'campaign-narrative',product_focus:'hero-reveal-with-depth',colour_strategy:'bold-mood-contrast',transformation_demo:'none',
    prompt:{camera:'A low, near eye-level camera across the surface with strong foreground-to-background depth (a soft-focus foreground object, a sharp middle, a deep background).',
      environment:`An editorial still-life set${s} that tells the campaign story: a deep-toned backdrop (painted plaster wall or heavy fabric drape), one sculptural object, not a home desk.`,
      lighting:'Dramatic low-key light: a single directional pool of light on the surface, long soft shadows, rich contrast.',
      props:'One or two story objects, staged deliberately; no mug, no knitted throw, no string lights.',
      style:'Photographic and realistic: editorial, cinematic campaign photography with rich contrast and deliberate staging, no clutter.'},
    brief:`Editorial still-life set${s}, seen from a low eye-level angle with strong foreground-to-background depth: a deep-toned painted plaster backdrop, a heavy fabric drape at one side, a sculptural object in soft focus in the foreground and a single pool of light on an empty matte surface, long soft shadows.`,
    avoid_motifs:COSY_DESK,max_props:2};
  throw new Error(`Unknown marketing route "${engine}"`);
}

/** The route without its prompt text (what is stored with a direction and compared). */
export const routeOf=c=>Object.fromEntries(ROUTE_DIMENSIONS.map(k=>[k,c[k]]).concat([['route',c.route]]));

/** The motif groups a brief uses. */
export const briefMotifs=text=>Object.entries(MOTIFS).filter(([,re])=>re.test(String(text??''))).map(([k])=>k);

/** Do two briefs describe the same scene? {similar, shared, jaccard} */
export function briefSimilarity(a,b){
  const A=new Set(briefMotifs(a)), B=new Set(briefMotifs(b)), shared=[...A].filter(x=>B.has(x)), union=new Set([...A,...B]).size;
  const jaccard=union?shared.length/union:0;
  return {similar:shared.length>=BRIEF_SHARED_MIN&&jaccard>=BRIEF_JACCARD_MAX,shared,jaccard:+jaccard.toFixed(2)};
}

/** Motifs a route forbids that the brief uses (AI Creative: two or more cosy-desk motifs together). */
export function forbiddenMotifs(contract,brief){
  const used=briefMotifs(brief).filter(m=>(contract.avoid_motifs??[]).includes(m));
  return contract.route==='ai-creative'?(used.length>=2?used:[]):used;
}

/** Structural comparison of two routes. {distinct, differing, same} on the major dimensions. */
export function routeDistinctness(a,b){
  const differing=MAJOR_DIMENSIONS.filter(k=>a?.[k]!==b?.[k]), same=MAJOR_DIMENSIONS.filter(k=>a?.[k]===b?.[k]);
  return {distinct:differing.length>=MIN_MAJOR_DIFFERENCES,differing,same};
}

/**
 * Pre-image gate. `candidate` = {engine, route, brief}; `others` = the routes already produced for this product,
 * [{engine, route, brief}]. Returns {ok, structural:[problems], brief:[problems]}. A structural problem cannot be
 * fixed by rewording; a brief problem can be fixed once by the route's own brief (redirectBrief).
 */
export function routeGate(candidate,others){
  const structural=[], brief=[];
  for(const o of others.filter(x=>x&&x.engine!==candidate.engine)){
    const d=routeDistinctness(candidate.route,o.route);
    if(!d.distinct)structural.push(`${candidate.engine} route differs from ${o.engine} on only ${d.differing.length} of ${MAJOR_DIMENSIONS.length} major dimensions (${d.differing.join(', ')||'none'}); at least ${MIN_MAJOR_DIFFERENCES} are required`);
    const s=briefSimilarity(candidate.brief,o.brief);
    if(s.similar)brief.push(`${candidate.engine} scene brief repeats the ${o.engine} scene (shared motifs: ${s.shared.join(', ')}; overlap ${s.jaccard})`);
  }
  const contract=candidate.contract??null, forbidden=contract?forbiddenMotifs(contract,candidate.brief):[];
  if(forbidden.length)brief.push(`${candidate.engine} scene brief falls back to the default scene its route forbids (${forbidden.join(', ')})`);
  return {ok:!structural.length&&!brief.length,structural,brief};
}

/**
 * Gate with ONE bounded redirection, before a paid image: if only the brief is too similar, the route's own
 * code-written brief replaces it and the gate runs again. Never loops, never calls a model.
 * @returns {brief, redirected, problems} — problems non-empty means: do NOT call the image API.
 */
export function gateBeforeImage({engine,contract,brief,others}){
  const first=routeGate({engine,route:routeOf(contract),brief,contract},others);
  if(first.ok)return {brief,redirected:false,problems:[]};
  if(first.structural.length)return {brief,redirected:false,problems:first.structural};
  const second=routeGate({engine,route:routeOf(contract),brief:contract.brief,contract},others);
  return second.ok?{brief:contract.brief,redirected:true,reason:first.brief,problems:[]}:{brief:contract.brief,redirected:true,problems:[...second.structural,...second.brief]};
}

/** The route's lines in a backplate prompt (replaces the fixed camera line; one route never reads another's). */
export function routePromptLines(contract){
  const p=contract.prompt;
  return [`Route: ${contract.route} (${contract.composition_family}).`,`Camera: ${p.camera}`,`Environment: ${p.environment}`,`Lighting: ${p.lighting}`,`Props: ${p.props}`];
}

/** The route as the Creative Director sees it (code-owned; the model refines inside it, never changes it). */
export function routeForModel(contract){
  return {route:contract.route,...routeOf(contract),camera:contract.prompt.camera,environment:contract.prompt.environment,lighting:contract.prompt.lighting,props:contract.prompt.props,
    scene_brief_must_avoid:contract.route==='ai-creative'?'the default cosy desk: wooden desk + knitted throw + mug + string lights (two or more of these together is rejected)':(contract.avoid_motifs??[]).join(', ')||'nothing extra',
    example_brief:contract.brief};
}
