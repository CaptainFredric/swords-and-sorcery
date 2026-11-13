// A single geometric contract for siege boarding, shared by the browser
// Mount affordance and authoritative game rules. High Grounds has multiple
// overlapping elevations: horizontal proximity alone is NOT access.
const horizontal=(player,machine)=>{
  const p=player?.position;
  if(!p||![p.x,p.z,machine?.x,machine?.z].every(Number.isFinite))return Infinity;
  return Math.hypot(p.x-machine.x,p.z-machine.z);
};
export function flightMountReach(player,machine){
  return horizontal(player,machine)<=3.2 &&
    Number.isFinite(player?.position?.y)&&Number.isFinite(machine?.y)&&
    Math.abs(player.position.y-machine.y)<=1.8;
}
export function ramMountReach(player,machine,entry,seat){
  if(!player?.position||!seat||!machine)return false;
  const p=player.position;
  const at=(q)=>q&&Number.isFinite(q.x)&&Number.isFinite(q.z)?
    Math.hypot(p.x-q.x,p.z-q.z):Infinity;
  const closest=Math.min(at(entry?.y==null?null:entry),at(machine),at(seat));
  return closest<=3.75&&Number.isFinite(p.y)&&Number.isFinite(seat.y)&&
    Math.abs(p.y-seat.y)<=2.0;
}
export function ballistaMountReach(player,machine){
  return horizontal(player,machine)<=Math.max(0,machine?.interactRadius??0) &&
    Number.isFinite(player?.position?.y)&&Number.isFinite(machine?.y)&&
    Math.abs(player.position.y-machine.y)<=2.0;
}
