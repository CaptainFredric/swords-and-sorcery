async page=>{
 await page.goto('http://127.0.0.1:3134/?debug');
 await page.waitForFunction(()=>globalThis.__ssMenu?.tour?.ready&&document.querySelector('#loading-veil').classList.contains('done'),null,{timeout:15000});
 await page.setViewportSize({width:1280,height:720});
 const records=[];
 for(const mode of ['command','watch']){
  await page.evaluate(mode=>{if(mode==='watch')__ssYard.observe();else __ssYard.showMenu(performance.now()/1000);},mode);
  await page.waitForTimeout(600);
  await page.evaluate(mode=>{const m=__ssMenu;cancelAnimationFrame(m.frameHandle);m.setPresentation(mode==='watch',{immediate:true});m.tour.framing=m.framing;m.tour.clear=mode==='watch'?[.02,.98]:m.commandClear;m.tour.restart();m.tour.setVisible(true);m.tour.sound=null;m.tour.voice=null;window.__ssCaptureSun=m.sun.position.clone().sub(m.characterRoot.position);},mode);
  for(let boundary=0;boundary<2;boundary++){
   await page.evaluate(()=>{const t=__ssMenu.tour;while(t.time<t.schedule.duration-.1){const m=__ssMenu,dt=Math.min(1/30,t.schedule.duration-.1-t.time),v=t.update(dt);m.effects?.update(dt);m.camera.position.copy(v.position);m.camera.lookAt(v.target);m.camera.fov=v.fov;m.camera.updateProjectionMatrix();m.camera.updateMatrixWorld();const next=t.lastMoment;if(next.phase==='fight'&&t.rivals[next.fight]?.resetPending)throw new Error('Rival was not ready for fight '+next.fight+' in round '+t.round);}});
   for(let frame=0;frame<14;frame++){
    const state=await page.evaluate(()=>{const m=__ssMenu,t=m.tour,v=t.update(1/60);m.effects?.update(1/60);m.camera.position.copy(v.position);m.camera.lookAt(v.target);m.camera.fov=v.fov;m.camera.updateProjectionMatrix();m.sun.position.copy(m.characterRoot.position).add(__ssCaptureSun);m.sun.target.position.copy(m.characterRoot.position);m.renderer.render(m.scene,m.camera);return {round:t.round,time:t.time,speed:t.lastMoment.speed,position:m.characterRoot.position.toArray(),yaw:m.characterRoot.rotation.y,gait:t.hero.instance.animator.gaitPhase,camera:m.camera.position.toArray(),observing:__ssYard.observing,pending:t.rivals.map(r=>Boolean(r?.resetPending))};});
    records.push({mode,boundary,frame,...state});
    await page.screenshot({path:`output/playwright/ui-refinement/${mode}-loop-${boundary+1}-${frame}.png`});
   }
  }
 }
 await page.evaluate(()=>{const m=__ssMenu,t=m.tour;while(t.time<t.schedule.duration-.1){const dt=Math.min(1/30,t.schedule.duration-.1-t.time),v=t.update(dt);m.effects?.update(dt);m.camera.position.copy(v.position);m.camera.lookAt(v.target);m.camera.fov=v.fov;m.camera.updateProjectionMatrix();m.camera.updateMatrixWorld();if(t.lastMoment.phase==='fight'&&t.rivals[t.lastMoment.fight]?.resetPending)throw new Error('Final round rival was not ready');}});
 return records;
}
