import * as THREE from 'three';
import {MachineAnimationComposition} from './MachineAnimationComposition.mjs';
import {FlightAnimationState,flightChannelOwner,FLIGHT_CLIPS} from './flightAnimationState.mjs';
import {FlightGroundCarriage} from './flightGroundCarriage.mjs';
import {SWORD_STRIKE_TIMES} from '../../shared/src/combat.mjs';
const own=owner=>key=>flightChannelOwner(key)===owner;
const clamp=x=>Math.max(0,Math.min(1,x));
export class FlightRigAnimation{
 constructor(root,clips){
  this.pose=new MachineAnimationComposition(root,clips);this.state=new FlightAnimationState();this.nodes=new Map();root.traverse(n=>{if(n.name)this.nodes.set(n.name,n);});
  this.chassisShell=this.pose.shell('Main_Apparatus_Chassis');this.gunShell=this.pose.shell('Crossbow_Body');this.shaftShell=this.pose.shell('Rotor_Shaft_And_Bearing');
  this.weights={braceL:0,braceR:0,rotor:0,chassis:0};
  // The grounded carriage (flightGroundCarriage.mjs): what each ground posture clip authors for the chassis, and the
  // chassis node it is laid on after everything else. Presentation only.
  this.carriage=new FlightGroundCarriage();this.chassis=this.nodes.get('Main_Apparatus_Chassis')??null;
  this.chassisRest=this.chassis?{p:this.chassis.position.clone(),q:this.chassis.quaternion.clone()}:null;
  this.chassisTracks=new Map();
  for(const name of [FLIGHT_CLIPS.idle,FLIGHT_CLIPS.walk,FLIGHT_CLIPS.sprint,FLIGHT_CLIPS.stop]){
   const clip=clips.find(c=>c.name===name);if(!clip)continue;
   const track=suffix=>clip.tracks.find(t=>t.name==='Main_Apparatus_Chassis.'+suffix)?.createInterpolant()??null;
   this.chassisTracks.set(name,{duration:clip.duration,position:track('position'),quaternion:track('quaternion')});
  }
  this.authoredChassis=(name,time)=>{
   const t=this.chassisTracks.get(name);if(!t||!this.chassisRest)return null;
   const at=Math.max(0,Math.min(t.duration,name===FLIGHT_CLIPS.stop?time:((time%t.duration)+t.duration)%t.duration));
   const restQ=this.chassisRest.q;
   const q=t.quaternion?new THREE.Quaternion().fromArray(t.quaternion.evaluate(at)).premultiply(restQ.clone().invert()):new THREE.Quaternion();
   return{y:t.position?t.position.evaluate(at)[1]-this.chassisRest.p.y:0,q:[q.x,q.y,q.z,q.w]};
  };
 }
 // The grounded carriage's offset, laid on the chassis after the composition (which puts every animated node back
 // to its rest at the start of each frame, the chassis among them: so this never accumulates, and whatever a
 // wreck clip has done to the chassis stands).
 applyCarriage(m,plan,dt){
  if(!this.chassis)return;
  const offset=this.carriage.update(m,plan?.posture??null,dt,this.authoredChassis);
  this.carriageOffset=offset;this.carriageQ=null;
  if(offset.weight<=0)return;
  this.carriageQ=new THREE.Quaternion(offset.q[0],offset.q[1],offset.q[2],offset.q[3]);
  this.chassis.position.y+=offset.y;
  this.chassis.quaternion.multiply(this.carriageQ);
 }
 // Where a node hung from the chassis would be without the grounded carriage: the aiming eye stays where the
 // authority has it, however the machine rocks under the rider.
 steadyWorldPosition(node,out=new THREE.Vector3()){
  node.getWorldPosition(out);
  if(!this.chassis?.parent||!this.carriageQ)return out;
  // out of the rocked chassis, and back through the chassis as it was before the rock was laid on
  const local=this.chassis.worldToLocal(out);
  const steadyQ=this.chassis.quaternion.clone().multiply(this.carriageQ.clone().invert());
  local.multiply(this.chassis.scale).applyQuaternion(steadyQ).add(this.chassis.position);local.y-=this.carriageOffset.y;
  return local.applyMatrix4(this.chassis.parent.matrixWorld);
 }
 update(m,now,dt,operator,ejectionAt){
  if(this.id!==m.id){this.id=m.id;this.lastSword=null;this.weights={braceL:0,braceR:0,rotor:0,chassis:0};}
  const p=this.pose,plan=this.state.update(m,now);this.plan=plan;p.begin(dt);
  if(plan.wreck){
   p.sample(plan.wreck,()=>true,{transition:'wreck'});
   // Operator release is a visual harness reaction. Server already detached him.
   if(!m.operatorId&&now-m.destroyedAt<.75)p.sample({clip:'Operator_Release_Harness_Open_And_Clearance',time:now-m.destroyedAt},k=>k.startsWith('operator_root_anchor.')||/operator_waist|operator_shoulder/.test(k));
   p.end();this.applyCarriage(m,plan,dt);return plan;
  }
  p.sample(plan.posture,k=>['posture','rider'].includes(flightChannelOwner(k)),{transition:'posture'});
  const phase=(((m.rotorAngle??0)/(2*Math.PI))%1+1)%1;
  p.sample({clip:'Rotor_Spin_Cycle_1Rev',time:phase},own('gears'));
  p.sample({clip:'Crossbow_Reload_Index',time:Math.min(6,Math.floor(m.ammo??0))/6},own('ammo'));
  const shotAge=now-(m.lastShotAt??-Infinity);
  if(shotAge>=0&&shotAge<.143)p.sample({clip:'Crossbow_Fire_Loop',time:shotAge},own('fire'),{remap:t=>t.node.name==='Crossbow_Body'?this.gunShell:null,additive:true});
  // Default authored offensive sword corridor yields to a committed sword swing
  // and to the player's real Guard animation on the independent rider rig.
  if(plan.runWeight>0&&!operator?.guarding)p.sample({clip:'Dash_Narrowed_04_Resting_3P_Couched_Sword_Layer',time:now,loop:true},own('sword'),{weight:plan.runWeight,transition:'sword'});
  if(operator?.attackActive&&Number.isFinite(operator.attackStartedAt))this.lastSword={at:operator.attackStartedAt,count:operator.attackCommitted??0};
  if(this.lastSword){
   for(let i=0;i<Math.min(this.lastSword.count,SWORD_STRIKE_TIMES.length);i++){
    const age=now-this.lastSword.at-(SWORD_STRIKE_TIMES[i]-.65*.46);
    if(age>=0&&age<.65)p.sample({clip:'Sword_Strike_And_Recovery',time:age},own('sword'));
   }
   if(now-this.lastSword.at>3)this.lastSword=null;
  }
  for(const side of ['L','R']){
   const owner='brace'+side,hp=m[owner+'HP']??80;
   this.weights[owner]+=(clamp(1-hp/80)-this.weights[owner])*(1-Math.exp(-dt*9));
   if(hp<=0)p.sample({clip:`Damage_Comp_Brace_${side}_Broken_ZeroHP`,time:now-(m.componentFailedAt?.[owner]??m.builtAt??0)},own(owner));
   else p.sample({clip:`Damage_Comp_Brace_${side}_Looseness_And_Flex`,time:now,loop:true},own(owner),{weight:this.weights[owner],additive:true});
  }
  this.weights.chassis+=(clamp(1-m.health/250)-this.weights.chassis)*(1-Math.exp(-dt*9));
  p.sample({clip:'Damage_Comp_Chassis_Buckle_And_Compression',time:now,loop:true},k=>k.startsWith('Main_Apparatus_Chassis.')||flightChannelOwner(k)==='chassis',{
   weight:this.weights.chassis,additive:true,remap:t=>t.node.name==='Main_Apparatus_Chassis'?this.chassisShell:null});
  if(m.rotorHP<=0){
   const age=Math.max(0,now-(m.rotorDestroyedAt??now));
   p.sample({clip:'Damage_08_Rotor_Destroy_Grounded',time:age},k=>k.startsWith('Rotor_Blade_'));
   p.sample({clip:'Damage_Comp_Rotor_ZeroHP_Decay_And_Windmill',time:age},own('rotorDamage'));
   // Cosmetic hub coast only. Authority has already stopped damaging sweeps.
   this.nodes.get('Rotor_Hub')?.rotation.set(0,(m.rotorAngle??0)+10*(1-Math.exp(-1.8*age)),0);
  }else{
   this.weights.rotor+=(clamp(1-m.rotorHP/100)-this.weights.rotor)*(1-Math.exp(-dt*9));
   p.sample({clip:'Damage_Comp_Rotor_Wobble_And_Vibration',time:now,loop:true},k=>k.startsWith('Rotor_Shaft_And_Bearing.'),{additive:true,weight:this.weights.rotor*.35,remap:()=>this.shaftShell});
   this.nodes.get('Rotor_Hub')?.rotation.set(0,m.rotorAngle??0,0);
  }
  // Halo is deliberately subordinate: no opaque target-obscuring angel ring.
  p.sample(plan.posture,own('halo'));
  if(Number.isFinite(ejectionAt)&&now-ejectionAt>=0&&now-ejectionAt<1.2&&!m.operatorId)
   p.sample({clip:'Operator_Release_Harness_Open_And_Clearance',time:now-ejectionAt},k=>flightChannelOwner(k)==='rider'||flightChannelOwner(k)==='braceL'&&m.braceLHP>0||flightChannelOwner(k)==='braceR'&&m.braceRHP>0);
  const rpm=clamp((m.rotorRPM??0)/450);
  for(const [name,node] of this.nodes){
   if(name.startsWith('Rotor_Halo')){
    const ring=name.includes('Angel_Ring'),amount=clamp((rpm-(ring?.42:.08))/(ring?.53:.54));
    node.visible=m.rotorHP>0&&amount>.01&&!this.isFirstPerson;
    node.scale.set(1,Math.max(.001,amount),1);
    node.traverse(mesh=>{if(!mesh.isMesh)return;for(const mat of [mesh.material].flat()){
     if(mat.userData.haloOpacity==null){mat.userData.haloOpacity=mat.opacity;mat.transparent=true;mat.depthWrite=false;mat.needsUpdate=true;}
     mat.opacity=mat.userData.haloOpacity*amount*(ring?.32:.5);
    }});
   }
   if(name.includes('Thermal'))node.visible=Boolean(m.terminalDive&&!m.terminalDive.resolved)||m.health<75||m.rotorHP<=0&&now-(m.rotorDestroyedAt??0)<2.4;
  }
  p.end();this.applyCarriage(m,plan,dt);return plan;
 }
 grips(){
  const point=name=>this.nodes.get(name)?.getWorldPosition(new THREE.Vector3());
  return{leftFootQ:this.nodes.get('operator_foot_stirrup_L')?.getWorldQuaternion(new THREE.Quaternion()),rightFootQ:this.nodes.get('operator_foot_stirrup_R')?.getWorldQuaternion(new THREE.Quaternion()),pelvis:point('operator_waist_harness_anchor'),left:point('operator_hand_L_crossbow_grip'),right:point('operator_hand_R_sword_grip'),rightTip:point('operator_sword_tip_locator'),leftFoot:point('operator_foot_stirrup_L'),rightFoot:point('operator_foot_stirrup_R')};
 }
}
