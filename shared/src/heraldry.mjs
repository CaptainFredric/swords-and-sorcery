// The emblem a Spellblade carries on his back banner (the large cloth behind him). The trident is Castleward's own
// symbol and every knight's from the start; it stays on the front tabard, the castle's banners and every small surface
// whatever is chosen here. An earned emblem is shown only where it has room to read: the back banner, and its card in
// the Armory. Each earned emblem is unlocked by one challenge (shared/src/challenges.mjs), and owned once that
// challenge is complete: the profile's completed feats are the record, nothing else is stored for it.
//
// banners: the emblem's back-banner texture for each kind of banner cloth a model may have, by its material's name:
//   KitBanner: the kit's banner atlas with the emblem on the back banner's half (the front tabard's half unchanged);
//   CapeBanner: a cape with a texture of its own (the supplied Spellblade's), its sign replaced by the emblem.

import { CHALLENGE_PREVIEWS } from './challenges.mjs';

export const DEFAULT_EMBLEM = 'trident';

const emblem = (id, name, description, { flavor = null, challenge = null, banners = {}, art = null, available = true } = {}) =>
  Object.freeze({ id, name, description, flavor, challenge, banners: Object.freeze({ ...banners }), art, available });

export const EMBLEMS = Object.freeze({
  trident: emblem('trident', 'Castleward Trident', 'The castle\'s own sign, worn by every knight of the yard.'),
  seize_thy_slayer: emblem('seize_thy_slayer', 'Seize Thy Slayer', 'A gauntlet closed on a burning blade.', {
    flavor: 'Leverage comes with an edge.',
    challenge: 'seize_thy_slayer',
    banners: {
      KitBanner: '/client/assets/heraldry/seize-thy-slayer-banner.jpg',
      CapeBanner: '/client/assets/heraldry/seize-thy-slayer-cape.jpg',
    },
    art: '/client/assets/heraldry/seize-thy-slayer.png',
  }),
  mutual_mortality: emblem('mutual_mortality', 'Mutual Mortality', CHALLENGE_PREVIEWS.mutual_mortality.condition, {
    flavor: CHALLENGE_PREVIEWS.mutual_mortality.flavor,
    challenge: 'mutual_mortality', available: false,
  }),
});

export function isEmblem(id) { return typeof id === 'string' && Object.hasOwn(EMBLEMS, id); }
export function emblemChoice(id) { return isEmblem(id) ? EMBLEMS[id] : EMBLEMS[DEFAULT_EMBLEM]; }

/** The emblems a profile's completed challenges have earned (the trident always). */
export function ownedEmblems(challenges) {
  const completed = challenges?.completed ?? {};
  return Object.values(EMBLEMS).filter((e) => e.available && (!e.challenge || Boolean(completed[e.challenge]))).map((e) => e.id);
}
