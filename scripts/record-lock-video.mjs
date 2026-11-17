// Records the lock screen in use: an encrypted chat is set up first (off camera), then the video shows the app locking, a wrong passphrase, and the unlock.
//   node scripts/record-lock-video.mjs <out.mp4> [light|dark]
import {launch} from '../tests/e2e/harness.mjs';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {renameSync} from 'node:fs';
const out=process.argv[2]||'/tmp/lock-animation.mp4',theme=process.argv[3]||'light';
const SIZE={width:430,height:880};
const MODEL='Qwen3.5-9B';
// the chat shows one of the app's real model names (not the test server's), and the replies come from a scripted local test server
const useQwen=(theme)=>{try{const c=JSON.parse(sessionStorage.getItem('chatConfig')||'{}');c.theme=theme;c.model='Qwen3.5-9B';if(c.endpoint)c.endpoint=c.endpoint.replace('127.0.0.1','localhost');sessionStorage.setItem('chatConfig',JSON.stringify(c));sessionStorage.setItem('chatModels',JSON.stringify(['Qwen3.5-9B']));}catch{}};
const h=await launch({port:19470,viewport:SIZE,init:`(${useQwen.toString()})('${theme}')`,launchArgs:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}); // software WebGL, so the 3D padlock draws in headless Chromium
const {page,context,browser,origin}=h;
const ready=async p=>{await p.waitForSelector('#messageInput');await p.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:20000});};
const dir=await mkdtemp(join(tmpdir(),'plc-video-'));
try{
  // off camera: a conversation, then turn encryption on
  await ready(page);
  await page.fill('#messageInput','What secret ingredient should I put in my chili to win the cookoff?');await page.click('#sendBtn');
  await page.waitForFunction(()=>/^Response complete/.test(document.querySelector('#generationStatus').textContent),null,{timeout:20000});
  await page.evaluate(()=>window.plcShell.openSettings('security'));
  await page.click('.set-row:has-text("App lock") button');
  await page.fill('#lockNew1','correct horse');await page.fill('#lockNew2','correct horse');await page.check('#lockEncrypt');
  await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")',{timeout:30000});await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(()=>!localStorage.getItem('chatThreads'));await page.waitForTimeout(1500);
  const state=await context.storageState({indexedDB:true});
  // on camera
  const ctx=await browser.newContext({storageState:state,viewport:SIZE,recordVideo:{dir,size:SIZE},colorScheme:theme});
  const v=await ctx.newPage();
  await v.addInitScript(t=>{try{localStorage.setItem('plc.theme.v1',t);}catch{}},theme);
  await v.addInitScript(()=>{const f=()=>document.querySelectorAll('.message-model').forEach(n=>{if(/ · (localhost|127\.0\.0\.1)$/.test(n.textContent))n.textContent=n.textContent.replace(/ · (localhost|127\.0\.0\.1)$/,'');});new MutationObserver(f).observe(document,{subtree:true,childList:true,characterData:true});}); // the model name only: no host after it
  await v.goto(origin+'/');
  await v.waitForSelector('#lockScreen',{state:'visible'});
  await v.waitForTimeout(1500);                                           // the lock snaps shut as the screen appears
  await v.locator('#unlockPass').pressSequentially('wrong guess',{delay:85});await v.waitForTimeout(250);
  await v.press('#unlockPass','Enter');await v.waitForTimeout(1200);      // a wrong passphrase: the lock shakes and flushes red
  await v.fill('#unlockPass','');await v.locator('#unlockPass').pressSequentially('correct horse',{delay:85});await v.waitForTimeout(300);
  await v.press('#unlockPass','Enter');                                   // the right one: the lock opens in green, the screen fades, the chat is there
  await v.waitForSelector('#lockScreen',{state:'hidden',timeout:20000});await ready(v);
  await v.waitForFunction(()=>[...document.querySelectorAll('.message.user')].some(n=>/cookoff/.test(n.textContent)),null,{timeout:15000});
  await v.waitForTimeout(1300);                                           // the video ends here, on the unlocked chat; the end hold is added below
  await v.close();await ctx.close();
  const webm=(await readdir(dir)).find(f=>f.endsWith('.webm'));
  // a browser address bar under the picture, so the lock is seen where it lives: privatelocal.chat
  const BAR=96,dark=theme==='dark';
  const barPage=await browser.newPage({viewport:{width:SIZE.width,height:BAR}});
  const barHtml=`<body style="margin:0;width:${SIZE.width}px;height:${BAR}px;background:${dark?'#1c1c1e':'#f2f2f7'};border-top:1px solid ${dark?'#2c2c2e':'#d1d1d6'};box-sizing:border-box;font:16px -apple-system,system-ui,Helvetica,Arial,sans-serif;display:flex;align-items:flex-start;justify-content:center;padding-top:12px">
    <div style="display:flex;align-items:center;gap:8px;width:${SIZE.width-32}px;height:46px;border-radius:14px;background:${dark?'#2c2c2e':'#e3e3e8'};justify-content:center;color:${dark?'#f2f2f7':'#1c1c1e'}">
      <svg width="15" height="17" viewBox="0 0 15 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="1.5" y="7.5" width="12" height="8" rx="2.2" fill="currentColor" stroke="none" opacity=".85"/><path d="M4 7.5V5a3.5 3.5 0 0 1 7 0v2.5"/></svg>
      <span>https://privatelocal.chat</span></div></body>`;
  await barPage.setContent(barHtml);
  const barPng=join(dir,'bar.png');await barPage.screenshot({path:barPng});await barPage.close();
  execFileSync('ffmpeg',['-y','-loglevel','error','-ss','0.3','-i',join(dir,webm),'-i',barPng,'-filter_complex',`[0:v]pad=iw:ih+${BAR}:0:0:color=${dark?'#1c1c1e':'#f2f2f7'}[p];[p][1:v]overlay=0:H-h,tpad=stop_mode=clone:stop_duration=3,pad=ceil(iw/2)*2:ceil(ih/2)*2[v]`,'-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-movflags','+faststart',out]);
  if(dark){ // the page reload on re-lock flashes a blank white frame before the dark theme paints: cut those frames out
    const r=spawnSync('ffmpeg',['-i',out,'-vf','signalstats,metadata=print:key=lavfi.signalstats.YAVG','-f','null','-'],{encoding:'utf8'});
    const times=[...(r.stderr||'').matchAll(/pts_time:([0-9.]+)[^\n]*\n[^\n]*YAVG=([0-9.]+)/g)].filter(m=>+m[2]>150).map(m=>+m[1]);
    console.log('white frames at',times.join(' '));
    if(times.length){const t0=Math.min(...times)-0.02,t1=Math.max(...times)+0.03,tmp=out+'.tmp.mp4';
      execFileSync('ffmpeg',['-y','-loglevel','error','-i',out,'-vf',`select='not(between(t,${t0},${t1}))',setpts=N/FRAME_RATE/TB`,'-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-movflags','+faststart',tmp]);
      renameSync(tmp,out);}
  }
  console.log('wrote',out);
  // a poster still (twice the resolution) for uploading the video: the lock, closed, in its screen, with the address bar
  const pctx=await browser.newContext({storageState:state,viewport:SIZE,deviceScaleFactor:2,colorScheme:theme});
  const pp=await pctx.newPage();await pp.addInitScript(t=>{try{localStorage.setItem('plc.theme.v1',t);}catch{}},theme);
  await pp.goto(origin+'/');await pp.waitForSelector('#lockScreen',{state:'visible'});await pp.waitForTimeout(2600); // the bar has snapped shut and settled
  const shot=join(dir,'poster-page.png');await pp.screenshot({path:shot});await pctx.close();
  const bar2=await browser.newPage({viewport:{width:SIZE.width,height:BAR},deviceScaleFactor:2});
  await bar2.setContent(barHtml);
  const bar2png=join(dir,'bar2.png');await bar2.screenshot({path:bar2png});await bar2.close();
  const posterOut=out.replace(/\.mp4$/,'-poster.png');
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',shot,'-i',bar2png,'-filter_complex',`[0:v]pad=iw:ih+${BAR*2}:0:0:color=${dark?'#1c1c1e':'#f2f2f7'}[p];[p][1:v]overlay=0:H-h[v]`,'-map','[v]','-frames:v','1',posterOut]);
  console.log('wrote',posterOut);
}finally{await h.close();await rm(dir,{recursive:true,force:true});}
