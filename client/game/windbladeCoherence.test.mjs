import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { swordWave } from './OneHitLiveEffects.mjs';
import { DisasterElementEffects } from './DisasterElementEffects.mjs';

function parts(tiers) {
  const wave=swordWave(tiers);
  const [body]=wave.children;
  const [wake,edge]=body.children;
  return {wave,body,wake,edge};
}
function disposeWave(wave) {
  wave.traverse(node=>{
    node.geometry?.dispose?.();
    if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());
    else node.material?.dispose?.();
  });
}

test('Gale is one connected translucent pressure wake, not stacked duplicate projectile silhouettes',()=>{
  for(const tiers of [{},{gale:1},{gale:2},{gale:2,lightning:2},{gale:2,fire:2,frost:2,steel:2}]){
    const {wave,body,wake,edge}=parts(tiers);
    assert.equal(body.children.length,2,'only one leading cut and one connected wake');
    assert.equal(wake.name,'Windblade continuous pressure wake');
    assert.equal(edge.name,'Windblade leading cut');
    assert.equal(wake.geometry.getAttribute('color').itemSize,4,'wake has per-vertex alpha');
    assert.equal(wake.geometry.getAttribute('position').count,37*8);
    assert.equal(wake.geometry.index.count,36*7*6,'entire wake has joined triangles');
    assert.equal(edge.geometry.getAttribute('color').itemSize,3);
    assert.equal(wake.material.depthWrite,false);
    assert.equal(edge.material.depthWrite,false);
    const pos=wake.geometry.getAttribute('position');
    const col=wake.geometry.getAttribute('color');
    for(let i=0;i<=36;i++){
      const front=i*8,back=front+7;
      assert.ok(pos.getZ(back)<pos.getZ(front)-.9,'each arc segment trails in the same flight direction');
      assert.ok(col.getW(front)>=col.getW(back),'pressure fades continuously backward');
      assert.ok(col.getW(front)>=0&&col.getW(front)<=1,'alpha is valid');
      if(i>0){
        const previous=(i-1)*8;
        assert.ok(Math.hypot(pos.getX(front)-pos.getX(previous),pos.getY(front)-pos.getY(previous))<.2,
          'no gap between adjacent segments of the moving crescent');
      }
    }
    const before=wake.material.opacity;
    wave.userData.breathe(1);
    assert.ok(wake.material.opacity>.8&&wake.material.opacity<=1,'subtle pulsation keeps membrane attached');
    assert.ok(Math.abs(before-wake.material.opacity)<.1);
    disposeWave(wave);
  }
});

test('Full Gale is brighter than an uninfused wave and retains a white-to-lime pressure gradient',()=>{
  const uninfused=parts({});
  const full=parts({gale:2});
  const a=uninfused.wake.geometry.getAttribute('color');
  const b=full.wake.geometry.getAttribute('color');
  assert.ok(b.getW(18*8)>a.getW(18*8)*1.9,
    'Full Gale visibly strengthens the continuous sheet');
  assert.ok(b.getY(18*8+5)>b.getX(18*8+5)*1.2,
    'the wake has a real lime-green hue, not a duplicate white silhouette');
  assert.ok(b.getX(18*8)>b.getX(18*8+5),
    'the leading edge is whiter than the lime wake');
  assert.ok(b.getW(18*8+7)<.001,'wake dissolves smoothly rather than ending in a hard arc');
  disposeWave(uninfused.wave);disposeWave(full.wave);
});

test('Lightning arcs stay parented to the travelling Gale projectile, not abandoned at old world positions',()=>{
  const scene=new THREE.Scene();
  const {wave}=parts({gale:2,lightning:2});
  wave.position.set(3,2,-4);
  scene.add(wave);
  const effects=new DisasterElementEffects(scene);
  effects.clock=1;
  effects.waveBody({
    id:'coherent-gale',tiers:{gale:2,lightning:2},
    direction:{x:0,y:0,z:1},
  },wave,.05);
  assert.ok(effects.bolts.length>=2,'lightning forks and a trailing filament are emitted');
  assert.ok(effects.bolts.every(entry=>entry.mesh.parent===wave),
    'every wave bolt is attached to the moving head');
  const bolt=effects.bolts[0].mesh;
  wave.updateWorldMatrix(true,true);
  const local=new THREE.Vector3().fromBufferAttribute(bolt.geometry.getAttribute('position'),0);
  const before=bolt.localToWorld(local.clone());
  wave.position.x+=4;
  wave.position.y+=1;
  wave.updateWorldMatrix(true,true);
  const after=bolt.localToWorld(local.clone());
  assert.ok(Math.abs(after.x-before.x-4)<1e-6);
  assert.ok(Math.abs(after.y-before.y-1)<1e-6);
  effects.dispose();
  disposeWave(wave);
});
