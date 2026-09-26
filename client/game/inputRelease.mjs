export function recordArenaKey(keys, code, enabled) {
  if (!enabled) return false;
  keys?.add?.(code);
  return true;
}

export function releaseHeldInputs(controller) {
  if (!controller) return;

  const releaseAttack = Boolean(controller.attackHeld);
  const releaseGuard = Boolean(controller.guardHeld);

  controller.keys?.clear?.();
  controller.attackHeld = false;
  controller.guardHeld = false;
  controller.scoreboardHeld = false;
  controller.touch?.reset?.();

  if (releaseAttack) {
    controller.socket?.attack?.(false);
    controller.onAttackLocal?.(false);
  }
  if (releaseGuard) {
    controller.socket?.guard?.(false);
    controller.onGuardLocal?.(false);
  }
}
