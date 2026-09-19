export function releaseHeldInputs(controller) {
  if (!controller) return;

  const releaseAttack = Boolean(controller.attackHeld);
  const releaseGuard = Boolean(controller.guardHeld);

  controller.keys?.clear?.();
  controller.attackHeld = false;
  controller.guardHeld = false;
  controller.scoreboardHeld = false;

  if (releaseAttack) {
    controller.socket?.attack?.(false);
    controller.onAttackLocal?.(false);
  }
  if (releaseGuard) {
    controller.socket?.guard?.(false);
    controller.onGuardLocal?.(false);
  }
}
