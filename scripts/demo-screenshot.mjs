// Regenerates brand/screenshot-demo-1.png, the screenshot on the About page. Everything on it is invented for the picture: the conversation
// is seeded below, and the scripted test provider stands in for a real one. Run it after the interface changes:
//   node scripts/demo-screenshot.mjs
// It builds dist/, serves it, drives it with Playwright and writes the PNG (a size above 250 KB is an error).
import {launch} from '../tests/e2e/harness.mjs';
import {writeFile,stat} from 'node:fs/promises';

const at=Date.UTC(2026,10,1,9,0);
const message=(role,content,offset)=>({id:'demo-m'+offset+role[0],role,content,at:at+offset*60000});
const thread=(id,title,messages,age)=>({id,title,systemPrompt:'',messages,createdAt:at-age*3600000,updatedAt:at-age*3600000+messages.length*60000});
const threads=[
 thread('demo-1','Note to my neighbour',[
  message('user','rough notes: bins went out late again, not angry, want to ask nicely if they can move them in before the weekend, thank them for last month',0),
  message('assistant','Hi Sam,\n\nThanks again for keeping an eye on the garden last month, it really helped.\n\nA small favour: could the bins be brought in before the weekend? They have been out a day or two longer than usual, and I would like to keep the street tidy for everyone.\n\nThank you,\nAlex',1)
 ],0),
 thread('demo-2','Comparing two weekend plans',[message('user','Compare a hike and a museum day for Saturday.',0),message('assistant','Hike: outdoors, free, weather dependent. Museum: indoors, small cost, fixed hours.',1)],5),
 thread('demo-3','Explain this paragraph',[message('user','What does "a stitch in time saves nine" mean?',0),message('assistant','It means fixing a small problem early prevents a bigger one later.',1)],26)
];
const storage={chatThreads:JSON.stringify(threads),'plc.activeThread.v1':'demo-1'};
// the page shows the provider's host name: use a neutral example instead of the test server's address
const init=()=>{sessionStorage.setItem('chatConfig',JSON.stringify({endpoint:'https://api.example.com/v1',token:'',model:'example-model',theme:'light'}));sessionStorage.setItem('chatModels',JSON.stringify(['example-model']));};
const h=await launch({storage,init,viewport:{width:1280,height:800}});
try{
 await h.page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await h.page.waitForSelector('.message.assistant');
 const later=h.page.getByRole('button',{name:'Remind me later'});
 if(await later.count())await later.click();
 await h.page.mouse.move(900,560);
 await h.page.waitForTimeout(500);
 const out=process.argv[2]||'brand/screenshot-demo-1.png';
 await writeFile(out,await h.page.screenshot({type:'png'}));
 const {size}=await stat(out);
 console.log(out,size,'bytes');
 if(size>250*1024)throw new Error('The screenshot is larger than 250 KB');
}finally{await h.close();}
