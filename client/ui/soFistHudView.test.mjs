import test from 'node:test';import assert from 'node:assert/strict';
import{soFistHudView}from'./soFistHudView.mjs';import{createSoFistication}from'../../shared/sim/soFistication.mjs';
test('ram prompt belongs to its actual rear operator station and uses rebound controls',()=>{
 const b=createSoFistication(),local={id:'p',alive:true,position:{x:0,y:0,z:3}},snapshot={soFistication:b};
 assert.match(soFistHudView(local,snapshot,0,{bindings:{interact:['KeyK']}}).status,/K/);
 assert.equal(soFistHudView({...local,position:{x:0,y:0,z:-3}},snapshot,0),null);
 assert.equal(soFistHudView({...local,operatingBallistaId:'other'},snapshot,0),null);
 const op={...local,operatingRamId:b.id};b.operatorId='p';b.pressure=37;b.components.Fist.health=0;
 const view=soFistHudView(op,snapshot,0,{bindings:{sprint:['KeyH'],attack:['KeyJ'],siegeView:['KeyL'],siegeWeapon:['KeyX'],jump:['Space'],interact:['KeyK']}});assert.equal(view.pressure,37);assert.match(view.status,/EXPOSED PISTON/);assert.match(view.controls,/H.*J.*L.*K/);assert.match(soFistHudView(op,snapshot,0,{touch:true}).controls,/stick forward.*CHARGE/);
 assert.match(view.controls,/lift.*lower/);
 assert.match(view.controls,/RMB Flick/);assert.match(view.controls,/\[SPACE\] \+ .*lift\/lower/);
 b.health=0;assert.equal(soFistHudView(op,snapshot,0),null);
});

test('ram HUD shows unboardable recovery and physically obstructed elevation',()=>{
 const b=createSoFistication(),local={id:'p',alive:true,position:{x:0,y:0,z:3}};
 b.detachedFist={state:'recovering'};b.fistRecoveryUntil=30;
 assert.match(soFistHudView(local,{soFistication:b},5).status,/BOARDING LOCKED/);
 b.detachedFist=null;b.operatorId='p';b.ramLiftBlockedAt=6;
 assert.match(soFistHudView({...local,operatingRamId:b.id},{soFistication:b},6.1).status,/LIFT OBSTRUCTED/);
});
