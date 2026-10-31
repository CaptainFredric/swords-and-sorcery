import { TEAMS } from '../src/teams.mjs';

export const HIGH_GROUNDS_RULES = Object.freeze({
  scoreToWin: 900,
  matchSec: 720,
  neutralizeSec: 9,
  foundryCooldownSec: 120,
  foundryInteractRadius: 5,
  spawnSafetyRadius: 18,
});
const SIDES = [TEAMS.ATTACKERS, TEAMS.DEFENDERS];
const opposition = team => team === TEAMS.ATTACKERS ? TEAMS.DEFENDERS : TEAMS.ATTACKERS;

export function createHighGroundsState(world) {
  return {
    sites: (world.objectives ?? []).map(o => ({
      id: o.id, name: o.name, position: { x: o.x, y: o.y, z: o.z },
      radius: o.radius, captureSec: o.captureSec, forwardTeam: o.forwardTeam ?? null,
      owner: o.initialOwner ?? null, capturingTeam: null, progress: 0, contested: false,
      attackersCount: 0, defendersCount: 0, lastCapturedAt: null,
    })),
    scores: { [TEAMS.ATTACKERS]: 0, [TEAMS.DEFENDERS]: 0 },
    foundries: (world.siegeFoundries ?? []).map(f => ({
      id: f.id, team: f.team, x: f.x, y: f.y, z: f.z, spawnX: f.spawnX, spawnZ: f.spawnZ,
      heading: f.heading, machineId: null, machine: null,
      readyAt: 0, lastProducedAt: null,
    })),
  };
}
// Exactly one team in the ring makes progress. Both teams present means a
// genuine contest. Hovering over the deck never counts as occupying it.
export function stepHighGrounds(room, dt, now) {
  if (room.mode !== 'HIGH_GROUNDS' || room.state !== 'PLAYING' || !room.highGrounds) return;
  const state = room.highGrounds;
  const validDt = Math.max(0, Math.min(dt, 0.1));
  for (const site of state.sites) {
    let attackers = 0, defenders = 0;
    for (const p of room.players.values()) {
      if (!p.alive || !SIDES.includes(p.team)) continue;
      if (p.operatingFightFlightId && !room.fightFlight?.grounded) continue;
      const dx = p.position.x - site.position.x, dz = p.position.z - site.position.z;
      const dy = p.position.y - site.position.y;
      if (dx * dx + dz * dz > site.radius * site.radius || dy < -.6 || dy > 2.3) continue;
      if (p.team === TEAMS.ATTACKERS) attackers++;
      else defenders++;
    }
    site.attackersCount = attackers;
    site.defendersCount = defenders;
    const wasContested = site.contested;
    site.contested = attackers > 0 && defenders > 0;
    if (site.contested && !wasContested) room.events.push({
      type: 'highGroundsContested', siteId: site.id, name: site.name, at: now,
    });
    const force = attackers && !defenders ? TEAMS.ATTACKERS
      : defenders && !attackers ? TEAMS.DEFENDERS : null;
    if (!force || site.contested) {
      // Don't let a fractional capture wait indefinitely between skirmishes.
      if (!site.contested && site.progress > 0) {
        site.progress = Math.max(0, site.progress - validDt / (site.captureSec * 2));
        if (site.progress === 0) site.capturingTeam = null;
      }
      continue;
    }
    if (site.owner === force) {
      site.capturingTeam = null;
      site.progress = 0;
      continue;
    }
    if (site.capturingTeam !== force) {
      site.capturingTeam = force;
      site.progress = 0;
    }
    const number = force === TEAMS.ATTACKERS ? attackers : defenders;
    const time = site.owner ? HIGH_GROUNDS_RULES.neutralizeSec : site.captureSec;
    site.progress = Math.min(1, site.progress + validDt * (1 + .25 * (number - 1)) / time);
    if (site.progress < 1) continue;
    const oldOwner = site.owner;
    site.owner = oldOwner ? null : force;
    site.progress = 0;
    site.capturingTeam = oldOwner ? force : null;
    site.lastCapturedAt = now;
    room.events.push({ type: oldOwner ? 'highGroundsNeutralized' : 'highGroundsCaptured',
      siteId: site.id, name: site.name, team: force, previousOwner: oldOwner, at: now });
  }
  // A side never gains score for neutral or merely contested territory.
  for (const team of SIDES) {
    const held = state.sites.filter(s => s.owner === team && !s.contested).length;
    state.scores[team] += held * validDt;
  }
  const [a,b] = SIDES.map(team => state.scores[team]);
  if (a >= HIGH_GROUNDS_RULES.scoreToWin || b >= HIGH_GROUNDS_RULES.scoreToWin) {
    if (Math.abs(a-b) > 1e-6) {
      room.finish(a > b ? TEAMS.ATTACKERS : TEAMS.DEFENDERS, now, 'territory');
    }
  }
}
export function finishHighGroundsOnTime(room, now) {
  if (room.mode !== 'HIGH_GROUNDS' || room.state !== 'PLAYING') return false;
  const s = room.highGrounds?.scores;
  if (!s) return false;
  const delta = s[TEAMS.ATTACKERS] - s[TEAMS.DEFENDERS];
  room.finish(Math.abs(delta) < 1e-6 ? null : delta > 0 ? TEAMS.ATTACKERS : TEAMS.DEFENDERS,
    now, Math.abs(delta) < 1e-6 ? 'stalemate' : 'territory-time');
  return true;
}
export function availableHighGroundsSpawns(room, player, allSpawns) {
  const base = allSpawns.filter(s => s.team === player.team && !s.forward);
  const state = room.highGrounds;
  if (!state || room.matchStartedAt == null || room.state !== 'PLAYING') return base;
  const site = state.sites.find(s => s.forwardTeam === player.team && s.owner === player.team);
  if (!site || site.contested) return base;
  const forward = allSpawns.filter(s => s.team === player.team && s.forward);
  if (!forward.length) return base;
  const enemies = [...room.players.values()].filter(p => p.alive && p.team === opposition(player.team));
  if (forward.some(s => enemies.some(e => Math.hypot(e.position.x - s.x, e.position.z - s.z)
    < HIGH_GROUNDS_RULES.spawnSafetyRadius))) return base;
  return forward;
}
export function highGroundsBotGoal(room, actor) {
  const sites = room.highGrounds?.sites;
  if (!sites || !actor?.team) return null;
  const candidates = sites.filter(s => s.owner !== actor.team);
  if (!candidates.length) return sites[2]?.position ?? null;
  // Prefer the middle battle without forbidding recaptures or high-route play.
  const slots = actor.rivalIndex ?? 0;
  let best = null, bestScore = Infinity;
  for (const site of candidates) {
    const dx = actor.position.x - site.position.x;
    const dz = actor.position.z - site.position.z;
    const dy = actor.position.y - site.position.y;
    const crowd = [...room.players.values()].filter(p => p !== actor && p.alive
      && p.team === actor.team && Math.hypot(p.position.x - site.position.x,
        p.position.z - site.position.z) < site.radius + 6).length;
    const score = Math.hypot(dx,dz) + Math.abs(dy) * 2.5 + crowd * 12
      - (site.id === 'crown-span' ? 16 : 0) + (slots % 2 === 0 && dy > 5 ? 7 : 0);
    if (score < bestScore) { bestScore = score; best = site; }
  }
  return best?.position ?? null;
}
