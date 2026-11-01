// Castleward — Touch Controls Layout Model, Presets, and Customization
// Supports distinct on-foot and Fight-and-Flight layouts, left/right-handed presets,
// safe-bounds clamping, and local persistence.

export const MIN_BUTTON_SIZE = 40;
export const MAX_BUTTON_SIZE = 110;
export const DEFAULT_OPACITY = 0.85;

export const DEFAULT_ON_FOOT_LAYOUT = Object.freeze({
  stick: { left: 118, bottom: 110, size: 112, type: 'stick' },
  attack: { right: 28, bottom: 28, size: 80 },
  guard: { right: 152, bottom: 36, size: 64 },
  dash: { right: 138, bottom: 104, size: 54 },
  spell: { right: 88, bottom: 147, size: 54 },
  jump: { right: 21, bottom: 154, size: 58 },
  sprint: { left: 26, bottom: 190, size: 50 },
  crouch: { left: 190, bottom: 187, size: 50 },
  gauntlet: { right: 206, bottom: 150, size: 46 },
  ultimate: { right: 24, bottom: 222, size: 50 },
  interact: { right: 204, bottom: 96, size: 58 },
  deploy: { right: 196, bottom: 164, size: 58 },
  pause: { left: 10, top: 8, size: 38 },
  scores: { left: 54, top: 8, size: 38 },
});

export const DEFAULT_FLIGHT_LAYOUT = Object.freeze({
  stick: { left: 118, bottom: 110, size: 112, type: 'stick' },
  // Vertical flight rail is attached to the movement stick; it follows mirrored/custom stick placement.
  // Right-side combat cluster (bottom to top):
  // Bottom row: GUARD (left), SWORD (right)
  guard: { right: 108, bottom: 24, size: 66 },
  attack: { right: 20, bottom: 24, width: 88, height: 76 },
  // Second row: BOLT (left) with sustained-fire target, JUMP (right)
  siegeWeapon: { right: 108, bottom: 105, width: 86, height: 62 },
  jump: { right: 26, bottom: 105, size: 62 },
  // Third row: FIRE AWAY (left), DASH (right)
  siegeSkill: { right: 108, bottom: 172, size: 58 },
  dash: { right: 24, bottom: 172, size: 58 },
  // Above ordinary cluster: ULTIMATE / VALKYRIE
  ultimate: { right: 66, bottom: 242, size: 58 },
  // Upper auxiliary controls
  siegeView: { right: 14, top: 12, size: 44 },
  interact: { right: 68, top: 12, size: 44 },
  pause: { left: 10, top: 8, size: 38 },
  scores: { left: 54, top: 8, size: 38 },
});

export function mirrorLayoutHorizontal(layout) {
  const mirrored = {};
  for (const [key, item] of Object.entries(layout)) {
    const copy = { ...item, custom: true };
    if ('left' in copy) {
      copy.right = copy.left;
      delete copy.left;
    } else if ('right' in copy) {
      copy.left = copy.right;
      delete copy.right;
    }
    mirrored[key] = copy;
  }
  return mirrored;
}

export function clampPlacement(item, viewport = { width: 800, height: 450 }) {
  const clamped = { ...item, custom: true };
  const w = item.width ?? item.size ?? 50;
  const h = item.height ?? item.size ?? 50;
  const safeMargin = 4;

  if (clamped.size !== undefined) {
    clamped.size = Math.max(MIN_BUTTON_SIZE, Math.min(MAX_BUTTON_SIZE, clamped.size));
  }
  if (clamped.width !== undefined) {
    clamped.width = Math.max(36, Math.min(120, clamped.width));
  }
  if (clamped.height !== undefined) {
    clamped.height = Math.max(30, Math.min(80, clamped.height));
  }

  if ('left' in clamped) {
    clamped.left = Math.max(safeMargin, Math.min(viewport.width - w - safeMargin, clamped.left));
  } else if ('right' in clamped) {
    clamped.right = Math.max(safeMargin, Math.min(viewport.width - w - safeMargin, clamped.right));
  }

  if ('top' in clamped) {
    clamped.top = Math.max(safeMargin, Math.min(viewport.height - h - safeMargin, clamped.top));
  } else if ('bottom' in clamped) {
    clamped.bottom = Math.max(safeMargin, Math.min(viewport.height - h - safeMargin, clamped.bottom));
  }

  return clamped;
}

// Old saved default layouts used the centerline above the joystick for Crouch.
// Migrate only that exact unmodified location; preserve deliberate custom layouts.
function migrateCrouchPosition(onFoot) {
  const crouch = onFoot?.crouch;
  if (!crouch || crouch.custom || crouch.left !== 90 || crouch.bottom !== 196) return onFoot;
  return { ...onFoot, crouch: { ...crouch, left: 190, bottom: 187 } };
}

export function loadTouchLayout(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.('ss-touch-layout');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        onFoot: migrateCrouchPosition(parsed.onFoot ?? { ...DEFAULT_ON_FOOT_LAYOUT }),
        flight: parsed.flight ?? { ...DEFAULT_FLIGHT_LAYOUT },
        opacity: Number.isFinite(parsed.opacity) ? parsed.opacity : DEFAULT_OPACITY,
        handedness: parsed.handedness === 'left' ? 'left' : 'right',
      };
    }
  } catch {}
  return {
    onFoot: { ...DEFAULT_ON_FOOT_LAYOUT },
    flight: { ...DEFAULT_FLIGHT_LAYOUT },
    opacity: DEFAULT_OPACITY,
    handedness: 'right',
  };
}

export function saveTouchLayout(layout, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.('ss-touch-layout', JSON.stringify(layout));
  } catch {}
}

export function applyLayoutItem(element, placement, scale = 1) {
  if (!element || !placement || !placement.custom) return;
  const s = scale;
  if ('left' in placement) {
    element.style.left = `calc(var(--safe-l) + ${placement.left}px * var(--s))`;
    element.style.right = 'auto';
  } else if ('right' in placement) {
    element.style.right = `calc(var(--safe-r) + ${placement.right}px * var(--s))`;
    element.style.left = 'auto';
  }

  if ('top' in placement) {
    element.style.top = `calc(var(--safe-t) + ${placement.top}px * var(--s))`;
    element.style.bottom = 'auto';
  } else if ('bottom' in placement) {
    element.style.bottom = `calc(var(--safe-b) + ${placement.bottom}px * var(--s))`;
    element.style.top = 'auto';
  }

  if (placement.size !== undefined) {
    element.style.setProperty('--size', `${placement.size}px`);
  }
  if (placement.width !== undefined) {
    element.style.width = `calc(${placement.width}px * var(--s))`;
  }
  if (placement.height !== undefined) {
    element.style.height = `calc(${placement.height}px * var(--s))`;
  }
}
