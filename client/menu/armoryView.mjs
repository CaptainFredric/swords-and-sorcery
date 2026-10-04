// What the Armory shows: the Spellblade's kit, slot by slot. The spell cards come from the shared spell table, so a
// spell added there appears here with its own words. Pure, so the wording can be tested.

import { GAME } from '../../shared/src/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { STEEL } from '../../shared/src/steel.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

// how each spell reads in the Armory: what it is like, then plainly what it does
const SPELL_WORDS = Object.freeze({
  fireball: {
    mark: '✦',
    line: 'Explodes on impact and burns enemies caught near the blast.',
    facts: (s) => `${s.directDamage} impact · ${s.burn.damage} burn · ${s.cooldownSec}s cooldown`,
  },
  frostfire: {
    mark: '❄',
    line: 'A fast bolt of cold that slows whoever it hits until they thaw.',
    facts: (s) => `${s.directDamage} impact · heavy chill ${s.chill.seconds}s · ${s.cooldownSec}s cooldown`,
  },
  gale: {
    mark: '≋',
    line: 'Release a cone of wind that carries enemies, bends projectiles, and can launch you when aimed at the ground.',
    facts: (s) => `Up to ${s.cone.damage} damage · ${s.cone.pressureReach}m reach · ${s.cone.lastsSec}s wind · ${s.cooldownSec}s cooldown`,
  },
  steel: {
    mark: '⛨',
    line: 'Harden your armor. While Steel holds, incoming hits land like glancing contacts.',
    facts: (s) => `${GAME.swordGlance} sword damage · ${STEEL.fullSec}s full strength · ${STEEL.fadeSec}s fade · ${s.cooldownSec}s cooldown`,
  },
});

// and each ultimate
const ULTIMATE_WORDS = Object.freeze({
  sunder: {
    mark: '⚒',
    line: 'Every sword strike becomes a crushing downward blow. Hits interrupt actions, split the ground, and hammer through Guard.',
    facts: (u) => `${GAME.swordElevated} sword damage · double Guard impact · ${u.activeSec}s duration`,
  },
  chivalry: {
    mark: '⚔',
    line: 'Guard rises as Chivalry begins. For 9 seconds, Sprint, attack, Guard, Dash and cast together. Draw from three prepared spells. The spell you finish with stays equipped for the match.',
    facts: (u) => `${u.activeSec}s · 3 prepared spells · rapid projectile casting · no parry reel`,
  },
  vortex: {
    mark: '✺',
    line: 'Spin through enemies with your blade and aimed fire. Move faster and fall slowly. Hold Attack for stronger fire or Guard for faster cuts.',
    facts: (u) => `${u.contact.damage} contact damage · Guard unavailable · ${u.activeSec}s duration`,
  },
});

export function armoryView(equipped, ultimate = 'sunder') {
  return {
    blade: {
      name: 'Castleward longsword',
      facts: `Three-strike combo · ${GAME.swordGlance} to ${GAME.swordDamage} damage · guard and parry`,
    },
    spells: Object.values(SPELLS).map((spell) => {
      const words = SPELL_WORDS[spell.id] ?? { mark: '◆', line: '', facts: () => `${spell.cooldownSec} s` };
      return {
        id: spell.id,
        name: spell.label.toUpperCase(),
        mark: words.mark,
        line: words.line,
        facts: words.facts(spell),
        equipped: spell.id === equipped,
      };
    }),
    ultimates: Object.values(ULTIMATES).map((u) => {
      const words = ULTIMATE_WORDS[u.id] ?? { mark: '◆', line: '', facts: () => `${u.activeSec} s` };
      return { id: u.id, name: u.label.toUpperCase(), mark: words.mark, line: words.line, facts: words.facts(u), equipped: u.id === ultimate };
    }),
  };
}
