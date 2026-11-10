import test from 'node:test';
import assert from 'node:assert/strict';
import { beginSwordTechnique, stepSwordTechnique, techniqueInterception } from '../../shared/sim/swordTechnique.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';

const point=(x,y,z)=>({x,y,z});
const pose={position:point(0,0,0),yaw:0,eye:point(0,1.55,0)};
const floor={id:'arena',center:[0,-.1,0],size:[10,.2,10],y:0};
const world={solids:[],floors:[floor]};
const body=(id,x,z)=>({id,base:point(x,0,z),top:1.8});
const fighter=overrides=>({alive:true,grounded:true,dashReadyAt:0,prowess:0,...overrides});
const harness=(bodies=[],scene=world,held=false)=>({
  transformAt:()=>pose,bodiesAt:()=>bodies,world:scene,held,
});
const sample=(time,base,tip)=>({time,base,tip});

// Synthetic blade paths exercise the authority math. They are deliberately
// separate from production assets and cannot be equipped through the Armory.
const riposte={
  kind:'riposte',cooldown:10,braceFrom:.1,braceUntil:.24,activeFrom:.30,activeUntil:.44,recovery:.35,
  track:[
    sample(.1,point(-.5,1.2,-.55),point(.66,1.2,-.55)),
    sample(.24,point(-.5,1.2,-.55),point(.66,1.2,-.55)),
    sample(.30,point(0,1.2,-.10),point(0,1.2,-1.23)),
    sample(.44,point(0,1.2,-.72),point(0,1.2,-1.85)),
  ],
};
const whirl={
  kind:'whirl',cooldown:10,activeFrom:.1,activeUntil:.7,recovery:.2,maxRevolutions:2,extraRevolutionCost:25,
  track:Array.from({length:33},(_,i)=>{
    const angle=i*Math.PI/16;
    const end=radius=>point(Math.sin(angle)*radius,1.15,-Math.cos(angle)*radius);
    return sample(.1+.6*i/32,end(.45),end(1.6));
  }),
};

test('Riposte intercepts one actual crossing during brace and thrusts only along its blade track',()=>{
  const player=fighter();
  assert.equal(beginSwordTechnique(player,null,0),null);
  const action=beginSwordTechnique(player,riposte,0);
  const through={base:point(0,1.2,-1.8),tip:point(0,1.2,-.2)};
  const over={base:point(0,1.55,-1.8),tip:point(0,1.55,-.2)};
  assert.equal(techniqueInterception(action,through,pose,world,.05),null);
  assert.deepEqual(stepSwordTechnique(player,.18,harness()),[]);
  assert.equal(action.phase,'brace');
  assert.equal(techniqueInterception(action,over,pose,world,.18),null);
  const wall={id:'wall',center:[0,1,-1.4],size:[3,2,.1]};
  assert.equal(techniqueInterception(action,through,pose,{...world,solids:[wall]},.18),null);
  assert.ok(techniqueInterception(action,through,pose,world,.18));
  assert.equal(techniqueInterception(action,through,pose,world,.19),null);
  const contacts=stepSwordTechnique(player,.45,harness([body('forward',0,-1.91),body('side',1,-.7),body('far',0,-3)]));
  assert.deepEqual(contacts.map(hit=>hit.id),['forward']);
  assert.equal(action.phase,'recovery');
  stepSwordTechnique(player,.8,harness());
  assert.equal(player.swordTechnique,null);
  assert.equal(beginSwordTechnique(player,riposte,9.99),null);
});

test('airborne Riposte spends the existing Dash clock and a Stagger break ends its action',()=>{
  const player=fighter({grounded:false,dashReadyAt:3});
  assert.equal(beginSwordTechnique(player,riposte,2.99),null);
  assert.equal(beginSwordTechnique(player,whirl,3),null);
  assert.ok(beginSwordTechnique(player,riposte,3));
  assert.equal(player.dashReadyAt,3+MOVEMENT.dashCooldown);
  assert.equal(player.dashUntil,undefined);
  player.staggerUntil=5;
  assert.deepEqual(stepSwordTechnique(player,3.4,harness([body('target',0,-1.8)])),[]);
  assert.equal(player.swordTechnique,null);
});

test('Whirl samples all quadrants across a long tick and spends Prowess on one bounded extra revolution',()=>{
  const player=fighter({prowess:75});
  const action=beginSwordTechnique(player,whirl,0);
  const fixtures=[body('front',0,-1.65),body('right',1.65,0),body('back',0,1.65),body('left',-1.65,0)];
  const contacts=stepSwordTechnique(player,.71,harness(fixtures,world,true));
  assert.deepEqual(contacts.map(hit=>hit.id),fixtures.map(v=>v.id));
  assert.equal(action.revolutions,2);
  assert.equal(player.prowess,50);
  assert.deepEqual(stepSwordTechnique(player,1.31,harness(fixtures,world,true)),[]);
  assert.equal(action.phase,'recovery');
  assert.equal(player.prowess,50);
  stepSwordTechnique(player,1.51,harness());
  assert.equal(player.swordTechnique,null);
});

test('Whirl meets the scene first and cannot damage a fighter behind a wall',()=>{
  const player=fighter();
  beginSwordTechnique(player,whirl,0);
  const wall={id:'stone',center:[0,1,-.95],size:[3,2,.12]};
  const contacts=stepSwordTechnique(player,.8,harness([body('covered',0,-1.66)],{...world,solids:[wall]}));
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].kind,'solid');
  assert.equal(contacts[0].solid,wall);
  assert.equal(player.swordTechnique,null,'wall recoil finishes the commitment');
});
