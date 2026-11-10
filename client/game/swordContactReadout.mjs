// A sword contact as the F3 debugger reads it out (BladeHeatmapDebug.mjs): pure, so it is tested.
const CUTS = ['forehand', 'backhand', 'chop'];
const FORMS = ['falling', 'rising'];

/** One contact as the debugger reads it out (pure: tested). */
export function describeContact({ strike = 0, kind = strike, variant = 0, outcome = 'hit', damage = 0, quality = 0, heat = null } = {}) {
  const where = !heat ? '' : heat.reach < 0.45 ? ' hilt' : heat.reach > 0.88 ? ' tip' : ' cutting';
  const when = !heat ? '' : heat.dt < -0.03 ? ' early' : heat.dt > 0.03 ? ' late' : ' peak';
  const detail = heat ? ` reach ${heat.reach.toFixed(2)}${where} · dt ${(heat.dt * 1000).toFixed(0)}ms${when} · angle ${heat.qAngle.toFixed(2)}` : '';
  return `${FORMS[variant] ?? variant} ${strike + 1}:${CUTS[kind] ?? kind} ${outcome.padEnd(10)} ${outcome === 'hit' ? `${damage}`.padStart(2) : '  '} q ${quality.toFixed(2)}${detail}`;
}
