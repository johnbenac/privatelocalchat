import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown,parseInline,safeHref,codeBlocksOf} from '../chat/markdown.mjs';
const types=blocks=>blocks.map(b=>b.t);
test('headings, paragraphs, rules and quotes',()=>{
 const b=parseMarkdown('# Title\n\nSome *emphasis* and **strong** text\ncontinued.\n\n---\n\n> quoted\n> more');
 assert.deepEqual(types(b),['h','p','hr','quote']);
 assert.equal(b[0].level,1);
 assert.deepEqual(b[1].c.map(n=>n.t),['text','em','text','strong','text']);
 assert.equal(b[3].c[0].t,'p');
});
test('lists nest and keep numbering',()=>{
 const b=parseMarkdown('1. one\n2. two\n   - nested a\n   - nested b\n3. three\n\n- x\n- [x] done\n- [ ] todo');
 assert.deepEqual(types(b),['ol','ul']);
 assert.equal(b[0].items.length,3);
 assert.deepEqual(types(b[0].items[1].c),['p','ul']);
 assert.equal(b[0].items[1].c[1].items.length,2);
 assert.equal(b[1].items[1].task,true);assert.equal(b[1].items[2].task,false);
 assert.equal(parseMarkdown('3. a\n4. b')[0].start,3);
});
test('fenced code keeps its text exactly and survives being unterminated while streaming',()=>{
 const b=parseMarkdown('Before\n```js\nconst a = "<b>";\n\n# not a heading\n```\nAfter');
 assert.deepEqual(types(b),['p','code','p']);
 assert.equal(b[1].lang,'js');assert.equal(b[1].text,'const a = "<b>";\n\n# not a heading');assert.equal(b[1].open,false);
 const partial=parseMarkdown('```python\nprint(1)');
 assert.equal(partial[0].t,'code');assert.equal(partial[0].open,true);assert.equal(partial[0].text,'print(1)');
 assert.deepEqual(codeBlocksOf('x\n~~~\none\n~~~\n```\ntwo\n```').map(c=>c.text),['one','two']);
});
test('tables parse with alignment and padded rows',()=>{
 const b=parseMarkdown('| Name | Qty |\n|:--|--:|\n| a | 1 |\n| b |\n\nafter');
 assert.deepEqual(types(b),['table','p']);
 assert.deepEqual(b[0].align,['left','right']);
 assert.equal(b[0].rows.length,2);assert.equal(b[0].rows[1].length,2);
});
test('inline code, escapes and links',()=>{
 const n=parseInline('use `a*b*c` and \\*not em\\* see [docs](https://example.com/a_b) or https://example.org/x.');
 assert.deepEqual(n.filter(x=>x.t==='code').map(x=>x.v),['a*b*c']);
 assert.ok(n.some(x=>x.t==='text'&&x.v.includes('*not em*')));
 const links=n.filter(x=>x.t==='a');
 assert.deepEqual(links.map(l=>l.href),['https://example.com/a_b','https://example.org/x']);
 assert.equal(parseInline('snake_case_word and 2*3*4')[0].v.includes('snake_case_word'),true);
});
test('only http(s) and mailto links are clickable',()=>{
 assert.equal(safeHref('https://a.test'),'https://a.test');
 assert.equal(safeHref('mailto:a@b.test'),'mailto:a@b.test');
 for(const bad of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>','vbscript:x','//evil.test','https://a b','java\nscript:alert(1)','/relative'])assert.equal(safeHref(bad),null,bad);
});
test('raw HTML stays text in the AST',()=>{
 const b=parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
 assert.deepEqual(types(b),['p','p']);
 assert.equal(b[0].c[0].v,'<script>alert(1)</script>');
});
test('asterisks in arithmetic are not emphasis, real emphasis still is',()=>{
 const flat=n=>n.map(x=>x.t==='text'?x.v:'<'+x.t+'>'+(x.c?flat(x.c):x.v)+'</'+x.t+'>').join('');
 assert.equal(flat(parseInline('12*(3+4) = **84**')),'12*(3+4) = <strong>84</strong>');
 assert.equal(flat(parseInline('a * b * c and 5 * 6')),'a * b * c and 5 * 6');
 assert.equal(flat(parseInline('**bold**, *it* and _also_ (**x**)')),'<strong>bold</strong>, <em>it</em> and <em>also</em> (<strong>x</strong>)');
 assert.equal(flat(parseInline('snake_case_name')),'snake_case_name');
});
