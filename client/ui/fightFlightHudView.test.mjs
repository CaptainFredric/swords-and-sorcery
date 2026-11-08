import test from 'node:test';import assert from 'node:assert/strict';
import {fightFlightHudView} from './fightFlightHudView.mjs';
import {readFileSync} from 'node:fs';
test('Mounted HUD describes actual charge, rotor, posture and rebinds; hidden for unmounted',()=>{
 const player={id:'p',alive:true,health:100,guardStamina:85,operatingFightFlightId:'flight-3'},m={id:'flight-3',mode:'AIRBORNE',grounded:false,health:250,maxHealth:250,y:6.375,flightCharge:31.4,maxFlightCharge:100,rotorHP:68,rotorEnergy:72};
 const controls={bindings:{jump:['KeyJ'],crouch:['KeyK'],interact:['KeyL'],siegeView:['KeyM']}};
 let v=fightFlightHudView(player,{fightFlight:m},3,controls);
 assert.equal(v.pressure,31.4);assert.match(v.status,/ALT 6.4 m/);assert.match(v.status,/ROTOR 68/);
 assert.match(v.controls,/J ASCEND/);assert.match(v.controls,/K DESCEND/);assert.match(v.controls,/L EJECT/);
 assert.match(v.controls,/E FLIGHT DASH/);assert.match(v.controls,/R ULTIMATE/);
 const rebound=fightFlightHudView(player,{fightFlight:m},3,{bindings:{dash:['KeyP'],ultimate:['KeyO']}});
 assert.match(rebound.controls,/P FLIGHT DASH/);assert.match(rebound.controls,/O ULTIMATE/);
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

test('Mounted Flight preserves the desktop E ability tile while other siege machines conceal it',()=>{
 const css=readFileSync(new URL('../../client/styles.css',import.meta.url),'utf8');
 const hud=readFileSync(new URL('./HUD.mjs',import.meta.url),'utf8');
 const armory=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 assert.match(css,/\.ballista-mounted:not\(\.flight-mounted\) \.abilities \{ display: none; \}/);
 assert.doesNotMatch(css,/\.ballista-mounted \.abilities \{ display: none; \}/);
 assert.match(hud,/inFlight\?'FLIGHT DASH':'DASH'/);
 assert.match(hud,/iconSvg\(dashFace\)/);
 const siegeStart = armory.search(/\$\(['"]#armory-siege-machines['"]\)\.innerHTML\s*=/);
 const siegeEnd = armory.indexOf('if(siegeFocus)') !== -1 ? armory.indexOf('if(siegeFocus)') : armory.indexOf("$('#siege-ctrl-desktop')");
 const siege = siegeStart !== -1 && siegeEnd !== -1 ? armory.slice(siegeStart, siegeEnd) : '';
 assert.ok(siege.length>0);
 assert.doesNotMatch(siege,/iconSvg\(skill\.icon\)/,
   'Siege Skill cards retain their names and descriptions without oversized icons');
 assert.match(siege,/data-siege-skill/);
});

test('Narrow HUD calls out mechanical traverse and target loss instead of blaming the camera FOV',()=>{
 const p={id:'pilot',alive:true,operatingFightFlightId:'f',siegeLoadout:{fightFlight:'narrowToOne'}};
 const m={id:'f',grounded:false,health:250,rotorHP:90,flightCharge:80,
   skill:{id:'narrowToOne',phase:'active',targetId:'enemy',trackingState:'outOfTraverse'}};
 const out=fightFlightHudView(p,{fightFlight:m},1);
 assert.equal(out.skillText,'OUT OF ARC');
 assert.match(out.warning,/CROSSBOW ARC/);
 m.skill.lockedOnce=true;
 assert.match(fightFlightHudView(p,{fightFlight:m},1).warning,/TURN MACHINE/);
 m.skill.trackingState='sightLost';
 assert.match(fightFlightHudView(p,{fightFlight:m},1).warning,/FIRE PAUSED/);
 m.skill.trackingState='locked';
 assert.equal(fightFlightHudView(p,{fightFlight:m},1).skillText,'TARGET LOCKED');
});

test('Narrow HUD separates marked preview from hard target lock',()=>{
 const p={id:'pilot',alive:true,operatingFightFlightId:'f',
   siegeLoadout:{fightFlight:'narrowToOne'}};
 const m={id:'f',grounded:false,mode:'AIRBORNE',health:250,rotorHP:75,
   flightCharge:70,skill:{id:'narrowToOne',phase:'active',targetId:'enemy',
     lockedOnce:false,trackingState:'preview'}};
 let view=fightFlightHudView(p,{fightFlight:m},10);
 assert.equal(view.skillText,'TARGET MARKED · FIRE TO LOCK');
 assert.match(view.warning,/FIRE TO LOCK/);
 assert.equal(view.targetLocked,false);
 m.skill.lockedOnce=true;m.skill.trackingState='locked';
 view=fightFlightHudView(p,{fightFlight:m},10);
 assert.equal(view.skillText,'TARGET LOCKED');
 assert.equal(view.targetLocked,true);
 m.skill.targetId=null;m.skill.lockedOnce=false;m.skill.trackingState='acquiring';
 view=fightFlightHudView(p,{fightFlight:m},10);
 assert.match(view.warning,/LOOK AT AN ENEMY/);
});
test('Broken rotor does not leave a permanent DESCENDING warning over the game',()=>{
 const p={id:'pilot',alive:true,operatingFightFlightId:'f'};
 const m={id:'f',grounded:false,mode:'FALLING',rotorHP:0,rotorRPM:0,
   health:200,flightCharge:0};
 let v=fightFlightHudView(p,{fightFlight:m},8);
 assert.match(v.title,/ROTOR LOST/);
 assert.equal(v.warning,'','no endless rotor-loss banner or DESCENDING text');
 assert.doesNotMatch(v.status,/DESCENDING/);
 m.grounded=false;m.mode='LANDING';
 v=fightFlightHudView(p,{fightFlight:m},9);
 assert.match(v.title,/ROTOR LOST/);
 assert.doesNotMatch(v.title,/DESCENDING/,'rotor-loss must override ordinary landing descent');
 m.grounded=true;m.mode='GROUNDED';
 v=fightFlightHudView(p,{fightFlight:m},15);
 assert.equal(v.warning,'','rotor remains lost, but landing cannot keep a DESCENDING alert');
 assert.match(v.title,/ROTOR LOST/);
});
