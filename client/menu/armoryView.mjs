// What the Armory shows: the Spellblade's kit, slot by slot. The spell cards come from the shared spell table, so a
// spell added there appears here with its own words. Pure, so the wording can be tested.

import { GAME } from '../../shared/src/combat.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { STEEL } from '../../shared/src/steel.mjs';
import { STEEL_RAM } from '../../shared/src/steelRam.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { normalizePreparedSpells } from '../../shared/src/preparedSpells.mjs';

// Preview only until their authoritative controls and contact rules ship.
export const SWORD_TECHNIQUES = Object.freeze([
  {
    id: 'rigid_riposte',
    name: 'Rigid Riposte',
    mark: '⇏',
    icon: 'attack',
    line: 'A committed forward sword thrust that intercepts and parries incoming attacks along its startup path.',
    facts: () => '~20–25 damage · ~10s cooldown · physical interception parry',
    lore: "Sword technique in development. The Spellblade's tutors are drilling the recovery posture; not yet authorized for tournament combat.",
    status: 'IN TRAINING',
    disabled: true,
  },
  {
    id: 'whirl_wind',
    name: 'Whirl Like the Wind',
    mark: '↻',
    icon: 'vortex',
    line: 'A full 360° mobile sword sweep. Can be sustained by expending Prowess energy; synergizes with Gale Garner.',
    facts: () => 'Directional blade guard · ~8–12s cooldown · Prowess sustain',
    lore: 'Sword technique in development. Rotational balance and physical footing are still being mastered under live sparring conditions.',
    status: 'IN TRAINING',
    disabled: true,
  },
]);

// how each spell reads in the Armory: what it is like, then plainly what it does
const SPELL_WORDS = Object.freeze({
  line_of_conduct: {
    mark:'ϟ',
    line:'A lightning line whose direct damage diminishes over distance; dangerous conduction persists briefly along the path.',
    facts:(s)=>`20 close → 12 extreme · ${s.cooldownSec}s cooldown`,
    lore:'Arcing lightning conduit. An instantaneous linear discharge that punishes tight formations and leaves an energized trace across the ground.',
  },
  fireball: {
    mark: '✦',
    line: 'Explodes on impact and burns enemies caught near the blast.',
    facts: (s) => `${s.directDamage} impact · ${s.burn.damage} burn · ${s.cooldownSec}s cooldown`,
    lore: 'The classic martial sorcery. Concentrated flame gathered in the off-hand and cast with destructive conviction.',
  },
  coreflagration: {
    mark: '◆',
    line: 'A burning stone bursts on impact, then erupts a moment later. Parry the flying core to knock it aside.',
    facts: (s) => `${s.core.initialDamage} first burst · ${s.directDamage} final blast · ${s.burn.damage} burn · ${s.cooldownSec}s cooldown`,
    lore: 'Dense volcanic pyromancy. A hurled magma core cracks on initial contact, creating a delayed explosive threat that skilled fighters can parry away.',
  },
  frostfire: {
    mark: '❄',
    line: 'A fast bolt of cold that slows whoever it hits until they thaw.',
    facts: (s) => `${s.directDamage} impact · heavy chill ${s.chill.seconds}s · ${s.cooldownSec}s cooldown`,
    lore: 'Glacial bolt. Drains momentum upon contact, drastically reducing target movement and sprint speed during critical maneuvers.',
  },
  gale: {
    mark: '≋',
    line: 'Release a cone of wind that carries enemies, bends projectiles, and can launch you when aimed at the ground.',
    facts: (s) => `Up to ${s.cone.damage} damage · ${s.cone.pressureReach}m reach · burst / balanced / sustained · ${s.cooldownSec}s cooldown`,
    lore: 'Atmospheric pressure bent to the Spellblade\'s command. Shape the gust on release into a sudden burst, balanced gale, or sustained carry.',
  },
  steel: {
    mark: '⛨',
    line: 'Harden your armor. Incoming hits glance off; Dash into a foe to ram them with your hardened plate.',
    facts: (s) => `${STEEL_RAM.damage} ram damage · heavy shove & Balance · ${STEEL.fullSec}s full strength · ${STEEL.fadeSec}s fade · ${s.cooldownSec}s cooldown`,
    lore: 'An ancient chivalric ward that fortifies armor plates. Incoming attacks glance off while your Dash transforms into a devastating physical ram.',
  },
});

// and each ultimate (player-facing category: MASTERSTROKE)
const ULTIMATE_WORDS = Object.freeze({
  one_hit_of_wonders: {
    mark: '✦', line: 'Simple Sunder: a spinning sword strike and rock-breaking slam. Earn Fire, Frost, Gale and Lightning separately from real spell encounters.',
    facts: () => '40 PHYSICAL · +13 FIRE · +11 FROST · +8 GALE · +12 LIGHTNING · FULL GALE: AERIAL · FULL LIGHTNING: BLINK',
    lore: 'All-Natural Disaster channels multiple elemental aspects through the blade. Builds upon physical Sunder with distinct aerial and blink infusions.',
  },
  sunder: {
    mark: '⚒',
    line: 'Every sword strike becomes a crushing downward blow. Hits interrupt actions, split the ground, and hammer through Guard.',
    facts: (u) => `${GAME.swordElevated} sword damage · double Guard impact · ${u.activeSec}s duration`,
    lore: 'Pure martial overwhelm. Each heavy strike splits stone beneath your feet, bypassing ordinary Guard and breaking defensive stances.',
  },
  chivalry: {
    mark: '⚔',
    line: 'Guard rises as Chivalry begins. For 10 seconds, Sprint, attack, Guard, Dash and cast together. Eligible attacks from the front are automatically parried while your Guard is ready. Draw from three prepared spells. The spell you finish with stays equipped for the match.',
    facts: (u) => `${u.activeSec}s · 3 prepared spells · rapid projectile casting · no parry reel`,
    lore: 'The apex of Spellblade doctrine. Seamlessly weaves concurrent swordplay, automatic parrying, and prepared spell rotations without posture delay.',
  },
  vortex: {
    mark: '✺',
    line: 'Spin through enemies with your blade and aimed fire. Move faster and fall slowly. Hold Attack for stronger fire or Guard for faster cuts.',
    facts: (u) => `${u.contact.damage} contact damage · Guard unavailable · ${u.activeSec}s duration`,
    lore: 'An unstoppable offensive whirlwind. Ignites the blade and propels the Spellblade forward in a mobile blaze of cuts and projectiles.',
  },
});

export function armoryView(equipped, ultimate = 'sunder') {
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
      equipped: false,
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
