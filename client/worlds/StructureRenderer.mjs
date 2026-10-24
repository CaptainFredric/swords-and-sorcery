import * as THREE from 'three';

// Bounded authored destruction: planks and straps settle as a few large pieces.
// These meshes never contribute collision; the shared structural world owns it.
export class StructureRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'Destructible defenses';
    this.entries = [];
    this.materials = {
      timber: new THREE.MeshStandardMaterial({color:0x68472c,roughness:.94}),
      grain: new THREE.MeshStandardMaterial({color:0x30251c,roughness:1}),
      fresh: new THREE.MeshStandardMaterial({color:0xa67c4f,roughness:.9}),
      iron: new THREE.MeshStandardMaterial({color:0x353b40,metalness:.7,roughness:.65}),
    };
    for(const def of world.structures??[]) for(const id of def.solidIds) {
      const solid=world.solids.find(v=>v.id===id);if(!solid)continue;
      const root=new THREE.Group();root.position.set(...solid.center);this.group.add(root);
      const [width,height,depth]=solid.size,parts=[],cracks=[];
      const add=(size,position,material=this.materials.timber,rotation=0)=>{
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
        mesh.position.set(...position);mesh.rotation.z=rotation;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
        parts.push({mesh,position:mesh.position.clone(),rotation:mesh.rotation.clone()});return mesh;
      };
      const count=Math.max(4,Math.ceil(width/.5)),step=width/count;
      for(let i=0;i<count;i++){
        const x=-width/2+step*(i+.5);
        add([step-.018,height*(i%3===1?.98:1),depth*.8],[x,0,0]);
        const crack=add([.025,height*.56,.018],[x+step*.17,-height*.08,-depth*.405],this.materials.grain,(i%2?1:-1)*.025);
        cracks.push(crack);
      }
      for(const y of [-height*.28,height*.27])for(let j=0;j<3;j++)add([width/3+.01,.15,depth+.06],[(j-1)*width/3,y,0],this.materials.iron);
      add([width*.92,.16,depth*.16],[0,0,depth*.48],this.materials.timber,-Math.atan2(height*.65,width));
      this.entries.push({def,solid,root,parts,cracks});
    }
    scene.add(this.group);
  }
  update(state,now) {
    for(const e of this.entries){
      const health=state?.entities?.[e.def.id],fraction=health?health.health/health.maxHealth:1;
      const failed=fraction<=0,age=failed?Math.max(0,now-(health.destroyedAt??now)):0;
      const t=Math.min(1,age/.65),ease=1-(1-t)**3;
      const [width,height,depth]=e.solid.size;
      for(let i=0;i<e.parts.length;i++){
        const {mesh,position,rotation}=e.parts[i];mesh.position.copy(position);mesh.rotation.copy(rotation);
        if(failed){
          const side=i%2?1:-1;
          mesh.position.x=THREE.MathUtils.lerp(position.x,side*(width*.43+(i%3)*.16),ease);
          mesh.position.y=THREE.MathUtils.lerp(position.y,-height/2+depth*.45+(i%3)*.025,ease);
          mesh.position.z=THREE.MathUtils.lerp(position.z,(i%2?.36:-.36)+(i%3)*.12,ease);
          mesh.rotation.x=ease*(Math.PI/2+(i%3-.8)*.13);
          mesh.rotation.z=rotation.z+ease*side*.36;
        }else if(fraction<.67&&i%3===1){mesh.rotation.z+=(fraction<.34?.035:.018)*(i%2?1:-1);}
      }
      for(const crack of e.cracks)crack.visible=!failed&&fraction<.67;
    }
  }
  dispose(){this.scene.remove(this.group);this.group.traverse(o=>o.geometry?.dispose());for(const m of Object.values(this.materials))m.dispose();}
}
