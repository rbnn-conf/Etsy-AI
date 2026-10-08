export const stationeryDefaults={
  S02:{title:'Before the clock strikes twelve',arrival:'Doors open at 7:00 pm',dress:'Velvet, lace & a touch of mystery',details:'Join us for good company, candlelight and curious conversation.',contact:'Questions? Contact your host.'},
  S04:{title:'Drink if you dare',subtitle:'The midnight apothecary',message:'Choose a spirited sip or an alcohol-free spell.',footer:'Sip slowly. Strange things happen.'},
  S05:{title:'A feast after dark',subtitle:'Gather around the table',message:'Help yourself to something delicious.',footer:'Good food fuels great spirits.'},
  S06:{title:'Sweet temptations',subtitle:'A little indulgence',message:'Take a treat. Stay for the mystery.',footer:'The sweetest part of midnight.'},
  S07:{title:'Leave your mark',subtitle:'Our midnight guestbook',message:'Share a wish, a memory or a message for your hosts.',footer:'Some nights deserve to be remembered.'},
  S08:{title:'Parting charms',subtitle:'A small token of the night',message:'Please take a favour with our thanks.',footer:'Same souls. Brighter tomorrows.'},
  S09:{title:'Reserved',subtitle:'For our midnight guests',detail:'The Raven Table'},
  S10:{title:'Enter after dark',subtitle:'Good spirits welcome',detail:'Follow the candlelight. Your evening awaits.'},
  S11:{title:'Dinner Menu',firstName:'Autumn squash soup',firstDetail:'With sage cream',mainName:'Herb-roasted chicken',mainDetail:'Or wild mushroom risotto\nWith thyme and parmesan',dessertName:'Black velvet cake',dessertDetail:'With blackberry compote',footer:'Please ask your host about ingredients and allergens.'},
  S12:{title:'Signature sips',drink1:'Bramble after dark',detail1:'Gin, blackberry, lemon & soda',drink2:'Velvet midnight',detail2:'Vodka, cranberry & lime',drink3:'The golden hour',detail3:'Rum, ginger & orange',drink4:'Moonlit fizz',detail4:'Alcohol-free · apple, lemon & soda',drink5:'Rose garden tonic',detail5:'Alcohol-free · rose, lime & tonic',drink6:'Plum & circumstance',detail6:'Alcohol-free · plum, ginger & soda'},
  S13:{names:'Amélie Laurent\nOliver Reed\nChloë Bennett\nJames O’Neill\nMaya Patel\nEva-Marie Clark'},
  S14:{labels:'Wild mushroom risotto\nHerb-roasted chicken\nAutumn squash soup\nBlack velvet cake\nMoonlit fizz\nRose garden tonic',note:'Ask your host about ingredients & allergens.'},
  S15:{name1:'Witch’s Brew',name2:'Midnight Elixir',name3:'Spider Venom',name4:'Phantom Tonic',name5:'Bat Wings',name6:'Nightshade Nocturne',detail:'A fictional potion for a festive night'},
  S16:{message:'A little magic to take home',host:'With love from your midnight hosts'},
  S17:{title:'A memory from midnight',prompt:'A wish, a memory or a little advice…',nameLabel:'From'},
  S18:{title:'Thank you',message:'For sharing the candlelight, conversation and a little midnight magic.',signoff:'With love, your midnight hosts'}
};
const limit=(label,max,required=true,extra={})=>({label,max,required,...extra});
export const stationerySchemas={
  S02:{title:limit('Heading',42),arrival:limit('Arrival details',60),dress:limit('Dress code',70),details:limit('Additional information',150),contact:limit('Contact details',70,false)},
  S04:sign(),S05:sign(),S06:sign(),S07:sign(),S08:sign(),
  S09:{title:limit('Heading',26),subtitle:limit('Supporting wording',50,false),detail:limit('Table or party name',45)},
  S10:{title:limit('Heading',30),subtitle:limit('Supporting wording',50,false),detail:limit('Entrance message',90)},
  S11:{title:limit('Menu heading',26),...Object.fromEntries(['first','main','dessert'].flatMap(k=>[[`${k}Name`,limit(`${k} course name`,40)],[`${k}Detail`,limit(`${k} course description`,85,false,{maxLines:2})]])),footer:limit('Ingredient or dietary note',80,false)},
  S12:{title:limit('Drinks heading',26),...Object.fromEntries(Array.from({length:6},(_,i)=>[[`drink${i+1}`,limit(`Drink ${i+1} name`,32)],[`detail${i+1}`,limit(`Drink ${i+1} description`,55,false)]]).flat())},
  S13:{names:limit('Guest names — one per line',335,true,{maxLines:12,maxEntry:26})},
  S14:{labels:limit('Food, drink or table names — one per line',359,true,{maxLines:12,maxEntry:28}),note:limit('Ingredient or dietary note',55,false)},
  S15:{...Object.fromEntries(Array.from({length:6},(_,i)=>[`name${i+1}`,limit(`Potion ${i+1} name`,24)])),detail:limit('Short label description',40,false)},
  S16:{message:limit('Tag message',42),host:limit('Host or sign-off',45,false)},
  S17:{title:limit('Guestbook heading',40),prompt:limit('Writing prompt',70),nameLabel:limit('Name label',18)},
  S18:{title:limit('Heading',26),message:limit('Thank-you message',160),signoff:limit('Sign-off',65,false)}
};
function sign(){return {title:limit('Main heading',32),subtitle:limit('Supporting heading',46,false),message:limit('Guest instructions',110),footer:limit('Closing phrase',65,false)};}

export function validateStationery(id,values,schemas) {
  const rules=schemas[id],errors=[];
  if(!rules||!values||typeof values!=='object'||Array.isArray(values))return {valid:false,errors:['Invalid saved stationery']};
  for(const key of Object.keys(values))if(!Object.hasOwn(rules,key))errors.push(`Unexpected entry: ${key}`);
  for(const [key,rule] of Object.entries(rules)){
    const value=values[key];
    if(typeof value!=='string'){errors.push(`${rule.label}: enter text`);continue;}
    if(rule.required&&!value.trim())errors.push(`${rule.label}: required`);
    if([...value].length>rule.max)errors.push(`${rule.label}: use at most ${rule.max} characters`);
    if(!/^[\p{Script=Latin}\p{N}\p{M}\s.,;:!?&'’“”"()@+\-/–—£$€%·…]*$/u.test(value))errors.push(`${rule.label}: unsupported character`);
    const lines=value.split('\n');
    if(lines.length>(rule.maxLines??(key==='address'?3:key==='rsvp'?2:1)))errors.push(`${rule.label}: too many lines`);
    if(rule.maxEntry&&lines.some(line=>!line.trim()||[...line].length>rule.maxEntry))errors.push(`${rule.label}: use non-empty lines of at most ${rule.maxEntry} characters`);
  }
  return {valid:!errors.length,errors};
}

export function regionalFixture(defaults,id,region='uk'){
  const value=structuredClone(defaults[id]);
  if(region==='us')for(const key of Object.keys(value))value[key]=value[key].replace(/favour/g,'favor');
  if(id==='S01')Object.assign(value,region==='us'?{address:'1287 West Blackwood Avenue\nApartment 4B, Salem, MA 01970',host:'Chloë & James O’Neill'}:{address:'Flat 4, 128 Blackwood Gardens\nRoyal Tunbridge Wells, TN1 2AB',host:'Amélie & Eva-Marie'});
  return value;
}
