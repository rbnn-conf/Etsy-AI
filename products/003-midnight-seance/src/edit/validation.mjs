export function validateFields(kind, values, schemas) {
  const schema = schemas[kind];
  if (!schema) return {valid:false,errors:['Unknown stationery type']};
  const errors = [];
  for (const key of Object.keys(values)) if (!schema[key]) errors.push(`Unknown field: ${key}`);
  for (const [key, rule] of Object.entries(schema)) {
    const value = values[key];
    if (typeof value !== 'string') {errors.push(`${rule.label}: enter text`);continue;}
    if (rule.required && !value.trim()) errors.push(`${rule.label}: required`);
    if ([...value].length > rule.max) errors.push(`${rule.label}: maximum ${rule.max} characters`);
    if (!/^[\p{Script=Latin}\p{N}\p{Zs}\n.,:;!?&@#()\[\]+'’“”"\-–—·/\\£$€%]*$/u.test(value)) errors.push(`${rule.label}: unsupported character; use Latin text and ordinary punctuation`);
  }
  return {valid:errors.length === 0,errors};
}
export function fixtureValues(schemas, kind, scenario, defaults) {
  const values = structuredClone(defaults[kind]);
  if (scenario === 'maximum') for (const [key, rule] of Object.entries(schemas[kind])) {
    const base = key === 'eventTitle' ? 'Midnight Romance & Revelations ' : key === 'rsvp' ? 'RSVP to Éléonore at hello@example.com · ' : 'Éléonore & Maximilian · The Nightingale House ';
    values[key] = [...base.repeat(5)].slice(0,rule.max).join('');
  }
  if (scenario === 'maximum-wide') for(const [key,rule] of Object.entries(schemas[kind]))values[key]='W'.repeat(rule.max);
  if (scenario === 'us') {
    values.eventTitle = 'Midnight Séance';values.host = 'Zoë & Gabriel';
    if (kind === 'invitation') Object.assign(values,{date:'Saturday, October 31, 2026',time:'7:00 PM – 11:00 PM',venue:'The Ravenwood Conservatory',address:'131 Ravenwood Lane · Salem, MA 01970',rsvp:'RSVP by October 24 · hello@example.com',dressCode:'Black tie, velvet & vintage lace'});
    else values.subtitle = 'Salem, Massachusetts · October 31, 2026';
  }
  if (scenario === 'special') {
    values.eventTitle = 'Séance d’Éléonore & Zoë';values.host = 'François, Søren & Chloë';
    if (kind === 'invitation') Object.assign(values,{venue:'L’Étoile — Café No. 7',address:'12 Rue de l’Église · £ / $ / €',rsvp:'Zoë’s RSVP: hello@example.com',dressCode:''});
    else Object.assign(values,{subtitle:'Café, curiosités & good company.',motto:''});
  }
  if (scenario === 'optional-empty') values[kind === 'invitation' ? 'dressCode' : 'motto'] = '';
  return values;
}
