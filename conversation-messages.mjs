// Internal notices remain in the saved transcript, outside model context.
// What the model sees is a separate thing from what was saved: excluded messages stay on screen, and a saved summary stands in
// for the older part of a long conversation (see contextMessages).
import {contextMessages} from './chat/threads.mjs';
const attachmentBlock=(a,text)=>`[Attached file: ${a.name}${a.pages?`, ${a.pages} pages`:''}]\n${text}\n[End of ${a.name}]`;
export function messagesForInference(thread,{preamble=[],attachmentText={}}={}){
 const messages=[],system=[];let conversationStarted=false;
 if(thread.systemPrompt?.trim())system.push(thread.systemPrompt.trim());
 for(const p of preamble)if(typeof p==='string'&&p.trim())system.push(p.trim());
 if(thread.summary?.text?.trim())system.push('Summary of the earlier part of this conversation:\n'+thread.summary.text.trim());
 for(const message of contextMessages(thread)){
  const {role}=message;let {content}=message;
  if(conversationStarted&&role==='system'&&typeof content==='string'&&/^Error:\s/i.test(content.trim()))continue;
  if(!conversationStarted&&role==='system'){if(content)system.push(content);continue;}
  if(role==='assistant'&&!String(content).trim())continue;
  if(role==='user'&&message.attachments?.length){
   const blocks=message.attachments.filter(a=>typeof attachmentText[a.id]==='string').map(a=>attachmentBlock(a,attachmentText[a.id]));
   if(blocks.length)content=blocks.join('\n\n')+'\n\n'+content;
  }
  if(role==='user'&&message.tools?.length)content+='\n\n'+message.tools.map(t=>`[Exact result computed by the app: ${t.label} = ${t.result}. Use this result as given.]`).join('\n');
  if(role==='user'||role==='assistant')conversationStarted=true;
  const images=role==='user'?(message.attachments||[]).filter(a=>a.kind==='image').map(a=>a.id):[];
  messages.push(images.length?{role,content,images}:{role,content});
 }
 return system.length?[{role:'system',content:system.join('\n\n')},...messages]:messages;
}
