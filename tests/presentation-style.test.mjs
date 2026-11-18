// The look of the character package preview is PLC's own, and every palette keeps readable text (WCAG AA for normal text, 4.5:1; the accent used for borders needs 3:1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PALETTES,LAYOUTS} from '../chat/presentation/view-model.mjs';

const css=readFileSync(new URL('../chat/chat.css',import.meta.url),'utf8');
const lum=(hex)=>{const c=[1,3,5].map((i)=>parseInt(hex.slice(i,i+2),16)/255).map((v)=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

test('every palette name has a rule, with readable text and a visible accent',()=>{
  for(const name of PALETTES){
    const m=css.match(new RegExp('\\.pkg-card\\[data-palette="'+name+'"\\]\\s*\\{([^}]*)\\}'));
    assert.ok(m,'a rule for palette '+name);
    const v=Object.fromEntries([...m[1].matchAll(/--pkg-(bg|fg|accent):\s*(#[0-9a-fA-F]{6})/g)].map((x)=>[x[1],x[2]]));
    assert.ok(v.bg&&v.fg&&v.accent,name+' sets all three colours');
    assert.ok(ratio(v.fg,v.bg)>=4.5,name+': text contrast '+ratio(v.fg,v.bg).toFixed(2));
    assert.ok(ratio(v.accent,v.bg)>=3,name+': accent contrast '+ratio(v.accent,v.bg).toFixed(2));
  }
});
test('every layout name has a rule, and there is no rule for a name the view model does not accept',()=>{
  for(const name of LAYOUTS) assert.match(css,new RegExp('\\.pkg-card\\[data-layout="'+name+'"\\]'),name);
  const named=[...css.matchAll(/data-layout="([a-z-]+)"/g)].map((m)=>m[1]);
  for(const n of named) assert.ok(LAYOUTS.includes(n),'unknown layout in the stylesheet: '+n);
  const pal=[...css.matchAll(/data-palette="([a-z-]+)"/g)].map((m)=>m[1]);
  for(const n of pal) assert.ok(PALETTES.includes(n),'unknown palette in the stylesheet: '+n);
});
test('the message is on a solid panel, so a background picture can never lower its contrast',()=>{
  assert.match(css,/\.pkg-card \.pkg-turn \{[^}]*background: var\(--pkg-bg\)/);
  assert.match(css,/\.pkg-card \.pkg-bg \{[^}]*pointer-events: none/);
});
test('the preview uses no animation, so reduced motion is honoured by construction',()=>{
  const block=css.slice(css.indexOf('/* Character package preview'));
  assert.ok(!/animation|transition|@keyframes/.test(block),'no motion in the preview styles');
});
