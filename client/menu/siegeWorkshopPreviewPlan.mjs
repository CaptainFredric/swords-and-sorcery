// Workshop-only choreography. This is an exhibition, not a combat simulator:
// no HP, ammo, cooldown, score, or authoritative gameplay state is modified.
export const SIEGE_PREVIEW_LENGTH = Object.freeze({
  longArmToTheJaw: Infinity,
  beatToThePunch: 5.4,
  coldHowTouching: 3.8,
  boltToTheOccasion: 5.0,
  doNotStopMyAscension: Infinity,
  narrowToOne: 6.2,
  fireAwayRightHere: 8.2,
});
export const SIEGE_PREVIEW_MACHINE = Object.freeze({
  longArmToTheJaw: 'soFist', beatToThePunch: 'soFist',
  coldHowTouching: 'biBye', boltToTheOccasion: 'biBye',
  doNotStopMyAscension: 'fightFlight', narrowToOne: 'fightFlight',
  fireAwayRightHere: 'fightFlight',
});
const cap = x => Math.max(0, Math.min(1, x));
export const smooth = x => { const u=cap(x); return u*u*(3-2*u); };
export const between = (t,a,b) => smooth((t-a)/(b-a));
const lerp = (a,b,u) => a+(b-a)*u;

// In local workshop metres, forward on the ballista / flying chassis is -Z.
// The ram faces the other way at rest. Time and distances are menu staging only.
export function workshopPreviewPose(skill, time) {
  const t=Math.max(0, Number(time)||0);
  let x=0,y=0,z=0,pitch=0,roll=0,yawOffset=0, fist=0,shudder=0;
  if (skill==='longArmToTheJaw') {
    fist=between(t,.14,.57);
  } else if (skill==='beatToThePunch') {
    shudder=t<1.15?Math.pow(1-between(t,.9,1.2),.4)*.075:0;
    z=-2.5*between(t,.9,2.05)+2.5*between(t,3.35,5.2);
    fist=between(t,2.13,2.55)*(1-between(t,3.05,3.55));
    if(t>2.1&&t<3.4)z+=.48*between(t,2.1,2.45);
  } else if (skill==='boltToTheOccasion') {
    z=.95*between(t,.12,.95)*(1-between(t,3.9,4.8));
  } else if (skill==='doNotStopMyAscension') {
    // Dash, complete the loop, then dive into the waiting formation.
    // At impact the machine is consumed; no automatic reset while open.
    const launch=between(t,.35,1.45);
    const dive=between(t,3.15,5.55);
    const impact=between(t,5.55,5.78);
    z=-4.7*launch-3.8*dive;
    y=3.5*between(t,.8,2.1)*(1-between(t,3.1,5.55));
    pitch=2*Math.PI*between(t,1.55,2.8)+.34*Math.sin(Math.PI*dive);
    if(t>=5.78){x=0;y=0;z=0;pitch=0;}
    
  } else if (skill==='narrowToOne') {
    const u=between(t,.28,4.75);
    const a=u*Math.PI*2;
    x=2.7*Math.sin(a)*(1-between(t,4.65,5.8));
    z=-2.8+2.8*Math.cos(a);
    z*=1-between(t,4.65,5.8);
    y=2.2*between(t,.14,.75)*(1-between(t,4.8,5.95));
    yawOffset=-a;
  } else if (skill==='fireAwayRightHere') {
    // The demonstration first ascends dramatically and then settles to the
    // workshop floor BEFORE the sustained borrowed-ammo crossbow exhibition.
    y=5.1*between(t,.22,1.25)*(1-between(t,1.55,2.4));
    z=-.6*between(t,.75,1.3)*(1-between(t,1.55,2.4));
  }
  return {x,y,z,pitch,roll,yawOffset,fist,shudder};
}

// A projectile starts only at the authored cue and is visible only while in
// flight. Explicit cue arrays make reversal (heavy bolt before upper bolt),
// near-miss frost detonations, and all three sustained repeater targets testable.
export function workshopPreviewShots(skill) {
  if(skill==='coldHowTouching')return [
    {at:.75,flight:.65,kind:'frost',target:0,nearMiss:true}
  ];
  if(skill==='boltToTheOccasion')return [
    {at:1.27,flight:.65,kind:'heavy',target:0},
    {at:2.62,flight:.65,kind:'frost',target:1}
  ];
  if(skill==='narrowToOne')
    return Array.from({length:18},(_,i)=>({
      at:1.05+i*.195,flight:.28,kind:'repeater',target:0,
      lowShot: i%3!==0,
    }));
  if(skill==='fireAwayRightHere')
    return Array.from({length:27},(_,i)=>({
      at:2.65+i*.145,flight:.33,kind:'repeater',target:i%3,
    }));
  return [];
}
export function workshopPreviewTargets(skill) {
  if(skill==='beatToThePunch')return [[.15,0,1.65]];
  if(skill==='coldHowTouching')return [[1.2,0,-4.05]];
  if(skill==='boltToTheOccasion')return [[.15,0,-4.7],[-1.8,0,-4.5]];
  if(skill==='doNotStopMyAscension')return [[-1.1,0,-8.25],[0,0,-8.5],[1.1,0,-8.25]];
  if(skill==='narrowToOne')return [[0,0,-2.8]];
  if(skill==='fireAwayRightHere')return [[-2.35,0,-4.35],[0,0,-5.3],[2.35,0,-4.35]];
  return [];
}
export function workshopPreviewTargetPose(skill,t,index) {
  if(skill==='beatToThePunch') {
    const flight=between(t,2.65,3.3),back=between(t,3.35,4.95);
    return {x:.15,y:.95*Math.sin(Math.PI*flight)*(1-back),z:1.65+1.85*flight*(1-back),
      fall:between(t,3.02,3.42)*(1-back),guard:false};
  }
  const defeated=skill==='doNotStopMyAscension'?5.55:
     skill==='narrowToOne'?4.68:
    skill==='fireAwayRightHere'?[6.4,6.55,6.7][index]:
    skill==='boltToTheOccasion'?[2.03,3.35][index]:2;
  const fall=between(t,defeated,defeated+.38);
  return {x:0,y:0,z:0,fall,
    guard:skill==='narrowToOne'&&t>=.65&&t<4.68};
}
export function workshopPreviewDone(skill,t) {
  return t>=SIEGE_PREVIEW_LENGTH[skill];
}
