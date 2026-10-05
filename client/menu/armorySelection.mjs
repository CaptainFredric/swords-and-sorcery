// Card presses own sound; model feedback has an independent lifetime (the gesture's, or an ultimate's showcase).
import { ARMORY_PREVIEW_SEC } from './armoryPreview.mjs';
import { armoryShowcaseSeconds } from './showcaseSheets.mjs';
export function createArmorySelection({ play, preview, restore, schedule = setTimeout, unschedule = clearTimeout, seconds = (id) => armoryShowcaseSeconds(id, ARMORY_PREVIEW_SEC) }) {
  let stop = null;
  let timer = null;
  let active = null;
  function stopSound() { stop?.(); stop = null; }
  function cancel() {
    stopSound();
    if (timer !== null) unschedule(timer);
    timer = null;
    active = null;
  }
  return {
    cancel,
    select(id, current, equip) {
      stopSound();
      if (id !== current) equip(id);
      stop = play(id) ?? null;
      if (active !== id || timer === null) {
        if (timer !== null) unschedule(timer);
        active = id;
        preview(id);
        timer = schedule(() => { timer = null; active = null; restore(); }, seconds(id) * 1000);
      }
      return id !== current;
    },
  };
}
