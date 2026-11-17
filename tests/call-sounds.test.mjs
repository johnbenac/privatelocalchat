import test from 'node:test';
import assert from 'node:assert/strict';
import {createCallSounds} from '../chat/call/call-sounds.mjs';
function fakeContext(){
 const log={osc:[],gains:0,resumed:0,closed:0};
 const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){}});
 const ctx={currentTime:10,state:'suspended',destination:{},resume(){log.resumed++;},close(){log.closed++;},
  createGain(){log.gains++;return {gain:param(),connect(){}};},
  createOscillator(){const o={type:'',frequency:{value:0},connect(){},start(t){o.startedAt=t;},stop(t){o.stoppedAt=t;}};log.osc.push(o);return o;}};
 return {ctx,log};
}
test('ringback, pick-up and hang-up are short quiet tones built from the audio context',()=>{
 const {ctx,log}=fakeContext();const s=createCallSounds({createContext:()=>ctx});
 s.ringback();assert.deepEqual(log.osc.map(o=>o.frequency.value),[440,480],'the two ringback frequencies together');
 assert.ok(log.osc.every(o=>o.startedAt>=10&&o.stoppedAt>o.startedAt&&o.stoppedAt-o.startedAt<1.2),'under about a second');
 s.connected();assert.deepEqual(log.osc.slice(2).map(o=>o.frequency.value),[880,1175]);
 s.ended();assert.deepEqual(log.osc.slice(4).map(o=>o.frequency.value),[520,392],'a falling pair');
 assert.ok(log.resumed>=1,'a suspended context is resumed');assert.equal(log.gains,5);
});
test('sounds that are turned off, or a browser without audio, do nothing and never throw',()=>{
 const {ctx,log}=fakeContext();let on=false;const s=createCallSounds({createContext:()=>ctx,enabled:()=>on});
 s.unlock();s.ringback();s.connected();s.ended();assert.equal(log.osc.length,0);
 on=true;s.ringback();assert.equal(log.osc.length,2,'switching them on takes effect at once');
 const none=createCallSounds({createContext:()=>null});none.unlock();none.ringback();none.connected();none.ended();none.close();
 const broken=createCallSounds({createContext:()=>{throw new Error('no audio');}});broken.ringback();
 s.close();assert.equal(log.closed,1);
});
test('keypad buttons make their telephone tones, and unknown keys make none',()=>{
 const {ctx,log}=fakeContext();const s=createCallSounds({createContext:()=>ctx});
 s.dtmf('1');assert.deepEqual(log.osc.map(o=>o.frequency.value),[697,1209]);
 s.dtmf('#');assert.deepEqual(log.osc.slice(2).map(o=>o.frequency.value),[941,1477]);
 s.dtmf('0');assert.deepEqual(log.osc.slice(4).map(o=>o.frequency.value),[941,1336]);
 s.dtmf('x');assert.equal(log.osc.length,6);
});
