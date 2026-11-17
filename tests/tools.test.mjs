import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,calculate,formatNumber,convertUnits,parseDate,formatDate,addToDate,daysBetween,dateQuestion,detectTools,runCommand} from '../chat/tools.mjs';
const NOW=new Date(2026,9,30,15,0,0); // Fri 30 Oct 2026, local
test('arithmetic follows precedence and is exact where floats are not',()=>{
 assert.equal(evaluate('2+3*4'),14);assert.equal(evaluate('(2+3)*4'),20);assert.equal(evaluate('2^3^2'),512);assert.equal(evaluate('-2^2'),-4);
 assert.equal(calculate('0.1+0.2'),'0.3');assert.equal(calculate('1,234 * 5,678'),'7006652');assert.equal(calculate('12*(3+4)'),'84');
 assert.equal(calculate('10 mod 3'),'1');assert.equal(calculate('sqrt(144)+abs(-3)'),'15');assert.equal(calculate('2(3+4)'),'14');assert.equal(calculate('50%'),'0.5');assert.equal(calculate('20% of 150'),'30');
 assert.equal(calculate('2 pi'),'6.28318530718');assert.equal(calculate('1/3'),'0.333333333333');assert.equal(calculate('2^100'),'1.26765060023e30');
});
test('bad input is refused, not guessed at, and never executed',()=>{
 for(const bad of ['1/0','2+','(1+2','foo(3)','1 +* 2','alert(1)','process.exit()','constructor','1;2','`x`'])assert.throws(()=>evaluate(bad),bad);
 assert.throws(()=>evaluate('sqrt'),/parentheses/);
});
test('unit conversion',()=>{
 assert.ok(Math.abs(convertUnits(5,'km','miles')-3.10686)<1e-4);assert.ok(Math.abs(convertUnits(100,'F','C')-37.7778)<1e-3);assert.equal(convertUnits(0,'celsius','kelvin'),273.15);
 assert.equal(convertUnits(2,'hours','minutes'),120);assert.equal(Math.round(convertUnits(1,'gib','mb')),1074);assert.ok(Math.abs(convertUnits(60,'mph','km/h')-96.5606)<1e-3);
 assert.throws(()=>convertUnits(1,'kg','miles'),/can.t be converted/);assert.throws(()=>convertUnits(1,'florps','m'),/know the unit/);
});
test('dates',()=>{
 assert.equal(formatDate(parseDate('today',NOW)),'Friday, 30 October 2026 (2026-10-30)');
 assert.equal(formatDate(parseDate('March 5, 2026')),'Thursday, 5 March 2026 (2026-03-05)');
 assert.equal(formatDate(parseDate('5 March 2026')),'Thursday, 5 March 2026 (2026-03-05)');
 assert.equal(parseDate('2026-02-30'),null);assert.equal(parseDate('whenever'),null);
 assert.equal(formatDate(addToDate(parseDate('2026-01-31'),1,'month')),'Saturday, 28 February 2026 (2026-02-28)');
 assert.equal(formatDate(addToDate(parseDate('2024-02-29'),1,'year')),'Friday, 28 February 2025 (2025-02-28)');
 assert.equal(daysBetween(parseDate('2026-01-01'),parseDate('2026-03-05')),63);
});
test('date questions',()=>{
 assert.match(dateQuestion("what's today's date?",NOW).result,/30 October 2026/);
 assert.match(dateQuestion('what day of the week is March 5, 2026?',NOW).result,/Thursday/);
 assert.equal(dateQuestion('How many days between 2026-01-01 and 2026-03-05?',NOW).result,'63 days');
 assert.match(dateQuestion('2026-03-05 + 30 days',NOW).result,/4 April 2026/);
 assert.match(dateQuestion('what is the date 10 days from today',NOW).result,/9 November 2026/);
 assert.equal(dateQuestion('tell me a story',NOW),null);
});
test('exact questions are found inside ordinary messages, and ordinary text is left alone',()=>{
 const r=detectTools('Quick one: what is 1234 * 5678? Also convert 5 km to miles please.',NOW);
 assert.deepEqual(r.map(x=>[x.kind,x.result]),[['convert','3.10685596119 miles'],['calc','7006652']]);
 assert.equal(detectTools('What is 15% of 80?',NOW)[0].result,'12');
 assert.equal(detectTools('Convert 100 F to C',NOW)[0].result,'37.7777777778 C');
 for(const plain of ['I was born on 2026-03-05 in room 10-20.','Chapter 3 covers pages 10-20, 5 to 6 pm','call 555-1234 now','Tell me about the Hermitage in 1764','My score was 3 out of 5'])assert.deepEqual(detectTools(plain,NOW),[],plain);
});
test('slash commands answer immediately',()=>{
 assert.equal(runCommand('/calc 12*(3+4)').text,'12*(3+4) = **84**');
 assert.equal(runCommand('/convert 5 km to miles').text,'5 km = **3.10685596119 miles**');
 assert.match(runCommand('/date today',NOW).text,/30 October 2026/);
 assert.match(runCommand('/date 2026-03-05',NOW).text,/Thursday/);
 assert.equal(runCommand('/calc 1/0').ok,false);assert.match(runCommand('/calc 1/0').text,/Division by zero/);
 assert.equal(runCommand('hello'),null);assert.equal(runCommand('/other 1'),null);
});
