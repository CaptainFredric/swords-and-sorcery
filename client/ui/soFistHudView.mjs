import {siegeSkillLabel} from './siegeSkillView.mjs';
import {keyLabel,registry} from '../settings/settingsRegistry.mjs';
import {soFistTiming} from '../../shared/sim/soFistGeometry.mjs';
import {soFistEntry} from '../../shared/sim/soFistication.mjs';
export function soFistHudView(local,snapshot,now,{bindings=registry.defaultBindings(),touch=false}={}){
 const b=snapshot?.soFistication;if(!local?.alive||!b||b.retired||b.health<=0||local.operatingBallistaId||b.team&&local.team!==b.team)return null;
 const key=action=>bindings[action]?.[0]?keyLabel(bindings[action][0]):'UNBOUND';
 if(local.operatingRamId!==b.id){const at=soFistEntry(b);if(b.operatorId||Math.hypot(at.x-local.position.x,at.z-local.position.z)>2.2)return null;if(b.detachedFist?.state==='recovering')return {title:'SO-FIST-ICATION',status:'FIST RECOVERY '+Math.max(0,Math.ceil((b.fistRecoveryUntil??now)-now))+'s · BOARDING LOCKED',controls:''};return{title:'SO-FIST-ICATION',status:touch?'Tap MOUNT at the rear frame':`[${key('interact')}] Operate`,controls:''};}
 const fist=b.components?.Fist,drive=b.components?.Drive,wheels=Object.entries(b.components??{}).filter(([id,c])=>id.startsWith('Wheel_')&&c.health<=0).length;
 const timing=soFistTiming(b);
 const age=b.strikeAt==null?4:now-b.strikeAt;
 const lift=(b.ramLiftY??0),elev=(b.ramElevPitch??0)*180/Math.PI;
 const recovery=b.detachedFist?.state==='recovering'?(`FIST RECOVERY ${Math.max(0,Math.ceil((b.fistRecoveryUntil??now)-now))}s`):
  b.detachedFist?.state==='abyss'?
   `FIST LOST · HOME ${Math.ceil(Math.hypot(b.x-(b.fistHome?.x??b.x),b.z-(b.fistHome?.z??b.z)))}m · DISMOUNT` :
  b.detachedFist?.state==='resting'?'FIST ON GROUND · DRIVE TO PICK UP':
  b.detachedFist?.state==='flying'||b.detachedFist?.state==='falling'?'FIST IN FLIGHT':null;
 const strike=age<timing.release?(b.skillStroke?'Piston resetting':'Piston winding'):age<timing.peak?'Piston released':age<4?'Piston retracting':'Piston ready';
 return{title:`SO-FIST-ICATION · ${Math.ceil(b.health)}/${b.maxHealth}`,pressure:b.pressure,
  status:[b.charging&&b.speed<-.05?'REVERSE PRESSURE CHARGE':b.charging?'KNOCK ON STEEL':b.chargeSpent?'DRIVE WINDING DOWN':`${Math.abs(b.speed).toFixed(1)} m/s`,strike,siegeSkillLabel(b,now),fist?.health<=0?'EXPOSED PISTON':b.fistMounted===false?'PISTON ONLY':
   `FIST ${Math.ceil(fist?.health??500)}/500`,
   `LIFT ${lift.toFixed(1)}m · AIM +${elev.toFixed(0)}°`,(b.ramLiftBlockedAt!=null&&now>=b.ramLiftBlockedAt&&now-b.ramLiftBlockedAt<.75?'LIFT OBSTRUCTED':''),recovery,drive?.health<=0?'DRIVE DAMAGED':'',wheels?`${wheels} WHEEL${wheels>1?'S':''} DISABLED`:''].filter(Boolean).join(' · '),
  controls:touch?'Full stick forward or hold CHARGE · JUMP raises upper ram · CROUCH lowers · Aim up for elevated punch · ATTACK piston · SKILL · VIEW · LEAVE':
  `Hold [${key('sprint')}] + W charge or S reverse while primed · [${key('attack')}] Piston · [${key('siegeView')}] View · [${key('interact')}] Leave · [${key('dash')}] lift · [${key('crouch')}] lower · Look up to aim · [${key('siegeSkill')}] Skill`};
}
