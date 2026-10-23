import { BI_BYE_LLISTA_CONFIG as CONFIG } from '../../shared/sim/biByeLlista.mjs';

// Each layer has exclusive node ownership. All samples seek the presentation host clock.
export function biByeAnimation(b, now) {
  if (b.mode === 'DESTROYED') return { name:'12_BiBye_Damaged_Destroyed',time:Math.min(1.8,Math.max(0,now-(b.destroyedAt??now))) };
  if (b.state === 'RELOADING') return { name:'19_BiBye_Main_Winch_Reload_Only',time:Math.max(0,now-(b.reloadStartedAt??now)) };
  if (b.mainReleasedAt != null && now < (b.firedAt??0)+CONFIG.timing.recoilRecoveryDurationSec)
    return { name:'21_BiBye_Delayed_Shot2_Release_And_Recoil',time:Math.max(0,now-b.mainReleasedAt) };
  return { name:b.mode==='DEPLOYED'?'01_BiBye_LoadedIdle':'06_BiBye_Travel_Ready',time:0 };
}
export { biByeWheelSteering, biByeWheelTravel } from '../../shared/sim/biByeComponents.mjs';
export function biByeUpperAnimation(b,now){
  const started=b.upperFiredAt??b.mobileFiredAt;
  if(started!=null&&(now<(b.smallBoltReadyAt??0)||b.upperPending||b.coupling==='FIRING'&&b.upperReleasedAt==null)){
    const elapsed=Math.max(0,now-started),coupled=b.upperShotKind==='coupled';
    if(elapsed<.85)return {name:coupled?'20_BiBye_Coupled_Shot1_Trigger_And_Delay_Upper':'09_BiBye_Mobile_Shot1_Fire_Upper',time:Math.min(elapsed,coupled?.7:.85)};
    return {name:'10_BiBye_Mobile_Shot1_Reload_Upper',time:Math.min(2.5,(elapsed-.85)*2.5/Math.max(.001,b.smallBoltReadyAt-started-.85))};
  }
  return {name:'01_BiBye_LoadedIdle_Upper',time:0};
}
export function biByeClutchAnimation(b,now){
  if(b.trackingSince!=null)return {name:'17_BiBye_Upper_Align_And_Couple_Clutch',time:Math.min(.6,Math.max(0,now-b.trackingSince))};
  if(b.coupling==='ENGAGING')return {name:'17_BiBye_Upper_Align_And_Couple_Clutch',time:Math.max(0,now-b.couplingStartedAt)};
  if(b.coupling==='RELEASING'&&(b.couplingReleaseFrom??1)<1)return {name:'17_BiBye_Upper_Align_And_Couple_Clutch',time:Math.max(0,.6*b.couplingReleaseFrom-(now-b.couplingStartedAt))};
  if(b.coupling==='RELEASING')return {name:'18_BiBye_Upper_Uncouple_Release_Clutch',time:.6*(1-(b.couplingReleaseFrom??1))+Math.max(0,now-b.couplingStartedAt)};
  if(b.coupling==='FIRING'||b.coupling==='COUPLED')return {name:'20_BiBye_Coupled_Shot1_Trigger_And_Delay_Clutch',time:Math.max(0,now-(b.firedAt??now))};
  return {name:'18_BiBye_Upper_Uncouple_Release_Clutch',time:.6};
}
export function biByeDelayAnimation(b,now){
  if(b.state==='RELOADING')return {name:'19_BiBye_Main_Winch_Reload_Only_Delay',time:Math.max(0,now-b.reloadStartedAt)};
  if(b.firedAt!=null&&Number.isFinite(b.firedAt)&&now>=b.firedAt&&b.upperShotKind==='coupled')return {name:'20_BiBye_Coupled_Shot1_Trigger_And_Delay_Delay',time:Math.min(.7,now-b.firedAt)};
  return {name:'01_BiBye_LoadedIdle_Delay',time:0};
}
export function biByeTrackOwner(track){
  const node=track.split('.')[0];
  if(/^(Wheel_|Stabilizer_)/.test(node))return 'Components';
  if(node==='Upper_Turret_Mount'&&track.endsWith('.quaternion'))return 'Aim';
  if(node==='Upper_Conditioning_Bolt')return 'Aim';
  if(node.startsWith('Upper_'))return 'Upper';
  if(['Operator_Fire_And_Couple_Lever','Coupling_Clutch_Collar'].includes(node))return 'Clutch';
  if(['Coupling_Transfer_Linkage','Delay_Escapement_Gear'].includes(node))return 'Delay';
  if(['BiBye_Root','Carriage_Chassis','Traverse_Mount'].includes(node))return 'Aim';
  return 'Main';
}
