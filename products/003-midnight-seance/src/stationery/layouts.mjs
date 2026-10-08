import {escapeText,field} from '../components/index.mjs';
import {invitation,welcome} from '../layouts/pages.mjs';
import {illustratedFrame} from '../components/artwork.mjs';

const signArt={S04:'D08',S05:'B04',S06:'A07',S07:'B05',S08:'B06'};
const f=(key,v,cls='')=>field(key,v[key]??'',cls);
function frame(art,small=false){return small?'<div class="small-frame" aria-hidden="true"></div>':illustratedFrame('stationery',art);}
function corners(art){return art('A01','formal-top-left')+art('A04','formal-bottom-right');}
function hero(id,art){return `<div class="stationery-hero">${art(id,'hero-art')}</div>`;}
function closing(art,id='A05'){return `<div class="stationery-closing">${art(id,'closing-art')}</div>`;}

export function stationeryLayout(item,values,art,size,index=0){
  if(item.id==='S01'){
    const title=field('eventTitle',values.eventTitle,'event-title'),host=field('host',values.host,'host');
    return invitation(values,art).replace('<div class="summons">','<div class="invitation-identity"><div class="summons">').replace(title,title+'</div>').replace('<div class="date-group">','<div class="invitation-details"><div class="date-group">').replace(host,host+'</div>');
  }
  if(item.id==='S03'){
    const host=field('host',values.host,'host'),ravens=art('B02','raven-pair','welcome-raven-focal');
    return welcome(values,size,art).replace(host+ravens,ravens+host);
  }
  const v=values,id=item.id;
  let content='';
  if(signArt[id]){
    const artwork=signArt[id];
    content=`${frame(art)}${art('A03','sign-botanical-left')}${art('A04','sign-botanical-right')}<div class="sign-content"><div class="collection-line">Midnight Séance</div>${hero(artwork,art)}${f('title',v,'sign-title')}${art('E04','engraved-separator')}${f('subtitle',v,'sign-subtitle')}${f('message',v,'sign-message')}<div class="sign-footer">${f('footer',v,'sign-phrase')}${closing(art)}</div></div>`;
  }else if(id==='S02'){
    content=`${frame(art)}${corners(art)}<div class="formal-content details-content"><div class="collection-line">Midnight Séance</div>${hero('B05',art)}${f('title',v,'formal-title')}<div class="detail-block"><div class="utility-label">Arrival</div>${f('arrival',v)}</div><div class="detail-block"><div class="utility-label">Dress for the night</div>${f('dress',v)}</div>${f('details',v,'body-copy')}${f('contact',v,'utility-copy')}${closing(art,'E05')}</div>`;
  }else if(id==='S09'||id==='S10'){
    content=`${frame(art)}${corners(art)}<div class="formal-content compact-sign"><div class="collection-line">Midnight Séance</div>${hero(id==='S09'?'B02':'B04',art)}${f('title',v,'compact-title')}${art('C02','formal-moon-phases')}${f('subtitle',v,'formal-subtitle')}${f('detail',v,'formal-detail')}${closing(art,'A05')}</div>`;
  }else if(id==='S11'){
    content=`${frame(art)}${corners(art)}<div class="formal-content menu-content">${hero('C01',art)}${f('title',v,'formal-title')}${['first','main','dessert'].map((key,i)=>`<div class="course"><div class="utility-label">${['First course','Main course','Dessert'][i]}</div>${f(key+'Name',v,'course-name')}${f(key+'Detail',v,'course-detail')}</div>`).join('')}${f('footer',v,'utility-copy')}${closing(art,'E05')}</div>`;
  }else if(id==='S12'){
    content=`${frame(art)}${corners(art)}<div class="formal-content drinks-content"><div class="collection-line">Midnight Séance</div>${hero('D03',art)}${f('title',v,'formal-title')}<div class="drink-list">${Array.from({length:6},(_,i)=>`<div class="drink-entry">${f('drink'+(i+1),v,'drink-name')}${f('detail'+(i+1),v,'drink-detail')}</div>`).join('')}</div>${closing(art,'E05')}</div>`;
  }else if(id==='S13'){
    const name=v.names.split('\n')[index];
    content=`${frame(art,true)}<div class="place-card-content">${art('C03','small-star')}${field('names',name,'guest-name')}${art('A09','small-leaf-divider')}</div>`;
  }else if(id==='S14'){
    const name=v.labels.split('\n')[index];
    content=`<div class="tent-back" aria-hidden="true">${art('C03','small-star')}</div><div class="tent-front">${frame(art,true)}<div class="food-card-content">${art('A09','small-leaf-divider')}${field('labels',name,'food-name')}${f('note',v,'food-note')}</div></div>`;
  }else if(id==='S15'){
    content=index===5?`${frame(art,true)}<div class="slim-potion-content">${f('name6',v,'potion-name')}<div class="horizontal-bottle">${art('D06','slim-potion-bottle')}</div>${f('detail',v,'potion-detail')}</div>`:`${frame(art,true)}<div class="potion-content">${art('D0'+(index+1),'potion-bottle')}<div class="potion-copy"><div class="utility-label">Midnight apothecary</div>${f('name'+(index+1),v,'potion-name')}${f('detail',v,'potion-detail')}</div></div>`;
  }else if(id==='S16'){
    content=`${frame(art,true)}<div class="tag-content">${hero('B06',art)}${f('message',v,'tag-message')}${f('host',v,'tag-host')}${closing(art,'E05')}</div>`;
  }else if(id==='S17'){
    content=`${frame(art)}${art('A06','guestbook-botanical')}<div class="guestbook-content"><div class="collection-line">Midnight Séance</div>${f('title',v,'guestbook-title')}${f('prompt',v,'guestbook-prompt')}<div class="writing-lines" aria-hidden="true">${'<div></div>'.repeat(11)}</div><div class="guestbook-name">${f('nameLabel',v,'name-label')}<span></span></div>${closing(art,'E05')}</div>`;
  }else if(id==='S18'){
    content=`${frame(art)}${corners(art)}<div class="formal-content thanks-content"><div class="collection-line">Midnight Séance</div>${hero('B06',art)}${f('title',v,'thanks-title')}${art('C02','formal-moon-phases')}${f('message',v,'thanks-message')}${f('signoff',v,'thanks-signoff')}${closing(art,'A05')}</div>`;
  }else throw Error(`Unimplemented master: ${id}`);
  return `<article class="design stationery master-${id} archetype-${item.archetype}" data-master="${id}" data-safe-mm="${item.archetype==='small'||item.archetype==='apothecary'?5:10}">${content}</article>`;
}

export function pieceCount(item,values){
  if(item.id==='S13')return values.names.split('\n').length;
  if(item.id==='S14')return values.labels.split('\n').length;
  return item.designCount??1;
}
