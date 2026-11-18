// The fixtures for the discovery "open in PLC" link (board T461): one case per line of the contract, each with the fragment a page would carry and what PLC's reader must answer.
//   node tests/helpers/make-resource-cases.mjs       writes tests/fixtures/discovery-opening/cases.json (tests/resource-link.test.mjs fails if the file differs from what this makes)
// aiofourown's page generator (T481) runs against that file: for every case with "page": "builds" it must produce exactly that fragment from "resource"; for every other case the reader must refuse with "code".
import {writeFileSync} from 'node:fs';
import {encodeResourceFragment,RESOURCE_LIMITS} from '../../chat/assistant/resource-link.mjs';

const SHA='3'.repeat(64);
export const valid=()=>({v:1,family:'preset-candidate',title:'Lantern Keeper',version:'1.0.0',bytes:585,sha256:SHA,license:'CC0-1.0',page:'https://cosmogenitor.example/characters/lantern-keeper'});
const b64=(text)=>{const bytes=new TextEncoder().encode(text);let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const frag=(object)=>'#resource='+b64(JSON.stringify(object));
const w=(over)=>({...valid(),...over});
const without=(k)=>{const o=valid();delete o[k];return o;};
export function cases(){
  const out=[];
  const add=(name,fragment,expect,note)=>out.push({name,fragment,expect,...(note?{note}:{})});
  const ok=encodeResourceFragment(valid());
  out.push({name:'valid',builds:valid(),fragment:ok,expect:'ok',note:'the canonical key order, compact JSON, UTF-8, base64url without padding'});
  out.push({name:'valid, license and title with non-ASCII text',builds:w({title:'Gardienne du phare',license:'CC-BY-4.0'}),fragment:encodeResourceFragment(w({title:'Gardienne du phare',license:'CC-BY-4.0'})),expect:'ok'});
  out.push({name:'valid with other parameters in the address',fragment:'x=1&'+ok.slice(1)+'&y=2',expect:'ok'});
  add('not a resource link: a preset link',  '#preset=eyJuYW1lIjoiQSIsInByb21wdCI6IkIifQ','none');
  add('not a resource link: a long fragment that names no resource','#'+'a'.repeat(5000),'none');
  add('not a resource link: empty','','none');
  add('too long (the whole fragment)','#resource='+'A'.repeat(RESOURCE_LIMITS.envelopeChars),'too-large');
  add('too long (the value)','#resource='+'A'.repeat(RESOURCE_LIMITS.valueChars+1),'too-large');
  add('two resource values',ok+'&'+ok.slice(1),'ambiguous');
  add('not base64url','#resource=%%%','not-json');add('not JSON','#resource='+b64('not json'),'not-json');add('not UTF-8','#resource=_w','not-json');
  add('JSON that is a list','#resource='+b64('[]'),'not-an-object');add('JSON that is text','#resource='+b64('"x"'),'not-an-object');
  add('an unknown field',frag({...valid(),extra:1}),'unknown-field');add('a credential-looking field',frag({...valid(),apiKey:'x'}),'unknown-field');
  for(const k of ['v','family','title','version','bytes','sha256','license','page'])add('missing '+k,frag(without(k)),'missing');
  add('a newer format',frag(w({v:2})),'version');add('v as text',frag(w({v:'1'})),'version');
  add('a family not released',frag(w({family:'presentation-package'})),'family');add('a family named like a property',frag(w({family:'constructor'})),'family');
  add('title blank',frag(w({title:'  '})),'bad-title');add('title with a line break',frag(w({title:'A\nB'})),'bad-title');add('title with a line separator',frag(w({title:'A B'})),'bad-title');
  add('title with a direction override',frag(w({title:'A‮B'})),'bad-title');add('title one unit too long',frag(w({title:'t'.repeat(121)})),'bad-title','120 UTF-16 code units, as PLC counts');
  add('title of 61 emoji (122 units)',frag(w({title:'\u{1F600}'.repeat(61)})),'bad-title');
  out.push({name:'title of 60 emoji (120 units)',builds:w({title:'\u{1F600}'.repeat(60)}),fragment:encodeResourceFragment(w({title:'\u{1F600}'.repeat(60)})),expect:'ok'});
  add('license blank',frag(w({license:''})),'bad-license');add('license too long',frag(w({license:'l'.repeat(121)})),'bad-license');add('license not text',frag(w({license:7})),'bad-license');
  add('version with a space',frag(w({version:'1 0'})),'bad-version');add('version empty',frag(w({version:''})),'bad-version');add('version too long',frag(w({version:'1'.repeat(65)})),'bad-version');
  add('bytes zero',frag(w({bytes:0})),'bad-bytes');add('bytes one over the family maximum',frag(w({bytes:32769})),'bad-bytes');add('bytes a fraction',frag(w({bytes:1.5})),'bad-bytes');add('bytes as text',frag(w({bytes:'585'})),'bad-bytes');
  out.push({name:'bytes at the family maximum',builds:w({bytes:32768}),fragment:encodeResourceFragment(w({bytes:32768})),expect:'ok'});
  add('sha256 in capitals',frag(w({sha256:'A'.repeat(64)})),'bad-sha256');add('sha256 too short',frag(w({sha256:'3'.repeat(63)})),'bad-sha256');add('sha256 with a prefix',frag(w({sha256:'sha256:'+SHA})),'bad-sha256');
  for(const [name,page] of [['http','http://cosmogenitor.example/a'],['credentials','https://user:pw@cosmogenitor.example/a'],['a port','https://cosmogenitor.example:8443/a'],['a fragment','https://cosmogenitor.example/a#x'],
    ['a token in the query','https://cosmogenitor.example/a?token=1'],['an api key in the query','https://cosmogenitor.example/a?api_key=1'],['a numeric host','https://192.168.1.2/a'],['localhost','https://localhost/a'],['a host without a dot','https://intranet/a'],
    ['a local host name','https://printer.local/a'],['not an address','not an address'],['a javascript address','javascript:alert(1)']])add('page: '+name,frag(w({page})),'bad-page');
  add('page: an address over 2,048 characters makes the whole fragment too long, which is checked first',frag(w({page:'https://cosmogenitor.example/'+'a'.repeat(2048)})),'too-large');
  out.push({name:'a field that would not fit: the page leaves the link out',builds:w({page:'https://cosmogenitor.example/'+'a'.repeat(1900),title:'t'.repeat(120)}),fragment:null,expect:'no-link',note:'encodeResourceFragment returns null above 2,048 characters: the page offers the download link only and never cuts a field'});
  return out;
}
if(import.meta.url===new URL(process.argv[1],'file:').href)writeFileSync(new URL('../fixtures/discovery-opening/cases.json',import.meta.url),JSON.stringify({about:'Cases for the discovery "Open in Private Local Chat" link (PLC T461, contract agreed with aiofourown). Made by tests/helpers/make-resource-cases.mjs. expect: ok = the reader returns that resource; none = this fragment holds no resource; any other value is the refusal code; no-link = the generator must leave the link out.',cases:cases()},null,1)+'\n');
