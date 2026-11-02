import * as THREE from 'three';
import {createSpellbladeAsset} from '../../client/game/SpellbladeAssets.mjs';
import {FightFlightRenderer} from '../../client/worlds/FightFlightRenderer.mjs';
import {SoFisticationRenderer} from '../../client/worlds/SoFisticationRenderer.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {createSoFistication} from '../../shared/sim/soFistication.mjs';
import {flightMuzzle} from '../../shared/src/flightRepeaterAim.mjs';
const expect=(ok,message)=>{if(!ok)throw Error(message);};
export async function runCompositionChecks(){
 let knight;
 const scene=new THREE.Scene(),flight=new FightFlightRenderer(scene),ram=new SoFisticationRenderer(scene),checks=[];
 try{
  expect(await flight.load(),'Flight GLB failed');expect(await ram.load(),'Ram GLB failed');
  const m=createFightFlight({id:'composition-test',heading:.6,x:2,y:7,z:3});m.grounded=false;m.mode='AIRBORNE';
  let worstMuzzle=0;
  for(let i=0;i<120;i++){
   const now=10+i/60;Object.assign(m,{offensiveRun:i<90,runAnimationStartedAt:10,runAnimationEndedAt:11.5,runPitch:.34+Math.sin(i*.12)*.6,rotorAngle:i*.7,crossbowYaw:m.heading+.24,crossbowPitch:-.17,health:80,braceLHP:0,braceRHP:24,lastShotAt:now-.06,componentFailedAt:{braceL:9}});
   flight.update(now,m,[],now,[],null,{attackActive:i>35&&i<55,attackStartedAt:10.4,attackCommitted:1});
   const visible=flight.nodes.get('crossbow_muzzle').getWorldPosition(new THREE.Vector3());
   const actual=flightMuzzle(m,{yaw:m.crossbowYaw,pitch:m.crossbowPitch});
   const error=visible.distanceTo(new THREE.Vector3(actual.x,actual.y,actual.z));worstMuzzle=Math.max(worstMuzzle,error);
   expect(error<2e-5,'Muzzle drift '+error+' '+JSON.stringify({sample:i,visible:visible.toArray(),actual,chain:['Main_Apparatus_Chassis','Crossbow_Yaw_Gimbal','Crossbow_Pitch_Cradle','Crossbow_Body','crossbow_muzzle'].map(n=>{const node=flight.nodes.get(n);return {name:n,parent:node.parent.name,p:node.position.toArray(),q:node.quaternion.toArray()};})}));
   expect(flight.nodes.get('Main_Apparatus_Chassis').quaternion.angleTo(new THREE.Quaternion())<1e-8,'Authored pitch added to authority');
   expect(!flight.nodes.get('Protective_Brace_L').visible,'Dash resurrected brace');
   expect(flight.nodes.get('Protective_Brace_L_Damaged').scale.x>.99,'Broken brace lost scale');
   const hub=flight.nodes.get('Rotor_Hub');expect(Math.abs(Math.atan2(Math.sin(hub.rotation.y-m.rotorAngle),Math.cos(hub.rotation.y-m.rotorAngle)))<1e-8,'Hub phase drift');
  }
  checks.push('120 moving/aimed/firing/damaged Dash samples: muzzle and phase agree');
  expect(flight.animation.chassisShell.position.length()>.01,'Chassis buckle absent');
  Object.assign(m,{offensiveRun:false,runAnimationEndedAt:12,lastImpactAt:12});flight.update(12.1,m);
  expect(flight.animation.plan.posture.clip.includes('Collision_Interruption'),'Collision did not acquire recovery');checks.push('Physical impact clock selects narrowed collision interruption');
  knight=await createSpellbladeAsset();scene.add(knight.root);
  let soleError=0,worstSole=null;
  for(let i=0;i<120;i++){
   Object.assign(m,{grounded:i<80,offensiveRun:i>=80,runPitch:i>=80?.34:0,runAnimationStartedAt:14+80/60,health:250,velocity:{x:0,y:0,z:i<40?-5.5:-9.3}});
   knight.root.position.set(m.x,m.y,m.z);knight.root.rotation.set(-m.runPitch,m.heading,0,'YXZ');
   knight.animator.apply({clip:'Idle',time:0,loop:true},1/60);flight.update(14+i/60,m);
   knight.animator.applyFightFlight(flight.getOperatorGrips(),false,m,14+i/60,1/60);knight.root.updateMatrixWorld(true);
   const grips=flight.getOperatorGrips();
   for(const side of ['L','R']){const foot=knight.animator.bone('foot.'+side),contact=knight.animator.flightRider.contacts.get(side),target=side==='L'?grips.leftFoot:grips.rightFoot;const error=foot.localToWorld(contact.offset.clone()).distanceTo(target);if(error>soleError){soleError=error;worstSole={i,side,error,settle:knight.animator.flightRider.harnessSettle};}}
  }
  expect(soleError<.006,'Production boot/stirrup separation '+JSON.stringify(worstSole));checks.push('Production rider soles fit both moving stirrups through walk, sprint and Dash');
  m.health=250;m.braceRHP=80;for(let i=0;i<90;i++)flight.update(17+i/60,m);
  expect(flight.animation.weights.chassis<.001&&flight.animation.weights.braceR<.001,'Surviving damage failed to repair');expect(!flight.nodes.get('Protective_Brace_L').visible,'Repair resurrected zero HP brace');checks.push('Steel recovery of survivors, permanent brace failure');
  m.rotorHP=0;m.rotorDestroyedAt=19;flight.update(19,m);const phase=flight.nodes.get('Rotor_Hub').rotation.y;flight.update(20,m);expect(flight.nodes.get('Rotor_Hub').rotation.y!==phase,'No cosmetic windmill');expect(!flight.nodes.get('Rotor_Sword_Blade_L').visible,'Failed rotor blade visible');checks.push('Rotor failure coasts cosmetically after contact authority stops');
  Object.assign(m,{mode:'DESTROYED',health:0,destroyedAt:24,wreckAirborne:true,operatorId:null});flight.update(24.2,m);expect(/Break/.test(flight.animation.plan.wreck.clip),'Missing airborne break');flight.update(25,m);expect(/Falling/.test(flight.animation.plan.wreck.clip),'Missing falling loop');m.wreckAirborne=false;m.wreckImpactAt=26;flight.update(26.3,m);expect(/Ground_Impact/.test(flight.animation.plan.wreck.clip),'Missing impact');m.terminalDive={resolved:true};flight.update(26.5,m);expect(/Terminal_Shatter/.test(flight.animation.plan.wreck.clip),'Terminal replayed ordinary collapse');m.wreckVisualExpired=true;flight.update(32,m);expect(!flight.group.visible,'Expired wreck persists');checks.push('Break, fall, impact, terminal, finite cleanup');
  const b=createSoFistication({id:'ram-composition',mode:'DESTROYED',health:0,destroyedAt:30,wreckSide:-1});ram.update(31,b);expect(ram.nodes.get('Carriage_Main').quaternion.angleTo(new THREE.Quaternion())>.01,'Ram authored wreck absent');b.components.Fist.health=0;b.wreckFistMissing=true;ram.update(31.6,b);expect(!ram.nodes.get('Armored_Fist').visible,'Prior fist was restored');checks.push('Directional ram ruin and pre-destroyed fist');
  return {passed:true,checks,worstMuzzleMetres:worstMuzzle,worstSoleSeparationMetres:soleError};
 }finally{knight?.dispose();flight.dispose();ram.dispose();}
}
