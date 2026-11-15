import { MOVEMENT, movePlayer } from '../../shared/src/movement.mjs';
import { SWORD_TECHNIQUE_CONTRACTS, galeWhirlLiftSpeed } from '../../shared/src/swordTechniqueContracts.mjs';

// Rendering and simulation do not necessarily run at the same rate. Advance
// locomotion across the elapsed frame in bounded, near-authoritative-size steps.
// A slow 20-FPS browser should not simulate only 50 ms of a 100 ms interval.
// Never attempt a whole multi-second stall: the authoritative snapshot owns it.
export const PREDICTION_MAX_CATCHUP_SEC = 0.16;
export const PREDICTION_STEP_SEC = 1/30;

// lift: { speed, until } while the owner's Gale-assisted Whirl carries them up (galeWhirlLiftSpeed, the server's rule):
// applied each step exactly as the host applies it before its own movement step, until `until` (server time)
export function advancePredictedMovement(state, input, elapsedSec, serverNow, world, lift = null) {
  if (!state) return state;
  const elapsed = Math.min(PREDICTION_MAX_CATCHUP_SEC,
    Math.max(0,Number.isFinite(elapsedSec)?elapsedSec:0));
  if (elapsed <= 0) return state;
  const count = Math.max(1,Math.ceil(elapsed/PREDICTION_STEP_SEC));
  const step = elapsed/count;
  let current=state;
  for(let i=0;i<count;i++){
    const at=serverNow - elapsed+(i+1)*step;
    if(lift&&input?.jump&&at<=lift.until)
      current={...current,grounded:false,velocity:{...current.velocity,y:Math.max(current.velocity?.y??0,lift.speed+MOVEMENT.gravity*step)}};
    current=movePlayer(current,input,step,at,world);
  }
  return current;
}

/**
 * The owner's Gale-assisted Whirl climb, as the host will make it: { speed, until } or null. It rises until the revolution
 * under way ends, or on while the technique is held and another revolution will be granted: in a match while the Prowess
 * for it is there and the limit is not reached; in the Practice Yard, without limit or cost (swordTechniqueLive.mjs
 * practiceWhirl). auth: the owner's latest authoritative state ({ swordTechnique, spell, prowess }).
 */
export function galeLiftPrediction({ auth, held, practice = false, serverNow }) {
  const technique = auth?.swordTechnique;
  const speed = galeWhirlLiftSpeed(technique, auth?.spell, true);
  if (speed === null) return null;
  const contract = SWORD_TECHNIQUE_CONTRACTS[technique.id];
  const another = Boolean(held) && (practice || ((auth.prowess ?? 0) >= contract.extraRevolutionCost
    && (technique.revolutions ?? 1) < contract.maxRevolutions));
  return { speed, until: another ? Infinity : (technique.startedAt ?? serverNow) + contract.activeUntil };
}
