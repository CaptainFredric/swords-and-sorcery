import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {flightMuzzle,flightDirection,solveConvergence,FLIGHT_REPEATER} from './flightRepeaterAim.mjs';
const base=new URL('../../client/assets/props/fight-and-flight/',import.meta.url);
const apparatus=fileURLToPath(new URL('fight-and-flight-v2.7.glb',base));
const quarrel=fileURLToPath(new URL('fight-and-flight-v2.7-quarrel.glb',base));
const rollback=fileURLToPath(new URL('fight-and-flight-v2.6.glb',base));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function glb(path){
  const b=readFileSync(path);
  assert.equal(b.toString('ascii',0,4),'glTF');
  assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
  const n=b.readUInt32LE(12);assert.equal(b.toString('ascii',16,20),'JSON');
  return JSON.parse(b.subarray(20,20+n).toString('utf8'));
}
const authored=glb(apparatus),nodes=authored.nodes;
const parentOf=i=>nodes.findIndex(n=>n.children?.includes(i));
const close=(a,b,eps=2e-5)=>assert.ok(Math.abs(a-b)<eps,String(a)+' != '+String(b));
const closeVec=(a,b)=>a.forEach((v,i)=>close(v,b[i]));
const qa=(axis,a)=>[...axis.map(v=>v*Math.sin(a/2)),Math.cos(a/2)];
const qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
function rotate(q,v){
  const t=[2*(q[1]*v[2]-q[2]*v[1]),2*(q[2]*v[0]-q[0]*v[2]),2*(q[0]*v[1]-q[1]*v[0])];
  return [v[0]+q[3]*t[0]+q[1]*t[2]-q[2]*t[1],
    v[1]+q[3]*t[1]+q[2]*t[0]-q[0]*t[2],
    v[2]+q[3]*t[2]+q[0]*t[1]-q[1]*t[0]];
}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function authoredMuzzle(m,yaw,pitch){
  let q=qm(qa([0,1,0],m.heading+Math.PI),qa([1,0,0],m.runPitch));
  let p=[m.x,m.y,m.z];
  const chain=[];for(let i=38;i>=0;i=parentOf(i)){chain.unshift(i);if(i===0)break;}
  assert.deepEqual(chain,[0,1,50,51,12,38]);
  for(const i of chain){
    const n=nodes[i];p=add(p,rotate(q,n.translation??[0,0,0]));
    let r=n.rotation??[0,0,0,1];
    if(i===50)r=qm(r,qa([0,1,0],yaw-m.heading));
    if(i===51)r=qm(r,qa([1,0,0],-pitch));
    q=qm(q,r);
  }
  return {p,forward:rotate(q,[0,0,1])};
}
test('hash, hierarchy, animation manifest, independent quarrel and rollback',()=>{
  assert.equal(sha(apparatus),'5358f2629a84563df4b2b64063f4ad31b844ac37ec3c37989c18586959125944');
  assert.equal(sha(quarrel),'f0fb5f44c1ee1348e7b7bb7e27a907879b289d6287a6eb674db1db0c41955091');
  assert.equal(sha(rollback),'122c53cb55134e400c1c4958b580c51bec311777deeed8ede67716efff1cd928');
  assert.equal(nodes.length,61);assert.equal(authored.meshes.length,38);
  assert.equal(authored.materials.length,1);assert.equal(authored.animations.length,18);
  assert.deepEqual([50,51,12,38].map(parentOf),[1,50,51,12]);
  assert.deepEqual([50,51,12,38].map(i=>nodes[i].name),
    ['Crossbow_Yaw_Gimbal','Crossbow_Pitch_Cradle','Crossbow_Body','crossbow_muzzle']);
  for(const name of ['Sword_Strike_And_Recovery','Posture_11_Aerial_Ejection','Rotor_Brake_To_Stop'])
    assert.ok(authored.animations.some(a=>a.name===name),name);
  const q=glb(quarrel);
  assert.equal(q.nodes[1].name,'quarrel_tip');
  assert.equal(q.meshes[0].primitives.reduce((n,p)=>n+q.accessors[p.indices].count/3,0),84);
});
test('server muzzle and forward axis match the exported GLB across articulation and chassis tilt',()=>{
  const D=Math.PI/180;
  for(const root of [0,16.5*D,-20*D])for(const heading of [0,1.2,-2.1]){
    for(const [wy,wp] of [[0,0],[50,0],[-50,0],[0,65],[0,-65],[50,65],[50,-65],[-50,65],[-50,-65]]){
      const m={x:15.12,y:8.45,z:-3.78,heading,runPitch:root};
      const yaw=heading+wy*D,pitch=wp*D,glb=authoredMuzzle(m,yaw,pitch);
      const muzzle=flightMuzzle(m,{yaw,pitch}),dir=flightDirection(m,{yaw,pitch});
      closeVec([muzzle.x,muzzle.y,muzzle.z],glb.p);
      closeVec([dir.x,dir.y,dir.z],glb.forward);
      close(Math.hypot(dir.x,dir.y,dir.z),1);
    }
  }
});
test('true physical convergence and unchanged software traverse stops',()=>{
  const m={x:0,y:2,z:0,heading:0,runPitch:.1};
  for(const range of [3,8,20,50]){
    const u=flightDirection(m,{yaw:0,pitch:0}),q=flightMuzzle(m,{yaw:0,pitch:0});
    const target={x:q.x+u.x*range,y:q.y+u.y*range,z:q.z+u.z*range};
    const aim=solveConvergence(m,target),p=flightMuzzle(m,aim),v=flightDirection(m,aim);
    const d=[target.x-p.x,target.y-p.y,target.z-p.z];
    const miss=Math.hypot(d[1]*v.z-d[2]*v.y,d[2]*v.x-d[0]*v.z,d[0]*v.y-d[1]*v.x);
    assert.ok(miss<.03,'convergence at '+range+' metres missed by '+miss);
  }
  close(FLIGHT_REPEATER.maxTraverse,50*Math.PI/180);
  close(FLIGHT_REPEATER.maxPitch,65*Math.PI/180);
});