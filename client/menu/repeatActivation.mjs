// A second deliberate choice invokes the SAME action as the detail panel's main button.
// The first choice is always a selection, even if it was preselected by saved UI state.
export function createRepeatActivation({ selected, select, activate, canActivate = () => true }) {
  let armed = null;
  let pending = false;
  return {
    choose(id) {
      if (pending) return false;
      // The second real click/tap is itself the requested launch gesture.
      // Do not suppress quick consecutive presses as accidental double-clicks.
      if (id === armed && id === selected()) return this.run();
      armed = id;
      select(id);
      return true;
    },
    run() {
      if (pending || !canActivate(selected())) return false;
      const result = activate(selected());
      if (result !== false) pending = true;
      return result;
    },
    reset() { armed = null; pending = false; },
    release() { pending = false; },
    get pending() { return pending; },
  };
}
