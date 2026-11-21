// Pure presentation contract for the authoritative Gale+Lightning detonation.
// Ordinary Lightning effects terminate at the explosion. Only the independent
// Gale+Lightning ground strike is allowed to continue vertically downward.
// The ground coordinate comes from combat.mjs; the client does not guess it.
const finitePoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export function lightningImpactPath(event){
 if(!event?.tiers?.lightning||!finitePoint(event.point))return null;
 const explosion=event.groundBlast&&finitePoint(event.groundPoint)
  ?event.groundPoint:event.point;
 const aerial=event.impactId&&event.form==='aerial'&&!event.groundBlast&&
   (event.tiers.gale??0)>=2;
 // An actual landing uses the server's highest supported floor; an
 // unsupported void uses a visually off-map endpoint but has NO impact.
 const ground=aerial&&finitePoint(event.lightningGroundPoint)&&
   event.lightningGroundPoint.y<explosion.y-1.25
   ?event.lightningGroundPoint:null;
 const voidEnd=aerial&&!ground&&finitePoint(event.lightningVoidPoint)&&
   event.lightningVoidPoint.y<explosion.y-1.25
   ?event.lightningVoidPoint:null;
 const endpoint=ground??voidEnd??explosion;
 return {
  explosion:{x:explosion.x,y:explosion.y,z:explosion.z},
  end:{x:endpoint.x,y:endpoint.y,z:endpoint.z},
  descends:Boolean(ground||voidEnd),
  strikesGround:Boolean(ground),
 };
}
