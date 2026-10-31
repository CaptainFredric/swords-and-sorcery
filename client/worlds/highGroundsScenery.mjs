import * as THREE from 'three';

// Presentation-only terrain. Authoritative floors and ramps still come from
// shared/worlds/highGrounds.mjs; nothing scenic changes combat collision.
const within = (f, x, z) => x >= f.center[0]-f.size[0]/2-1e-6
  && x <= f.center[0]+f.size[0]/2+1e-6
  && z >= f.center[2]-f.size[2]/2-1e-6
  && z <= f.center[2]+f.size[2]/2+1e-6;
const pushQuad = (a,b,c,d,vertices) => {
  for(const p of [a,b,c,b,d,c])vertices.push(...p);
};
function flatMesh(group, vertices, material, name) {
  if(!vertices.length)return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  const obj=new THREE.Mesh(geometry,material);
  obj.name=name;obj.receiveShadow=true;group.add(obj);return obj;
}
const unique = v => [...new Set(v.map(x => Number(x.toFixed(4))))].sort((a,b)=>a-b);

/**
 * Exactly one visible deck per square, per elevation. The first iteration
 * drew every overlapping floor box (camp + road + capture deck) at the same
 * depth, causing the entrance strobing / z-fighting.
 * We partition by all exact rectangle edges rather than introduce 1cm
 * offsets or depend on polygonOffset: the geometry truly has no duplicates.
 */
export function buildHighGroundsDecks(group, world, materials) {
  const tops=new Map(),walls=new Map(), floors=world.floors;
  const elevations=unique(floors.map(f=>f.y));
  for(const y of elevations) {
    const level=floors.filter(f=>Math.abs(f.y-y)<1e-5);
    const xs=unique(level.flatMap(f=>[f.center[0]-f.size[0]/2,f.center[0]+f.size[0]/2]));
    const zs=unique(level.flatMap(f=>[f.center[2]-f.size[2]/2,f.center[2]+f.size[2]/2]));
    const lookup=[];
    for(let i=0;i<xs.length-1;i++) {
      const row=[];
      for(let j=0;j<zs.length-1;j++) {
        const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
        const candidates=level.filter(f=>within(f,x,z));
        // Capture plazas are stone; unadorned roads timber. A deterministic
        // preference means no flickering between surfaces when camera moves.
        row.push(candidates.sort((a,b)=>
          (b.material==='stone'?1:0)-(a.material==='stone'?1:0))[0]??null);
      }
      lookup.push(row);
    }
    const add=(map,key,quad)=>{
      const a=map.get(key)??[];
      pushQuad(...quad,a);map.set(key,a);
    };
    const edge=(a,b,key)=> {
      const depth=y===0?1.6:1.0;
      add(walls,key,[[...a],[...b],[a[0],y-depth,a[2]],[b[0],y-depth,b[2]]]);
    };
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
      const chosen=lookup[i][j];if(!chosen)continue;
      const x0=xs[i],x1=xs[i+1],z0=zs[j],z1=zs[j+1];
      const key=(chosen.material==='stone'?'stone':'timber');
      // Thin actual surface, not overlapping boxes or the 0.44m interiors.
      add(tops,key,[[x0,y,z0],[x0,y,z1],[x1,y,z0],[x1,y,z1]]);
      const neighbors=[
        [i-1,j,[x0,y,z0],[x0,y,z1]],
        [i+1,j,[x1,y,z1],[x1,y,z0]],
        [i,j-1,[x1,y,z0],[x0,y,z0]],
        [i,j+1,[x0,y,z1],[x1,y,z1]],
      ];
      for(const [ni,nj,a,b] of neighbors)
        if(!lookup[ni]?.[nj])edge(a,b,key);
    }
  }
  for(const [key,vertices] of tops) flatMesh(group,vertices,materials[key],`joined-${key}-walkable-decks`);
  for(const [key,vertices] of walls) flatMesh(group,vertices,materials[key==='stone'?'cliff':'underwood'],
    `perimeter-${key}-fascia`);
}
const rand = i => {
  const a=Math.sin(i*127.1+78.233)*43758.5453;
  return a-Math.floor(a);
};
function terrainHeight(x,z) {
  const radial=Math.hypot(x*.9,z*.7);
  // Low valley directly below the map, then connected outer hills and
  // encircling wooded mountains. There is no infinite, untextured plane.
  return -74+10*Math.sin(x*.014)*Math.cos(z*.011)
    +9*Math.sin(x*.031+z*.009)
    +Math.min(82,Math.max(0,radial-95)*.22)
    +23*Math.pow(Math.max(0,Math.sin(x*.013+z*.017)),4);
}
function valleySurface(group, materials) {
  const verts=[];
  const n=44, half=540, step=half*2/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++) {
    const x0=-half+i*step,x1=x0+step,z0=-half+j*step,z1=z0+step;
    pushQuad([x0,terrainHeight(x0,z0),z0],
      [x0,terrainHeight(x0,z1),z1],
      [x1,terrainHeight(x1,z0),z0],
      [x1,terrainHeight(x1,z1),z1],verts);
  }
  flatMesh(group,verts,materials.valley,'far-valley-landscape-below-abyss');
}
const sceneryMaterial=(color)=>new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide});
function scenicMesh(group,geometry,material,position,name) {
  const m=new THREE.Mesh(geometry,material);
  m.position.set(...position);m.name=name;m.receiveShadow=true;group.add(m);return m;
}
function createScenicTree(group, mats, x, y, z, scale, seed) {
  const trunk=scenicMesh(group,new THREE.CylinderGeometry(.6*scale,1.12*scale,8.5*scale,5),
    mats.bark,[x,y+4.2*scale,z],'distant-trunk');
  const crown=scenicMesh(group,new THREE.IcosahedronGeometry(4.25*scale,0),
    seed%3===0?mats.bloom:seed%3===1?mats.farGreen:mats.farOlive,
    [x,y+9.5*scale,z],'distant-canopy');
  return [trunk,crown];
}
function addCliffFooting(group,materials,x,z,w,d,top,bottom,seed) {
  const v=[];
  const lower=bottom+(seed%3)*2;
  const topHalfX=w/2,topHalfZ=d/2;
  const baseX=w*.67,baseZ=d*.67;
  const topPoints=[[x-topHalfX,top,z-topHalfZ],[x+topHalfX,top,z-topHalfZ],
    [x+topHalfX,top,z+topHalfZ],[x-topHalfX,top,z+topHalfZ]];
  const basePoints=[[x-baseX,lower,z-baseZ],[x+baseX,lower,z-baseZ],
    [x+baseX,lower,z+baseZ],[x-baseX,lower,z+baseZ]];
  for(let i=0;i<4;i++)pushQuad(topPoints[i],topPoints[(i+1)%4],basePoints[i],basePoints[(i+1)%4],v);
  flatMesh(group,v,materials.cliff,'supported-island-rock-'+seed);
}
/** No added collision. The ravine remains dangerous, but it exists *inside*
 * an expansive forested landscape instead of a black-bottomless void. */
export function buildHighGroundsSurroundings(group, world, materials) {
  valleySurface(group,materials);
  const centers=[[-1,-100,45,33],[1,100,45,33],[0,0,28,24],
    [0,-52,24,22],[0,52,24,22],[-38,-7,25,25],[38,7,25,25]];
  centers.forEach(([x,z,w,d],i)=>addCliffFooting(group,materials,x,z,w,d,
    i>4?11.6:-1.35,-55,i));
  // Distant mountain silhouettes and terraces, rather than the featureless
  // dark void formerly seen immediately beyond the entrances.
  for(let i=0;i<13;i++){
    const angle=i*2*Math.PI/13;
    const x=Math.cos(angle)* (305+(i%3)*35),z=Math.sin(angle)*(355+(i%4)*27);
    const y=terrainHeight(x,z);
    scenicMesh(group,new THREE.ConeGeometry(40+(i%3)*18,90+(i%4)*23,5),
      i%3===0?materials.cliff:materials.distantRidge,[x,y+35,z],'distant-highland-'+i);
  }
  for(let i=0;i<82;i++){
    const a=rand(i+1)*Math.PI*2,r=140+rand(i+47)*285;
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    const y=terrainHeight(x,z);
    createScenicTree(group,materials,x,y,z,1.2+rand(i+92)*1.3,i);
  }
  // Far camp approach: permanent roadbed / ramparts visually continue toward
  // the rest of each kingdom. They are beyond game bounds, not false floors.
  for(const side of [-1,1]) {
    const z=side*142;
    addCliffFooting(group,materials,0,z,47,55,-2,-46,side+10);
    for(const dx of [-29,29]){
      scenicMesh(group,new THREE.CylinderGeometry(2.5,3.2,18,6),
        materials.cliff,[dx,4,z],'distant-approach-watchtower');
      scenicMesh(group,new THREE.ConeGeometry(3.8,5,6),
        side<0?materials.farAzure:materials.farCrimson,[dx,15.4,z],
        'watchtower-roof');
    }
  }
}
// Small but readable battlefield architecture: heraldic entrance posts,
// modest watch shelters, brass lanterns and bridge beamwork. Details avoid
// the spawn road and never masquerade as solid cover.
export function buildHighGroundsDetail(group, world, mats) {
  const beam = (name,pos,size,mat) => {
    const m=scenicMesh(group,new THREE.BoxGeometry(...size),mat,pos,name);
    return m;
  };
  for(const [side,team] of [[-1,'ATTACKERS'],[1,'DEFENDERS']]){
    const z=side*91;
    for(const wing of [-1,1]){
      const x=wing*19.5;
      beam('garrison-iron-reinforcement',[x,4.68,z],[2.2,.28,2.2],mats.metalTrim);
      const flag=scenicMesh(group,new THREE.BoxGeometry(2.8,2.5,.12),
        team==='ATTACKERS'?mats.farAzure:mats.farCrimson,
        [x+wing*1.25,5.2,z+side*1.15],'garrison-standard');
      flag.rotation.z=wing*.12;
      scenicMesh(group,new THREE.IcosahedronGeometry(.28,0),mats.lamp,
        [x,4.96,z],'entry-lantern');
    }
    // Towers are beyond the interior camp; they give it a defensible
    // silhouette and tie the playable entrance to the wider landscape.
    for(const x of [-32,32]){
      const zOuter=side*123;
      scenicMesh(group,new THREE.CylinderGeometry(2.8,3.4,12,6),
        mats.cliff,[x,-1,zOuter],'far-camp-watchbase');
      scenicMesh(group,new THREE.ConeGeometry(3.9,4.3,6),
        team==='ATTACKERS'?mats.farAzure:mats.farCrimson,
        [x,7.2,zOuter],'far-camp-watchroof');
    }
  }
  for(const z of [-57,0,57]){
    // Rails have authoritative collision definitions in highGrounds.mjs.
    // Decorative caps do not project into the walkable deck.
    for(const side of [-1,1])
      for(let x=-33;x<=33;x+=11)
        scenicMesh(group,new THREE.CylinderGeometry(.16,.18,.42,6),mats.metalTrim,
          [x,13.37,z+side*3.62],'bridge-rail-brass-finial');
    for(const x of [-28,0,28]) {
      beam('suspended-bridge-crossbrace',[x,10.3,z],[.22,.27,6.4],mats.underwood);
    }
  }
  for(const [i,site] of world.objectives.entries()){
    // Stone plinths and brass rivets announce capture destinations, staying
    // outside the actual standing circle and not blocking the melee ring.
    for(let k=0;k<6;k++){
      const a=Math.PI*2*k/6;
      const x=site.x+Math.cos(a)*(site.radius+1.7),
        z=site.z+Math.sin(a)*(site.radius+1.7);
      scenicMesh(group,new THREE.CylinderGeometry(.25,.36,.46,6),
        i%2?mats.metalTrim:mats.cliff,[x,site.y+.23,z],
        'capture-plinth-'+site.id);
    }
  }
}

export function highGroundsSceneryMaterials() {
  return {
    cliff:sceneryMaterial(0x706f61),underwood:sceneryMaterial(0x4f3b2d),
    valley:sceneryMaterial(0x677b59),
    distantRidge:sceneryMaterial(0x7b8477),
    bark:sceneryMaterial(0x604932),
    metalTrim:sceneryMaterial(0xb69c67),lamp:sceneryMaterial(0xf5df95),
    bloom:sceneryMaterial(0xe9b99e),
    farGreen:sceneryMaterial(0x748f6e),
    farOlive:sceneryMaterial(0x8c9570),
    farAzure:sceneryMaterial(0x4f759e),farCrimson:sceneryMaterial(0x9c625b),
  };
}
