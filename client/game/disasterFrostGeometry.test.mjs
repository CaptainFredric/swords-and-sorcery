import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crackedFrostPattern,frostPatternHash} from './disasterFrostGeometry.mjs';

const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];
  return sum+p.x*q.z-q.x*p.z;
},0))*.5;

test('Frost ground builds repeatable but nonidentical cracked ice for separate fields',()=>{
  const a=crackedFrostPattern(4.6,'field-a');
  assert.deepEqual(a,crackedFrostPattern(4.6,'field-a'));
  assert.notDeepEqual(a,crackedFrostPattern(4.6,'field-b'));
  assert.equal(a.outline.length,64);
  assert.ok(a.plates.length>=70);
  assert.notEqual(frostPatternHash('field-a'),frostPatternHash('field-b'));
});
test('The frozen crust covers the field without spikes or invented collision reach',()=>{
  for(const r of [1.5,3.4,4.6,7.6]){
    const pattern=crackedFrostPattern(r,'sample',92);
    const covered=pattern.plates.reduce((sum,p)=>sum+area(p.vertices),0);
    const disk=Math.PI*r*r;
    assert.ok(covered/disk>.55,'ice must cover a substantial area rather than just isolated cones');
    assert.ok(covered/disk<1.01,'ice cannot grow outside the field');
    assert.ok(pattern.plates.every(p=>p.vertices.length>=3));
    assert.ok(pattern.plates.flatMap(p=>p.vertices).every(v=>
      Number.isFinite(v.x)&&Number.isFinite(v.z)&&Math.hypot(v.x,v.z)<=r*1.005));
    assert.ok(pattern.plates.every(p=>p.tint>=0&&p.tint<5));
  }
});
test('Degenerate radius and bounded density never create invalid polygons',()=>{
  assert.deepEqual(crackedFrostPattern(0),{outline:[],plates:[]});
  assert.deepEqual(crackedFrostPattern(Infinity),{outline:[],plates:[]});
  assert.ok(crackedFrostPattern(3,'low',1).plates.length>=10);
  assert.ok(crackedFrostPattern(3,'high',1000).plates.length<=110);
});
test('Disaster visuals keep the ice floor locked, fade the field and preserve original combat',()=>{
  const source=readFileSync(new URL('./DisasterElementEffects.mjs',import.meta.url),'utf8');
  const combat=readFileSync(new URL('../../shared/sim/combat.mjs',import.meta.url),'utf8');
  assert.match(source,/crackedFrostPattern\(field\.radius,field\.id,/);
  assert.match(source,/ice\.position\.set\(field\.position\.x,field\.position\.y,field\.position\.z\)/);
  assert.match(source,/name='frost-fractured-ice-plates'/);
  assert.match(source,/name='frost-dark-crack-underlay'/);
  assert.match(source,/name='frost-crack-edges'/);
  assert.match(source,/geometry\.setDrawRange\(0,visible\?data\.ends\[visible-1\]:0\)/);
  assert.match(source,/this\.#disposeIce\(entry\.ice\)/);
  assert.match(source,/this\.#fireExplosion\(p,reach,tall,ground,tiers\.fire===2\)/);
  assert.match(source,/if \(!full \|\| !ground \|\| !event\.fieldId\) this\.#iceCrown/);
  assert.match(combat,/until:nowSec\+fieldSeconds\(tiers\)/);
  assert.match(combat,/if\(tiers\.frost>=1\).*?ONE_HIT_FROST_LINGER_SEC/);
});
