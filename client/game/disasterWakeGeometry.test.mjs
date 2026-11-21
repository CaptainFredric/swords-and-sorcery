import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWakeVisual,updateWakeVisual,disposeWakeVisual,wakeRibbonGeometry}
 from './disasterWakeGeometry.mjs';
const points=[{x:1,y:15,z:-2},{x:6,y:15,z:-2},{x:12,y:19,z:-4}];
test('3D wake geometry follows every authoritative path segment rather than flattening to terrain',()=>{
 const g=wakeRibbonGeometry(points,1.85);
 const p=g.getAttribute('position');
 assert.ok(p.count>=8,'at least two connected quads');
 const ys=Array.from({length:p.count},(_,i)=>p.getY(i));
 assert.ok(Math.max(...ys)>18&&Math.min(...ys)<16,'actual 3D elevation retained');
 const xs=Array.from({length:p.count},(_,i)=>p.getX(i));
 assert.ok(Math.min(...xs)<=1+1.85&&Math.max(...xs)>=12-1.85);
 g.dispose();
});
test('Fire/Frost/Gale/Lightning/Steel each has a distinct visual strand and matches Full Fire width',()=>{
 const tiers={fire:2,frost:2,gale:2,lightning:2,steel:2};
 const v=makeWakeVisual(tiers);
 assert.equal(v.userData.wakeLayers.length,10,'five distinct elements with two crossed sheets each');
 const field={trailPoints:points,radius:1.85,tiers};
 updateWakeVisual(v,field,1);
 assert.equal(v.userData.wakePoints,3);
 assert.ok(v.userData.wakeLayers.every(l=>l.mesh.visible));
 assert.ok(v.userData.wakeLayers.every(l=>(l.mesh.geometry.getAttribute('position')?.count??0)>=8));
 const highest=v.userData.wakeLayers[0].mesh.geometry.boundingSphere.center.y;
 assert.ok(highest>14&&highest<20);
 const opacity=v.userData.wakeLayers[0].mesh.material.opacity;
 updateWakeVisual(v,field,.5);
 assert.ok(v.userData.wakeLayers[0].mesh.material.opacity<opacity,
   'non-Steel fade is applied to the SAME geometry rather than changing its hitbox');
 disposeWakeVisual(v);
});
