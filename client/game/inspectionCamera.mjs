// Inspection changes only the viewpoint. Its clock and position are independent of simulation.
export function inspectionSpawn(actor) {
  const p=actor?.position??{x:0,y:0,z:0},yaw=actor?.yaw??0;
  return {position:{x:p.x+Math.sin(yaw)*4,y:p.y+3,z:p.z+Math.cos(yaw)*4},yaw,pitch:-.24};
}
export function flyStep(pose,input,seconds) {
  const dt=Math.min(.05,Math.max(0,Number.isFinite(seconds)?seconds:0));
  const yaw=pose.yaw,pitch=pose.pitch,f=Math.max(-1,Math.min(1,input.forward??0)),r=Math.max(-1,Math.min(1,input.right??0));
  let x=-Math.sin(yaw)*Math.cos(pitch)*f+Math.cos(yaw)*r;
  let y=Math.sin(pitch)*f+Number(Boolean(input.jump))-Number(Boolean(input.crouch));
  let z=-Math.cos(yaw)*Math.cos(pitch)*f-Math.sin(yaw)*r;
  const amount=(input.sprint?24:8)*dt/Math.max(1,Math.hypot(x,y,z));
  return {...pose,position:{x:pose.position.x+x*amount,y:pose.position.y+y*amount,z:pose.position.z+z*amount}};
}
export function inspectionViews(width,height,split,focus='actor') {
  const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height));
  if(!split)return [{kind:focus,x:0,y:0,width:w,height:h,controlled:true}];
  const wide=w>=h*1.25;
  const cut=Math.floor((wide?w:h)/2);
  return [
    {kind:'actor',x:0,y:0,width:wide?cut:w,height:wide?h:cut,controlled:focus==='actor'},
    {kind:'fly',x:wide?cut:0,y:wide?0:cut,width:wide?w-cut:w,height:wide?h:h-cut,controlled:focus==='fly'},
  ];
}
