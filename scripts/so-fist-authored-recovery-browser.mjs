// Actual Chrome input with parked-machine fixtures. Pose sampling changes only
// the renderer. Wall, launch, pickup and multiplayer outcomes come from rooms.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/src/server.mjs';
import { ProfileStore } from '../server/src/ProfileStore.mjs';
import { createSoFistication, damageSoFistication, soFistEntry } from '../shared/sim/soFistication.mjs';
import { createBiByeLlista } from '../shared/sim/biByeLlista.mjs';
import { ramState, ramWait } from './so-fist-browser.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = new URL('../output/playwright/so-fist-asset-recovery/', import.meta.url).pathname;
const proof = process.env.RAM_PROOF ?? 'all';
const temp = await mkdtemp(join(tmpdir(),'castleward-authored-ram-'));
await mkdir(out, { recursive: true });
const server = createGameServer({ port: 0, host: '127.0.0.1', profileStore: new ProfileStore(temp) });
await server.start();
const url = `http://127.0.0.1:${server.address().port}/?debug`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding',
] });
const errors = [];
const monitor = page => page.on('pageerror', error => errors.push(error.message));
const evidence = {};
const writeJson = (name,data) => writeFile(join(out,name+'.json'), JSON.stringify(data,null,2));
const watchEvents = page => page.evaluate(() => {
  window.__ramEvents = [];
  window.__ssRuntime.socket.on('events', batch => window.__ramEvents.push(...batch.events));
});
const screenshot = (page,name) => page.screenshot({path:join(out,name+'.png')});

async function focus(page) {
  await page.bringToFront();
  if(await page.evaluate(()=>window.__ssRuntime.input.enabled&&Boolean(document.pointerLockElement)))return;
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    for(let attempt=0;attempt<3;attempt++){
      const box=await page.locator('#game-canvas canvas').boundingBox();
      const x=box.x+box.width*.56,y=box.y+box.height*.47;
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});
      try{
        await page.waitForFunction(()=>window.__ssRuntime.input.enabled&&document.pointerLockElement,null,{timeout:1400});
        return;
      }catch(error){if(error.name!=='TimeoutError')throw error;}
    }
    throw new Error('Chrome did not accept real pointer lock input');
  }finally{await cdp.detach();}
}

async function localPractice(page, { rollback = false, touch = false, wall = false } = {}) {
  const z = wall ? -4.15 : 0;
  if (rollback) await page.route('**/so-fist-ication-elevating-ram.glb*', route => route.abort());
  await page.route('**/shared/worlds/castleward.mjs', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('spawnPoints: [',`spawnPoints: [{x:17,y:0,z:${z+3.25},yaw:0},`);
    await route.fulfill({ response, body:source });
  });
  await page.route('**/shared/sim/Room.mjs', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replaceAll('this.soFistication = null;',
      `this.soFistication = this.mode==='PRACTICE'?createSoFistication({x:17,y:0,z:${z},heading:0}):null;`);
    await route.fulfill({ response, body:source });
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#loading-veil')?.classList.contains('done'));
  const skip = page.locator('[data-tutorial-onboarding-skip]');
  if (await skip.isVisible()) await skip.click();
  await page.locator('#player-name').fill('Ram Recovery');
  await page.locator('#solo-button').click();
  await page.locator('#practice-mode').click();
  await page.locator('#solo-launch').click();
  await page.waitForFunction(() => window.__ssRuntime?.ramRenderer.model && window.__ssRuntime.localAuth);
  assert.equal(await page.evaluate(() => window.__ssRuntime.ramRenderer.authoredElevation),!rollback);
  await watchEvents(page);
  await page.waitForFunction(()=>document.querySelector('#arena-gate').classList.contains('hidden'));
  if (touch) await page.locator('#game-canvas canvas').tap({position:{x:480,y:245}});
  else await focus(page);
}

async function viewSample(page,name) {
  const { png, ...sample } = await page.evaluate(async () => {
    const {Vector3}=await import('three');
    const {boxLocal}=await import('/shared/src/orientedBox.mjs');
    const {soFistStriker,soFistFrame}=await import('/shared/sim/soFistGeometry.mjs');
    const r=window.__ssRuntime, v=r.ramRenderer, b=v.presentationData;
    const c=r.camera.clone(), p=v.group.position;
    c.position.copy(p).add(new Vector3(11.5,5.6,-8.5));
    c.fov=42;c.updateProjectionMatrix();c.lookAt(p.x,p.y+3,p.z-.75);
    r.renderer.render(r.scene,c);
    const png=r.renderer.domElement.toDataURL();
    const node=name=>v.nodes.get(name);
    const world=name=>node(name)?.getWorldPosition(new Vector3()).toArray();
    const a=new Vector3(...world('Arcane_Stator_Collar'));
    const w=new Vector3(...world('Wrist_Resonator_Ring'));
    const axis=node('Ram_Assembly').getWorldDirection(new Vector3());
    const coaxial=w.clone().sub(a).cross(axis).length();
    const piston=soFistStriker({...b,fistMounted:false},b.poseTime);
    const face=piston.center.map((n,i)=>n+piston.axes[2][i]*piston.size[2]/2);
    const tip=world('piston_exposed_striker_tip');
    const actualTip=tip?v.group.worldToLocal(new Vector3(...tip)):null;
    const authoritativeTip=new Vector3(...boxLocal(soFistFrame(b),face));
    return {png,b,coaxial,
      stator:a.toArray(),wrist:w.toArray(),tipError:actualTip?.distanceTo(authoritativeTip)??null,
      station:world('operator_onboard_rider'),frame:soFistFrame(b),
      fistVisible:node('Armored_Fist').visible,wristVisible:node('Wrist_Resonator_Ring').visible,
      detached:Boolean(v.detachedVisual),standalone:Boolean(v.detachedTemplate),
      debris:Boolean(v.debris),authored:v.authoredElevation,camera:r.camera.position.toArray()};
  });
  await writeFile(join(out,name+'.png'), Buffer.from(png.split(',')[1],'base64'));
  await writeJson(name,sample);
  return sample;
}

const mounted = page => ramWait(page, s=>s.p.operatingRamId,'mounted');
const strikeDone = page => ramWait(page, s=>s.b.strikeAt==null,'stroke recovery');
async function strike(page) { await page.mouse.down(); await page.mouse.up(); }
async function liftDesktop(page,up,timeout=25000) {
  const key=up?'e':'c';
  await page.mouse.down({button:'right'});
  try {
    await page.keyboard.down(key);
    await ramWait(page,s=>up?s.b.ramLiftY>1.36:s.b.ramLiftY<.012,up?'full lift':'fully lowered',timeout);
  } finally { await page.keyboard.up(key); await page.mouse.up({button:'right'}); }
}
async function pitchDesktop(page,up) {
  const key=up?'e':'c';
  await page.keyboard.down(key);
  try { await ramWait(page,s=>up?s.b.ramElevPitch>.87:s.b.ramElevPitch<.01,up?'full pitch':'level',25000); }
  finally { await page.keyboard.up(key); }
}
async function peak(page){
  await page.waitForFunction(() => {
    const b=window.__ssRuntime.ramRenderer.presentationData;
    const age=b.poseTime-b.strikeAt;
    return b.strikeAt!=null&&age>.87&&age<1.24;
  });
}
async function sightSample(page,name) {
  const result=await page.evaluate(async()=>{
    const {Raycaster,Vector2}=await import('three');
    const r=window.__ssRuntime,v=r.ramRenderer;
    const ray=new Raycaster();ray.far=7.5;
    ray.setFromCamera(new Vector2(0,0),r.camera);
    const hits=ray.intersectObject(v.group,true).filter(hit=>{
      for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;
      return true;
    });
    return {eye:r.camera.position.toArray(),obstruction:hits[0]?.object.name??null};
  });
  await screenshot(page,name);
  assert.equal(result.obstruction,null,'centered sight ray clears the raised machine');
  return result;
}

async function desktop(rollback) {
  const name=rollback?'rollback':'authored';
  const context=await browser.newContext({viewport:{width:1280,height:800},
    ...(!rollback&&{recordVideo:{dir:join(out,'video'),size:{width:1280,height:800}}})});
  const page=await context.newPage();monitor(page);
  try {
    await localPractice(page,{rollback});
    await page.keyboard.press('t');await mounted(page);
    const neutral=await viewSample(page,name+'-neutral');
    if (!rollback) await recordOverview(page);
    await strike(page);await peak(page);
    const flat=await viewSample(page,name+'-level-strike');
    await strikeDone(page);
    await liftDesktop(page,true);await pitchDesktop(page,true);
    await strike(page);await peak(page);
    const raised=await viewSample(page,name+'-raised-extended');
    if (rollback) assert.ok(raised.coaxial>1,'rollback reproduces the chassis-bound stator');
    else {
      assert.ok(raised.coaxial<.001&&flat.coaxial<.001,'stator and moving coupling share one axis');
      assert.ok(raised.tipError<.012&&flat.tipError<.012,'visible piston matches authority');
      assert.ok(Math.hypot(...raised.station.map((n,i)=>n-neutral.station[i]))<.02,'operator stays on the lower carriage');
      await page.keyboard.press('z');
      await page.waitForFunction(()=>window.__ssRuntime.siegeView==='sight');
      await page.evaluate(()=>window.__ramOverview=false);
      evidence.desktopSight=await sightSample(page,'desktop-rider-sight');
      await page.evaluate(()=>window.__ramOverview=true);
      await page.keyboard.press('z');
      await pitchDesktop(page,false);await liftDesktop(page,false);
      await inspectRig(page);
      await page.keyboard.press('t');
      await ramWait(page,s=>!s.p.operatingRamId,'dismounted');
    }
    evidence[name]={coaxialError:raised.coaxial,tipError:raised.tipError,raised:raised.b.ramLiftY,pitch:raised.b.ramElevPitch};
  } finally {
    const video=page.video();
    await context.close();
    if(video)await video.saveAs(join(out,'desktop-operation.webm'));
  }
  console.log(name,JSON.stringify(evidence[name]));
}

async function touchOperation() {
  const context=await browser.newContext({viewport:{width:960,height:540},isMobile:true,hasTouch:true});
  const page=await context.newPage();monitor(page);
  try {
    await localPractice(page,{touch:true});
    await page.locator('.touch-interact').tap();await mounted(page);
    const cdp=await context.newCDPSession(page);
    async function hold(selector,slide,until,label){
      const box=await page.locator(selector).boundingBox();
      const p={x:box.x+box.width/2,y:box.y+box.height/2,id:5};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      try{
        if(slide)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,y:p.y+slide}]});
        await ramWait(page,until,label);
      }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    }
    await hold('.touch-jump',-55,s=>s.b.ramLiftY>1.36,'touch lift');
    await hold('.touch-jump',0,s=>s.b.ramElevPitch>.87,'touch upward pitch');
    await page.locator('.touch-attack').tap();await peak(page);
    const raised=await viewSample(page,'touch-raised-extended');
    assert.ok(raised.coaxial<.001&&raised.tipError<.012);
    await page.locator('.touch-siegeView').tap();
    await page.waitForFunction(()=>window.__ssRuntime.siegeView==='sight');
    evidence.touchSight=await sightSample(page,'touch-rider-sight');
    await hold('.touch-crouch',0,s=>s.b.ramElevPitch<.01,'touch level');
    await hold('.touch-crouch',55,s=>s.b.ramLiftY<.012,'touch lower');
    await page.locator('.touch-interact').tap();
    await ramWait(page,s=>!s.p.operatingRamId,'touch dismount');
    evidence.touch={coaxialError:raised.coaxial,tipError:raised.tipError,raised:raised.b.ramLiftY,pitch:raised.b.ramElevPitch};
    console.log('touch',JSON.stringify(evidence.touch));
  } finally { await context.close(); }
}

async function wallStrike() {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();monitor(page);
  try{
    await localPractice(page,{wall:true});
    await page.keyboard.press('t');await mounted(page);
    await strike(page);
    const stopped=await ramWait(page,s=>s.events.some(e=>e.type==='soFistBlocked'),'piston struck Castleward gatepost');
    assert.ok(stopped.b.strokeLimit>0&&stopped.b.strokeLimit<1.26);
    const view=await viewSample(page,'castleward-wall-stop');
    assert.ok(view.tipError<.02,'wall clamp reaches the render animation');
    evidence.wall={strokeLimit:stopped.b.strokeLimit,event:stopped.events.find(e=>e.type==='soFistBlocked')};
    console.log('wall',JSON.stringify(evidence.wall));
  }finally{await context.close();}
}

async function recordOverview(page) {
  await page.evaluate(async () => {
    const r=window.__ssRuntime,{Vector3}=await import('three');
    const camera=r.camera.clone(),render=r.renderer.render.bind(r.renderer);
    window.__ramOverview=true;
    r.renderer.render=(scene,view)=>{
      if(!window.__ramOverview||view!==r.camera)return render(scene,view);
      if(view.layers.mask!==1)return;
      const p=r.ramRenderer.group.position;
      camera.position.copy(p).add(new Vector3(11.5,5.6,-8.5));
      camera.fov=42;camera.updateProjectionMatrix();camera.lookAt(p.x,p.y+3,p.z-.75);
      return render(scene,camera);
    };
  });
}

async function inspectRig(page) {
  const rows=await page.evaluate(async () => {
    const r=window.__ssRuntime,v=r.ramRenderer,live=v.presentationData,now=live.poseTime;
    const {Vector3}=await import('three');
    const {SO_FIST_LIFT}=await import('/shared/sim/soFistElevation.mjs');
    const {soFistStriker}=await import('/shared/sim/soFistGeometry.mjs');
    const node=name=>v.nodes.get(name),world=o=>o.getWorldPosition(new Vector3());
    const overlap=(a,b)=>Math.min(a.max,b.max)-Math.max(a.min,b.min);
    function span(root,axis,onlyOwnMeshes=false){
      let min=Infinity,max=-Infinity;
      const point=new Vector3();
      function read(o){
        const position=o.geometry?.getAttribute('position');
        if(!position)return;
        for(let i=0;i<position.count;i++){
          const projection=point.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld).dot(axis);
          min=Math.min(min,projection);max=Math.max(max,projection);
        }
      }
      if(onlyOwnMeshes){read(root);root.children.filter(o=>o.isMesh).forEach(read);}
      else root.traverse(read);
      return {min,max};
    }
    const rows=[];
    try{
      for(const lift of [0,SO_FIST_LIFT.maxRise])for(const t of [0,.5,1]){
        const pitch=t*(lift?SO_FIST_LIFT.maxPitch:SO_FIST_LIFT.lowPitch);
        for(const stroke of ['rest','extended'])for(const state of ['attached','launched','damaged','destroyed']){
          for(const occupied of [false,true]){
            const b={...live,ramLiftY:lift,ramElevPitch:pitch,operatorId:occupied?live.operatorId:null,
              strikeAt:stroke==='extended'?now-.88:null,strokeLimit:null,detachedFist:null,
              fistMounted:state!=='launched',components:{...live.components,Fist:{
                ...live.components.Fist,health:state==='destroyed'?0:state==='damaged'?250:500,
              }}};
            v.update(now,b);
            const lower=node('Elevation_Pitch_Barrels_Lower'),upper=node('Elevation_Pitch_Rods_Upper');
            const direction=world(upper).sub(world(lower)).normalize();
            const vertical=new Vector3(0,1,0).transformDirection(v.group.matrixWorld);
            const stage=span(node('Hydraulic_Lift_Stage1_Mid'),vertical);
            const cap=soFistStriker({...b,fistMounted:false},now);
            const face=cap.center.map((n,i)=>n+cap.axes[2][i]*cap.size[2]/2);
            const pistonAxis=node('Ram_Assembly').getWorldDirection(new Vector3());
            rows.push({lift,pitch,stroke,state,occupied,
              coaxial:world(node('Wrist_Resonator_Ring')).sub(world(node('Arcane_Stator_Collar'))).cross(pistonAxis).length(),
              fixedOverlap:overlap(span(node('Hydraulic_Lift_Barrels_Fixed'),vertical),stage),
              saddleOverlap:overlap(stage,span(node('Upper_Ram_Lift'),vertical,true)),
              pitchOverlap:overlap(span(lower,direction),span(upper,direction)),
              tipError:world(node('piston_exposed_striker_tip')).distanceTo(new Vector3(...face)),
              fist:node('Armored_Fist').visible,wrist:node('Wrist_Resonator_Ring').visible,
              rider:world(node('operator_onboard_rider')).toArray(),
            });
          }
        }
      }
    }finally{v.update(now,live);}
    return rows;
  });
  assert.equal(rows.length,96);
  assert.ok(rows.every(s=>s.coaxial<.001&&s.tipError<.012&&s.wrist));
  assert.ok(rows.every(s=>s.fist===['attached','damaged'].includes(s.state)));
  assert.ok(rows.every(s=>Math.hypot(...s.rider.map((n,i)=>n-rows[0].rider[i]))<.001));
  for(const key of ['fixedOverlap','saddleOverlap','pitchOverlap']){
    assert.ok(rows.every(s=>s[key]>.05),key+' must overlap at every lift and pitch');
  }
  await writeJson('pose-matrix',rows);
  evidence.poseMatrix={count:rows.length,...Object.fromEntries(
    ['fixedOverlap','saddleOverlap','pitchOverlap'].map(key=>[key,Math.min(...rows.map(s=>s[key]))]))};
  console.log('pose matrix',JSON.stringify(evidence.poseMatrix));
}

async function remoteOperation() {
  const now=server.now();
  const room=server.roomManager.createSharedPracticeRoom(now);
  for(const id of ['driver','observer'])room.addPlayer({id,token:'test-'+id,name:id,
    siegeLoadout:{soFist:'longArmToTheJaw'}},now);
  room.startMatch(now);
  const b=room.soFistication=createSoFistication({x:17,y:0,z:0});
  for(const id of ['driver','observer']){
    const p=room.players.get(id);
    p.position=id==='driver'?soFistEntry(b,room.world):{x:20.5,y:0,z:3.1};
    Object.assign(p,{connected:false,disconnectExpiresAt:now+3600});
  }
  const contexts=[];
  try{
    const pages=[];
    for(const id of ['driver','observer']){
      const context=await browser.newContext({viewport:{width:768,height:480}});
      contexts.push(context);
      await context.addInitScript(({id,code})=>{
        localStorage.setItem('ss-session-token','test-'+id);
        localStorage.setItem('ss-room-code',code);
        localStorage.setItem('ss-settings',JSON.stringify({version:1,values:{'loadout.soFistSkill':'longArmToTheJaw','display.quality':'low'},bindings:{}}));
      },{id,code:room.code});
      const page=await context.newPage();pages.push(page);monitor(page);
      page.on('websocket', ws=>{
        if(!ws.url().endsWith('/ws'))return;
        ws.on('close',()=>console.log('websocket closed',id));
        ws.on('socketerror',error=>console.log('websocket error',id,error));
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__ssRuntime?.ramRenderer.model&&window.__ssRuntime.localAuth);
      const skip=page.locator('[data-tutorial-onboarding-skip]');
      if(await skip.isVisible())await skip.click();
      assert.equal(await page.evaluate(()=>window.__ssRuntime.socket.playingLocally),false);
      await watchEvents(page);
      // Keep the observer's real snapshot and animation loop running, but
      // cap full-scene draws so two software WebGL views do not starve input.
      if(id==='observer')await page.evaluate(()=>{
        const runtime=window.__ssRuntime;
        const renderer=runtime.renderer;
        const render=renderer.render.bind(renderer);
        let lastDraw=-Infinity;
        renderer.render=(scene,camera)=>{
          const now=performance.now();
          if(camera===runtime.camera){
            if(now-lastDraw<125)return;
            lastDraw=now;
          }
          return render(scene,camera);
        };
      });
    }
    const [driver,observer]=pages;
    await driver.waitForFunction(()=>document.querySelector('#arena-gate').classList.contains('hidden'));
    await focus(driver);
    await driver.keyboard.press('t');await mounted(driver);
    const awaitBoth=async(check,label)=>{
      const states=await Promise.all(pages.map(p=>ramWait(p,check,label,22000)));
      assert.equal(states[0].b.id,states[1].b.id);
      return states;
    };
    await awaitBoth(s=>s.b.operatorId==='driver'&&s.b.skill.id==='longArmToTheJaw','both clients see operator and loadout');
    console.log('remote mounted both clients');
    await liftDesktop(driver,true,55000);await pitchDesktop(driver,true);
    await awaitBoth(s=>s.b.ramLiftY>1.36&&s.b.ramElevPitch>.87,'full articulated pose replicated');
    const observersRaised=[];
    for(const [i,page] of pages.entries())observersRaised.push(await viewSample(page,'remote-raised-'+i));
    assert.ok(observersRaised.every(s=>s.coaxial<.001&&s.tipError<.012));
    console.log('remote full lift replicated and rendered');
    // Stage a level launch lane. The ordinary lower controls are covered by
    // the desktop and touch journeys. Launch and pickup still use real keys.
    Object.assign(b,{ramLiftY:0,ramElevPitch:0});
    await awaitBoth(s=>s.b.ramLiftY===0&&s.b.ramElevPitch===0,'level launch lane');
    await focus(driver);
    const hit=(id,amount)=>damageSoFistication(room,b,amount,'observer','sword',server.now(),{componentId:id});
    await strikeDone(driver);
    assert.equal(hit('Fist',20),true);
    const damagedHp=b.components.Fist.health;
    await awaitBoth(s=>s.b.components.Fist.health===damagedHp,'fist damage replicated');
    await driver.keyboard.press('u');
    const [launch]=await awaitBoth(s=>s.b.fistMounted===false&&s.b.detachedFist,'fist launched');
    console.log('remote launch',launch.b.detachedFist.state);
    assert.equal(launch.b.detachedFist.healthAtLaunch,damagedHp);
    for(const page of pages)await page.waitForFunction(()=>{
      const r=window.__ssRuntime.ramRenderer;
      return r.detachedVisual?.getObjectByName('Fist_Detached_Root')&&
        !r.detachedVisual.getObjectByName('Arcane_Stator_Collar')&&
        !r.detachedVisual.getObjectByName('Wrist_Resonator_Ring')&&
        !r.nodes.get('Armored_Fist').visible&&r.nodes.get('Wrist_Resonator_Ring').visible;
    });
    const [rest]=await awaitBoth(s=>s.b.detachedFist?.state==='resting','physical fist landed');
    await viewSample(observer,'remote-fist-resting');
    console.log('remote landing',JSON.stringify(rest.b.detachedFist.position));
    await strike(driver);await peak(driver);
    const bare=await viewSample(driver,'remote-exposed-piston');
    assert.ok(bare.detached&&!bare.fistVisible&&bare.wristVisible&&bare.tipError<.012);
    await strikeDone(driver);
    await driver.keyboard.down('w');
    try {
      await ramWait(driver,s=>{
        const p=s.b.detachedFist?.position;
        return p&&Math.hypot(s.b.x-p.x,s.b.y-p.y,s.b.z-p.z)<2.4;
      },'drive to the resting fist',5000);
    }finally{await driver.keyboard.up('w');}
    await driver.keyboard.press('u');
    await awaitBoth(s=>s.b.fistMounted&&s.b.detachedFist==null,'both clients see reattachment');
    await observer.waitForFunction(()=>{
      const r=window.__ssRuntime.ramRenderer;
      return !r.detachedVisual&&r.nodes.get('Armored_Fist').visible;
    });
    assert.equal(b.components.Fist.health,damagedHp);
    const retrieval=(await ramState(observer)).events.find(e=>e.type==='soFistDetachedFist'&&e.action==='retrieved');
    assert.ok(retrieval&&Math.abs(retrieval.readyAt-retrieval.at-24)<1e-8);
    await viewSample(observer,'remote-reattached');
    console.log('remote fist reattached');

    // Park the two engines for a repeatable contact. The strike, recoil
    // and exact damage component still come from normal server resolution.
    Object.assign(b,{x:17,y:0,z:0,speed:0,heading:0,recoilVelocity:0});
    room.biByeLlista=createBiByeLlista({x:17,y:0,z:-5.5,baseYaw:0});
    await awaitBoth(s=>Math.abs(s.b.z)<.1,'machines staged');
    await strike(driver);
    const [collision]=await awaitBoth(s=>s.events.some(e=>e.type==='bibyeDamaged'&&e.source==='so-fist'),'piston hit siege machine');
    await viewSample(observer,'remote-machine-contact');
    console.log('remote machine contact');
    await strikeDone(driver);
    while(b.components.Fist.health>0)assert.equal(hit('Fist',100),true);
    await awaitBoth(s=>s.b.components.Fist.health===0,'fist destruction replicated');
    await observer.waitForFunction(()=>window.__ssRuntime.ramRenderer.debris);
    await viewSample(observer,'remote-fist-destroyed');
    assert.equal(hit('hull',b.health),true);
    await awaitBoth(s=>s.b.mode==='DESTROYED'&&!s.b.operatorId,'hull destruction ejects operator');
    await viewSample(observer,'remote-wreck');
    evidence.remote={clients:2,damagedHp,launch:launch.b.detachedFist.state,rest:rest.b.detachedFist.position,
      impact:collision.events.find(e=>e.type==='bibyeDamaged'&&e.source==='so-fist'),
      reattached:true,fistDestroyed:true,ramDestroyed:true};
    console.log('remote',JSON.stringify(evidence.remote));
  }finally{
    for(const context of contexts)await context.close();
  }
}

try {
  if(['all','desktop'].includes(proof)){await desktop(true);await desktop(false);}
  if(['all','touch'].includes(proof))await touchOperation();
  if(['all','wall'].includes(proof))await wallStrike();
  if(['all','remote'].includes(proof))await remoteOperation();
  assert.deepEqual(errors,[]);
  await writeJson('gameplay-'+proof,evidence);
} finally { await browser.close(); await server.stop(); await rm(temp,{recursive:true,force:true}); }
