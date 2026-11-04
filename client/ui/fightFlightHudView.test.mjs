import test from 'node:test';import assert from 'node:assert/strict';
import {fightFlightHudView} from './fightFlightHudView.mjs';
test('Mounted HUD describes actual charge, rotor, posture and rebinds; hidden for unmounted',()=>{
 const player={id:'p',alive:true,health:100,guardStamina:85,operatingFightFlightId:'flight-3'},m={id:'flight-3',mode:'AIRBORNE',grounded:false,health:250,maxHealth:250,y:6.375,flightCharge:31.4,maxFlightCharge:100,rotorHP:68,rotorEnergy:72};
 const controls={bindings:{jump:['KeyJ'],crouch:['KeyK'],interact:['KeyL'],siegeView:['KeyM']}};
 let v=fightFlightHudView(player,{fightFlight:m},3,controls);
 assert.equal(v.pressure,31.4);assert.match(v.status,/ALT 6.4 m/);assert.match(v.status,/ROTOR 68/);
 assert.match(v.controls,/J ASCEND/);assert.match(v.controls,/K DESCEND/);assert.match(v.controls,/L EJECT/);
 assert.equal(v.hull, 250);assert.equal(v.maxHull, 250);
 assert.equal(v.playerHealth, 100);assert.equal(v.playerGuard, 85);
 assert.equal(v.charge, 32);assert.equal(v.rotor, 68);
 assert.equal(fightFlightHudView({...player,operatingFightFlightId:null},{fightFlight:m},3,controls),null);
 assert.equal(fightFlightHudView({...player,alive:false},{fightFlight:m},3,controls),null);
});

test('Flight HUD labels selected indefinite Skills and shows actionable lock feedback',()=>{
 const p={id:'pilot',alive:true,operatingFightFlightId:'f',siegeLoadout:{fightFlight:'narrowToOne'}};
 const m={id:'f',grounded:false,mode:'AIRBORNE',health:250,rotorHP:90,
   flightCharge:50,skill:{id:'narrowToOne',phase:'active',activeUntil:null,
     readyAt:24,trackingState:'noClearShot',targetId:'foe',noClearShot:true}};
 const v=fightFlightHudView(p,{fightFlight:m},5);
 assert.equal(v.skillName,'Narrow to One');assert.equal(v.skillIcon,'narrowToOne');
 assert.equal(v.skillActive,true);assert.match(v.warning,/NO CLEAR SHOT/);
 assert.equal(v.targetId,'foe');
 m.skill={id:'doNotStopMyAscension',phase:'active',activeUntil:null,readyAt:24};
 const a=fightFlightHudView({...p,siegeLoadout:{fightFlight:'doNotStopMyAscension'}},{fightFlight:m},5);
 assert.equal(a.skillText,'CHARGE DASH');assert.equal(a.skillActive,true);
 assert.equal(a.skillIcon,'doNotStopMyAscension');
});
