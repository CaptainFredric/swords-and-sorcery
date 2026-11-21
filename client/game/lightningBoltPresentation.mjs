// Pure presentation contract for the authoritative Gale+Lightning detonation.
// Ordinary Lightning effects terminate at the explosion. Only the independent
// Gale+Lightning ground strike is allowed to continue vertically downward.
// The ground coordinate comes from combat.mjs; the client does not guess it.
const finitePoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export function lightningImpactPath(event){
 if(!event?.tiers?.lightning||!finitePoint(event.point))return null;
 const explosion=event.groundBlast&&finitePoint(event.groundPoint)
  ?event.groundPoint:event.point;
 const ground=event.impactId&&event.form==='aerial'&&!event.groundBlast&&
   (event.tiers.gale??0)>=2&&finitePoint(event.lightningGroundPoint)&&
   event.lightningGroundPoint.y<explosion.y-1.25
   ?event.lightningGroundPoint:null;
 return {
  explosion:{x:explosion.x,y:explosion.y,z:explosion.z},
  end:ground?{x:ground.x,y:ground.y,z:ground.z}:
    {x:explosion.x,y:explosion.y,z:explosion.z},
  descends:Boolean(ground),
 };
}
