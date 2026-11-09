// Pure presentation from an authoritative Restless Day snapshot.
export function restlessDayHudView(local,snapshot,now){
 if(snapshot?.mode!=='RESTLESS_DAY'||!snapshot.modeState)return {visible:false};
 const state=snapshot.modeState,attacking=local?.team==='ATTACKERS';
 const phase=Math.max(0,Math.min(2,state.phase??0));
 const remaining=Math.max(0,(state.deadline??now)-now);
 const clock=`${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}`;
 const monument=state.renowner??{},health=Math.max(0,monument.health??0),max=Math.max(1,monument.maxHealth??1);
 const hpPct=Math.round(health/max*100);
 const phases=['OUTER CURTAIN','INNER CURTAIN','FINAL COURTYARD'];
 const present=state.ladders?.filter(l=>l.state==='deployed')??[];
 const carried=state.ladders?.filter(l=>l.state==='carrying')??[];
 const replacements=state.ladders?.filter(l=>l.state==='broken')??[];
 const footer=`LADDERS ${present.length} PLACED · ${carried.length} CARRIED · ${replacements.length} REFORGING`;
 const directive=attacking
   ?(phase===2?'DESTROY THE RIGHTFUL RENOWNER':`BREACH THE ${phase===0?'OUTER':'INNER'} WALL · [E] HANDLE LADDER`)
   :(phase===2?'SAVE THE RENOWNER':`DEFEND THE ${phase===0?'OUTER':'INNER'} RAMPART`);
 return {
  visible:true,mode:'restless-day',team:local?.team??'ATTACKERS',
  teamLabel:attacking?'ATTACKERS · AZURE HOST':'DEFENDERS · CRIMSON GUARD',
  phaseLabel:phases[phase],clock,objectiveName:'THE RIGHTFUL RENOWNER',
  progressPct:hpPct,stateLabel:`RENOWNER ${Math.ceil(health)} / ${max}`,
  stateKey:health<=0?'destroyed':remaining<=60?'urgent':'guarded',
  directive,footer,attackersCount:0,defendersCount:0,distanceMeters:null,
 };
}
