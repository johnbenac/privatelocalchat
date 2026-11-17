import test from 'node:test';
import assert from 'node:assert/strict';
import {kindOf,parseCsv,describeTable,chunkText,buildDocument,planContext,excerptPreamble,citedNumbers,estimateTokens} from '../chat/documents/documents.mjs';
import {buildIndex,rank,tokenize} from '../chat/documents/retrieval.mjs';
test('file kinds',()=>{
 assert.equal(kindOf('a.PDF'),'pdf');assert.equal(kindOf('x.png'),'image');assert.equal(kindOf('notes.md'),'text');assert.equal(kindOf('data.csv'),'text');
 assert.equal(kindOf('archive.zip'),null);assert.equal(kindOf('weird','text/plain'),'text');
});
test('csv handles quotes, embedded newlines and CRLF',()=>{
 const rows=parseCsv('name,note\r\n"Smith, J","said ""hi""\nthere"\r\nLee,ok\r\n');
 assert.deepEqual(rows,[['name','note'],['Smith, J','said "hi"\nthere'],['Lee','ok']]);
 assert.match(describeTable('a,b,c\n1,2,3\n4,5,6','t.csv'),/2 data rows and 3 columns: a, b, c/);
 assert.deepEqual(parseCsv('a\tb\n1\t2','\t'),[['a','b'],['1','2']]);
});
test('chunks respect size, keep order and break at natural points',()=>{
 const para=n=>('Sentence number '+n+' is here. ').repeat(8).trim();
 const text=Array.from({length:12},(_,i)=>para(i)).join('\n\n');
 const chunks=chunkText(text,{size:700,overlap:80});
 assert.ok(chunks.length>=4);assert.ok(chunks.every(c=>c.text.length<=720));
 assert.ok(chunks[0].text.startsWith('Sentence number 0'));
 assert.ok(chunks.at(-1).text.includes('Sentence number 11'));
 assert.deepEqual(chunkText('',{}),[]);
});
test('BM25 ranks the passage that answers the question first',()=>{
 const chunks=[{id:1,text:'The cancellation clause requires thirty days written notice before termination of the lease.'},{id:2,text:'Rent is due on the first day of each month by bank transfer.'},{id:3,text:'The tenant keeps the garden tidy and the landlord maintains the roof.'}];
 const r=rank(buildIndex(chunks),'What is the cancellation notice period?');
 assert.equal(r[0].chunk.id,1);
 assert.deepEqual(rank(buildIndex(chunks),'zebra'),[]);
 assert.ok(!tokenize('The and of').length);
});
test('short documents are included whole; long ones are cited by excerpt',()=>{
 const small=buildDocument({id:'d1',name:'note.txt',size:10,kind:'text',text:'hello world'});
 const plan=planContext([small],'hi',{budgetTokens:1800});
 assert.equal(plan.mode,'full');assert.equal(plan.fullText.d1,'hello world');
 const pages=Array.from({length:40},(_,i)=>({page:i+1,text:(i===27?'The warranty period is twenty-four months from delivery. ':'Generic filler paragraph about nothing in particular. ').repeat(i===27?3:30)}));
 const big=buildDocument({id:'d2',name:'manual.pdf',size:1,kind:'pdf',pages});
 assert.equal(big.pages,40);assert.match(big.text,/\[Page 28\]/);
 const p2=planContext([big],'How long is the warranty period?',{budgetTokens:900});
 assert.equal(p2.mode,'excerpts');assert.equal(p2.excerpts[0].page,28);assert.equal(p2.excerpts[0].n,1);
 assert.match(excerptPreamble(p2.excerpts),/\[1\] manual\.pdf, page 28:/);
 assert.ok(p2.excerpts.reduce((n,e)=>n+estimateTokens(e.text.length),0)<=900);
 assert.match(p2.fullText.d2,/only the passages relevant/);
});
test('library search only supplies excerpts and nothing when nothing matches',()=>{
 const d=buildDocument({id:'d3',name:'a.txt',size:1,kind:'text',text:'Alpha beta gamma.'});
 assert.equal(planContext([d],'unrelated zebra question',{library:true}).excerpts.length,0);
 assert.equal(planContext([d],'alpha',{library:true}).excerpts.length,1);
 assert.equal(planContext([],'x').mode,'none');
});
test('cited numbers are read from the answer',()=>{ assert.deepEqual(citedNumbers('See [2] and [1], also [2]. Not [x].'),[2,1]); });
