// A lost input stream must not mean "keep walking forward indefinitely".
// Online clients normally send movement at least every 50 ms; six missed
// heartbeats permit brief jitter while preventing blind movement during a
// rendering stall, disconnected socket or temporary radio interruption.
export const INPUT_LEASE_SEC = 0.35;

export function expireStaleMovementInputs(room, nowSec, leaseSec = INPUT_LEASE_SEC) {
  let expired = 0;
  for (const player of room.players.values()) {
    if (player.actorKind !== 'human'
        || !Number.isFinite(player.lastMovementInputAt)
        || nowSec - player.lastMovementInputAt < leaseSec) continue;
    // Preserve combat command authority and look angle. Only continuous
    // locomotion/machine drive axes are leased; a critical attack/guard event
    // has its own existing command semantics.
    Object.assign(player.input, {
      forward:0,right:0,jump:false,sprint:false,crouch:false,
      flightRise:false,flightLower:false,ramRaise:false,
      ramPitchUp:false,ramPitchDown:false,
    });
    player.lastMovementInputAt = null; // one expiry per silent interval
    expired++;
  }
  return expired;
}
