// The input heartbeat deliberately runs without the 3D renderer. It must not
// turn a GPU/main-thread render stall into blind continuous sprinting or flying.
export const RENDER_INPUT_STALL_MS = 280;

export function movementIntentDuringRenderStall(intent, nowMs, lastFrameAtMs, thresholdMs = RENDER_INPUT_STALL_MS) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastFrameAtMs)
      || nowMs - lastFrameAtMs <= thresholdMs) return intent;
  // Preserve camera heading, firing/Guard commands and user key state.
  // Only suppress the *networked* continuous locomotion/machine axes; the
  // local InputController retains the held key to resume on the next frame.
  return {
    ...intent,
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    crouch: false,
    flightRise: false,
    flightLower: false,
    ramRaise: false,
    ramPitchUp: false,
    ramPitchDown: false,
  };
}
