import {projectToScreen} from './screenProjection.mjs';

// A single marker follows the server-locked enemy, not whichever point the
// local camera is currently aiming at. Never reveal a fully occluded target.
export function flightTargetMarkerView(local,snapshot,camera,{THREE}={}){
  const m=snapshot?.fightFlight,skill=m?.skill;
  if(!local?.alive||local.operatingFightFlightId!==m?.id||
    skill?.id!=='narrowToOne'||skill.phase!=='active'||!skill.targetId||
    skill.targetVisible===false)return null;
  const target=snapshot.players?.find(p=>p.id===skill.targetId);
  if(!target?.alive||!target.position)return null;
  const projected=projectToScreen(target.position,camera,{
    heightOffset:1.1,THREE,
    bounds:{minX:.08,maxX:.92,minY:.14,maxY:.83},
  });
  if(!projected)return null;
  return {...projected,targetId:target.id,name:String(target.name??'SPELLBLADE').slice(0,48),
    state:skill.lockedOnce===false?'preview':skill.trackingState??'locked',
    previewDetail:skill.lockedOnce===false?skill.trackingState??'preview':null};
}
