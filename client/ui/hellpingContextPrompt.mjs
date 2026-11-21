import {HELLPING,hellpingPalm} from '../../shared/sim/soFistHellpingHand.mjs';
import {postureOf} from '../../shared/src/body.mjs';

// This is DISPLAY ONLY. The authoritative grasp and passenger boarding
// remain validated by requestHellpingHand/boardHellpingHand on the server.
// Mirror their actual 3D palm distance and enemy/ally eligibility so a prompt
// does not promise a grab simply because someone is close to the chassis.
const isCandidate=(p,b)=>Boolean(p?.alive&&p?.position&&p.id!==b.operatorId&&
 !p.operatingRamId&&!p.operatingBallistaId&&!p.operatingFightFlightId&&
 !p.hellpingCapturedBy&&!p.hellpingCarriedBy);
const allies=(a,b)=>Boolean(a?.team&&b?.team&&a.team===b.team);
function palmDistance(b,p){
 const v=hellpingPalm(b);
 return Math.hypot(p.position.x-v[0],
   p.position.y+postureOf(p).height*.5-v[1],
   p.position.z-v[2]);
}
export function hellpingContextPrompt(local,snapshot,bindings={siegeSkill:['KeyU'],interact:['KeyT']},now=0){
 const b=snapshot?.soFistication;
 if(!b||!local?.alive||b.retired||b.health<=0||
    b.skill?.id!=='hellpingHand'||b.fistMounted===false||
    (b.components?.Fist?.health??1)<=0||
    (b.components?.Drive?.health??1)<=0)return null;
 const skillKey=(bindings.siegeSkill?.[0]??'KeyU').replace(/^Key/,'');
 const interactKey=(bindings.interact?.[0]??'KeyT').replace(/^Key/,'');
 const operator=snapshot?.players?.find(p=>p.id===b.operatorId)||
   (local.id===b.operatorId?local:null);
 const open=b.hellping?.phase==='open';
 if(local.id===b.operatorId&&local.operatingRamId===b.id){
   if(b.hellping?.phase==='grasp')return {label:'ENEMY SECURED',detail:'CRUSHING · '+skillKey+' RELEASE',kind:'enemy'};
   if(b.hellping?.phase==='transport')return {label:'ALLY ABOARD',detail:skillKey+' RELEASE',kind:'ally'};
   if(b.hellping?.phase==='ledgePull')return {label:'HAND ANCHORED',detail:'PULLING UP',kind:'ledge'};
   if(b.hellpingLedge)return {label:skillKey+' · GRAB LEDGE',detail:'PULL UP',kind:'ledge'};
   if(['vault','release'].includes(b.hellping?.phase)||
     (!open&&(b.skill.readyAt??0)>now+.01))return null;
   const candidates=(snapshot?.players??[])
     .filter(p=>isCandidate(p,b)).map(p=>({p,distance:palmDistance(b,p)}))
     .sort((a,c)=>a.distance-c.distance||String(a.p.id).localeCompare(String(c.p.id)));
   const enemy=candidates.find(c=>!allies(operator,c.p)&&c.distance<=HELLPING.reach);
   if(enemy)return open
     ?{label:skillKey+' · SEIZE',detail:enemy.p.guarding?'GUARD MAY RESIST':'ENEMY IN REACH',kind:'enemy'}
     :{label:skillKey+' · OPEN HAND',detail:'ENEMY NEARBY',kind:'enemy'};
   const ally=candidates.find(c=>allies(operator,c.p)&&c.distance<=3);
   if(ally&&open)return {label:'ALLY MAY BOARD',detail:'ALLY PRESSES '+interactKey,kind:'ally'};
   return null;
 }
 if(!operator||!open||!isCandidate(local,b)||!allies(operator,local)||
     palmDistance(b,local)>3)return null;
 return {label:interactKey+' · BOARD HAND',detail:'ALLIED TRANSPORT',kind:'ally'};
}
