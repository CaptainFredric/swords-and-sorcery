#!/usr/bin/env node
// Bot against bot, for judging the skills (shared/sim/botSkill.mjs): two rivals of chosen skills fight on a real arena
// for a while, again and again with different seeds and loadouts, and what each did is counted. Pure simulation; no
// server. Usage: node scripts/bot-tournament.mjs spellblade squire [--matches 6] [--seconds 120] [--world castleward]
import { RoomManager } from '../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../shared/sim/BotController.mjs';
import { stepRoom } from '../shared/sim/combat.mjs';

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** One fight between skills `a` and `b`: { kills: { a, b }, damage: { a, b }, parries: { a, b } }. */
export function fight(a, b, { seed = 1, seconds = 120, world = 'castleward', spell = 'fireball', ultimate = 'sunder', dt = 1 / 30, skills = null } = {}) {
  const random = lcg(seed);
  const manager = new RoomManager({ random });
  const room = manager.createSoloRoom('BOT_DUEL', 0, world);
  const [first, second] = [a, b].map((skill, i) => {
    const actor = room.addServerActor({ id: `${i ? 'B' : 'A'}-${skill}`, name: skill, actorKind: 'bot', spell, ultimate }, 0);
    actor.botSkill = skills?.[i] ?? skill;
    actor.ultimate = actor.startingUltimate = ultimate;
    actor.spell = actor.startingSpell = spell;
    return actor;
  });
  room.startMatch(0);
  room.peace = null;
  const damage = { [first.id]: 0, [second.id]: 0 };
  let t = 0;
  while (t < seconds && room.state === 'PLAYING') {
    t += dt;
    stepBotControllers(room, t, room.world, { random, targetKinds: ['bot'] });
    stepRoom(room, dt, t, room.world);
    for (const event of room.events.splice(0)) {
      if (event.type === 'damage' && damage[event.attackerId] !== undefined && event.attackerId !== event.victimId) damage[event.attackerId] += event.amount;
    }
  }
  return {
    kills: { a: first.kills, b: second.kills },
    damage: { a: Math.round(damage[first.id]), b: Math.round(damage[second.id]) },
    parries: { a: first.parries, b: second.parries },
  };
}

if (process.argv[1]?.endsWith('bot-tournament.mjs')) {
  const [a = 'spellblade', b = 'squire'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const option = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const matches = Number(option('matches', 6));
  const seconds = Number(option('seconds', 120));
  const world = option('world', 'castleward');
  const total = { kills: { a: 0, b: 0 }, damage: { a: 0, b: 0 }, parries: { a: 0, b: 0 } };
  const loadouts = [['fireball', 'sunder'], ['frostfire', 'vortex'], ['gale', 'chivalry']];
  for (let m = 0; m < matches; m += 1) {
    const [spell, ultimate] = loadouts[m % loadouts.length];
    const r = fight(a, b, { seed: 1000 + m * 77, seconds, world, spell, ultimate });
    for (const key of Object.keys(total)) for (const side of ['a', 'b']) total[key][side] += r[key][side];
    console.log(`match ${m + 1} (${spell}, ${ultimate}): ${a} ${r.kills.a} - ${r.kills.b} ${b}   damage ${r.damage.a}/${r.damage.b}   parries ${r.parries.a}/${r.parries.b}`);
  }
  console.log(`\n${a} vs ${b} over ${matches} x ${seconds}s on ${world}: kills ${total.kills.a}-${total.kills.b}, damage ${total.damage.a}-${total.damage.b}, parries ${total.parries.a}-${total.parries.b}`);
}
