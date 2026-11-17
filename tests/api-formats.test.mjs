import test from 'node:test';
import assert from 'node:assert/strict';
import {API_FORMATS,FORMAT_IDS,ANTHROPIC_VERSION,ANTHROPIC_MAX_TOKENS,effectiveFormat,toResponsesInput,toAnthropicMessages,authHeaders,buildApiRequest,buildModelsRequest,modelIdsFrom,readApiStream,errorDetail,responsesText,anthropicText} from '../chat/provider/api-formats.mjs';

const PNG='data:image/png;base64,AAAA';
const convo=[
  {role:'system',content:'Be brief.'},
  {role:'user',content:[{type:'text',text:'What is this?'},{type:'image_url',image_url:{url:PNG}}]},
  {role:'assistant',content:'A square.'},
  {role:'user',content:'Thanks'},
];
const sse=(events,{type='text/event-stream'}={})=>new Response(new ReadableStream({start(c){const enc=new TextEncoder();for(const [name,data] of events)c.enqueue(enc.encode((name?'event: '+name+'\n':'')+'data: '+(typeof data==='string'?data:JSON.stringify(data))+'\n\n'));c.close();}}),{headers:{'content-type':type}});

test('the three formats exist, and the format used is the explicit one, else the provider default, else chat',()=>{
  assert.deepEqual(FORMAT_IDS,['chat','responses','anthropic']);for(const f of FORMAT_IDS)assert.ok(API_FORMATS[f].label&&API_FORMATS[f].note);
  assert.equal(effectiveFormat('responses',{format:'chat'}),'responses');
  assert.equal(effectiveFormat('',{format:'anthropic'}),'anthropic');
  assert.equal(effectiveFormat('nonsense',undefined),'chat');
  assert.equal(effectiveFormat(undefined,{format:'bogus'}),'chat');
});

test('Responses input: system text becomes instructions, history keeps its roles, images become input_image, nothing empty goes out',()=>{
  const r=toResponsesInput([...convo,{role:'assistant',content:''},{role:'user',content:'   '}]);
  assert.equal(r.instructions,'Be brief.');
  assert.deepEqual(r.input,[
    {role:'user',content:[{type:'input_text',text:'What is this?'},{type:'input_image',image_url:PNG}]},
    {role:'assistant',content:[{type:'output_text',text:'A square.'}]},
    {role:'user',content:[{type:'input_text',text:'Thanks'}]},
  ]);
  assert.equal(toResponsesInput([{role:'user',content:'hi'}]).instructions,undefined);
});

test('Anthropic messages: system separate, images as base64 blocks, plain text stays a string, empty messages dropped, first message is the user\'s',()=>{
  const a=toAnthropicMessages([...convo,{role:'assistant',content:''}]);
  assert.equal(a.system,'Be brief.');
  assert.deepEqual(a.messages[0],{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:'AAAA'}},{type:'text',text:'What is this?'}]});
  assert.deepEqual(a.messages.slice(1),[{role:'assistant',content:'A square.'},{role:'user',content:'Thanks'}]);
  assert.deepEqual(toAnthropicMessages([{role:'assistant',content:'Hello'}]).messages[0],{role:'user',content:'(The conversation so far.)'});
  assert.deepEqual(toAnthropicMessages([{role:'user',content:[{type:'image_url',image_url:{url:'https://x.test/a.png'}}]}]).messages[0].content,[{type:'image',source:{type:'url',url:'https://x.test/a.png'}}]);
});

test('the key goes in the header each provider expects',()=>{
  assert.deepEqual(authHeaders({format:'chat',token:'k'}),{Authorization:'Bearer k'});
  assert.deepEqual(authHeaders({format:'chat',authStyle:'api-key',token:'k'}),{'api-key':'k'});
  assert.deepEqual(authHeaders({format:'responses',authStyle:'x-api-key',token:'k'}),{'x-api-key':'k'});
  assert.deepEqual(authHeaders({format:'chat',token:''}),{},'no key, no header');
  assert.deepEqual(authHeaders({format:'anthropic',token:'k'}),{'anthropic-version':ANTHROPIC_VERSION,'anthropic-dangerous-direct-browser-access':'true','x-api-key':'k'});
});

test('Chat Completions request: the endpoint\'s /chat/completions, the model, the messages, streaming',()=>{
  const r=buildApiRequest({format:'chat',endpoint:'https://api.openai.com/v1',model:'m',messages:convo,token:'k'});
  assert.equal(r.url,'https://api.openai.com/v1/chat/completions');assert.equal(r.init.headers.Authorization,'Bearer k');
  assert.deepEqual(JSON.parse(r.init.body),{model:'m',messages:convo,stream:true});
  assert.deepEqual(JSON.parse(buildApiRequest({format:'chat',endpoint:'https://x.test/v1',model:'m',messages:[],stream:false}).init.body),{model:'m',messages:[]});
});

test('Responses request: /responses, instructions and input, store:false, streaming; a pasted /chat/completions address still works',()=>{
  const r=buildApiRequest({format:'responses',endpoint:'https://api.openai.com/v1/chat/completions',model:'m',messages:convo,token:'k'});
  assert.equal(r.url,'https://api.openai.com/v1/responses');
  const b=JSON.parse(r.init.body);assert.equal(b.model,'m');assert.equal(b.store,false,'nothing kept on the provider by default');assert.equal(b.stream,true);assert.equal(b.instructions,'Be brief.');assert.equal(b.input.length,3);assert.equal(b.messages,undefined);
});

test('Anthropic request: /messages, the browser-access and version headers, max_tokens, system, streaming; the key is not a Bearer token',()=>{
  const r=buildApiRequest({format:'anthropic',endpoint:'https://api.anthropic.com/v1',model:'claude-x',messages:convo,token:'sk-ant'});
  assert.equal(r.url,'https://api.anthropic.com/v1/messages');
  assert.equal(r.init.headers['x-api-key'],'sk-ant');assert.equal(r.init.headers['anthropic-version'],ANTHROPIC_VERSION);assert.equal(r.init.headers['anthropic-dangerous-direct-browser-access'],'true');assert.equal(r.init.headers.Authorization,undefined);
  const b=JSON.parse(r.init.body);assert.equal(b.max_tokens,ANTHROPIC_MAX_TOKENS);assert.equal(b.system,'Be brief.');assert.equal(b.stream,true);assert.equal(b.temperature,undefined,'2026-10-21 rejects sampling parameters, so none are sent');assert.equal(b.messages.length,3);
});

test('the models request: the endpoint\'s /models, a provider\'s own address, Anthropic\'s limit, the right header',()=>{
  assert.equal(buildModelsRequest({endpoint:'https://api.openai.com/v1'}).url,'https://api.openai.com/v1/models');
  assert.equal(buildModelsRequest({endpoint:'https://api.perplexity.ai',modelsUrl:'https://api.perplexity.ai/v1/models'}).url,'https://api.perplexity.ai/v1/models');
  const a=buildModelsRequest({format:'anthropic',endpoint:'https://api.anthropic.com/v1',token:'k'});
  assert.equal(a.url,'https://api.anthropic.com/v1/models?limit=1000');assert.equal(a.init.headers['x-api-key'],'k');assert.equal(a.init.headers.Accept,'application/json');
  assert.deepEqual(modelIdsFrom({data:[{id:'models/gemini-a'},{id:'models/gemini-b'}]},{stripModelPrefix:'models/'}),['gemini-a','gemini-b']);
  assert.deepEqual(modelIdsFrom({data:[{id:'claude-a',display_name:'A'}],has_more:false}),['claude-a']);
});

test('Chat Completions answers are read by the existing reader',async()=>{
  const r=sse([[null,{choices:[{delta:{content:'Hel'}}]}],[null,{choices:[{delta:{content:'lo'},finish_reason:'stop'}]}],[null,'[DONE]']]);
  const seen=[];const out=await readApiStream('chat',r,{onDelta:(d,f)=>seen.push([d,f])});
  assert.equal(out.text,'Hello');assert.equal(out.finishReason,'stop');assert.deepEqual(seen,[['Hel','Hel'],['lo','Hello']]);
});

test('a Responses stream is read: text deltas, completion, and the finish reason',async()=>{
  const r=sse([['response.created',{type:'response.created',response:{status:'in_progress'}}],['response.output_text.delta',{type:'response.output_text.delta',delta:'Hello'}],['response.output_text.delta',{type:'response.output_text.delta',delta:' there'}],['response.completed',{type:'response.completed',response:{status:'completed'}}]]);
  const seen=[];const out=await readApiStream('responses',r,{onDelta:(d,f)=>seen.push([d,f])});
  assert.deepEqual([out.text,out.finishReason,out.streamed],['Hello there','stop',true]);assert.deepEqual(seen,[['Hello','Hello'],[' there','Hello there']]);
});
test('a Responses stream that stops at the limit is "length", a refusal is text, an empty stream takes the final text, a failure throws',async()=>{
  assert.equal((await readApiStream('responses',sse([[null,{type:'response.output_text.delta',delta:'Cut'}],[null,{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}]]))).finishReason,'length');
  assert.equal((await readApiStream('responses',sse([[null,{type:'response.refusal.delta',delta:'I cannot.'}],[null,{type:'response.completed',response:{}}]]))).text,'I cannot.');
  assert.equal((await readApiStream('responses',sse([[null,{type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'Only at the end'}]}]}}]]))).text,'Only at the end');
  await assert.rejects(readApiStream('responses',sse([[null,{type:'response.failed',response:{error:{message:'quota exceeded'}}}]])),/quota exceeded/);
  await assert.rejects(readApiStream('responses',sse([[null,{type:'error',message:'bad key'}]])),/bad key/);
});

test('an Anthropic stream (the shape in its documentation) is read: only text deltas count, ping and thinking are skipped, stop_reason maps',async()=>{
  const r=sse([['message_start',{type:'message_start',message:{id:'m',role:'assistant',content:[]}}],['content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}],['ping',{type:'ping'}],
    ['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'hmm'}}],
    ['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Hello'}}],['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'!'}}],
    ['content_block_stop',{type:'content_block_stop',index:0}],['message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:15}}],['message_stop',{type:'message_stop'}]]);
  const out=await readApiStream('anthropic',r,{});assert.deepEqual([out.text,out.finishReason],['Hello!','stop']);
  const cut=await readApiStream('anthropic',sse([[null,{type:'content_block_delta',delta:{type:'text_delta',text:'x'}}],[null,{type:'message_delta',delta:{stop_reason:'max_tokens'}}]]),{});assert.equal(cut.finishReason,'length');
  assert.equal((await readApiStream('anthropic',sse([[null,{type:'message_delta',delta:{stop_reason:'refusal'}}]]),{})).finishReason,'content_filter');
  await assert.rejects(readApiStream('anthropic',sse([['error',{type:'error',error:{type:'overloaded_error',message:'Overloaded'}}]]),{}),/Overloaded/);
});

test('a provider that ignores stream:true and sends one JSON answer is read in every format',async()=>{
  const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  assert.equal((await readApiStream('responses',json({output_text:'Whole answer',status:'completed'}))).text,'Whole answer');
  assert.equal((await readApiStream('responses',json({output:[{type:'message',content:[{type:'output_text',text:'From items'}]}],incomplete_details:{reason:'max_output_tokens'}}))).finishReason,'length');
  assert.deepEqual(await readApiStream('anthropic',json({content:[{type:'text',text:'Hi'},{type:'text',text:' there'}],stop_reason:'max_tokens'})),{text:'Hi there',finishReason:'length',streamed:false});
  await assert.rejects(readApiStream('anthropic',json({type:'error',error:{type:'invalid_request_error',message:'max_tokens too large'}})),/max_tokens too large/);
  assert.equal(responsesText({}),'');assert.equal(anthropicText({}),'');
});

test('a stop while reading is an AbortError that keeps what arrived',async()=>{
  const controller=new AbortController();
  const r=new Response(new ReadableStream({start(c){const enc=new TextEncoder();c.enqueue(enc.encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:'Partial'})+'\n\n'));}}),{headers:{'content-type':'text/event-stream'}});
  const p=readApiStream('responses',r,{signal:controller.signal,onDelta:()=>controller.abort()});
  await assert.rejects(p,e=>e.name==='AbortError'&&e.partialText==='Partial');
});

test('the provider\'s own words are found in an error body, whatever the shape',()=>{
  assert.equal(errorDetail({error:{message:'Invalid key'}}),'Invalid key');
  assert.equal(errorDetail({error:'plain string'}),'plain string');
  assert.equal(errorDetail({message:'Top level'}),'Top level');
  assert.equal(errorDetail({}),'');assert.equal(errorDetail(null),'');
  assert.ok(errorDetail({error:{message:'x'.repeat(1000)}}).length<=300);
});
