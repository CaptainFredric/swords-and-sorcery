// Authored first person Chivalry paths in view space: an angled brace and three compact forward beats.
// The existing solver retains the physical grip. Only presentation changes; contact clocks belong to combat.
import { createSwordPath, COMBO_CONTACTS, COMBO_CYCLE } from './fpSlash.mjs';
import { SWORD_CHAIN } from '../../shared/src/combat.mjs';

const BRACE = { wrist: [.27, -.29, -.55], blade: [-.62, .55, -.56], edge: [.78, .57, -.30] };
const brace = t => ({ t, ...BRACE, ease: 0 });
const beat = (t, wrist, blade, edge, shoulder, body, look) => ({ t, wrist, blade, edge, shoulder, body, look });
const [one, two, three] = COMBO_CONTACTS;
const path = createSwordPath([
  brace(0),
  beat(one-.20, [.32,-.26,-.54], [-.45,.61,-.65], [.85,.45,-.16], [.008,.012,.006], [.004,.002,.004], [.15,.25,.2]),
  beat(one, [.23,-.28,-.71], [-.58,.16,-.80], [.81,.10,-.57], [-.045,.01,-.105], [-.008,0,-.014], [-.3,-.45,-.5]),
  beat(one+.09, [.17,-.31,-.65], [-.63,.20,-.75], [.77,.12,-.63], [-.045,.01,-.085], [-.008,-.002,-.008], [-.2,-.3,-.3]),
  brace(SWORD_CHAIN.starts[1]),
  beat(two-.18, [.23,-.27,-.55], [-.40,.65,-.65], [.82,.53,.03], [-.02,.015,-.015], [-.004,.002,.003], [.1,-.15,-.15]),
  beat(two, [.28,-.24,-.71], [.45,.32,-.83], [.83,.17,.52], [.025,.035,-.12], [.008,.003,-.014], [-.2,.45,.5]),
  beat(two+.09, [.33,-.24,-.64], [.46,.40,-.80], [.83,.13,.53], [.01,.025,-.075], [.006,.002,-.008], [-.1,.25,.3]),
  brace(SWORD_CHAIN.starts[2]),
  beat(three-.18, [.30,-.24,-.56], [-.32,.70,-.63], [.89,.42,.02], [.01,.03,-.02], [0,.004,.002], [.25,.1,0]),
  beat(three, [.24,-.30,-.76], [-.07,.12,-.99], [.995,.04,-.065], [-.02,.025,-.15], [0,-.004,-.02], [-.45,0,0]),
  beat(three+.08, [.26,-.32,-.70], [-.13,.25,-.96], [.99,.03,-.126], [-.01,.015,-.11], [0,-.003,-.01], [-.25,0,0]),
  brace(COMBO_CYCLE-.04),
  brace(COMBO_CYCLE),
]);

export const guardedBracePose = () => path.sample(0);
export const guardedComboPose = time => path.sample(time);
export const guardedRecoveryPose = (from, elapsed) => path.recover(from, elapsed);
