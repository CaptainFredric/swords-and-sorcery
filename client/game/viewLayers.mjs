// My own arms and sword are drawn in a pass of their own, after the world and on depth cleared of it (GameRuntime
// #renderView): a wall I stand against never swallows the blade, so nothing has to pull the arms back out of its way
// (which is what used to crowd the eye near walls). They live on VIEW_LAYER; everything else stays on the default
// layer. A light must be on both, or the arms would not be lit by it: every light the arena makes goes through
// everywhere().

export const VIEW_LAYER = 1;

/** A light that lights the world and my own arms alike (on every layer). */
export function everywhere(light) {
  light.layers.enableAll();
  return light;
}

/** Put a first-person rig (and everything on it) on the view layer; its own lights go on lighting the world too. */
export function onViewLayer(root) {
  root.traverse((object) => {
    if (object.isLight) object.layers.enableAll();
    else object.layers.set(VIEW_LAYER);
  });
}
