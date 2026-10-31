// Pure geometry planner shared by browser presentation and Node regression
// tests. Neither DOM nor Three.js is required to verify deck topology.
const unique = a => [...new Set(a.map(v=>Number(v.toFixed(5))))].sort((a,b)=>a-b);
const within = (f,x,z) => x >= f.center[0]-f.size[0]/2-1e-6
  && x<=f.center[0]+f.size[0]/2+1e-6
  && z>=f.center[2]-f.size[2]/2-1e-6
  && z<=f.center[2]+f.size[2]/2+1e-6;
function quad(out,a,b,c,d){
  out.push(...a,...b,...c,...b,...d,...c);
}
function emit(map,key,a,b,c,d) {
  let dest=map.get(key);
  if(!dest) { dest=[];map.set(key,dest); }
  quad(dest,a,b,c,d);
}
/** The result contains grouped XYZ triangle arrays by material.
 * Surface faces never occupy the same plane/footprint twice, even when the
 * authoritative floor rectangles intentionally overlap for wheel support. */
export function partitionHighGroundsDecks(world) {
  const top=new Map(),fascia=new Map();
  for(const y of unique(world.floors.map(f=>f.y))) {
    const level=world.floors.filter(f=>Math.abs(f.y-y)<1e-5);
    const xs=unique(level.flatMap(f=>[f.center[0]-f.size[0]/2,f.center[0]+f.size[0]/2]));
    const zs=unique(level.flatMap(f=>[f.center[2]-f.size[2]/2,f.center[2]+f.size[2]/2]));
    const lookup=xs.slice(0,-1).map((x,i)=>zs.slice(0,-1).map((z,j)=>{
      const mx=(xs[i]+xs[i+1])/2,mz=(zs[j]+zs[j+1])/2;
      return level.filter(f=>within(f,mx,mz))
        .sort((a,b)=>Number(b.material==='stone')-Number(a.material==='stone'))[0]??null;
    }));
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++) {
      const chosen=lookup[i][j];if(!chosen)continue;
      const [x0,x1,z0,z1]=[xs[i],xs[i+1],zs[j],zs[j+1]];
      const type=chosen.material==='stone'?'stone':'timber';
      emit(top,type,[x0,y,z0],[x0,y,z1],[x1,y,z0],[x1,y,z1]);
      const dep=y===0?1.6:1;
      const edges=[
        [i-1,j,[x0,y,z0],[x0,y,z1]],
        [i+1,j,[x1,y,z1],[x1,y,z0]],
        [i,j-1,[x1,y,z0],[x0,y,z0]],
        [i,j+1,[x0,y,z1],[x1,y,z1]],
      ];
      for(const [nx,nz,a,d]of edges)if(!lookup[nx]?.[nz]) {
        emit(fascia,type,a,d,[a[0],y-dep,a[2]],[d[0],y-dep,d[2]]);
      }
    }
  }
  return {top,fascia};
}
