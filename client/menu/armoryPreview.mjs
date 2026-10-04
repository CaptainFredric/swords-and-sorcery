// Menu performances on the real rig. Root space: right +x, up +y, forward -z.
export const ARMORY_PREVIEW_SEC = 1.5;
const arm = (wrist, aim, roll = [1, 0, 0]) => ({ wrist, aim, roll });
const pose = (spell = null, sword = null, body = 0, crouch = 0, fist = 0) => ({ spell, sword, body, crouch, fist });
const rest = () => pose();
// Each gesture's beats land on its cue's (tools/audio/armory_cues.py): the flame blooming as the palm comes up, the
// ice cracking as the arm snaps out, the whoosh as the arm sweeps, the two plate contacts as the fist clenches and
// the body sets, Sunder's blow as the sword comes down (0.42 s), the Vortex's two passes of the blade, Chivalry's
// blade drawn and then its Guard set.
export const ARMORY_GESTURES = Object.freeze({
  fireball: [
    [0, rest()], [.12, pose(arm([-.36,1.2,-.34],[0,1,-.2]),null,-.05)], [.3, pose(arm([-.5,1.38,-.52],[0,.95,-.3]),null,-.08)],
    [.6, pose(arm([-.53,1.4,-.5],[0,1,0]),null,-.06)], [1.0, pose(arm([-.45,1.3,-.4],[0,1,-.1]),null,-.03)], [1.5, rest()],
  ],
  frostfire: [
    [0,rest()], [.09,pose(arm([-.55,1.35,-.24],[-.6,.35,-.6]),null,.18)],
    [.15,pose(arm([-.68,1.38,-.63],[0,.05,-1],[0,1,0]),null,.12)], [.55,pose(arm([-.64,1.42,-.58],[-.3,.5,-.8]),null,.08)],
    [1.0,pose(arm([-.55,1.3,-.45],[-.2,.6,-.7]),null,.04)], [1.5,rest()],
  ],
  gale: [
    [0,rest()], [.18,pose(arm([-.26,1.3,-.18],[0,1,-.2]),null,-.24,.04)],
    [.36,pose(arm([-.76,1.25,-.48],[-.6,.25,-.6]),null,.3,.06)], [.7,pose(arm([-.68,1.2,-.28],[0,.8,-.3]),null,.1)], [1.5,rest()],
  ],
  steel: [
    [0,rest()], [.06,pose(arm([-.15,1.28,-.32],[.4,.2,-.8]),null,.08,.08,1)], [.12,pose(arm([-.17,1.3,-.32],[.4,.2,-.8]),null,.12,.13,1)],
    [.7,pose(arm([-.17,1.32,-.32],[.4,.2,-.8]),null,.12,.12,1)], [1.1,pose(arm([-.23,1.15,-.25],[0,.5,-.8]),null,.04,.04,.5)], [1.5,rest()],
  ],
  sunder: [
    [0,rest()], [.2,pose(arm([-.27,1.05,-.08],[0,1,0]),arm([.32,1.84,-.13],[.05,1,-.1]),-.12,.22,.7)],
    [.33,pose(null,arm([.25,1.98,-.2],[0,1,-.25]),-.16,.12,.7)],
    [.43,pose(null,arm([.4,.95,-.55],[.1,-.75,-.6]),.12,.28,.7)], [.75,pose(null,arm([.42,1,-.48],[.1,-.65,-.7]),.08,.1,.4)], [1.5,rest()],
  ],
  vortex: [
    [0,rest()], [.12,pose(arm([-.44,1.05,-.08],[0,1,0]),arm([.48,1.3,-.18],[.8,.25,-.45]),-.35,.08)],
    [.27,pose(arm([-.52,1.2,-.24],[0,.8,-.3]),arm([.1,1.43,-.56],[-.9,.2,-.25],[0,1,0]),.48,.1)],
    [.46,pose(null,arm([.45,1.25,-.4],[.75,-.2,-.6]),.12,.04)], [.8,pose(null,arm([.42,1.15,-.35],[.5,-.4,-.6]),.04,.02)], [1.5,rest()],
  ],
  chivalry: [
    [0,rest()], [.28,pose(null,arm([.38,1.5,-.32],[.15,.9,-.35]),-.06)],
    [.42,pose(arm([-.22,1.42,-.42],[.35,.55,-.75]),arm([.36,1.55,-.36],[.1,.92,-.3]),.05,.06,.6)],
    [.95,pose(arm([-.22,1.44,-.42],[.35,.55,-.75]),arm([.36,1.56,-.36],[.1,.92,-.3]),.05,.06,.6)], [1.5,rest()],
  ],
});
const mix = (a,b,t) => a+(b-a)*t;
const vec = (a,b,t) => a.map((v,i)=>mix(v,b[i],t));
const smooth = (t) => t*t*(3-2*t);
function blendArm(a,b,t) {
  if (!a && !b) return null;
  return { weight:a && b ? 1 : a ? 1-t : t, target:{wrist:vec((a??b).wrist,(b??a).wrist,t),aim:vec((a??b).aim,(b??a).aim,t),roll:vec((a??b).roll,(b??a).roll,t)} };
}
export function mixArmoryPose(a,b,t) {
  const channel = (x,y) => {
    if (!x && !y) return null;
    const xx=x??{...y,weight:0}, yy=y??{...x,weight:0};
    return {weight:mix(xx.weight,yy.weight,t),target:{wrist:vec(xx.target.wrist,yy.target.wrist,t),aim:vec(xx.target.aim,yy.target.aim,t),roll:vec(xx.target.roll,yy.target.roll,t)}};
  };
  return {spell:channel(a.spell,b.spell),sword:channel(a.sword,b.sword),body:mix(a.body,b.body,t),crouch:mix(a.crouch,b.crouch,t),fist:mix(a.fist,b.fist,t)};
}
export function armoryPose(id,elapsed) {
  const keys=ARMORY_GESTURES[id];
  if (!keys) return { ...rest(), strength:0 };
  const age=Math.max(0,Math.min(ARMORY_PREVIEW_SEC,elapsed));
  const k=keys.findIndex(([at])=>at>=age);
  const [aTime,a]=keys[Math.max(0,k-1)], [bTime,b]=keys[Math.max(0,k)];
  const t=smooth(bTime===aTime?0:(age-aTime)/(bTime-aTime));
  return {spell:blendArm(a.spell,b.spell,t),sword:blendArm(a.sword,b.sword,t),body:mix(a.body,b.body,t),crouch:mix(a.crouch,b.crouch,t),fist:mix(a.fist,b.fist,t),strength:Math.sin(Math.PI*age/ARMORY_PREVIEW_SEC)};
}
