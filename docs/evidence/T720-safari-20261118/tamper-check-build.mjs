import {readFileSync,writeFileSync} from 'node:fs';
import {openAuthored} from '/cosmoshot/privatelocalchat/vendor/authored-profiles/neutral/index.mjs';
import {openPresentationBundle} from '/cosmoshot/privatelocalchat/chat/presentation/open-bundle.mjs';
import {makeRecord} from '/cosmoshot/privatelocalchat/chat/presentation/record.mjs';
const raw=readFileSync('/var/lib/cosmoshot/scratch-t520-commit/contracts/character-presentation/exports/harbour-clerk.bundle.json','utf8');
const r=await openPresentationBundle(raw,{openAuthored});const made=makeRecord({character:r.characters[0],assetBytes:r.assetBytes});
if(!made.ok)throw new Error(made.reason);
const D='/var/lib/cosmoshot/scratch-plc-t720b/';
const rec=JSON.parse(JSON.stringify(made.record));const id='preset-t720b';
const bad=JSON.parse(JSON.stringify(rec));{const b=Buffer.from(bad.images[0].data,'base64');b[b.length-1]^=1;bad.images[0].data=b.toString('base64');}
const preset=[{id,name:'Harbour Clerk (T720 check)',prompt:'Portray Harbour Clerk.'}];
const set=(map)=>`localStorage.setItem('plc.presets.v1',${JSON.stringify(JSON.stringify(preset))});localStorage.setItem('plc.presentations.v1',${JSON.stringify(JSON.stringify(map))});`;
writeFileSync(D+'pre.js',`return JSON.stringify({presets:localStorage.getItem('plc.presets.v1'),looks:localStorage.getItem('plc.presentations.v1'),build:(window.APP_BUILD||{}).commit||null,ua:navigator.userAgent})`);
writeFileSync(D+'inject-good.js',set({[id]:rec})+`return 'good injected'`);
writeFileSync(D+'inject-bad.js',set({[id]:bad})+`return 'tampered injected'`);
writeFileSync(D+'select.js',`const s=document.getElementById('presetSelect');if(!s)return 'no select';s.value='${id}';s.dispatchEvent(new Event('change',{bubbles:true}));return 'selected '+s.value`);
writeFileSync(D+'probe.js',`const st=document.getElementById('lookStrip');const w=document.querySelector('#lookControls .look-warning');const imgs=[...document.querySelectorAll('#lookStrip img')];return JSON.stringify({booted:window.__plcBooted===true,stripHidden:st?st.hidden||getComputedStyle(st).display==='none':null,palette:st&&st.dataset.palette||null,layout:st&&st.dataset.layout||null,images:imgs.length,imagesLoaded:imgs.every(i=>i.complete&&i.naturalWidth>0),warning:w?w.textContent.slice(0,120):null,messagePalette:document.getElementById('messages')&&document.getElementById('messages').getAttribute('data-look-palette'),stored:localStorage.getItem('plc.presentations.v1').length})`);
writeFileSync(D+'cleanup.js',`localStorage.removeItem('plc.presets.v1');localStorage.removeItem('plc.presentations.v1');return JSON.stringify([localStorage.getItem('plc.presets.v1'),localStorage.getItem('plc.presentations.v1')])`);
console.log('built; record bytes',JSON.stringify(rec).length);
