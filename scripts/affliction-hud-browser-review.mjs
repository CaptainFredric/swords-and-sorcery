// Real Chrome acceptance for the DOM and touch capture of the affliction dock.
// Synthetic player statuses are display fixtures only, never server gameplay.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host=(process.env.STATUS_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const output='output/playwright/affliction-hud';
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-status-'));
const port=9367;
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader','--remote-allow-origins=*',
  '--window-size=960,560','--remote-debugging-port='+port,
  '--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let ws,seq=0;
const pending=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function command(method,params={}){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},16000);
    pending.set(id,{
      resolve:result=>{clearTimeout(timeout);resolve(result);},
      reject:error=>{clearTimeout(timeout);reject(error);}
    });
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function until(fn,label,tries=160){
  let last;
  for(let i=0;i<tries;i++){
    try{const result=await fn();if(result)return result;}catch(error){last=error;}
    await wait(120);
  }
  throw Error('Timed out: '+label+(last?' '+last.message:''));
}
async function screenshot(name){
  const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+name+'.png',Buffer.from(r.data,'base64'));
}
async function tap(x,y){
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(110);
}
async function installFixture(){
  const {AfflictionPanel}=await import('/client/ui/AfflictionPanel.mjs');
  const hud=document.querySelector('#hud');
  hud.classList.remove('hidden');
  hud.setAttribute('aria-hidden','false');
  const panel=new AfflictionPanel(hud);
  window.__afflictionProbe=panel;
  panel.update({
    id:'me',alive:true,oneHitFrozenUntil:11,staggerUntil:11,
    electricalBacklash:{at:10,initial:12},
    blustered:{at:10,severity:1},shaken:{at:10,severity:1},
    burningUntil:12,chill:{startedAt:10,until:14,slow:.55},
    oneHitFrostSlow:{until:14,depth:.35},
    oneHitField:{id:'ground-1',ownerId:'enemy',strength:.7}
  },10.1);
  const backdrop=document.createElement('div');
  backdrop.style.cssText='position:absolute;inset:0;background:linear-gradient(140deg,#29312c,#111513);pointer-events:none';
  hud.insertBefore(backdrop,panel.dock);
  return true;
}
function inspect(){
  const panel=window.__afflictionProbe;
  const box=element=>{const r=element.getBoundingClientRect();return {
    x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height
  };};
  const buttons=[...panel.icons.querySelectorAll('button')];
  const icon=buttons[0],position=box(icon);
  const hovered=document.elementFromPoint(position.x+position.width/2,position.y+position.height/2);
  return {
    dock:box(panel.dock),icon:position,detail:box(panel.details),
    hit:hovered?.closest('button[data-effect]')?.dataset.effect??null,
    selected:panel.selectedId,visible:!panel.details.hidden,
    title:panel.heading.textContent,description:panel.description.textContent,
    buttons:buttons.length,svgCount:buttons.filter(b=>b.querySelector('svg')).length,
    hudLayer:getComputedStyle(document.querySelector('#hud')).zIndex,
    touchControlTarget:document.elementFromPoint(34,340)?.closest('.touch-controls')?.id??null,
    health:box(document.querySelector('.health-block'))
  };
}
function enableTouchCover(){
  document.body.classList.add('touch-ui');
  const layer=document.createElement('div');
  layer.className='touch-controls active';
  layer.id='affliction-touch-test-cover';
  document.querySelector('#game-shell').append(layer);
  window.__afflictionProbe.select(null);
  return true;
}
function secondIcon(){
  const r=window.__afflictionProbe.buttons.get('staggered').getBoundingClientRect();
  return {x:r.x+r.width/2,y:r.y+r.height/2};
}
try{
  const page=await until(async()=>{
    const result=await fetch('http://127.0.0.1:'+port+'/json/list');
    return (await result.json()).find(t=>t.type==='page');
  },'Chrome remote target');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const msg=JSON.parse(String(event.data)),task=pending.get(msg.id);
    if(!task)return;
    pending.delete(msg.id);
    if(msg.error)task.reject(Error(msg.error.message));else task.resolve(msg.result);
  };
  await command('Page.enable');await command('Runtime.enable');
  await command('Page.navigate',{url:host+'/?debug'});
  await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'game shell',190);
  await evaluate('('+installFixture.toString()+')()');
  const desktop=await evaluate('('+inspect.toString()+')()');
  assert.equal(desktop.buttons,9);
  assert.equal(desktop.svgCount,9,'icons are vector artwork');
  assert.equal(desktop.visible,false,'detail starts closed');
  assert.equal(desktop.hit,'frozen','desktop hit test');
  assert.ok(desktop.dock.bottom<desktop.health.y,'effects stay away from health');
  await screenshot('desktop-afflictions');

  await evaluate('window.__afflictionProbe.cycle()');
  const selected=await evaluate('('+inspect.toString()+')()');
  assert.equal(selected.selected,'frozen');
  assert.equal(selected.title,'Frozen');
  assert.equal(selected.visible,true);
  assert.doesNotMatch(selected.description,/\d+\s*(?:seconds?|%)/i);
  await screenshot('desktop-inspected');

  await command('Emulation.setDeviceMetricsOverride',{
    width:844,height:390,deviceScaleFactor:1,mobile:true,screenWidth:844,screenHeight:390,
    screenOrientation:{type:'landscapePrimary',angle:90}
  });
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await evaluate('('+enableTouchCover.toString()+')()');
  await wait(250);
  const mobile=await evaluate('('+inspect.toString()+')()');
  assert.equal(mobile.hudLayer,'13','status HUD must rise above touch controls');
  assert.equal(mobile.hit,'frozen','full-screen touch layer must not steal status taps');
  assert.equal(mobile.touchControlTarget,'affliction-touch-test-cover',
    'the rest of the touch-controls surface must still receive inputs');
  assert.ok(mobile.icon.x>=0&&mobile.icon.right<=844);
  assert.ok(mobile.icon.y>=0&&mobile.icon.bottom<=390);
  await tap(mobile.icon.x+mobile.icon.width/2,mobile.icon.y+mobile.icon.height/2);
  const tapped=await evaluate('('+inspect.toString()+')()');
  assert.equal(tapped.selected,'frozen');
  assert.equal(tapped.visible,true);
  assert.ok(tapped.detail.x>=250, 'mobile detail sidecar must stay off the left movement stick');
  assert.ok(tapped.detail.x>=0&&tapped.detail.right<=844);
  assert.ok(tapped.detail.bottom<=390,'detail must fit short landscape window');
  await screenshot('touch-inspected');

  const next=await evaluate('('+secondIcon.toString()+')()');
  await tap(next.x,next.y);
  const switched=await evaluate('('+inspect.toString()+')()');
  assert.equal(switched.selected,'staggered');
  assert.equal(switched.title,'Staggered');
  await tap(next.x,next.y);
  assert.equal((await evaluate('('+inspect.toString()+')()')).visible,false,'second tap closes details');
  await writeFile(output+'/results.json',JSON.stringify({desktop,selected,mobile,tapped,switched},null,2));
  console.log('[AFFLICTION HUD PASS] desktop, touch input, one detail, short landscape.');
}catch(error){
  console.error('[AFFLICTION HUD FAILED]',error.stack??error);
  process.exitCode=1;
}finally{
  ws?.close();chrome.kill();
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
