// Product-format-aware page-count rules. "page_count" is the number of
// distinct designed printable pages/panels, each needing its own artwork —
// not the number of files or deliverable components. A folded greeting card
// (front, inside, back) is 3 pages; its printing guide is a component.
// The schemas only enforce the absolute range (1..60); these rules add the
// per-format minimum and maximum. Keep this table and the `product_format`
// enum in schemas/concepts.schema.json in sync (a test checks it).
export const PAGE_RULES=Object.freeze({
  'greeting-card':{min:1,max:4},
  'invitation':{min:1,max:4},
  'single-printable':{min:1,max:2},
  'printable-set':{min:2,max:30},
  'worksheet-bundle':{min:5,max:60},
  'planner':{min:5,max:60},
  'party-kit':{min:5,max:60},
  'activity-book':{min:10,max:60},
  'colouring-book':{min:10,max:60},
  // Crochet pattern bundle (ADR-041): page_count is the Stage 1 ARTWORK only (cover, representative
  // illustrations, a motif). The number of crochet patterns is separate (product.crochet.brief.pattern_count),
  // so a 33-pattern bundle never needs 33 artwork pages.
  'crochet-pattern-bundle':{min:1,max:3}
});
// Concepts stored before `product_format` existed keep the old fixed rule.
export const LEGACY_RULE=Object.freeze({min:5,max:60});
// Book wording in the free text always needs the book minimum, so a book
// cannot pass as a small format by being given the wrong product_format.
const BOOK_TEXT=/\b(colou?ring|activity|puzzle|sticker|work)[\s-]*books?\b|\bworkbooks?\b/i;
const BOOK_MIN=PAGE_RULES['activity-book'].min;

/**
 * Startup diagnostic: the page-count validation this PROCESS will actually
 * apply (schemas as loaded into memory, plus the rule table), with the
 * schema's absolute path and a short fingerprint. If a running bot's
 * fingerprint differs from `check-config` run now, the bot is stale.
 */
export async function validationDiagnostic(){
  const { loadSchema, schemaPath }=await import('./schema.mjs');
  const { createHash }=await import('node:crypto');
  const concepts=await loadSchema('concepts'), spec=await loadSchema('specification');
  const pc=concepts.properties.concepts.items.properties.page_count, sc=spec.properties.page_count;
  const fingerprint=createHash('sha256').update(JSON.stringify([concepts,spec,PAGE_RULES,LEGACY_RULE])).digest('hex').slice(0,12);
  return ['Stage 1 validation:',
    `  concepts schema: ${schemaPath('concepts')}`,
    `  concept page_count absolute range: ${pc.minimum}-${pc.maximum}; specification: ${sc.minimum}-${sc.maximum}`,
    `  format rules: loaded (${Object.keys(PAGE_RULES).length} formats) ${Object.entries(PAGE_RULES).map(([f,r])=>`${f} ${r.min}-${r.max}`).join(', ')}`,
    `  fingerprint: ${fingerprint}`];
}

/** Page-count problems for a concept or specification; [] when valid. */
export function pageCountProblems({product_format,product_type='',name='',page_count},path='$'){
  const rule=product_format===undefined?LEGACY_RULE:PAGE_RULES[product_format];
  if(!rule)return [`${path}.product_format: unknown format ${JSON.stringify(product_format)}`];
  const label=product_format??'a product without product_format';
  const e=[];
  if(BOOK_TEXT.test(`${product_type} ${name}`)){
    if(rule.max<BOOK_MIN)e.push(`${path}.product_format: ${label} contradicts product_type ${JSON.stringify(product_type)} (a book needs at least ${BOOK_MIN} pages)`);
    else if(page_count<BOOK_MIN)e.push(`${path}.page_count: ${page_count} is below ${BOOK_MIN} for a book (${JSON.stringify(product_type)})`);
  }
  if(page_count<rule.min)e.push(`${path}.page_count: ${page_count} is below ${rule.min} for ${label}`);
  if(page_count>rule.max)e.push(`${path}.page_count: ${page_count} is above ${rule.max} for ${label}`);
  return e;
}
