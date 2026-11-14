import test from 'node:test';
import assert from 'node:assert/strict';
import { biByeHudView } from './biByeHudView.mjs';
const b = { id: 'siege', position: { x: 0, y: 0, z: 0 }, health: 400, maxHealth: 400, mode: 'MOBILE', state: 'LOADED', smallBoltReady: true };
const local = { alive: true, position: { x: 0, z: 3.1 } };
test('one interaction prompt uses the actual 3.2 m range and excludes an occupied machine', () => {
  assert.ok(biByeHudView(local, { bibyeBallista: b }, 0));
  assert.equal(biByeHudView({ ...local, position: { x: 0, z: 3.3 } }, { bibyeBallista: b }, 0), null);
  assert.equal(biByeHudView(local, { bibyeBallista: { ...b, operatorId: 'another' } }, 0), null);
});
test('mounted controls use rebound keys or touch labels', () => {
  const operator = { ...local, operatingBallistaId: b.id };
  const desktop = biByeHudView(operator, { bibyeBallista: b }, 0, { bindings: { attack: ['KeyF'], deploy: ['KeyH'], siegeView: ['KeyJ'], interact: ['KeyK'], siegeSweep: ['KeyY'] } });
  assert.match(desktop.controls, /LMB Bolt I.*\[Y\] Sharp Turn.*RMB prime\/fire II.*\[H\] Deploy.*\[J\] View.*\[K\] Leave/);
  assert.equal(biByeHudView(operator, { bibyeBallista: b }, 0, { touch: true }).controls,
    'SIEGE VIEW · VIEW ↑ zoom · BOLT I · SWEEP · SKILL',
    'mobile unprimed has Bolt I, a separate SWEEP, and the selected Skill but no BOTH');
  const primed={...b,skill:{id:'boltToTheOccasion',phase:'primed'},
    mainBoltLoaded:true,coupling:'INDEPENDENT'};
  assert.match(biByeHudView(operator,{bibyeBallista:primed},0,{touch:true}).controls,
    /BOLT I · SWEEP · SKILL · BOTH$/,'priming legitimately exposes the separate volley');
});

test('mounted HUD names structural faults and makes unsupported siege unavailable', async()=>{
 const {createBiByeLlista}=await import('../../shared/sim/biByeLlista.mjs');
 const b=createBiByeLlista();b.position={x:0,y:0,z:0};b.smallBoltReady=true;
 for(const id of ['Wheel_FL','Wheel_RL','Stabilizer_FL','Stabilizer_RR'])b.components[id].health=0;
 const hud=biByeHudView({...local,operatingBallistaId:b.id},{bibyeBallista:b},0);
 assert.match(hud.status,/IMMOBILIZED/);assert.match(hud.status,/SUPPORTS DISABLED/);
 assert.doesNotMatch(hud.controls,/\] Deploy/);assert.match(hud.status,/Shot I ready/);
});
test('deployed HUD exposes independent clocks, selected focus and rebound cancel control',()=>{
 const bl={...b,mode:'DEPLOYED',weaponFocus:'MAIN',smallBoltReady:true,mainBoltLoaded:false,reloadEndsAt:12,coupling:'ALIGNING',couplingProgress:.45};
 const hud=biByeHudView({...local,operatingBallistaId:b.id},{bibyeBallista:bl},10,{bindings:{siegeWeapon:['KeyL']}});
 assert.match(hud.title,/MAIN \/ COUPLED/);assert.match(hud.status,/Shot I ready.*II 2.0s.*Aligning 45%/);assert.match(hud.controls,/\[L\] Upper \/ cancel/);
});

test('terrain deployment rejection is concise and expires without replacing readiness permanently',()=>{
 const bl={...b,deploymentReason:'Too steep to deploy. Find flatter ground.',deploymentRejectedAt:10};
 const localDriver={...local,operatingBallistaId:b.id};
 assert.match(biByeHudView(localDriver,{bibyeBallista:bl},11).status,/Too steep/);
 assert.match(biByeHudView(localDriver,{bibyeBallista:bl},14).status,/Shot I ready/);
});

test('uprooted outriggers switch from forced retraction to MOBILE, then permit voluntary redeploy',()=>{
 const driver={...local,operatingBallistaId:b.id};
 const blast={...b,mode:'RETRACTING',outriggersDislodgedAt:1,
   outriggersDislodgedUntil:3.2,weaponFocus:'UPPER',deploymentReason:null};
 const active=biByeHudView(driver,{bibyeBallista:blast},1.2,
   {bindings:{deploy:['KeyH'],siegeView:['KeyJ']}});
 assert.match(active.status,/OUTRIGGERS UPROOTED.*FORCED RETRACTION/);
 assert.match(active.title,/RETRACTING/);
 assert.doesNotMatch(active.controls,/\[H\] Deploy|\[H\] Pack/);
 const mobile={...blast,mode:'MOBILE'};
 assert.match(biByeHudView(driver,{bibyeBallista:mobile},2).status,
   /OUTRIGGERS UPROOTED.*MOBILE.*STABILIZERS RECOVERING/);
 assert.doesNotMatch(biByeHudView(driver,{bibyeBallista:mobile},2,
   {bindings:{deploy:['KeyH']}}).controls,/\[H\] Deploy/);
 assert.match(biByeHudView(driver,{bibyeBallista:mobile},3.3,
   {bindings:{deploy:['KeyH']}}).controls,/\[H\] Deploy/,
   'the user chooses when to plant the outriggers again');
 assert.doesNotMatch(biByeHudView(local,{bibyeBallista:mobile},2).status,/OUTRIGGERS UPROOTED/,
   'nearby bystander only gets existing operate prompt');
});
