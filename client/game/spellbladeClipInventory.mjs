// Model/sidecar reconciliation without loading the browser-only Three.js module.
// Track ownership remains singular: the latest legs and spatial root; PR #457's
// corrected upper-body Slash_1 (torso and sword) on the compatible skin, but only
// for a model whose manifest still asks for it (`motionOverrides`, default
// ['Slash_1']): a model that carries its own corrected first cut (Argon's
// de8c8655) declares [] and is played as authored, not hidden under the old one.
// Every other canonical clip wins; technique phases are appended if absent.
const lowerBody = (name) => /^(?:root|pelvis|thigh[.]|shin[.]|foot[.]|ankle[.]|knee[.]|tabard_|crest_)/.test(name);
function composedFirstSlash(canonical, corrected) {
  if (!Array.isArray(canonical?.tracks) || !Array.isArray(corrected?.tracks)) return canonical;
  const upper = corrected.tracks.filter(track => !lowerBody(track.name));
  if (!upper.length) return canonical;
  const correctedChannels = new Set(upper.map(track => track.name));
  const existing = canonical.tracks.filter(track => lowerBody(track.name) || !correctedChannels.has(track.name));
  const combined = [...existing, ...upper];
  if (new Set(combined.map(track => track.name)).size !== combined.length)
    throw new Error('duplicate animation channel in Slash_1 composition');
  // Both assets use the same joint names and compatible bind matrices.
  // No layered double-play or root-motion transform is introduced.
  return new canonical.constructor(canonical.name, canonical.duration, combined);
}
export function withMotionClips(own, motion, { overrides = ['Slash_1'] } = {}) {
  if (!motion?.length) return own;
  const ownNames = new Set(own.map(clip => clip.name));
  const corrected = overrides.includes('Slash_1') ? motion.find(clip => clip.name === 'Slash_1') : null;
  return [...own.map(clip => clip.name === 'Slash_1' && corrected ? composedFirstSlash(clip,corrected) : clip),
    ...motion.filter(clip => !ownNames.has(clip.name))];
}
