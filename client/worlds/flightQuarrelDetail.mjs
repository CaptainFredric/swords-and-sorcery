// Small physically modelled details for the authored v2.7 Fight-and-Flight quarrels.
// A shared wood-grain texel atlas and low-poly iron/feather geometry keep all
// visible hopper bolts and flying quarrels consistent without replacing the GLB.
import * as THREE from 'three';
import {QUARREL_LENGTH,boltWoodPixels,featherMeshData} from './flightQuarrelData.mjs';

const LENGTH=QUARREL_LENGTH;
const AXIS=new THREE.Vector3(0,0,1);
const corners=[
  [0,0,0],[0,0,1],[0,1,0],[0,1,1],[1,0,0],[1,0,1],[1,1,0],[1,1,1]
];

export function boltWoodGrain(){
  const {width:w,height:h,pixels:data}=boltWoodPixels();
  const map=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=THREE.RepeatWrapping;
  map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;
  map.needsUpdate=true;
  return map;
}
export function createQuarrelDetail(){
  const group=new THREE.Group();group.name='Quarrel_Fletching_And_Iron_Detail';
  const grain=boltWoodGrain();
  const wood=new THREE.MeshStandardMaterial({map:grain,roughness:.88,metalness:0});
  const iron=new THREE.MeshStandardMaterial({color:0x9a9f9b,metalness:.72,roughness:.36,flatShading:true});
  const collar=new THREE.MeshStandardMaterial({color:0x59473b,metalness:.44,roughness:.64});
  const feather=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.94,metalness:0});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.022,.024,.61,7,1),wood);
  shaft.name='Grained_Oak_Shaft';shaft.rotation.x=Math.PI/2;shaft.position.z=-.035;
  const point=new THREE.Mesh(new THREE.ConeGeometry(.041,.14,5,1),iron);
  point.name='Five_Facet_Iron_Arrowhead';point.rotation.x=Math.PI/2;point.position.z=.352;
  const socket=new THREE.Mesh(new THREE.CylinderGeometry(.032,.027,.055,7),collar);
  socket.name='Iron_Tip_Socket';socket.rotation.x=Math.PI/2;socket.position.z=.275;
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.024,7),collar);
  band.name='Fletching_Binding';band.rotation.x=Math.PI/2;band.position.z=-.29;

  // Three small vanes, each subdivided into light/dark barbs: true double-sided
  // polygons with a readable silhouette, not a transparent feather sticker.
  const {positions:verts,colors,indices}=featherMeshData();
  const vaneGeometry=new THREE.BufferGeometry();
  vaneGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  vaneGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  vaneGeometry.setIndex(indices);
  vaneGeometry.computeVertexNormals();
  const vanes=new THREE.Mesh(vaneGeometry,feather);
  vanes.name='Three_Ribbed_Fletchings';
  group.add(shaft,point,socket,band,vanes);
  group.userData.quarrelDetail={length:LENGTH,vanes:3,hasGrain:true};
  return group;
}

/** Estimate a stock-bolt node's *original* visible geometry in its own space.
 * Measuring before adding accents avoids a self-expanding box or scale drift. */
export function boltNodeBounds(node){
  node.updateWorldMatrix(true,true);
  const inverse=node.matrixWorld.clone().invert();
  const bounds=new THREE.Box3();
  node.traverse(child=>{
    if(!child.isMesh||!child.geometry)return;
    const geometry=child.geometry;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const local=geometry.boundingBox;
    if(!local||local.isEmpty())return;
    const transform=inverse.clone().multiply(child.matrixWorld);
    for(const [x,y,z] of corners){
      const p=new THREE.Vector3(x?local.max.x:local.min.x,y?local.max.y:local.min.y,z?local.max.z:local.min.z);
      bounds.expandByPoint(p.applyMatrix4(transform));
    }
  });
  return bounds;
}

export function ornamentQuarrelSlot(slot,prototype,index=0){
  if(!slot||slot.userData.quarrelAccentsAdded)return null;
  const original=boltNodeBounds(slot);
  const detail=prototype.clone(true);
  if(!original.isEmpty()){
    const center=original.getCenter(new THREE.Vector3());
    const size=original.getSize(new THREE.Vector3());
    const major=Math.max(size.x,size.y,size.z);
    const axis=size.z>=size.x&&size.z>=size.y?new THREE.Vector3(0,0,1):
      size.x>=size.y?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    detail.position.copy(center);
    detail.quaternion.setFromUnitVectors(AXIS,axis);
    detail.scale.setScalar(THREE.MathUtils.clamp(major/LENGTH,.35,1.35));
  }
  // A few degrees of fixed feather clocking keep the six individual shafts
  // visibly handmade without changing their length or their collision shape.
  const vane=detail.getObjectByName('Three_Ribbed_Fletchings');
  if(vane)vane.rotation.z=(index%6)*Math.PI/9;
  slot.add(detail);
  slot.userData.quarrelAccentsAdded=true;
  return detail;
}
export function disposeQuarrelDetail(prototype){
  if(!prototype)return;
  prototype.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry?.dispose();
    if(o.material){
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
