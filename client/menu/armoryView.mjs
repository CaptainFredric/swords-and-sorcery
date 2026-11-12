// What the Armory shows: the Spellblade's kit, slot by slot. The spell cards come from the shared spell table, so a
// spell added there appears here with its own words. Pure, so the wording can be tested.

import { GAME } from '../../shared/src/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { STEEL } from '../../shared/src/steel.mjs';
import { STEEL_RAM } from '../../shared/src/steelRam.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { normalizePreparedSpells } from '../../shared/src/preparedSpells.mjs';
import { ONE_HIT_BASE_DAMAGE } from '../../shared/src/oneHitInfusions.mjs';
import { ONE_HIT_FIRST_INFUSION_DAMAGE, ONE_HIT_RULES } from '../../shared/src/oneHitOfWondersRules.mjs';

// Sword Techniques use the same authoritative loadout as spells and Ultimates.
export const SWORD_TECHNIQUES = Object.freeze([
  {
    id: 'rigid_riposte',
    name: 'Rigid Riposte',
    mark: '⇏',
    icon: 'attack',
    line: 'A committed forward sword thrust that intercepts and parries incoming attacks along its startup path.',
    facts: () => '24 clean / 20 grazing · 5.7 m thrust · 10s cooldown · aerial use consumes Dash',
    lore: 'A blade held exactly where the opponent would prefer it not to be.',
    status: 'AVAILABLE',
    disabled: false,
  },
  {
    id: 'whirl_wind',
    name: 'Whirl Like the Wind',
    mark: '↻',
    icon: 'vortex',
    line: 'A full 360° mobile sword sweep. Can be sustained by expending Prowess energy; synergizes with Gale Garner.',
    facts: () => '16 clean / 13 glancing per contact · 0.6s/revolution · 25 Prowess per extra spin · 10s cooldown',
    lore: 'More sword, less stopping to discuss it.',
    status: 'AVAILABLE',
    disabled: false,
  },
]);

// how each spell reads in the Armory: what it is like, then plainly what it does
const SPELL_WORDS = Object.freeze({
  line_of_conduct: {
    mark:'ϟ',
    line:'A lightning line whose direct damage diminishes over distance; dangerous conduction persists briefly along the path.',
    facts:(s)=>`${ONE_HIT_RULES.lineOfConduct.nearDamage} close → ${ONE_HIT_RULES.lineOfConduct.farDamage} extreme · ${s.cooldownSec}s cooldown`,
    lore:'A strict line of conduct, drawn where nobody sensible should stand.',
  },
  fireball: {
    mark: '✦',
    line: 'Explodes on impact and burns enemies caught near the blast.',
    facts: (s) => `${s.directDamage} impact · ${s.burn.damage} burn · ${s.cooldownSec}s cooldown`,
    lore: 'The off-hand makes its point with fire. It seldom requests a reply.',
  },
  coreflagration: {
    mark: '◆',
    line: 'A burning stone bursts on impact, then erupts a moment later. Parry the flying core to knock it aside.',
    facts: (s) => `${s.core.initialDamage} first burst · ${s.directDamage} final blast · ${s.burn.damage} burn · ${s.cooldownSec}s cooldown`,
    lore: 'The first burst is a warning only in the technical sense: it also hurts.',
  },
  frostfire: {
    mark: '❄',
    line: 'A fast bolt of cold that slows whoever it hits until they thaw.',
    facts: (s) => `${s.directDamage} impact · heavy chill ${s.chill.seconds}s · ${s.cooldownSec}s cooldown`,
    lore: 'The Spellblade prefers opponents who take time to compose themselves.',
  },
  gale: {
    mark: '≋',
    line: 'Release a cone of wind that carries enemies, bends projectiles, and can launch you when aimed at the ground.',
    facts: (s) => `Up to ${s.cone.damage} close damage · shove to ${s.cone.pressureReach}m · burst / balanced / sustained · ${s.cooldownSec}s cooldown`,
    lore: 'Atmospheric pressure bent to the Spellblade\'s command. Shape the gust on release into a sudden burst, balanced gale, or sustained carry.',
  },
  steel: {
    mark: '⛨',
    line: 'Harden your armor. Incoming hits glance off; Dash into a foe to ram them with your hardened plate.',
    facts: (s) => `${STEEL_RAM.damage} ram damage · heavy shove & Balance · ${STEEL.fullSec}s full strength · ${STEEL.fadeSec}s fade · ${s.cooldownSec}s cooldown`,
    lore: 'Hardened plate has made the Spellblade unusually confident about running into people.',
  },
});

// and each ultimate (player-facing category: MASTERSTROKE)
const ULTIMATE_WORDS = Object.freeze({
  one_hit_of_wonders: {
    // (main's words and its figures-from-the-rules form, with the fifth infusion and what each element now does)
    mark: '✦', line: 'A committed sword slam that fractures the ground. Earn Fire, Frost, Gale and Lightning infusions through separate spell encounters, and Steel by wearing Sheathe in Steel through unbroken.',
    facts: () => `${ONE_HIT_BASE_DAMAGE} PHYSICAL · +${ONE_HIT_FIRST_INFUSION_DAMAGE.fire} FIRE · +${ONE_HIT_FIRST_INFUSION_DAMAGE.frost} FROST · +${ONE_HIT_FIRST_INFUSION_DAMAGE.gale} GALE · +${ONE_HIT_FIRST_INFUSION_DAMAGE.lightning} LIGHTNING · +${ONE_HIT_FIRST_INFUSION_DAMAGE.steel} STEEL · FIRE: WIDER BLAST · FROST: SLOW · GALE: SHOVE · LIGHTNING: SHOCK · STEEL: INTERRUPT · FULL FIRE: BURNING GROUND · FULL FROST: FREEZE · FULL GALE: GROUND/AIR WAVE · FULL LIGHTNING: BLINK (3D WITH GALE) · FULL STEEL: 1 HP GUARD`,
    lore: 'Simple Sunder evidently did not account for the elements. The oversight has been corrected at considerable expense to the surrounding ground.',
  },
  sunder: {
    mark: '⚒',
    line: 'Every sword strike becomes a crushing downward blow. Hits interrupt actions, split the ground, and hammer through Guard.',
    facts: (u) => `${GAME.swordElevated} sword damage · double Guard impact · ${u.activeSec}s duration`,
    lore: 'Every strike is a verdict delivered from above. Guard takes the weight of two blows; hardened Steel is less impressed.',
  },
  chivalry: {
    mark: '⚔',
    line: 'Guard rises as Chivalry begins. For 10 seconds, Sprint, attack, Guard, Dash and cast together. Eligible attacks from the front are automatically parried while your Guard is ready. Draw from three prepared spells. The spell you finish with stays equipped for the match.',
    facts: (u) => `${u.activeSec}s · 3 prepared spells · rapid projectile casting · no parry reel`,
    lore: 'The Spellblade sees no reason to choose between swordplay, sorcery and self-preservation. The schedule is someone else’s concern.',
  },
  vortex: {
    mark: '✺',
    line: 'Spin through enemies with your blade and aimed fire. Move faster and fall slowly. Hold Attack for stronger fire or Guard for faster cuts.',
    facts: (u) => `${u.contact.damage} contact damage · Guard unavailable · ${u.activeSec}s duration`,
    lore: 'The sword goes round, the fire goes forward, and the Spellblade remains certain this counts as a plan.',
  },
});

export function armoryView(equipped, ultimate = 'sunder', technique = 'rigid_riposte') {
  return {
    blade: {
      name: 'Castleward longsword',
      facts: `Three-strike combo · ${GAME.swordGlance} to ${GAME.swordDamage} damage · guard and parry`,
    },
    techniques: SWORD_TECHNIQUES.map((tech) => ({
      id: tech.id,
      name: tech.name.toUpperCase(),
      mark: tech.mark,
      icon: tech.icon,
      line: tech.line,
      facts: tech.facts(GAME),
      lore: tech.lore,
      status: tech.status,
      disabled: tech.disabled,
      equipped: tech.id === technique,
    })),
    spells: Object.values(SPELLS).map((spell) => {
      const words = SPELL_WORDS[spell.id] ?? { mark: '◆', line: '', facts: () => `${spell.cooldownSec} s`, lore: '' };
      return {
        id: spell.id,
        name: spell.label.toUpperCase(),
        mark: words.mark,
        line: words.line,
        facts: words.facts(spell),
        lore: words.lore ?? '',
        equipped: spell.id === equipped,
      };
    }),
    ultimates: Object.values(ULTIMATES).map((u) => {
      const words = ULTIMATE_WORDS[u.id] ?? { mark: '◆', line: '', facts: () => `${u.activeSec} s`, lore: '' };
      return {
        id: u.id,
        name: u.label.toUpperCase(),
        mark: words.mark,
        line: words.line,
        facts: words.facts(u),
        lore: words.lore ?? '',
        equipped: u.id === ultimate,
      };
    }),
  };
}

/**
 * Chivalry's three prepared spells as the Armory shows them: a slot for each key (1, 2, 3), its spell's mark and name;
 * the starting spell's slot is fixed (★), any other is changed one way or the other (`previous`, `next`) among the
 * spells that are not already in another slot.
 */
export function preparedArmoryView(starting, ids) {
  const prepared = normalizePreparedSpells(starting, ids);
  return prepared.map((id, slot) => {
    const others = prepared.filter((_, i) => i !== slot);
    const choices = Object.keys(SPELLS).filter((spell) => spell === id || !others.includes(spell));
    const at = choices.indexOf(id);
    const fixed = id === starting || choices.length < 2;
    const words = SPELL_WORDS[id] ?? { mark: '◆' };
    return {
      slot, key: slot + 1, id, name: SPELLS[id].label.toUpperCase(), mark: words.mark, starting: id === starting,
      previous: fixed ? null : choices[(at - 1 + choices.length) % choices.length],
      next: fixed ? null : choices[(at + 1) % choices.length],
    };
  });
}
