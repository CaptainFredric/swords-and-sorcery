// High Grounds uses the established Breakthrough objective HUD instead of a second,
// full-width status overlay. All fields come from the authoritative room snapshot.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const HIGH_GROUNDS_MACHINE_KEYS=Object.freeze({
  Digit7:'bi-bye-llista',Digit8:'so-fist-ication',Digit9:'fight-and-flight'
});
export function highGroundsHudView(local,snapshot,now){
  if(snapshot?.mode!=='HIGH_GROUNDS'||!snapshot.highGrounds?.sites?.length)return {visible:false};
  const state=snapshot.highGrounds,team=local?.team==='DEFENDERS'?'DEFENDERS':'ATTACKERS';
  const position=local?.position;
  const distance=site=>position&&site.position
    ?Math.hypot(site.position.x-position.x,site.position.z-position.z)+Math.abs(site.position.y-position.y)*1.6
    :Infinity;
  // Prioritize nearby contested or currently capturing sites; otherwise suggest
  // the closest place the player could actually take from the opposing side.
  const sites=state.sites;
  const highlighted=[...sites].sort((a,b)=>{
    const priority=site=>{
      const d=distance(site);
      if(d<=site.radius+7&&(site.contested||site.progress>0))return -100+d*.01;
      if(site.owner!==team)return d-25;
      return d+95;
    };
    return priority(a)-priority(b);
  })[0];
  const owner=highlighted.owner;
  const captured=sites.filter(s=>s.owner===team).length;
  const enemy=sites.filter(s=>s.owner&&s.owner!==team).length;
  const attackers=state.scores?.ATTACKERS??0,defenders=state.scores?.DEFENDERS??0;
  const scoreToWin=Math.max(1,state.scoreToWin??900);
  const left=Math.max(0,(snapshot.matchSeconds??720)-Math.max(0,now-(snapshot.matchStartedAt??now)));
  const clock=snapshot.overtime?'OVERTIME':Math.floor(left/60)+':'+String(Math.floor(left%60)).padStart(2,'0');
  const pct=clamp(Math.round((highlighted.progress??0)*100),0,100);
  const stateKey=highlighted.contested?'contested':highlighted.progress>0?'capturing':owner===team?'holding':'idle';
  const stateLabel=highlighted.contested?'CONTESTED':highlighted.progress>0
    ?highlighted.capturingTeam===team?'CAPTURING':'UNDER ATTACK'
    :owner===team?'HELD':owner?'ENEMY HELD':'NEUTRAL';
  const myScore=team==='ATTACKERS'?attackers:defenders;
  return {visible:true,team,teamLabel:team==='ATTACKERS'?'AZURE':'CRIMSON',
    phaseLabel:`AZURE ${Math.floor(attackers)} : ${Math.floor(defenders)} CRIMSON · ${scoreToWin} TO WIN`,
    clock,objectiveName:highlighted.name.toUpperCase(),stateKey,stateLabel,progressPct:pct,
    directive:owner===team?'DEFEND THIS SITE':'CAPTURE THIS SITE',
    footer:`${captured} HELD · ${enemy} ENEMY · ${sites.length-captured-enemy} NEUTRAL`,
    distanceMeters:Number.isFinite(distance(highlighted))?Math.round(distance(highlighted)):null,
    mode:'high-grounds',sites:sites.map(s=>({id:s.id,owner:s.owner,contested:s.contested}))};
}
export function highGroundsFoundryView(snapshot,player,now){
 const state=snapshot?.highGrounds;
 if(snapshot?.mode!=='HIGH_GROUNDS'||snapshot.roomState!=='PLAYING'||!state||!player?.alive)return {visible:false};
 const foundry=state.foundries?.find(f=>f.team===player.team);
 if(!foundry||!player.position||Math.hypot(foundry.x-player.position.x,foundry.z-player.position.z)>5
   ||Math.abs(foundry.y-player.position.y)>2||player.operatingBallistaId||player.operatingRamId||player.operatingFightFlightId)return {visible:false};
 const remaining=Math.max(0,Math.ceil(foundry.readyAt-now));
 const machines=[snapshot.bibyeBallista,snapshot.soFistication,snapshot.fightFlight];
 const owned=Boolean(foundry.machineId&&machines.some(m=>m?.id===foundry.machineId&&!m.retired&&m.mode!=='DESTROYED'&&m.health>0));
 return {visible:true,remaining,owned,ready:!remaining&&!owned,
   status:owned?'TEAM MACHINE ACTIVE':remaining?`RECHARGING · ${remaining}s`:'CHOOSE YOUR SIEGE MACHINE',
   disabled:{
    'bi-bye-llista':Boolean(owned||remaining||machines[0]&&!machines[0].retired&&machines[0].mode!=='DESTROYED'&&machines[0].health>0),
    'so-fist-ication':Boolean(owned||remaining||machines[1]&&!machines[1].retired&&machines[1].mode!=='DESTROYED'&&machines[1].health>0),
    'fight-and-flight':Boolean(owned||remaining||machines[2]&&!machines[2].retired&&machines[2].mode!=='DESTROYED'&&machines[2].health>0)
   }};
}
