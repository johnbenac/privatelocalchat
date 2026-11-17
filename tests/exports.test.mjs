import test from 'node:test';
import assert from 'node:assert/strict';
import {exportsFor,stripMarkdown,slug,extensionFor} from '../chat/transfer/exports.mjs';
const answer='# Plan\n\nSome **bold** text with `code`.\n\n| item | qty |\n|---|---|\n| apples, red | 3 |\n| "pears" | 4 |\n\n```json\n{"a":1,"b":[2,3]}\n```\n\n```python\nprint("hi")\n```\n';
test('answers can be saved whole, as text, per table and per code block',()=>{
 const e=exportsFor(answer,'Fruit plan!');
 assert.deepEqual(e.map(x=>x.filename),['fruit-plan.md','fruit-plan.txt','fruit-plan-table.csv','fruit-plan-1.json','fruit-plan-2.py']);
 assert.equal(e[0].text,answer);
 const csv=e.find(x=>x.filename.endsWith('.csv')).text;
 assert.equal(csv,'item,qty\n"apples, red",3\n"""pears""",4\n');
 assert.equal(e.find(x=>x.filename.endsWith('.json')).text,'{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
 assert.ok(!/\*\*|`/.test(e[1].text));assert.match(e[1].text,/Plan[\s\S]*Some bold text with code\./);
});
test('naming',()=>{ assert.equal(slug('  Crème Brûlée / 2024 '),'creme-brulee-2024');assert.equal(slug(''),'answer');assert.equal(extensionFor('Rust'),'rs');assert.equal(extensionFor('whatever'),'txt'); });
test('plain text keeps list structure',()=>{ assert.equal(stripMarkdown('- a\n- b\n\n1. x\n2. y'),'- a\n- b\n\n1. x\n2. y'); });
