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
    line: 'A roaring blast that catches everyone near it; whoever it lands close to keeps burning.',
    facts: (s) => `Hits for ${s.directDamage}, burns for ${s.burn.damage} more · ${s.cooldownSec} s`,
  },
  frostfire: {
    mark: '❄',
    line: 'A quick bolt of cold. Whoever it strikes turns sluggish, then thaws.',
    facts: (s) => `Hits for ${s.directDamage}, chills them heavy for ${s.chill.seconds} s · ${s.cooldownSec} s`,
  },
  gale: {
    mark: '≋',
    line: 'Draw a breath of wind, then loose it in a cone: for a moment it carries off whoever stands in it, and bends any spell flying through it. It hurts far less than it moves. Into the ground, it throws you.',
    facts: (s) => `Stings for up to ${s.cone.damage}, carries out to ${s.cone.pressureReach} m for ${s.cone.lastsSec} s · ${s.cooldownSec} s`,
  },
  steel: {
    mark: '⛨',
    line: 'Clench the magic hand and your plate hardens: every blow lands like a glancing one, less so as it wears off.',
    facts: (s) => `Every sword blow lands for ${GAME.swordGlance} · hard ${STEEL.fullSec} s, then wears off over ${STEEL.fadeSec} s · ${s.cooldownSec} s`,
  },
});

// and each ultimate
const ULTIMATE_WORDS = Object.freeze({
  sunder: {
    mark: '⚒',
    line: 'Every blow the most forceful it could be: the sword slams down with each strike and the ground ruptures under it; a guard pays double.',
    facts: (u) => `${GAME.swordElevated} a blow, the ground split with each · ${u.activeSec} s · earned by fighting`,
  },
  vortex: {
    mark: '✺',
    line: 'Spin into a close-range storm of sword cuts and aimed fire. Move faster, fall slowly, and overwhelm anyone who stays near you.',
    facts: (u) => `${u.contact.damage} a cut, fire where you aim · hold Attack for the blade, Spell for the fire · no guard while it lasts · ${u.activeSec} s · earned by fighting`,
  },
});

export function armoryView(equipped, ultimate = 'sunder') {
  return {
    blade: {
      name: 'Castleward longsword',
      facts: `Three-strike combo · ${GAME.swordGlance}–${GAME.swordDamage} a blow · guard and parry`,
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
