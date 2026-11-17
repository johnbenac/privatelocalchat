import test from 'node:test';
import assert from 'node:assert/strict';
import {toastDuration,createPausableTimer,TOAST_MIN_MS,TOAST_MAX_MS} from '../chat/core/toast-timing.mjs';

test('a toast stays long enough to read, whatever the caller asked for',()=>{
  assert.equal(toastDuration('Copied.',1800),TOAST_MIN_MS,'short messages still get the minimum');
  const hint='Your model is ready for offline use. You can chat without a connection.';
  assert.ok(toastDuration(hint,3200)>=7000,'about 7.5 s for the offline hint: '+toastDuration(hint,3200));
  assert.equal(toastDuration('x'.repeat(2000)),TOAST_MAX_MS,'a very long one is capped');
});
test('what the caller asked for is never shortened, and a button adds time',()=>{
  assert.equal(toastDuration('Short.',9000),9000);
  assert.ok(toastDuration('a'.repeat(60),0,{hasAction:true})>toastDuration('a'.repeat(60),0));
  assert.equal(toastDuration(undefined,0),TOAST_MIN_MS);
});

function clock(){let t=0,next=1;const timers=new Map();
  return {now:()=>t,setTimer:(fn,ms)=>{const id=next++;timers.set(id,{fn,at:t+ms});return id;},clearTimer:id=>timers.delete(id),
    advance(ms){t+=ms;for(const [id,x] of [...timers])if(x.at<=t){timers.delete(id);x.fn();}},pending:()=>timers.size};
}
test('the clock fires after its time, can be paused and resumed, and a pause stops the countdown',()=>{
  const c=clock(),timer=createPausableTimer(c);let fired=0;
  timer.start(5000,()=>fired++);c.advance(4000);assert.equal(fired,0);
  timer.pause();c.advance(60000);assert.equal(fired,0,'paused: nothing happens');assert.equal(timer.remaining,1000);
  timer.resume();c.advance(999);assert.equal(fired,0);c.advance(1);assert.equal(fired,1);assert.equal(timer.active,false);
});
test('starting again replaces the old countdown, and stop cancels it',()=>{
  const c=clock(),timer=createPausableTimer(c);let a=0,b=0;
  timer.start(1000,()=>a++);timer.start(3000,()=>b++);c.advance(1000);assert.deepEqual([a,b],[0,0]);c.advance(2000);assert.deepEqual([a,b],[0,1]);
  timer.start(1000,()=>a++);timer.stop();c.advance(5000);assert.equal(a,0);assert.equal(c.pending(),0);
});
