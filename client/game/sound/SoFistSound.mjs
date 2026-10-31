import {soFistTiming} from '../../../shared/sim/soFistGeometry.mjs';
import {BiByeSound} from './BiByeSound.mjs';
// Shared timber, iron and chain recordings/recipes, with the ram's own cycle.
export class SoFistSound {
 constructor(engine){this.sound=new BiByeSound(engine);this.lastStrike=null;this.released=false;this.id=null;}
 update(b,options){
  if(this.id!==b?.id){this.id=b?.id;this.lastStrike=null;this.released=false;this.sound.stop();}
  if(!b){this.sound.update(null,options);return;}
  const timing=soFistTiming(b);
  const age=b.strikeAt==null?4:options.now-b.strikeAt;
  const pose={...b,yaw:b.heading,upperYaw:b.heading,state:age<timing.release||b.charging?'RELOADING':'LOADED'};
  this.sound.update(pose,options);
  const primed=Boolean(b.operatorId)&&b.skill?.phase==='primed';
  const jitterGain=primed?0.18+Math.min(0.12,(b.skill?.debt??0)*0.02):0;
  this.sound.loop('pressure',primed,pose,jitterGain,1.15);
  if(b.strikeAt!==this.lastStrike){this.lastStrike=b.strikeAt;this.released=false;}
  if(age>=timing.release&&age<timing.peak+.24&&!this.released){
    this.released=true;
    this.sound.event({type:'bibyeFired',ballistaId:b.id,shot:'II',at:b.strikeAt+timing.release},pose,options.now);
    this.sound.play('steamRelease',pose,0.85);
  }
 }
 event(e,b,now){
  if(!b||e.machineId!==b.id)return;
  if(e.type==='soFistSteam')this.sound.play('steamRelease',b,0.85);
  if(e.type==='siegeImpact'&&e.kind!=='piston-wall'&&e.strength>.12)this.sound.event({...e,type:'bibyeBoltImpact',ballistaId:b.id,subKind:'siege'},b,now);
   if(e.type==='soFistBlocked')this.sound.event({...e,type:'bibyeBoltImpact',ballistaId:b.id,subKind:'siege'},b,now);
  if(e.type==='soFistImpact')this.sound.event({...e,type:'bibyeBoltImpact',ballistaId:b.id,subKind:'siege'},b,now);
  if(e.type==='soFistDamaged')this.sound.event({...e,type:'bibyeDamaged',ballistaId:b.id,material:e.componentId==='Fist'?'metal':'timber'},b,now);
 }
 stop(){this.sound.stop();}
 dispose(){this.sound.dispose();}
}
