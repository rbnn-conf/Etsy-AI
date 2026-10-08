// Deterministic choice of the three proof pages (no model call, no cost).
const isEdge=p=>/cover|certificate|answer/i.test(p.page_type);
const ILLUSTRATIVE=/colou?r|scene|illustrat|picture|drawing/i;
const ACTIVITY=/maze|puzzle|match|count|trac|search|spy|spot|pattern|scramble|connect|dot|sudoku|activity|game/i;

export function selectProofPages(pages){
  if(!pages.length)throw new Error('Need at least 1 page to select proofs');
  // A 1- or 2-page product still gets 3 proofs (the review gate). The extra
  // proofs are labelled creative VARIATIONS of the main page, never extra
  // pages: page_count is unchanged.
  if(pages.length<3){
    const main=pages.find(p=>ILLUSTRATIVE.test(p.page_type))??pages[0], other=pages.find(p=>p.page_number!==main.page_number);
    return [
      {page_number:main.page_number,role:'primary',reason:`Primary proposed design (page ${main.page_number}, ${main.page_type}).`},
      other?{page_number:other.page_number,role:'different-composition',reason:`The product's other page (${other.page_type}) tests the direction on a second layout.`}
        :{page_number:main.page_number,role:'composition-variation',reason:`Same page, alternative composition: a real choice of layout within the same direction.`},
      {page_number:main.page_number,role:other?'composition-variation':'treatment-variation',
        reason:other?'Same page as proof 1, alternative composition.':'Same page, alternative treatment (colour emphasis, background, texture) within the same direction.'}
    ];
  }
  const pool=pages.filter(p=>!isEdge(p));
  const candidates=pool.length>=3?pool:pages;
  const picked=[];
  const take=(page,role,reason)=>{if(page&&!picked.some(x=>x.page_number===page.page_number))picked.push({page_number:page.page_number,role,reason});return !!page;};
  const used=()=>picked.map(x=>candidates.find(c=>c.page_number===x.page_number)?.page_type);

  const main=candidates.find(p=>ILLUSTRATIVE.test(p.page_type))??candidates[0];
  take(main,'main-style',`First ${ILLUSTRATIVE.test(main.page_type)?'illustration-led':'content'} page (${main.page_type}): sets the core illustration style.`);

  const second=candidates.find(p=>p.page_number!==main.page_number&&p.page_type!==main.page_type&&ACTIVITY.test(p.page_type))
    ??candidates.find(p=>p.page_number!==main.page_number&&p.page_type!==main.page_type)
    ??candidates.find(p=>p.page_number!==main.page_number);
  take(second,'different-composition',`A different page type (${second.page_type}) tests a different layout and activity structure.`);

  // Third: prefer a third distinct type from the later part of the book, to
  // test that the style holds away from the first pages.
  const later=[...candidates].reverse();
  const third=later.find(p=>!picked.some(x=>x.page_number===p.page_number)&&!used().includes(p.page_type))
    ??later.find(p=>!picked.some(x=>x.page_number===p.page_number));
  take(third,'consistency-check',`A later page (${third.page_type}, p${third.page_number}) checks the shared style stays consistent across the product.`);
  if(picked.length!==3)throw new Error('Need at least 3 pages to select proofs');
  return picked;
}

// Variation roles render the SAME page again with an explicit instruction.
export const VARIATIONS=Object.freeze({
  'composition-variation':'CREATIVE VARIATION: an alternative composition of this same page, not an additional page. Keep the same content, message and art direction; clearly change the arrangement, framing and focal placement.',
  'treatment-variation':'CREATIVE VARIATION: an alternative treatment of this same page, not an additional page. Keep the same content and art direction; vary the treatment within the palette and canvas: colour emphasis, background treatment, texture or lettering placement.'
});
const LABELS={primary:'Primary direction','composition-variation':'Composition variation','treatment-variation':'Treatment variation'};
/** Owner-facing label: variations are named as variations, pages as pages. */
export function proofLabel(sel,page){
  const where=`page ${sel.page_number}: ${page?.title??'untitled'}`;
  return LABELS[sel.role]?`${LABELS[sel.role]} (${where})`:where.replace(/^p/,'P');
}
