// One live owner per glTF node/property. Full-body exports are source material,
// never competing mixers. Wrecks acquire the complete visual rig after death.
export function flightChannelOwner(key){
 const node=key.slice(0,key.lastIndexOf('.'));
 if(['Main_Apparatus_Chassis','FightAndFlight_Root','Crossbow_Yaw_Gimbal','Crossbow_Pitch_Cradle','crossbow_muzzle','Rotor_Hub','operator_first_person_camera'].includes(node))return 'authority';
 if(node==='operator_root_anchor')return 'rider';
 if(node.startsWith('Protective_Brace_L'))return 'braceL';
 if(node.startsWith('Protective_Brace_R'))return 'braceR';
 if(node==='Rotor_Shaft_And_Bearing'||node.startsWith('Rotor_Hub_Fractured')||node.startsWith('Rotor_Blade')||node.startsWith('Rotor_Thermal'))return 'rotorDamage';
 if(node.startsWith('Drive_'))return 'gears';
 if(node.startsWith('Rotor_Halo'))return 'halo';
 if(node==='Rear_Drive_Assembly'||node.startsWith('Rear_Drive_Thermal'))return 'chassis';
 if(node==='Crossbow_Body'||node==='Crossbow_Bow_And_String'||node==='Crossbow_Recocking_Slide')return 'fire';
 if(node.startsWith('Quarrel_')||['Crossbow_Bolt_Carousel','Crossbow_Hopper_Follower'].includes(node))return 'ammo';
 if(node.startsWith('operator_arm_R')||node.startsWith('operator_hand_R')||node==='operator_sword_tip_locator')return 'sword';
 if(/^(Lower_|Grounded_|Rear_Trident_|operator_shoulder_|operator_waist_)/.test(node))return 'posture';
 return 'unused';
}
export const FLIGHT_CLIPS=Object.freeze({
 idle:'Posture_01_Grounded_Idle',walk:'Gait_02_Balance_Test_Brisk_Stride_5p5_mps',sprint:'Gait_03_Sprint_Stride_9p3_mps',stop:'Gait_04_Stride_To_Idle_Recovery',
 entry:'Dash_Narrowed_01_Entry_Posture',sustain:'Dash_Narrowed_02_Sustained_Hold_Loop',release:'Dash_Narrowed_03_Release_Flare_Recovery',interrupt:'Dash_Narrowed_05_Collision_Interruption_Recovery',
 break:'Destruction_Airborne_01_Break_And_Shudder',fall:'Destruction_Airborne_02_Falling_Wreck_Loop',impact:'Destruction_Airborne_03_Ground_Impact_To_Ruined_Rest',terminal:'Destruction_Valkyrie_Dive_Terminal_Shatter_And_Ruin'
});
const sample=(clip,time,loop=false)=>({clip,time,loop});
export class FlightAnimationState{
 reset(m,now){this.id=m.id;this.wasRun=false;this.runAt=null;this.releaseAt=null;this.speed=0;this.phase=0;this.lastAt=now;this.mode=null;this.modeAt=now;}
 update(m,now){
  if(this.id!==m.id)this.reset(m,now);
  const dt=Math.min(.1,Math.max(0,now-this.lastAt));this.lastAt=now;
  const speed=Math.hypot(m.velocity?.x??0,m.velocity?.z??0),running=Boolean(m.offensiveRun);
  if(running&&!this.wasRun)this.runAt=m.runAnimationStartedAt??now;
  if(!running&&this.wasRun)this.releaseAt=Number.isFinite(m.runAnimationEndedAt)&&m.runAnimationEndedAt>=this.runAt?m.runAnimationEndedAt:now;
  const interrupted=Number.isFinite(this.releaseAt)&&((m.lastImpactAt??-Infinity)>=this.releaseAt-.12||m.rotorHP<=0||m.emergencyBrakeActive);
  const destroyed=m.mode==='DESTROYED'||m.health<=0;
  let posture;
  if(destroyed){
   let wreck;
   if(m.terminalDive?.resolved)wreck=sample(FLIGHT_CLIPS.terminal,now-m.destroyedAt);
   else if(m.wreckAirborne)wreck=now-m.destroyedAt<.65?sample(FLIGHT_CLIPS.break,now-m.destroyedAt):sample(FLIGHT_CLIPS.fall,now-m.destroyedAt-.65,true);
   else wreck=sample(FLIGHT_CLIPS.impact,now-(m.wreckImpactAt??m.destroyedAt));
   this.wasRun=false;return{wreck};
  }
  if(running){const age=now-this.runAt;posture=age<.38?sample(FLIGHT_CLIPS.entry,age):sample(FLIGHT_CLIPS.sustain,age-.38,true);}
  else if(this.releaseAt!=null&&now-this.releaseAt<(interrupted?.95:.7))posture=sample(interrupted?FLIGHT_CLIPS.interrupt:FLIGHT_CLIPS.release,now-this.releaseAt);
  else{
   let clip=FLIGHT_CLIPS.idle;
   if(m.terminalDive)clip='Posture_07_Terminal_Dive_Pitch';
   else if(m.crouched)clip='Posture_03_Grounded_Crouch';
   else if(m.mode==='LANDING')clip='Posture_02_Controlled_Landing';
   else if(m.mode==='TAKEOFF')clip=Number.isFinite(m.hopStartedAt)?'Posture_09_Ordinary_Small_Jump':'Posture_04_Takeoff_To_Flight';
   else if(!m.grounded)clip='Posture_10_Ascending_Hover_Descending';
   else if(speed>.25)clip=speed>7.2?FLIGHT_CLIPS.sprint:FLIGHT_CLIPS.walk;
   else if(this.speed>.25||this.mode===FLIGHT_CLIPS.stop&&now-this.modeAt<.7)clip=FLIGHT_CLIPS.stop;
   if(clip!==this.mode){this.mode=clip;this.modeAt=now;}
   const gait=clip===FLIGHT_CLIPS.walk||clip===FLIGHT_CLIPS.sprint;
   // Preserve phase on walk/sprint transitions; distance controls cadence.
   this.phase+=dt*speed/(clip===FLIGHT_CLIPS.sprint?9.3*.75:5.5*.96);
   posture=sample(clip,gait?(this.phase%1)*(clip===FLIGHT_CLIPS.sprint?.75:.96):now-this.modeAt,gait||clip===FLIGHT_CLIPS.idle);
  }
  this.wasRun=running;this.speed=speed;
  return{posture,running,runWeight:running?Math.min(1,(now-this.runAt)/.3):Math.max(0,1-(now-(this.releaseAt??-Infinity))/.7)};
 }
}
export function ramWreckClip(m){return m.wreckFistMissing?'08_Carriage_Full_Breakdown_With_PreDestroyed_Fist':m.wreckSide<0?'07_Carriage_Breakdown_Port_Forward_Axle_Lead':'06_Carriage_Full_Breakdown_And_Ruined_Rest';}
