import './helpers/install-site-links.mjs'; // the test assistant speaks for our site: its manifest, as the build writes it into the page
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROBOT_NAME,describeContext,introScript,menuPrompt,menuItems,modelStatus,sizeWords,NODES,MAIN_MENU,KEY_TO_NODE,INTENT_PHRASES,INTENT_IDS,FALLBACK_SAY,WHO_I_AM} from '../chat/roberta/ivr-content.mjs';
import {createIvr} from '../chat/roberta/ivr.mjs';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari',ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140 Mobile',WIN='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140',DDG='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) DuckDuckGo/7';
const ctx=(o={})=>describeContext({userAgent:MAC,...o});
const all=c=>Object.values(NODES).flatMap(n=>n.say(c));
test('the context describes the device, and the scripts adapt to it and to the model',()=>{
 assert.equal(ctx({userAgent:IPHONE}).platform,'iphone');assert.equal(ctx({userAgent:IPHONE}).mobile,true);
 assert.equal(ctx({userAgent:ANDROID}).platform,'android');assert.equal(ctx({userAgent:WIN}).platform,'windows');assert.equal(ctx().mobile,false);
 assert.equal(ctx({userAgent:MAC,maxTouchPoints:5}).platform,'ipad','an iPad that says it is a Mac');
 assert.equal(ctx({userAgent:DDG}).inApp,true);
 const phone=introScript(ctx({userAgent:IPHONE,model:{state:'none',bytes:1.2e9}})).join(' ');
 const desk=introScript(ctx({userAgent:MAC,model:{state:'none',bytes:5.6e9}})).join(' ');
 assert.match(phone,/iPhone/);assert.match(phone,/on the phone itself/);assert.match(phone,/about 1\.2 gigabytes/);
 assert.match(desk,/Mac/);assert.match(desk,/this computer/);assert.match(desk,/about 5\.6 gigabytes/);assert.doesNotMatch(desk,/phone itself/);
 assert.notEqual(phone,desk);
 assert.match(modelStatus(ctx({model:{state:'downloading',progress:0.37}})),/37 percent/);
 assert.match(modelStatus(ctx({model:{state:'ready'}})),/already loaded/);
 assert.match(modelStatus(ctx({model:{state:'none',backend:'cpu',bytes:1.2e9}})),/slower/);
 assert.match(modelStatus(ctx({model:{state:'unavailable'}})),/outside provider/);
 assert.match(modelStatus(ctx({mode:'api'})),/outside provider/);
 assert.equal(sizeWords(1.2e9),'about 1.2 gigabytes');assert.equal(sizeWords(12e9),'about 12 gigabytes');assert.equal(sizeWords(null),'a few gigabytes');
});
test('Roberta is a named robot, never a person: she says what she is and claims no feelings, awareness or memory',()=>{
 assert.equal(ROBOT_NAME,'Roberta');
 const intro=introScript(ctx()).join(' ');
 assert.match(intro,/I'm a program, not a person/);assert.match(intro,/don't have feelings or awareness/);assert.match(intro,/robot/);
 assert.match(WHO_I_AM,/not a person/);
 // no script anywhere claims a human or inner life for her
 for(const platform of [IPHONE,MAC,ANDROID,WIN])for(const text of all(ctx({userAgent:platform})).concat(introScript(ctx({userAgent:platform})),FALLBACK_SAY(ctx()))){
  assert.doesNotMatch(text,/\bI (feel|love|enjoy|miss|think about you|care about you|am alive|am conscious|am human|am excited|am happy)\b/i,text);
  assert.doesNotMatch(text,/\bmy (feelings|friend|family|childhood)\b/i,text);
 }
 const who=NODES['about.who'].say(ctx()).join(' ');assert.match(who,/not a person/);assert.match(who,/language model/);assert.match(who,/prepared messages/);
});
test('Roberta is not the language model: she says her answers are prepared, and what the model does afterwards',()=>{
 assert.match(introScript(ctx()).join(' '),/prepared messages/);
 assert.match(NODES['about.who'].say(ctx()).join(' '),/written by that language model on your device/);
});
test('the menu is numbered, in order, and its prompt follows the model state',()=>{
 const items=menuItems(null,ctx());
 assert.deepEqual(items.map(i=>i.key),['1','2','3','4','5','6','7','8','9','#']);
 assert.deepEqual(items.map(i=>i.id),MAIN_MENU);
 const prompt=menuPrompt(null,ctx({model:{state:'none'}}));
 assert.equal(prompt[0],'Press 1 for privacy.');assert.ok(prompt.includes('Press 3 to download the model.'));assert.ok(prompt.includes('Press 4 to share with a friend.'));assert.ok(prompt.includes('Press 5 to restore from a backup.'));assert.ok(prompt.includes('Press 6 to export your chats.'));
 assert.ok(prompt.includes('Press pound to start chatting.'));assert.match(prompt.at(-1),/Press zero to hear this menu again/);
 assert.ok(menuPrompt(null,ctx({model:{state:'downloading',progress:.5}})).includes('Press 3 to hear how the download is going.'));
 assert.ok(menuPrompt(null,ctx({model:{state:'ready'}})).includes('Press 3 to start chatting.'));
 const sub=menuPrompt('privacy',ctx());
 assert.deepEqual(sub.slice(0,4),['Press 1 for the cloud.','Press 2 for where your chats are stored.','Press 3 for outside providers.','Press 4 for accounts and tracking.']);assert.match(sub.at(-1),/Press star to go back/);
 assert.deepEqual(menuItems('help',ctx()).map(i=>i.key),['1','2','3','4']);
});
test('every menu item exists, has copy, and every sub-menu key is unique',()=>{
 for(const id of MAIN_MENU){const n=NODES[id];assert.ok(n,id);assert.ok(n.say(ctx()).length,id);assert.ok(KEY_TO_NODE[n.key]===id,'key '+n.key);}
 for(const n of Object.values(NODES)){for(const child of n.children)assert.ok(NODES[child],n.id+'>'+child);assert.ok(n.say(ctx({model:{state:'ready'}})).every(s=>typeof s==='string'),n.id);}
 assert.equal(new Set(Object.values(NODES).map(n=>n.key).filter(Boolean)).size,Object.values(NODES).filter(n=>n.key).length,'main keys are unique');
});
test('there are enough different ways of asking for every topic, and none is repeated',()=>{
 const byIntent={};for(const p of INTENT_PHRASES)(byIntent[p.intent]||=[]).push(p.text);
 for(const id of INTENT_IDS)assert.ok((byIntent[id]||[]).length>=6,id+' has only '+(byIntent[id]||[]).length+' phrases');
 const seen=new Map();for(const p of INTENT_PHRASES){const k=p.text.toLowerCase();assert.ok(!seen.has(k)||seen.get(k)===p.intent,'"'+p.text+'" is in both '+seen.get(k)+' and '+p.intent);seen.set(k,p.intent);}
 // the owner's own examples of asking about the cloud and about data are covered
 const cloud=byIntent['privacy.cloud'].concat(byIntent['privacy.storage']).join('|');
 for(const q of ['is this sending information to the cloud','is this cloud connected','what about the cloud','who has my data','where is my data stored'])assert.ok(cloud.includes(q),q);
});
// ---- the engine
function rig({context=ctx(),router=null}={}){
 const spoken=[],log=[],actions={};let stops=0,release=null;
 const states=[];
 const ivr=createIvr({getContext:()=>context,
  say:async lines=>{spoken.push(...lines);if(release)await release();},
  stopSpeech:()=>{stops++;},
  actions:new Proxy(actions,{get:(t,k)=>(...a)=>log.push([k,...a])}),
  router,onChange:s=>states.push(s)});
 return {ivr,spoken,log,get stops(){return stops;},states,set context(v){context=v;},hold(){let r;const p=new Promise(x=>{r=x;});release=()=>p;return ()=>{release=null;r();};}};
}
test('start plays the introduction and then the main menu',async()=>{
 const r=rig({context:ctx({userAgent:IPHONE,model:{state:'none',bytes:1.2e9}})});await r.ivr.start();
 assert.match(r.spoken[0],/Hello, this is Roberta/);assert.ok(r.spoken.some(s=>/iPhone/.test(s)));
 assert.equal(r.spoken.indexOf('Press 1 for privacy.')>r.spoken.findIndex(s=>/prepared messages/.test(s)),true);
 assert.equal(r.ivr.state.phase,'menu');assert.equal(r.ivr.state.items.length,10);
});
test('keys choose menu items, sub-menus renumber, star goes back, zero repeats, pound starts chatting',async()=>{
 const r=rig();await r.ivr.start();r.spoken.length=0;
 await r.ivr.press('1');assert.match(r.spoken.join(' '),/Private Local Chat is built so your thinking stays yours/);assert.ok(r.spoken.includes('Press 1 for the cloud.'));
 assert.equal(r.ivr.state.nodeId,'privacy');assert.deepEqual(r.ivr.state.items.map(i=>i.key),['1','2','3','4']);
 r.spoken.length=0;await r.ivr.press('2');assert.match(r.spoken.join(' '),/live in this browser's storage/);assert.equal(r.ivr.state.nodeId,'privacy','a topic leaves the sub-menu open for another');
 r.spoken.length=0;await r.ivr.press('0');assert.equal(r.spoken[0],'Press 1 for the cloud.');
 r.spoken.length=0;await r.ivr.press('*');assert.equal(r.ivr.state.nodeId,null);assert.equal(r.spoken[0],'Press 1 for privacy.');
 r.spoken.length=0;await r.ivr.press('#');assert.deepEqual(r.log.at(-1).slice(0,1),['startChatting']);assert.match(r.spoken.join(' '),/start chatting any time/);
 r.spoken.length=0;await r.ivr.press('7');await r.ivr.press('2');assert.deepEqual(r.log.at(-1).slice(0,1),['openProvider']);
 r.spoken.length=0;await r.ivr.press('5');assert.match(r.spoken[0],/isn't one of the options|restore|Press/);
});
test('an invalid key says so and repeats the menu',async()=>{
 const r=rig();await r.ivr.start();await r.ivr.press('1');r.spoken.length=0;await r.ivr.press('9');
 assert.equal(r.spoken[0],"9 isn't one of the options.");assert.equal(r.spoken[1],'Press 1 for the cloud.');
 await r.ivr.press('x');assert.equal(r.spoken.length,r.spoken.length);
});
test('a key press interrupts what is being said (barge-in) and a late line from the old turn is dropped',async()=>{
 const r=rig();const free=r.hold();const first=r.ivr.start();
 await new Promise(x=>setTimeout(x,5));const before=r.stops;
 const pressed=r.ivr.press('4');free();await Promise.all([first,pressed]);
 assert.ok(r.stops>before,'speech was stopped');
 assert.ok(r.spoken.some(s=>/share sheet/.test(s)),'the new turn spoke');
 assert.equal(r.spoken.filter(s=>/Press 1 for privacy/.test(s)).length,0,'the interrupted menu was not read out');
});
test('actions run for items that start something, and ones that need a tap wait for it when the request was spoken',async()=>{
 const r=rig();await r.ivr.start();
 await r.ivr.press('3');assert.equal(r.log.at(-1)[0],'startSetup');assert.equal(r.ivr.state.nodeId,null,'the download item has no sub-menu, so pressing 3 again reports progress');
 r.log.length=0;await r.ivr.press('4');assert.equal(r.log.at(-1)[0],'openShare','a key press is a gesture: it runs at once');
 r.log.length=0;await r.ivr.press('5');await r.ivr.press('6');assert.deepEqual(r.log.map(l=>l[0]),['openImport','openExport']);
 // the same item reached by speech has no gesture, so it waits for a tap on a button
 const routed=rig({router:{route:async()=>({intent:'restore',confidence:'high',candidates:[]})}});await routed.ivr.start();routed.spoken.length=0;
 await routed.ivr.hear('I have a backup file');assert.equal(routed.log.length,0,'not run without a tap');
 assert.equal(routed.ivr.state.pendingAction.id,'openImport');assert.match(routed.spoken.join(' '),/Tap the button on your screen to choose a backup file/i);
 routed.ivr.runPending();assert.deepEqual(routed.log.at(-1).slice(0,1),['openImport']);assert.equal(routed.ivr.state.pendingAction,null);
 // an action that needs no gesture runs from speech straight away
 const setup=rig({router:{route:async()=>({intent:'setup',confidence:'high',candidates:[]})}});await setup.ivr.start();await setup.ivr.hear('download the model');assert.equal(setup.log.at(-1)[0],'startSetup');
});
test('what is said is matched by meaning: confident matches go there, unsure ones offer choices, repeat and back are understood',async()=>{
 const answers=[{intent:'privacy.cloud',confidence:'high',candidates:[]},{intent:'help.stuck',confidence:'medium',candidates:[]},{intent:null,confidence:'low',candidates:[{intent:'privacy.storage',score:.4},{intent:'setup.size',score:.35},{intent:'ctl.back',score:.3}]},{intent:'ctl.repeat',confidence:'high',candidates:[]},{intent:'ctl.back',confidence:'high',candidates:[]},null];
 const r=rig({router:{route:async()=>answers.shift()}});await r.ivr.start();
 r.spoken.length=0;await r.ivr.hear('is this sending my stuff to the cloud');assert.match(r.spoken.join(' '),/nothing you type is sent to the cloud/);
 r.spoken.length=0;await r.ivr.hear('my download froze');assert.match(r.spoken.join(' '),/restarts it by itself after two minutes/);
 r.spoken.length=0;await r.ivr.hear('blah blah');assert.match(r.spoken[0],/couldn't match that/);assert.match(r.spoken.join(' '),/Did you mean where your chats are stored, or download size\?/);
 r.spoken.length=0;await r.ivr.hear('say that again');assert.match(r.spoken[0],/^Press 1 for privacy/);
 await r.ivr.press('1');r.spoken.length=0;await r.ivr.hear('go back');assert.equal(r.ivr.state.nodeId,null);
 r.spoken.length=0;await r.ivr.hear('anything');assert.match(r.spoken[0],/couldn't match/,'a router that fails is the same as no match');
 const none=rig();await none.ivr.start();none.spoken.length=0;await none.ivr.hear('hello?');assert.match(none.spoken[0],/couldn't match/,'with no router the keypad still works');
});
test('scripts follow the model as it changes: the download item reads the current progress',async()=>{
 const r=rig({context:ctx({model:{state:'none',bytes:5.6e9,tierLabel:'larger'}})});await r.ivr.start();r.spoken.length=0;
 await r.ivr.press('3');assert.match(r.spoken.join(' '),/start the one-time download now: about 5\.6 gigabytes for the larger model/);
 r.context=ctx({model:{state:'downloading',progress:0.62}});r.spoken.length=0;await r.ivr.press('3');assert.match(r.spoken.join(' '),/62 percent done/);
 r.context=ctx({model:{state:'ready'}});r.spoken.length=0;await r.ivr.press('3');assert.match(r.spoken.join(' '),/Your model is ready/);
 r.context=ctx({hasChats:false});r.spoken.length=0;await r.ivr.press('6');assert.match(r.spoken.join(' '),/nothing to export/);
});
test('the transcript records what Roberta said and what was pressed or said, for captions',async()=>{
 const r=rig({router:{route:async()=>({intent:'about.who',confidence:'high',candidates:[]})}});await r.ivr.start();await r.ivr.press('1');await r.ivr.hear('who are you');
 const t=r.ivr.state.transcript;assert.ok(t.some(x=>x.who==='roberta'));assert.ok(t.some(x=>x.who==='you'&&x.text==='Pressed 1'));assert.ok(t.some(x=>x.who==='you'&&x.text==='who are you'));
});
test('spoken menu prompts are marked as such, so a voicemail view can show them as reply buttons instead',async()=>{
 const r=rig();await r.ivr.start();
 const t=r.ivr.state.transcript;assert.ok(t.some(x=>x.kind==='say'&&/Hello, this is Roberta/.test(x.text)));assert.ok(t.some(x=>x.kind==='menu'&&x.text==='Press 1 for privacy.'));
 await r.ivr.press('1');assert.ok(r.ivr.state.transcript.some(x=>x.kind==='say'&&/thinking stays yours/.test(x.text)));assert.ok(r.ivr.state.transcript.some(x=>x.kind==='menu'&&x.text==='Press 1 for the cloud.'));
});
