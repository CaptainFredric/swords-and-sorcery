// Pure presentation timing for the smoky halo left by Flight to the Valkyrie.
// Never drive gameplay or infer damage from an animation. The normal ground
// fire lasts exactly until its authoritative burn-zone expiresAt.
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));

export function valkyrieHaloExpiry(startedAt,fireDuration,burnExpiresAt){
  // null explicitly means no GROUND fire (e.g. an abyss detonation). Let its
  // brief impact smoke disperse rather than misrepresent a lingering hazard.
  if(burnExpiresAt===null)return startedAt+1.8;
  if(Number.isFinite(burnExpiresAt))return Math.max(startedAt+.1,burnExpiresAt);
  // Compatibility with older servers that did not send groundBurnExpiresAt.
  return startedAt+clamp(Number(fireDuration)||7,1,30);
}

export function valkyrieSmokeHaloState(now,startedAt,expiresAt,radius=8,power=.5){
  if(!Number.isFinite(now)||!Number.isFinite(startedAt)||
     !Number.isFinite(expiresAt)||now>=expiresAt)return null;
  const lifetime=Math.max(.1,expiresAt-startedAt);
  const age=Math.max(0,now-startedAt);
  const progress=clamp(age/lifetime);
  const size=clamp(Number.isFinite(radius)?radius:8,2,13);
  const strength=clamp(Number.isFinite(power)?power:.5);
  // A broad, climbing smoke wreath: its radial spread is distinct from
  // the FIXED, damaging ground-fire radius. This aerial ring is purely VFX.
  const ringRadius=size*(.22+1.10*progress**.72);
  const elevation=.45+size*.76*progress**.94+1.55*progress;
  const fade=clamp((1-progress)/.27)**1.5;
  const form=clamp(age/.38);
  const smokeOpacity=(.19+.14*strength)*form*fade;
  return {
    age,progress,ringRadius,elevation,smokeOpacity,
    rimOpacity:(.11+.09*strength)*form*fade,
    puffScale:size*(.105+.088*progress),
  };
}
