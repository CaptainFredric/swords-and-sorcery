import * as THREE from 'three';
import {MachineAnimationComposition} from './MachineAnimationComposition.mjs';
import {FlightAnimationState,flightChannelOwner} from './flightAnimationState.mjs';
import {SWORD_STRIKE_TIMES} from '../../shared/src/combat.mjs';
const own=owner=>key=>flightChannelOwner(key)===owner;
const clamp=x=>Math.max(0,Math.min(1,x));
export class FlightRigAnimation{
 constructor(root,clips){
  this.pose=new MachineAnimationComposition(root,clips);this.state=new FlightAnimationState();this.nodes=new Map();root.traverse(n=>{if(n.name)this.nodes.set(n.name,n);});
  this.chassisShell=this.pose.shell('Main_Apparatus_Chassis');this.gunShell=this.pose.shell('Crossbow_Body');this.shaftShell=this.pose.shell('Rotor_Shaft_And_Bearing');
  this.weights={braceL:0,braceR:0,rotor:0,chassis:0};
 }
 update(m,now,dt,operator,ejectionAt){
  if(this.id!==m.id){this.id=m.id;this.lastSword=null;this.weights={braceL:0,braceR:0,rotor:0,chassis:0};}
  const p=this.pose,plan=this.state.update(m,now);this.plan=plan;p.begin(dt);
  if(plan.wreck){
   p.sample(plan.wreck,()=>true,{transition:'wreck'});
   // Operator release is a visual harness reaction. Server already detached him.
   if(!m.operatorId&&now-m.destroyedAt<.75)p.sample({clip:'Operator_Release_Harness_Open_And_Clearance',time:now-m.destroyedAt},k=>k.startsWith('operator_root_anchor.')||/operator_waist|operator_shoulder/.test(k));
   p.end();return plan;
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
  p.end();return plan;
 }
 grips(){
  const point=name=>this.nodes.get(name)?.getWorldPosition(new THREE.Vector3());
  return{leftFootQ:this.nodes.get('operator_foot_stirrup_L')?.getWorldQuaternion(new THREE.Quaternion()),rightFootQ:this.nodes.get('operator_foot_stirrup_R')?.getWorldQuaternion(new THREE.Quaternion()),pelvis:point('operator_waist_harness_anchor'),left:point('operator_hand_L_crossbow_grip'),right:point('operator_hand_R_sword_grip'),rightTip:point('operator_sword_tip_locator'),leftFoot:point('operator_foot_stirrup_L'),rightFoot:point('operator_foot_stirrup_R')};
 }
}
