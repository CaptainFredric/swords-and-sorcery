// Private test course. It replaces only the served world definition and spawn
// configuration. Driving, aiming, deployment and firing use ordinary UI input.
import {mkdir,writeFile} from 'node:fs/promises';
import {startPractice,state,waitFor,aim,capture,focus} from './bibye-browser-inputs.mjs';
const rad=n=>n*Math.PI/180;
const floor={id:'test-ground',center:[0,-.15,0],size:[30,.3,70],y:0,material:'grass'};
export function terrainCourse(degrees=0,step=0,cross=false){
 const entry=3*Math.tan(rad(degrees/2)),top=entry+11*Math.tan(rad(degrees));
 return {id:'castleward',name:'Vehicle terrain test course',zones:[],props:[],spawnPoints:[{x:0,y:0,z:-6.8,yaw:Math.PI}],navigation:{nodes:[]},navigationHints:[],abyssY:-20,
  floors:cross?[]:[floor,...(degrees?[{id:'test-plateau',center:[0,top-.15,23],size:[10,.3,18],y:top,material:'stone'}]:[])],
  ramps:cross?[{id:'test-cross-slope',minX:-12,maxX:12,minZ:-15,maxZ:25,startY:-12*Math.tan(rad(degrees)),endY:12*Math.tan(rad(degrees)),axis:'x'}]:degrees?[
   {id:'test-entrance',minX:-5,maxX:5,minZ:0,maxZ:3,startY:0,endY:entry,axis:'z'},
   {id:'test-grade',minX:-5,maxX:5,minZ:3,maxZ:14,startY:entry,endY:top,axis:'z'}]:[],
  solids:step?[{id:'test-curb',center:[0,step/2,4],size:[10,step,8],material:'stone'}]:[]};
}
export async function installCourse(page,world){
 await page.route('**/shared/worlds/castleward.mjs',route=>route.fulfill({contentType:'text/javascript',body:`export const CASTLEWARD=Object.freeze(${JSON.stringify(world)});`}));
 await page.route('**/shared/sim/Room.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:"import {createBiByeLlista} from './biByeLlista.mjs';\n"+(await r.text()).replace('this.biByeLlista = null;','this.biByeLlista = createBiByeLlista({x:0,z:-4,baseYaw:Math.PI});')});});
 await page.route('**/client/worlds/CastlewardRenderer.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('buildCastlewardDecorPlan(1337)',"{paths:[],banners:[],runeStones:[],trees:[],forest:[],houses:[],torches:[],braziers:[]}").replace('this.#landscape(batch, rand);','')});});
}
export async function terrainBrowser(chromium,{url='http://127.0.0.1:3237/?debug',folder='output/playwright/bibye-terrain',headless=true,only=null}={}){
 await mkdir(folder,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless}),results=[];
 try{
  for(const [name,world] of [['grade22',terrainCourse(22)],['cross14',terrainCourse(14,0,true)],['curb25',terrainCourse(0,.25)],['deploy6',terrainCourse(6)]]){
   if(only&&!only.includes(name))continue;
   const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,recordVideo:{dir:folder,size:{width:1280,height:800}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await installCourse(page,world);
   await startPractice(page,url);await focus(page);await page.keyboard.press('t');await waitFor(page,s=>s.player.operatingBallistaId,'terrain mount');await aim(page,Math.PI,.05);
   const trace=[];const timer=setInterval(()=>state(page).then(s=>trace.push({t:s.now,b:s.ballista})).catch(()=>{}),100);
   await page.keyboard.down('w');
   if(name==='cross14')await page.waitForTimeout(2400);else await waitFor(page,s=>s.ballista.z>6,name+' climb',30000);
   await page.keyboard.up('w');await aim(page,Math.PI/2,.03);await page.waitForTimeout(250);await capture(page,name+'-side.png',folder);
   if(name==='grade22'){
    await page.keyboard.press('b');await page.waitForTimeout(150);await capture(page,'grade22-deploy-rejected.png',folder);
    await page.keyboard.press('f');await page.waitForTimeout(250);await capture(page,'grade22-upper-fire.png',folder);
    await page.keyboard.down('s');await waitFor(page,s=>s.ballista.z< -2.5,'reverse downhill',20000);await page.keyboard.up('s');await capture(page,'grade22-reverse.png',folder);
   }
   if(name==='deploy6'){
    await page.keyboard.press('b');await waitFor(page,s=>s.ballista.mode==='DEPLOYED','mild grade deploy');await aim(page,Math.PI,.15);await page.waitForTimeout(600);await capture(page,'deploy6-aim.png',folder);
    await page.keyboard.press('f');await waitFor(page,s=>s.ballista.coupling==='FIRING','inclined volley');await page.waitForTimeout(750);await capture(page,'deploy6-volley.png',folder);
    await page.keyboard.press('x');await waitFor(page,s=>s.ballista.weaponFocus==='UPPER','inclined upper');await aim(page,0,.02);await page.waitForTimeout(2400);await page.keyboard.press('f');await page.waitForTimeout(300);await capture(page,'deploy6-rear.png',folder);
   }
   clearInterval(timer);const result={name,state:await state(page),trace,errors};results.push(result);await writeFile(folder+'/'+name+'.json',JSON.stringify(result,null,2));console.log(name,JSON.stringify({position:result.state.ballista.position,pitch:result.state.ballista.chassisPitch,roll:result.state.ballista.chassisRoll,errors}));await context.close();
  }
 }finally{await browser.close();await writeFile(folder+'/terrain-summary.json',JSON.stringify(results.map(({trace,...rest})=>rest),null,2));}
 return results;
}
