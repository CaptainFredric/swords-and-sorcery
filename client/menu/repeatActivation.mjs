// A second deliberate choice invokes the SAME action as the detail panel's main button.
// The first choice is always a selection, even if it was preselected by saved UI state.
export function createRepeatActivation({ selected, select, activate, canActivate = () => true }) {
  let armed = null;
  let armedAt = -Infinity;
  let pending = false;
  return {
    choose(id, now = Date.now()) {
      if (pending) return false;
      if (id === armed && id === selected()) {
        // A quick mouse double-click or touch double-tap must not launch accidentally.
        if (now - armedAt < 300) return false;
        return this.run();
      }
      armed = id;
      armedAt = now;
      select(id);
      return true;
    },
    run() {
      if (pending || !canActivate(selected())) return false;
      const result = activate(selected());
      if (result !== false) pending = true;
      return result;
    },
    reset() { armed = null; armedAt = -Infinity; pending = false; },
    release() { pending = false; },
    get pending() { return pending; },
  };
}
