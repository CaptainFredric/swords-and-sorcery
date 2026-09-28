// What the Armory shows: the Spellblade's kit, slot by slot. The spell cards come from the shared spell table, so a
// spell added there appears here with its own words. Pure, so the wording can be tested.

import { GAME } from '../../shared/src/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';

// how each spell reads in the Armory: what it is like, then plainly what it does
const SPELL_WORDS = Object.freeze({
  fireball: {
    mark: '✦',
    line: 'A roaring blast that catches everyone near it, and keeps burning.',
    facts: (s) => `Hits for ${s.directDamage}, burns for ${s.burn.damage} more · ${s.cooldownSec} s`,
  },
  frostfire: {
    mark: '❄',
    line: 'A quick bolt of cold. Whoever it strikes turns sluggish, then thaws.',
    facts: (s) => `Hits for ${s.directDamage}, chills them heavy for ${s.chill.seconds} s · ${s.cooldownSec} s`,
  },
});

export function armoryView(equipped) {
  return {
    blade: {
      name: 'Castleward longsword',
      facts: `Three-strike combo · ${GAME.swordDamage} a blow · guard and parry`,
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
  };
}
