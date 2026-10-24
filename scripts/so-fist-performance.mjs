// Matched camera, browser, viewport, settings and one passive player. The host
// wrapper measures existing work and restores itself after each sample.
import {mkdir,writeFile} from 'node:fs/promises';
import {focus} from './bibye-browser-inputs.mjs';
export async function measureRamFrames(page,seconds=8){return page.evaluate(async seconds=>{
 const r=window.__ssRuntime,host=r.socket.local,original=host.tick,frames=[],ticks=[],intervals=[],speed=[];let lastTick=null,last=null;
 host.tick=function(...args){const start=performance.now();if(lastTick!=null)intervals.push(start-lastTick);lastTick=start;if(this.room?.soFistication)speed.push(this.room.soFistication.speed);try{return original.apply(this,args);}finally{ticks.push(performance.now()-start);}};
 const started=performance.now();await new Promise(resolve=>{const next=at=>{if(last!=null)frames.push(at-last);last=at;if(at-started<seconds*1000)requestAnimationFrame(next);else resolve();};requestAnimationFrame(next);});host.tick=original;
 const stats=list=>{const sorted=[...list].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];return{samples:list.length,median:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1),over33:list.filter(v=>v>33.5).length,over50:list.filter(v=>v>50).length};};
 const gl=r.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{frames:stats(frames),hostCpu:stats(ticks),hostIntervals:stats(intervals),maxSpeed:speed.length?Math.max(...speed):0,memory:r.renderer.info.memory,viewport:[innerWidth,innerHeight],pixelRatio:r.renderer.getPixelRatio(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent,position:r.camera.position.toArray(),yaw:r.input.yaw,view:r.view,raw:{frames,ticks,intervals}};
 },seconds);}
export async function performancePractice(page,url){
 await page.route('**/shared/worlds/castleward.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('spawnPoints: [','spawnPoints: [{x:14,y:0,z:6,yaw:0},')});});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));await page.locator('#player-name').fill('Frame Sample');await page.locator('#solo-button').click();await page.locator('#practice-mode').click();await page.waitForFunction(()=>window.__ssRuntime?.localAuth&&window.__ssRuntime.world?.biByeLlista?.authoredModel);await focus(page);await page.waitForTimeout(1600);
}
export async function saveRamPerformance(results){const dir=new URL('../output/playwright/so-fist-ication',import.meta.url).pathname;await mkdir(dir,{recursive:true});await writeFile(dir+'/performance.json',JSON.stringify(results));}
