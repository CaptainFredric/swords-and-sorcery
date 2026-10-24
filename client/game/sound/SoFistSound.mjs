import {BiByeSound} from './BiByeSound.mjs';
// Shared timber, iron and chain recordings/recipes, with the ram's own cycle.
export class SoFistSound {
 constructor(engine){this.sound=new BiByeSound(engine);this.lastStrike=null;this.released=false;this.id=null;}
 update(b,options){
  if(this.id!==b?.id){this.id=b?.id;this.lastStrike=null;this.released=false;this.sound.stop();}
  if(!b){this.sound.update(null,options);return;}
  const age=b.strikeAt==null?4:options.now-b.strikeAt;
  const pose={...b,yaw:b.heading,upperYaw:b.heading,state:age<2.08||b.charging?'RELOADING':'LOADED'};
  this.sound.update(pose,options);
  if(b.strikeAt!==this.lastStrike){this.lastStrike=b.strikeAt;this.released=false;}
  if(age>=2.08&&age<2.5&&!this.released){this.released=true;this.sound.event({type:'bibyeFired',ballistaId:b.id,shot:'II',at:b.strikeAt+2.08},pose,options.now);}
 }
 event(e,b,now){
  if(!b||e.machineId!==b.id)return;
  if(e.type==='soFistBlocked')this.sound.event({...e,type:'bibyeBoltImpact',ballistaId:b.id,subKind:'siege'},b,now);
  if(e.type==='soFistImpact')this.sound.event({...e,type:'bibyeBoltImpact',ballistaId:b.id,subKind:'siege'},b,now);
  if(e.type==='soFistDamaged')this.sound.event({...e,type:'bibyeDamaged',ballistaId:b.id,material:e.componentId==='Fist'?'metal':'timber'},b,now);
 }
 stop(){this.sound.stop();}
 dispose(){this.sound.dispose();}
}
