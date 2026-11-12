// Actual desktop and landscape-phone Chrome coverage for Chronicles.
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { launchAcceptanceChrome } from './acceptance-chrome.mjs';
import { CdpClient } from './browser-cdp.mjs';

const output='output/playwright/chronicles-hud';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-chronicles-'));
const bin=process.env.CHROME_BIN??'chromium';
const game=createGameServer({host:'127.0.0.1',port:0});
let chrome,cdp;
const results=[];
const poll=async(fn,label,timeout=45000)=>{
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await fn().catch(()=>false))return;await sleep(100);}
  throw Error('Timed out: '+label);
};
const evaluate=async(expression)=>{
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
};
const inspect=fn=>evaluate('('+fn.toString()+')()');
const shot=async(name)=>{
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
};
async function run(name,width,height,touch,url){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch,
    ...(touch?{screenOrientation:{type:'landscapePrimary',angle:90}}:{})});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:5});
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),name+' menu loaded');
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  // The main-menu label is hidden when the Chronicles banner opens, so
  // measure its two actual visible lines BEFORE routing to the manual.
  const caption=await inspect(()=>{
    const label=document.querySelector('#how-button .chronicles-command-label');
    const line=parseFloat(getComputedStyle(label).lineHeight);
    return {height:label.getBoundingClientRect().height,line,
      unbroken:getComputedStyle(label.querySelector('span')).whiteSpace==='nowrap'};
  });
  assert.ok(caption.height>=caption.line*1.8&&caption.height<=caption.line*2.3,
    'Chronicles menu caption uses exactly two lines');
  assert.ok(caption.unbroken,'CHRONICLES does not wrap inside the word');
  await evaluate("document.querySelector('#how-button').click()");
  await poll(()=>evaluate("!document.querySelector('#how-panel')?.classList.contains('hidden')"),name+' Chronicles opened');
  const initial=await inspect(()=>{
    const list=document.querySelector('#chronicles-affliction-list');
    const detail=document.querySelector('#chronicles-affliction-detail');
    const controls=document.querySelector('#chronicles-controls');
    const buttons=[...list.querySelectorAll('button')];
    const panel=document.querySelector('#how-panel .manual-scroll');
    return {count:buttons.length,hasIcon:buttons.every(b=>b.querySelector('svg')),
      hasLabels:buttons.every(b=>b.getAttribute('aria-label')),
      selected:buttons.filter(b=>b.getAttribute('aria-pressed')==='true').length,
      detailHidden:detail.hidden,controlsOpen:controls.open,
      viewHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,
      touchUI:document.body.classList.contains('touch-ui')};
  });
  assert.equal(initial.count,10,'the complete canonical affliction registry');
  assert.ok(initial.hasIcon&&initial.hasLabels,'SVG icons with accessible names');
  assert.equal(initial.selected,0);
  assert.ok(initial.detailHidden&&!initial.controlsOpen,'no initial wall of text');
  assert.ok(initial.viewHeight>60,'actual available scroll height');
  if(touch)assert.ok(initial.touchUI,'touch CSS active');
  await shot(name+'-icons');
  const selected=await inspect(()=>{
    const icon=document.querySelector('#chronicles-affliction-list button[aria-label="Shocking Conduct"]');
    icon.click();
    const detail=document.querySelector('#chronicles-affliction-detail');
    return {hidden:detail.hidden,title:detail.querySelector('h4')?.textContent,
      description:detail.querySelector('p')?.textContent,pressed:icon.getAttribute('aria-pressed')};
  });
  assert.equal(selected.hidden,false);
  assert.equal(selected.title,'Shocking Conduct');
  assert.ok(selected.description.includes('melee'));
  assert.equal(selected.pressed,'true');
  await shot(name+'-selected');
  const scroll=await inspect(()=>{
    const controls=document.querySelector('#chronicles-controls');
    controls.querySelector('summary').click();
    const manual=document.querySelector('#how-panel .manual-scroll');
    manual.scrollTop=manual.scrollHeight;
    return {open:controls.open,max:manual.scrollHeight-manual.clientHeight,
      current:manual.scrollTop,visible:!!controls.querySelector('.controls-grid')};
  });
  assert.ok(scroll.open&&scroll.visible,'controls expanded');
  assert.ok(scroll.max>10&&scroll.current>0,'scroll reaches additional controls');
  await shot(name+'-controls');
  const notice=await inspect(()=>{
    const root=document.createElement('div');
    root.style.cssText='position:fixed;inset:0;z-index:100;pointer-events:none';
    document.querySelector('#game-shell').append(root);
    const flash=document.createElement('div');
    flash.className='status-flash show';flash.textContent='VIEW: THIRD PERSON';
    root.append(flash);
    const b=flash.getBoundingClientRect();
    const r={x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};
    root.remove();
    return r;
  });
  assert.ok(notice.width>30&&notice.width<340&&notice.height<90,'notice is compact');
  assert.ok(notice.x<width*.53&&notice.y>height*.57,'notice is off-center and low');
  assert.ok(notice.right<width*.7,'no crosshair collision');
  results.push({name,caption,initial,selected,scroll,notice});
  console.log('[CHRONICLES HUD PASS]',name,JSON.stringify({icons:initial.count,scroll,notice}));
}
try{
  await game.start();
  const url='http://127.0.0.1:'+game.address().port;
  chrome=launchAcceptanceChrome(bin,profile,join(output,'chrome.log'),{width:1280,height:800});
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await run('desktop',1280,800,false,url);
  await run('phone',844,390,true,url);
  await writeFile(join(output,'result.json'),JSON.stringify(results,null,2)+'\n');
}catch(error){
  console.error('[CHRONICLES HUD FAIL]',error.stack);
  await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),results},null,2));
  process.exitCode=1;
}finally{
  cdp?.close();chrome?.child?.kill('SIGTERM');await game.stop().catch(()=>{});
  await sleep(350);await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
