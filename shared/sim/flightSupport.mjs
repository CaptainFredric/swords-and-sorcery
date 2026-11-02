import {surfaceHeightAt} from '../src/collision.mjs';
// A machine needs support under its feet, rather than tangential cylinder
// overlap with a ledge. No side wall or underside can supply ground contact.
export function flightSupportAt(world,x,z,maxY){
 const probes=[[0,0],[-.24,0],[.24,0],[0,-.24],[0,.24]];
 const heights=probes.map(([dx,dz])=>{
   const px=x+dx,pz=z+dz;
   let best=surfaceHeightAt(px,pz,maxY-.65,world);
   for(const solid of world.solids??[]){
     if(solid.axes||!solid.center||!solid.size)continue;
     const top=solid.center[1]+solid.size[1]/2;
     if(top<=maxY+.00001&&Math.abs(px-solid.center[0])<=solid.size[0]/2&&Math.abs(pz-solid.center[2])<=solid.size[2]/2)
       best=best==null?top:Math.max(best,top);
   }
   return best;
 });
 const center=heights[0];
 if(center==null||heights.filter(y=>y!=null&&Math.abs(y-center)<.36).length<3)return null;
 return center;
}
