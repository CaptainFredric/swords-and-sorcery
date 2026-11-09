// A whole bot match on the authoritative simulation, as the server runs it (bots, combat, machines, mode rules at
// 30 Hz), with one idle human so the room runs. Reports how the match moved: phases reached and when, ladders
// raised, gates and structures broken, knights lost to the void, bots that stood stuck, and how it ended.
//
//   node scripts/world-bot-match.mjs RESTLESS_DAY restless-day [seconds=420] [--root path/to/checkout]
//
// --root runs the same match on another checkout (a before/after comparison on identical seeds).

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const rootAt = args.indexOf('--root');
const root = resolve(rootAt >= 0 ? args[rootAt + 1] : '.');
const [mode = 'RESTLESS_DAY', worldId = 'restless-day', secondsArg = '420'] = args.filter((a, i) => !a.startsWith('--') && (rootAt < 0 || i !== rootAt + 1));
const seconds = Number(secondsArg);
const load = (p) => import(pathToFileURL(resolve(root, p)).href);

const { Room } = await load('shared/sim/Room.mjs');
const { stepRoom } = await load('shared/sim/combat.mjs');
const { stepBotControllers } = await load('shared/sim/BotController.mjs');
const { TEAMS } = await load('shared/src/teams.mjs');

// a fixed random stream, the same on both checkouts
let seed = 20261109;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
Math.random = random;

const room = new Room('BOTMATCH', { isPrivate: true, mode, worldId });
const human = room.addPlayer({ id: 'observer', token: 't', name: 'Observer', team: TEAMS.ATTACKERS }, 0);
room.provisionModeActors(0);
room.startMatch(1);
const start = 1;
const log = { mode, worldId, root, seconds, phases: [], events: {}, voidDeaths: 0, kills: 0, stuck: [], samples: [] };
const last = new Map();
let phase = null;
const abyss = room.world.abyssY ?? -9;
for (let tick = 0; tick < seconds * 30 && room.state === 'PLAYING'; tick += 1) {
  const now = start + tick / 30;
  human.input = { forward: 0, right: 0, yaw: human.yaw ?? 0, pitch: 0 };
  stepBotControllers(room, now, room.world, { random });
  stepRoom(room, 1 / 30, now, room.world);
  for (const e of room.events.splice(0)) {
    log.events[e.type] = (log.events[e.type] ?? 0) + 1;
    if (e.type === 'kill' || e.type === 'playerKilled' || e.type === 'death') log.kills += 1;
  }
  const current = room.restlessDay?.phase ?? room.objectiveState?.phase ?? null;
  if (current !== phase) { phase = current; log.phases.push({ phase, at: +(now - start).toFixed(1) }); }
  for (const p of room.players.values()) {
    if (p.actorKind !== 'bot') continue;
    if (p.alive && p.position.y < abyss + 1 && !last.get(p.id)?.fell) { log.voidDeaths += 1; last.set(p.id, { ...(last.get(p.id) ?? {}), fell: true }); }
    if (p.alive && p.position.y > abyss + 1 && last.get(p.id)?.fell) last.set(p.id, { ...last.get(p.id), fell: false });
  }
  if (tick % (30 * 15) === 0) {
    for (const p of room.players.values()) {
      if (p.actorKind !== 'bot') continue;
      const before = last.get(p.id)?.at;
      if (before && p.alive && before.alive && Math.hypot(p.position.x - before.x, p.position.z - before.z) < 1.0 && !p.operatingRamId && !p.operatingBallistaId)
        log.stuck.push({ id: p.id, team: p.team, at: +(now - start).toFixed(0), x: +p.position.x.toFixed(1), y: +p.position.y.toFixed(1), z: +p.position.z.toFixed(1) });
      last.set(p.id, { ...(last.get(p.id) ?? {}), at: { x: p.position.x, z: p.position.z, alive: p.alive } });
    }
    log.samples.push({ t: +(now - start).toFixed(0), phase: current,
      ladders: room.restlessDay?.ladders.map((l) => `${l.state}${l.wall ?? ''}`).join(',') ?? null,
      structures: Object.fromEntries(Object.entries(room.structures?.entities ?? {}).map(([k, v]) => [k, Math.round(v.health)])),
      attackersAt: [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS && p.alive && p.actorKind === 'bot').map((p) => Math.round(p.position.z)) });
  }
}
log.finish = { state: room.state, winner: room.winnerTeam ?? null, reason: room.finishReason ?? null };
log.stuckBots = new Set(log.stuck.map((s) => s.id)).size;
console.log(JSON.stringify(log, null, 1));
