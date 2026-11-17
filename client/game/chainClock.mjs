// The chain's clock as a body shows it. A press on the beat cancels the rest of a cut's follow-through into the next
// cut (shared/src/combatFrameData.mjs chainCadence): the server moves the chain's start earlier by up to an eighth of a
// second at once. Shown at once, the body would jump through what was left of the follow-through; instead it is shown
// behind the jump and catches up within a few hundredths of a second, playing the rest a little fast. Long before the
// next cut's contact (at least a third of a second on), what is shown is the server's clock exactly.
//
// Pure: `d` is the body's own record (kept between frames), `startedAt` the chain's start as the server has it now.

export const CHAIN_CATCH_UP = Object.freeze({ halflife: 0.035, largest: 0.25 });

/** The chain start to show the body at this frame (dt: seconds since the last). */
export function chainClockShown(d, startedAt, dt) {
  if (!Number.isFinite(startedAt)) return startedAt;
  const c = d.chainClock ?? (d.chainClock = { startedAt, lag: 0 });
  const moved = c.startedAt - startedAt;
  // (a later start is another chain: nothing to catch up. An earlier one, by a little, is the same chain hastened)
  if (moved > 1e-4 && moved <= CHAIN_CATCH_UP.largest) c.lag += moved;
  else if (moved < -1e-4 || moved > CHAIN_CATCH_UP.largest) c.lag = 0;
  c.startedAt = startedAt;
  c.lag *= Math.pow(0.5, Math.max(0, dt) / CHAIN_CATCH_UP.halflife);
  if (c.lag < 1e-4) c.lag = 0;
  return startedAt + c.lag;
}
