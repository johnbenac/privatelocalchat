const B64='@@BASE64_OF_THE_PACKAGE_FILE@@';const NAME='@@FILE_NAME@@';
const text=new TextDecoder().decode(Uint8Array.from(atob(B64),c=>c.charCodeAt(0)));
window.__pics={made:[],revoked:[]};
if(!window.__origCreate){window.__origCreate=URL.createObjectURL.bind(URL);window.__origRevoke=URL.revokeObjectURL.bind(URL);}
URL.createObjectURL=b=>{const u=window.__origCreate(b);if(b&&/^image\//.test(b.type))window.__pics.made.push(u);return u;};
URL.revokeObjectURL=u=>{window.__pics.revoked.push(u);return window.__origRevoke(u);};
const origClick=HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click=function(){if(this.type==='file'){const dt=new DataTransfer();dt.items.add(new File([text],NAME,{type:'application/json'}));this.files=dt.files;this.dispatchEvent(new Event('change'));}else origClick.call(this);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const btn=document.getElementById('previewCharacterBtn');
const out={name:NAME,buttonPresent:!!btn,buttonHidden:btn&&btn.hidden};
btn.focus();btn.click();
for(let i=0;i<80&&!document.querySelector('.app-dialog');i++)await wait(100);
await wait(600);
const dlg=document.querySelector('.app-dialog');
out.dialogOpened=!!dlg;
if(dlg){
  out.title=dlg.querySelector('h2')&&dlg.querySelector('h2').textContent;
  out.h3=dlg.querySelector('h3')&&dlg.querySelector('h3').textContent;
  const card=dlg.querySelector('.pkg-card');
  out.card=card?{palette:card.dataset.palette||null,layout:card.dataset.layout||null,ownLook:card.classList.contains('pkg-own-look')}:null;
  out.images=[...dlg.querySelectorAll('.pkg-card img')].map(i=>({cls:i.className,alt:i.alt,ariaHidden:i.getAttribute('aria-hidden'),loaded:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight,src:i.src.slice(0,5)}));
  out.notes=[...dlg.querySelectorAll('.pkg-note')].map(n=>n.textContent.slice(0,160));
  out.facts=[...dlg.querySelectorAll('.pkg-facts li:not(.pkg-note)')].map(n=>n.textContent.slice(0,140));
  out.isPreviewDialog=/Preview character package/.test(dlg.textContent);
  out.alertTitle=dlg.querySelector('h2')&&dlg.querySelector('h2').textContent;
  out.alertText=!out.isPreviewDialog?dlg.querySelector('.dialog-body').textContent.slice(0,200):null;
  const turn=dlg.querySelector('.pkg-turn');
  if(turn){const s=getComputedStyle(turn);out.turnColours={fg:s.color,bg:s.backgroundColor};}
  out.focusInsideDialog=!!(document.activeElement&&document.activeElement.closest('.app-dialog'));
  const sheet=dlg.querySelector('.sheet');out.reflow={scrollW:sheet.scrollWidth,clientW:sheet.clientWidth,innerW:innerWidth,pageScrollW:document.documentElement.scrollWidth};
  out.reducedMotionQuery=matchMedia('(prefers-reduced-motion: reduce)').matches;
  out.animationsInPreview=document.getAnimations().filter(a=>a.effect&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest('.pkg-preview')).length;
  if(dlg.querySelector('.pkg-toggle input')){const t=dlg.querySelector('.pkg-toggle input');t.click();await wait(200);out.ownLookToggleOn={palette:card.dataset.palette||null,layout:card.dataset.layout||null};t.click();await wait(200);out.ownLookToggleOff={palette:card.dataset.palette||null};}
  for(let i=0;i<8;i++){document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));}
  out.focusStillInside=!!(document.activeElement&&document.activeElement.closest('.app-dialog'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(400);
  out.closedByEscape=!document.querySelector('.app-dialog');
  out.focusReturnedTo=document.activeElement&&document.activeElement.id;
}
out.pics={made:window.__pics.made.length,revokedAllMade:window.__pics.made.every(u=>window.__pics.revoked.includes(u))};
HTMLInputElement.prototype.click=origClick;
return out;
