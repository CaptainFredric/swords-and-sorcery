const clamp=v=>Math.max(0,Math.min(1,v));
export function biByeOperatorReach(b,now){
 if(b.trackingSince!=null)return clamp((now-b.trackingSince)/.35);
 if(b.coupling==='ENGAGING')return clamp((now-b.couplingStartedAt)/.35);
 if(b.coupling==='COUPLED'||b.coupling==='FIRING')return 1;
 if(b.coupling==='RELEASING')return 1-clamp((now-b.couplingStartedAt-.3)/.3);
 return 0;
}

// Bow-limb clearance is a deliberate operator posture, not a player crouch or
// an extra collision immunity. The rider folds down while the wide limbs sweep
// past him, including every sustained revolution, and unfolds at recovery.
const smooth=t=>{const x=clamp(t);return x*x*(3-2*x);};
export function biByeOperatorDuck(b,now){
 const s=b?.sweep;
 if(!Number.isFinite(now))return 0;
 if(!s)return Number.isFinite(b?.lastSweepEndAt)
  ? 1-smooth((now-b.lastSweepEndAt)/.38) : 0;
 if(s.phase==='single'){
  const age=Math.max(0,now-s.startedAt);
  return smooth(age/.26)*(1-smooth((age-1.10)/.55));
 }
 if(s.phase==='opening')return smooth(Math.max(0,now-s.startedAt)/.26);
 if(s.phase==='loop')return 1;
 // An arbitrary stopping angle can take longer than .38s to settle.
 // Stay beneath the blades until the bow actually stops; then stand.
 if(s.phase==='settle')return 1;
 return 0;
}
