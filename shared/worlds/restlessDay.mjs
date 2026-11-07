// Restless Day: real, collision-matched outer/inner curtains and defender-held ramparts.
// The walls cannot be bypassed around the field; mobile siege ladders supply the frontal ascent.
import { TEAMS } from '../src/teams.mjs';
const floor=(id,x,z,w,d,y=0,material='stone')=>({id,center:[x,y-.18,z],size:[w,.36,d],y,material});
const solid=(id,x,y,z,w,h,d,material='stone')=>({id,center:[x,y,z],size:[w,h,d],material});
const ramp=(id,minX,maxX,minZ,maxZ,startY,endY)=>({id,axis:'z',minX,maxX,minZ,maxZ,startY,endY});
const spawn=(x,z,team,phase=0)=>({x,y:0,z,team,phase,yaw:team===TEAMS.ATTACKERS?Math.PI:0});
const walls=Object.freeze([
  {id:'outer',z:-24,height:6,landingZ:-16,approachZ:-31},
  {id:'inner',z:22,height:7,landingZ:32,approachZ:14},
]);
const floors=[
  floor('field',0,-65,56,82),floor('outer-yard',0,-1,56,46),
  floor('inner-yard',0,46,56,52),floor('final-court',0,72,56,22),
  floor('outer-rampart',0,-24,48,3.6,6),
  floor('inner-rampart',0,22,46,4.2,7),
  floor('renowner-dais',0,56,10,10,.75),
];
const ramps=[
  ramp('outer-west-defender',-22,-17,-22.5,-8,6,0),
  ramp('outer-east-defender',17,22,-22.5,-8,6,0),
  ramp('inner-east-defender',17,22,23.9,39,7,0),
  ramp('renowner-dais-approach',-4.4,4.4,50.2,52.0,0,.75),
];
const solids=[
  solid('boundary-west',-28.2,3,-9,1.6,6,180),
  solid('boundary-east',28.2,3,-9,1.6,6,180),
  solid('boundary-rear',0,3,82,57,6,1.4),
  // Structural curtain stones: complete collision from ground to battlement.
  solid('outer-curtain-west',-13.5,3,-24,21,6,2.2),
  solid('outer-curtain-east',13.5,3,-24,21,6,2.2),
  solid('outer-gate',0,3,-24,6,6,2.2,'timber'),
  solid('inner-curtain-west',-13.5,3.5,22,21,7,2.5),
  solid('inner-curtain-east',13.5,3.5,22,21,7,2.5),
  solid('inner-gate',0,3.5,22,6,7,2.5,'timber'),
  ...[-23,-11,11,23].map((x,i)=>solid('outer-merlon-'+i,x,6.58,-25.37,1.5,1.16,.7)),
  ...[-22,-9,9,22].map((x,i)=>solid('inner-merlon-'+i,x,7.68,20.33,1.8,1.36,.76)),
  // Two tactically different approaches: exposed field, then tight barricaded court.
  solid('outer-breastwork-left',-14,.8,-37,5,1.6,1.1,'timber'),
  solid('outer-breastwork-right',15,.8,-38,4,1.6,1.1,'timber'),
  solid('inner-sally-cover-left',-15,1.1,10,4,2.2,1.5,'timber'),
  solid('inner-sally-cover-right',13,.8,7,5,1.6,1.5,'timber'),
  solid('final-court-column-left',-15,2.1,48,2.2,4.2,2.2),
  solid('final-court-column-right',15,2.1,48,2.2,4.2,2.2),
  solid('renowner-podium',0,.7,56,5.6,1.4,5.6,'brass'),
  // The upper effigy is the actual destructible hit volume, not the fixed podium.
  solid('renowner-body',0,4,56,3.1,5.1,2.8,'iron'),
];
const spawnPoints=[
  ...[-16,-8,0,8,16].map(x=>spawn(x,-90,TEAMS.ATTACKERS,0)),
  ...[-15,-7,0,7,15].map(x=>spawn(x,-5,TEAMS.ATTACKERS,1)),
  ...[-15,-7,0,7,15].map(x=>spawn(x,35,TEAMS.ATTACKERS,2)),
  ...[-15,0,15].map(x=>({...spawn(x,-24,TEAMS.DEFENDERS,0),y:6})),
  ...[-7,7].map(x=>({...spawn(x,22.8,TEAMS.DEFENDERS,0),y:7})),
];
// Navigational nodes reflect *supported* surfaces; no ground-level node is
// allowed inside a curtain wall. Static components are intentionally isolated
// until an attacker deploys a ladder or destroys a gate. Dynamic links are
// generated from the authoritative geometry in withRestlessLadders().
const nodes=[];
const node=(x,y,z,id)=>nodes.push({id:id??'rd-'+x+'-'+y+'-'+z,x,y,z});
for(const z of [-90,-76,-62,-48,-35,-29])
  for(const x of [-19,-9,0,9,19])node(x,0,z);
for(const z of [-16,-3,10,15])
  for(const x of z===-16?[-12,-6,0,6,12]:[-19,-9,0,9,19])node(x,0,z);
for(const z of [39,46,55,65])
  for(const x of [-19,-9,0,9,19]){
    // A real solid brass podium occupies the central 5.6 m at z=55.
    if(z===55&&x===0)continue;
    node(x,0,z);
  }
node(0,0,50.2);node(0,.375,51.1);node(0,.75,52);
for(const x of [-19,-9,0,9,19])node(x,6,-23.4,'rd-outer-walk-'+x);
for(const x of [-19,-9,0,9,19])node(x,7,22.8,'rd-inner-walk-'+x);
for(const x of [-19,19]){ // two rear approaches to the outer battlement
  node(x,0,-8.3);node(x,3,-15.25);node(x,6,-22.5);
}
node(19,0,38.8);node(19,3.5,31.4);node(19,7,23.9);
export const RESTLESS_DAY_WORLD=Object.freeze({
  id:'restless-day',name:'Restless Day',floors,ramps,solids,spawnPoints,walls,
  structures:Object.freeze([
    {id:'outer-gate',name:'Outer gate',profile:'reinforcedTimber',team:TEAMS.DEFENDERS,solidIds:['outer-gate']},
    {id:'inner-gate',name:'Inner gate',profile:'reinforcedTimber',team:TEAMS.DEFENDERS,solidIds:['inner-gate']},
    {id:'rightful-renowner',name:'The Rightful Renowner',
      profile:'renowner',team:TEAMS.DEFENDERS,solidIds:['renowner-body']},
  ]),
  // Existing machine instances, not a mode-specific mechanical imitation.
  ballistaEmplacement:Object.freeze({id:'restless-ballista',x:15,y:0,z:-77,
    baseYaw:Math.PI,team:TEAMS.ATTACKERS,interactRadius:3.2}),
  siegeEmplacements:Object.freeze([
    {id:'restless-ram',type:'so-fist-ication',team:TEAMS.ATTACKERS,phases:[0,1,2],
      x:-4,y:0,z:-76,heading:Math.PI},
  ]),
  navigation:Object.freeze({nodes}),
  bounds:Object.freeze({minX:-28,maxX:28,minZ:-105,maxZ:82}),abyssY:-28,
  restlessDay:Object.freeze({renowner:{x:0,y:1.4,z:56},ladders:[
    {id:'ladder-a',x:-10,z:-68},{id:'ladder-b',x:10,z:-68}],
  }),
});
