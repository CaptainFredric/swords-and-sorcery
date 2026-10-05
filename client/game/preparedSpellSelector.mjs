import { isSpell, spellFor } from '../../shared/src/spells.mjs';

// how long Q is held to open the choice instead of casting (a tap is shorter than this)
export const PREPARED_HOLD_MS = 200;

/** The repertoire is authoritative; only an unfinished highlight belongs to the client. */
export function preparedSpellView(local, serverNow = 0) {
  const state = local?.ultimateState;
  const phase = state?.id === 'chivalry' && local?.alive !== false
    && (state.phase === 'startup' || (state.phase === 'active' && serverNow < state.until)) ? state.phase : null;
  const ids = [...new Set((local?.preparedSpells ?? []).filter(isSpell))].slice(0, 3);
  const visible = Boolean(phase && ids.length === 3);
  const spells = ids.map((id) => {
    const spell = spellFor(id);
    const projectile = id === 'fireball' || id === 'frostfire';
    const readyAt = phase === 'active' && projectile ? local.chivalryProjectileReadyAt
      : local?.spellReadyById?.[id] ?? (id === local?.spell ? local?.spellReadyAt : 0);
    const remaining = Math.max(0, (readyAt ?? 0) - serverNow);
    const busy = Boolean(local?.castingSpell && serverNow < local.castEndsAt);
    return { id, spell, current: id === local?.spell, remaining, busy, available: phase === 'active' && remaining <= 0.01 && !busy };
  });
  return { visible, phase, current: local?.spell, spells, left: phase === 'active' ? Math.max(0, state.until - serverNow) : 0 };
}

/** Small local fan. Pointer lock callers feed accumulated deltas; touch callers feed displacement from press. */
export class PreparedSpellSelector {
  constructor(ids, current, { touch = false } = {}) {
    const ordered = [current, ...ids.filter((id) => id !== current)].filter(isSpell).slice(0, 3);
    const positions = touch ? [[0, 0], [-66, -56], [14, -86]] : [[0, 0], [-60, 0], [60, 0]];
    this.slots = ordered.map((id, index) => ({ id, x: positions[index][0], y: positions[index][1] }));
    this.highlight = this.slots[0]?.id ?? null;
  }

  move(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return this.highlight = null;
    if (Math.hypot(x, y) <= 22) return this.highlight = this.slots[0]?.id ?? null;
    const held = this.slots.find((slot) => slot.id === this.highlight);
    if (held && Math.hypot(x - held.x, y - held.y) <= 44) return this.highlight;
    const nearest = this.slots.map((slot) => ({ ...slot, distance: Math.hypot(x - slot.x, y - slot.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    this.highlight = nearest && nearest.distance <= 34 ? nearest.id : null;
    return this.highlight;
  }

  view() { return { highlight: this.highlight, slots: this.slots }; }
}
