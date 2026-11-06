// Castleward's institutional mark is Grimoirelee. Earned heralds remain personal back-banner choices.
// Legacy profile/wire value 'trident' is a compatibility alias, never a separate selectable mark.
// Model-specific earned and default banner textures are indexed by material name.

import { CHALLENGE_PREVIEWS } from './challenges.mjs';

export const DEFAULT_EMBLEM = 'grimoirelee';
export const LEGACY_EMBLEM = 'trident';
export const canonicalEmblemId = (id) => id === LEGACY_EMBLEM ? DEFAULT_EMBLEM : id;

const emblem = (id, name, description, { flavor = null, challenge = null, banners = {}, art = null, available = true } = {}) =>
  Object.freeze({ id, name, description, flavor, challenge, banners: Object.freeze({ ...banners }), art, available });

export const EMBLEMS = Object.freeze({
  grimoirelee: emblem('grimoirelee', 'Grimoirelee', 'Castleward’s sword conjured from an open grimoire, worn by every knight of the yard.', {
    art: '/client/assets/heraldry/grimoirelee.svg',
  }),
  seize_thy_slayer: emblem('seize_thy_slayer', 'Seize Thy Slayer', 'A gauntlet closed on a burning blade.', {
    flavor: 'Leverage comes with an edge.',
    challenge: 'seize_thy_slayer',
    banners: {
      KitBanner: '/client/assets/heraldry/seize-thy-slayer-banner.jpg',
      CapeBanner: '/client/assets/heraldry/seize-thy-slayer-cape.jpg',
    },
    art: '/client/assets/heraldry/seize-thy-slayer.png',
  }),
  st_perry_the_plain: emblem('st_perry_the_plain', 'St. Perry the Plain', "Perry's helmet and askew halo, cleaved by a blade.", {
    flavor: 'I suppose anyone can become a saint... these days.',
    challenge: 'st_perry_the_plain',
    banners: {
      KitBanner: '/client/assets/heraldry/st-perry-the-plain-banner.jpg',
      CapeBanner: '/client/assets/heraldry/st-perry-the-plain-cape.jpg',
    },
    art: '/client/assets/heraldry/st-perry-the-plain.png',
    available: true,
  }),
  mutual_mortality: emblem('mutual_mortality', 'Mutual Mortality', CHALLENGE_PREVIEWS.mutual_mortality.condition, {
    flavor: CHALLENGE_PREVIEWS.mutual_mortality.flavor,
    challenge: 'mutual_mortality', available: false,
  }),
});

export function isEmblem(id) { return typeof id === 'string' && Object.hasOwn(EMBLEMS, canonicalEmblemId(id)); }
export function emblemChoice(id) { return isEmblem(id) ? EMBLEMS[canonicalEmblemId(id)] : EMBLEMS[DEFAULT_EMBLEM]; }

/** The emblems a profile's completed challenges have earned (Grimoirelee always). */
export function ownedEmblems(challenges) {
  const completed = challenges?.completed ?? {};
  return Object.values(EMBLEMS).filter((e) => e.available && (!e.challenge || Boolean(completed[e.challenge]))).map((e) => e.id);
}
