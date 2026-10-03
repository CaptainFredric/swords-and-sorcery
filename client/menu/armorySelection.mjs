// Deliberate choices alone trigger feedback. Restoration and rendering never call select.
export function createArmorySelection({ play, preview, restore, schedule = setTimeout, unschedule = clearTimeout }) {
  let stop = null;
  let timer = null;
  function cancel() {
    stop?.();
    stop = null;
    if (timer !== null) unschedule(timer);
    timer = null;
  }
  return {
    cancel,
    select(id, current, equip) {
      if (id === current) return false;
      cancel();
      equip(id);
      stop = play(id) ?? null;
      preview(id);
      timer = schedule(() => { cancel(); restore(); }, 850);
      return true;
    },
  };
}
