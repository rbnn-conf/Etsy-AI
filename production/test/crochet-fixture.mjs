// Crochet pattern bundle TEST FIXTURE (ADR-040). Test data only: not a
// product, not tested by anyone, never shipped. A fresh copy per call so a
// test can break one field without affecting another.
export function crochetBundle({patterns=2}={}){
  const base=[
    {pattern_id:'fixture-daisy',name:'Fixture Daisy',category:'flower',difficulty:'beginner',finished_size:'About 5 cm across',
      yarn:[{description:'Cotton, white',colour:'white',amount:'About 5 m'},{description:'Cotton, yellow',colour:'yellow',amount:'About 2 m'}],
      yarn_weight:'3-light',hook_size:{mm:3,us:'D-3'},additional_materials:['Tapestry needle','Scissors'],
      stitches_used:['ch','sc','sl st'],abbreviations:{},gauge:'Not critical for this pattern.',
      instructions:[
        {heading:'Centre',steps:[{label:'Rnd 1',text:'With yellow, make a MR, 6 sc into the ring, sl st to the first sc.',stitch_count:6}]},
        {heading:'Petals',steps:[{label:'Rnd 2',text:'With white, *ch 8, sl st in the next st; rep from * around.',stitch_count:null}]}],
      assembly:['Sew the centre onto the petals with the yellow tail.'],
      finishing:['Fasten off and weave in all ends.']},
    {pattern_id:'fixture-leaf',name:'Fixture Leaf',category:'leaf',difficulty:'easy',finished_size:'About 6 cm long',
      yarn:[{description:'Cotton, green',colour:'green',amount:'About 4 m'}],
      yarn_weight:'3-light',hook_size:{mm:3,us:null},additional_materials:['Tapestry needle'],
      stitches_used:['ch','sc','hdc','dc'],abbreviations:{hdc:'half double crochet'},gauge:'Not critical for this pattern.',
      instructions:[{heading:'Leaf',steps:[{label:'Row 1',text:'Ch 10, sc in the 2nd ch from the hook, hdc, dc in the next 5 ch, hdc, sc; ch 1 and work along the other side.'}]}],
      finishing:['Fasten off and weave in the ends.']}];
  const list=Array.from({length:patterns},(_,i)=>{
    const p=structuredClone(base[i%base.length]);
    if(i>=base.length){p.pattern_id=`${p.pattern_id}-${i+1}`;p.name=`${p.name} ${i+1}`;}
    return p;
  });
  return {schema_version:1,format:'crochet-pattern-bundle',title:'Fixture Crochet Flowers',theme:'crochet flowers',
    audience:['adults','beginners'],skill_level:['beginner','easy'],delivery:['digital','printable'],style:['botanical'],
    pattern_count:list.length,terminology:'US',provenance:{author:'Test fixture',origin:'owner-authored',notes:null},
    abbreviations:{ch:'chain',sc:'single crochet',dc:'double crochet','sl st':'slip stitch',mr:'magic ring',st:'stitch',rep:'repeat',rnd:'round'},
    patterns:list};
}
