// WebGL presentation evidence in the real Practice and Restless Day runtimes.
// Camera and cue times are staged. Authority and reward acceptance are covered
// separately by renown-trials-browser and restless-day-browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';
import { ProfileStore } from '../server/src/ProfileStore.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const label = process.env.RENOWNER_CAPTURE ?? 'after';
const out = `output/renowner-correction/${label}`;
await mkdir(out, {recursive:true});
const temp = await mkdtemp(join(tmpdir(),'renowner-visual-'));
const server = createGameServer({port:0, host:'127.0.0.1', profileStore:new ProfileStore(temp)});
await server.start();
const browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader']});
const errors = [];
const results = [];
try {
  for (const world of (process.env.RENOWNER_WORLD ? [process.env.RENOWNER_WORLD] : ['court','restless'])) {
    const context = await browser.newContext({viewport:{width:1280,height:800}});
    const page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug`);
    await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
    const skip=page.locator('[data-tutorial-onboarding-skip]');
    if(await skip.isVisible())await skip.click();
    await page.locator('#player-name').fill('Renowner review');
    if (world==='court') {
      await page.locator('#solo-button').click();
      await page.locator('#practice-mode').click();
      const details=page.locator('#solo-details');
      if(await details.isVisible())await details.click();
      await page.locator('#solo-arena [data-arena="court-of-merit"]').click();
      await page.locator('#solo-launch').click();
    } else {
      await page.locator('#breakthrough-button').click();
      await page.locator('[data-mettle-mode=RESTLESS_DAY]').click();
      await page.locator('#breakthrough-play-bots').click();
    }
    await page.waitForFunction(()=>Boolean(window.__ssRuntime?.world?.renowner?.model),null,{timeout:45000});
    await page.locator('#arena-gate').waitFor({state:'hidden'});
    await page.addStyleTag({content:'body > :not(#game-canvas){visibility:hidden!important} #game-canvas{visibility:visible!important}'});
    const inspection=await page.evaluate(async world=>{
      const {Vector3,Box3,Quaternion}=await import('three');
      const {RENOWNER_BLADE_TIP,restlessRenownerBlade}=await import('/shared/worlds/renownerGeometry.mjs');
      const r=window.__ssRuntime, w=r.world, v=w.renowner;
      const room=r.socket.local.room;
      room.inspectionFrozenActors=new Set(room.players.keys());
      const player=room.players.get(r.playerId);
      player.position=world==='court'?{x:-2.6,y:.8,z:13}:{x:3.2,y:0,z:51};
      player.velocity={x:0,y:0,z:0};player.spawnProtectionUntil=Infinity;
      room.tick=function(){this.events=[];};
      const camera=r.camera.clone();camera.fov=45;camera.updateProjectionMatrix();
      if(world==='court') {camera.position.set(5.2,3.4,7.6);camera.lookAt(0,3.4,15.8);}
      else {camera.position.set(8,5.4,44);camera.lookAt(0,3.9,55);}
      const render=r.renderer.render.bind(r.renderer);
      r.renderer.render=()=>{};
      r.remotePlayers.showSelf(player,{position:player.position,yaw:Math.PI,velocity:player.velocity},
        r.socket.serverNow(),performance.now(),0,true);
      const courtUpdate=w.update.bind(w);
      w.update=()=>{};
      const canvas=r.renderer.domElement;
      window.review={r,w,v,camera,Vector3,world,render,courtUpdate,tip:RENOWNER_BLADE_TIP,blade:restlessRenownerBlade,playerPosition:new Vector3(player.position.x,player.position.y,player.position.z),
        setCamera(overview){
          if(world==='court'){
            camera.position.set(...(overview?[12,8,-4]:[5.2,3.4,7.6]));
            camera.lookAt(0,3.4,15.8);
          }
        }};
      const poseBlade=v.poseBlade.bind(v);
      v.poseBlade=(grip,tip)=>{
        v.group.updateWorldMatrix(true,true);
        const root=v.group.getWorldQuaternion(new Quaternion());
        const orientation=new Quaternion().setFromUnitVectors(new Vector3(...RENOWNER_BLADE_TIP).normalize(),
          tip.clone().sub(grip).normalize().applyQuaternion(root.clone().invert())).premultiply(root);
        const targets=v.arms.map(([, ,wrist])=>v.sword.worldToLocal(wrist.getWorldPosition(new Vector3()))
          .multiplyScalar(v.scale*v.swordScale).applyQuaternion(orientation).add(grip));
        poseBlade(grip,tip);
        window.review.handErrors=v.arms.map(([, ,wrist],i)=>wrist.getWorldPosition(new Vector3()).distanceTo(targets[i]));
      };
      const asset=[];
      for(const t of [0,.8,1.7,2.15,2.8,3.4,4.05,5.5]){
        v.sample('01_Knighting_And_Dispense_Cycle',t);
        asset.push({t,grip:v.sword.getWorldPosition(new Vector3()).toArray(),
          tip:v.sword.localToWorld(new Vector3(...RENOWNER_BLADE_TIP)).toArray()});
      }
      if(world==='restless'){
        // Fixed daylight for a matched comparison; the capture does not advance
        // the siege objective clock or adjudicate any gameplay outcome.
        w.lastMode={...r.latestSnapshot.modeState,deadline:r.socket.serverNow()+780};
        courtUpdate(r.socket.serverNow());
      }
      return {world,asset,bounds:new Box3().setFromObject(v.model).getSize(new Vector3()).toArray()};
    },world);
    const stages=world==='court'
      ? [['idle-cycle',12,null],['left-dip',3.5,'KNIGHTING',false],['right-dip',3.5,'KNIGHTING',true],
        ['compensation',4,'coin'],['execution',5.6,'sword'],['evasion-retaliation',10.5,'retaliation'],['court-overview',3,null]]
      : [['downstroke',3,'downstroke'],['sweep',3,'sweep']];
    for(const [name,seconds,kind,alternate] of stages){
      if(process.env.RENOWNER_SCENE && name!==process.env.RENOWNER_SCENE)continue;
      await page.evaluate(({name,kind,alternate})=>{
        const q=window.review,{r,w,v,Vector3}=q;
        q.setCamera(name==='court-overview');
        w.coinVisuals?.forEach(c=>w.group.remove(c.mesh));
        if(w.coinVisuals)w.coinVisuals.length=0;
        w.lastCeremonyId=null;w.handledCues?.clear();
        const canvas=r.renderer.domElement;
        q.parts=[];q.recorder=new MediaRecorder(canvas.captureStream(24),{mimeType:'video/webm;codecs=vp9'});
        q.recorder.ondataavailable=event=>q.parts.push(event.data);
        q.recorder.start();q.started=performance.now();q.samples=[];q.freezeAt=null;
        q.update=()=>{
          const t=q.freezeAt??(performance.now()-q.started)/1000;
          if(q.world==='court'){
            let cue=null;
            if(kind==='KNIGHTING')cue=t<1.1?'SWORD_RAISE':'KNIGHTING';
            if(kind==='coin')cue=t<2.1?'SOLEMN_JUDGMENT':t<3.1?'CONSOLATION_COIN':'CONSOLATION_REACTION';
            if(kind==='sword')cue=t<1.7?'SWORD_RAISE':t<3?'SWORD_EXECUTION':t<4.8?'SWORD_RESET':'LATE_COIN';
            if(kind==='retaliation')cue=t<1.8?'SWORD_RAISE':t<3?'SWORD_EVADED':t<5.2?'I_HAVE_SURPASSED_JUDGEMENT':t<7?'SWORD_RESET':t<9.3?'RECEIVE_COMPENSATION':'COIN_RETALIATION';
            const ceremony=kind?{id:name,startedAt:0,cue}:null;
            w.setTrialState({renownTrial:ceremony?{waveIndex:alternate?1:2,ceremony}:null},t);
            // Preserve the production coin/court update and direct the pose's
            // alternating selection explicitly for comparable left/right takes.
            q.courtUpdate(t,q.camera,1/24);
          }else{
            v.restless(t,{position:{x:0,y:1.4,z:56},yaw:Math.PI,health:1650,
              attack:{type:kind,startedAt:0,contactAt:1.05}});
          }
          v.group.updateWorldMatrix(true,true);
          const grip=v.sword.getWorldPosition(new Vector3());
          const tip=v.sword.localToWorld(new Vector3(...q.tip));
          let contactError=0;
          if(q.world==='restless' && t>=1.05 && t<=1.30){
            const segment=q.blade({position:{x:0,y:1.4,z:56},yaw:Math.PI,attack:{type:kind,contactAt:1.05}},t);
            contactError=Math.max(grip.distanceTo(new Vector3(...segment.a)),tip.distanceTo(new Vector3(...segment.b)));
          }
          const self=r.remotePlayers.self?.root;
          if(self){self.visible=true;self.position.copy(q.playerPosition);}
          q.render(r.scene,q.camera);
          q.samples.push({t,grip:grip.toArray(),tip:tip.toArray(),scale:v.sword.getWorldScale(new Vector3()).toArray(),
            contactError,morph:v.sword.morphTargetInfluences?.[0]??0,handErrors:q.handErrors});
          q.raf=requestAnimationFrame(q.update);
        };
        q.update();
      },{name,kind,alternate});
      // Initializing the update closure once keeps the presentation renderer
      // itself identical to the runtime used in gameplay.
      const first=world==='restless'?1150:seconds*500;
      await page.waitForTimeout(first);
      await page.evaluate(time=>{window.review.freezeAt=time;},world==='restless'?1.175:seconds/2);
      await page.waitForTimeout(80);
      await page.screenshot({path:join(out,`${world}-${name}.png`)});
      await page.evaluate(()=>{window.review.freezeAt=null;});
      await page.waitForTimeout(seconds*1000-first);
      const data=await page.evaluate(async()=>{
        const q=window.review;cancelAnimationFrame(q.raf);
        await new Promise(resolve=>{q.recorder.onstop=resolve;q.recorder.stop();});
        const bytes=new Uint8Array(await new Blob(q.parts).arrayBuffer());
        let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return {video:btoa(binary),samples:q.samples};
      });
      await writeFile(join(out,`${world}-${name}.webm`),Buffer.from(data.video,'base64'));
      if(label==='after')for(const sample of data.samples){
        assert.equal(sample.morph,0,'Sword must remain rigid');
        assert.ok(sample.contactError<.001,'Visible sword must agree with contact segment');
        assert.ok((sample.handErrors??[]).every(error=>error<.03),'Both hands must stay on the hilt '+JSON.stringify(sample.handErrors));
        assert.ok(Math.max(...sample.scale)-Math.min(...sample.scale)<1e-6,'Uniform proportions required');
      }
      results.push({...inspection,name,samples:data.samples});
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'poses.json'),JSON.stringify(results,null,2));
  console.log('Captured',label,results.map(r=>r.name).join(', '));
} finally {
  await browser.close();await server.stop();await rm(temp,{recursive:true,force:true});
}
