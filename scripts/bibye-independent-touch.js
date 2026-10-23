// Run with playwright-cli run-code --filename. Uses ordinary keyboard, mouse or touch.
// Evaluations only observe gameplay state; the test never edits simulation or hit results.
async page => {
 for(const old of page.context().browser().contexts())if(old!==page.context())await old.close();
 const targetUrl=page.url();
 const context=await page.context().browser().newContext({viewport:{width:926,height:430},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const p=await context.newPage();await p.bringToFront();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const cdp=await context.newCDPSession(p);
 const read=()=>p.evaluate(()=>{const r=window.__ssRuntime;return {now:r.socket.serverNow(),local:r.socket.playingLocally,b:r.latestSnapshot.bibyeBallista,player:r.localAuth,enabled:r.input.enabled,yaw:r.input.yaw,pitch:r.input.pitch,view:r.siegeView,action:r.world.biByeLlista.activeActionName,upper:r.world.biByeLlista.upperAction?.getClip().name};});
 const wait=async fn=>{for(let i=0;i<240;i++){const s=await read();if(fn(s))return s;await p.waitForTimeout(40);}throw Error('Touch condition timed out');};
 const tap=async selector=>{await p.locator(selector).tap();};
 const drag=async(x,y,dx,dy,ms=20)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});await p.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 const aim=async yaw=>{for(let i=0;i<12;i++){const s=await read(),a=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw));if(Math.abs(a)<.008)return;await drag(540,160,Math.max(-150,Math.min(150,-a/.0058)),0);}};
 const walk=async(x,z)=>{const until=Date.now()+15000;for(;;){const s=await read(),dx=x-s.player.position.x,dz=z-s.player.position.z,d=Math.hypot(dx,dz);if(d<.45)return;if(Date.now()>until)throw Error('Touch route stalled '+JSON.stringify(s.player.position));await aim(Math.atan2(-dx,-dz));const box=await p.locator('.touch-stick').boundingBox();await drag(box.x+box.width/2,box.y+box.height/2,0,d>2?-60:-38,Math.min(250,d<1?65:180));}};
 await p.goto(targetUrl);await p.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
 const skip=p.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await tap('[data-tutorial-onboarding-skip]');
 await p.locator('#player-name').fill('Touch Siege');await tap('#solo-button');await tap('#practice-mode');
 await p.waitForFunction(()=>window.__ssRuntime?.localAuth);await p.touchscreen.tap(500,190);await wait(s=>s.enabled);
 for(const point of [[0,-4.5],[13.8,-4.5],[13.8,-10],[9,-11.5]])await walk(...point);
 await tap('.touch-interact');const mounted=await wait(s=>s.player.operatingBallistaId);
 await tap('.touch-deploy');await wait(s=>s.b.mode==='DEPLOYED');await tap('.touch-siegeWeapon');await wait(s=>s.b.weaponFocus==='UPPER');
 await tap('.touch-attack');const independent=await wait(s=>s.b.upperReleasedAt!=null);
 await tap('.touch-siegeWeapon');await wait(s=>s.b.weaponFocus==='MAIN'&&s.b.smallBoltReady);await tap('.touch-attack');
 const committed=await wait(s=>s.b.coupling==='FIRING');const heavy=await wait(s=>s.b.mainBoltLoaded===false);
 await tap('.touch-siegeWeapon');await wait(s=>s.b.weaponFocus==='UPPER'&&s.b.smallBoltReady);await tap('.touch-attack');await p.waitForTimeout(350);const concurrent=await read();
 await p.screenshot({path:'output/playwright/bibye-independent/exported-touch.png'});
 await tap('.touch-siegeView');await p.waitForTimeout(400);const sight=await read();await p.screenshot({path:'output/playwright/bibye-independent/exported-touch-sight.png'});
 const controls=await p.locator('.touch-btn').evaluateAll(bs=>bs.filter(b=>!b.hidden&&getComputedStyle(b).display!=='none').map(b=>{const r=b.getBoundingClientRect();return {label:b.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height};}));
 const proof={mounted,independent,committed,heavy,concurrent,sight,controls,errors};await context.close();return proof;
}
