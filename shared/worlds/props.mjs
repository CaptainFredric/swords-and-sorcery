// A world's furnishings (barrels, crates, a rack of practice blades...), as data both sides share: the renderer draws
// each prop in a world's `props` list, and each kind that stands in the way also becomes a solid of its size, the same
// for a knight walking into it and for a blade swung through it. What only decorates (flowers, a pennant on a post that
// is itself solid) stands in nobody's way. One table, not a rule per prop: a new prop kind is a new row here.
//
// A kind's footprint is given along its own facing (`width` across it, `depth` along it); facings are quarter turns.
// `incidental`: a small, loose furnishing a blade can catch in passing (a barrel's rim, a crate's corner, a lantern
// post, the rack of practice blades), as against a pile or a butt that is the thing itself. What a knight says when
// his blade snags on one is the voice's business (a rare line); nothing about the blow changes.

export const PROP_KINDS = Object.freeze({
  barrel: Object.freeze({ width: 0.64, depth: 0.64, height: 0.84, material: 'timber', incidental: true }),
  crate: Object.freeze({ width: 0.68, depth: 0.68, height: 0.62, stacked: 1.22, material: 'timber', incidental: true }),
  // split logs, stacked three rows high, their cut ends out (length: how long the logs are, along the facing)
  woodpile: Object.freeze({ width: 0.98, height: 0.64, material: 'timber' }),
  sacks: Object.freeze({ width: 0.8, depth: 0.8, height: 0.46, material: 'cloth', incidental: true }),
  lantern: Object.freeze({ width: 0.2, depth: 0.2, height: 2.5, material: 'timber', incidental: true }),
  target: Object.freeze({ width: 1.2, depth: 0.6, height: 1.6, material: 'straw' }),
  rack: Object.freeze({ width: 1.7, depth: 0.25, height: 1.3, material: 'timber', incidental: true }),
  // an army's furnishings (the siege grounds): a pavilion tent in its side's colours; a two-wheeled supply cart, its
  // shafts down (length along its facing); a brazier on its stone foot; a side's standard on its pole (the pole is what
  // stands); a row of sharpened stakes, a cheval-de-frise (length across its facing); a smith's anvil on its block; a
  // heap of ore or coal by a forge
  tent: Object.freeze({ width: 3.4, depth: 3.4, height: 2.6, material: 'cloth' }),
  cart: Object.freeze({ width: 1.5, depth: 2.7, height: 1.25, material: 'timber' }),
  brazier: Object.freeze({ width: 0.62, depth: 0.62, height: 1.3, material: 'stone' }),
  standard: Object.freeze({ width: 0.2, depth: 0.2, height: 4.2, material: 'timber', incidental: true }),
  stakes: Object.freeze({ width: 3, depth: 0.9, height: 1.05, material: 'timber' }),
  anvil: Object.freeze({ width: 0.55, depth: 0.95, height: 0.82, material: 'iron' }),
  ore: Object.freeze({ width: 1.4, depth: 1.4, height: 0.6, material: 'stone' }),
  flowers: null,
  pennant: null,
  // what grows in the dark under a great tree's roots: soft glowing caps at the foot of a wall or a root
  fungus: null,
});

/** The solid a prop stands as (a box for bodies and blades alike), or null for one that stands in nobody's way. */
export function propSolid(prop) {
  const kind = PROP_KINDS[prop.kind];
  if (!kind) return null;
  const quarter = Math.round((prop.facing ?? 0) / (Math.PI / 2));
  const turned = Math.abs(quarter) % 2 === 1;
  const width = prop.kind === 'stakes' ? prop.length ?? kind.width : kind.width;
  const depth = prop.kind === 'woodpile' ? prop.length ?? 2 : kind.depth;
  const height = prop.kind === 'crate' && prop.stack ? kind.stacked : kind.height;
  const base = prop.y ?? 0;
  // (width runs across the facing: along x unfaced, along z a quarter turn round)
  const sx = turned ? depth : width;
  const sz = turned ? width : depth;
  return {
    id: prop.id,
    center: [prop.x, base + height / 2, prop.z],
    size: [sx, height, sz],
    material: kind.material,
    kind: 'prop',
    prop: prop.kind,
    ...(kind.incidental ? { incidental: true } : {}),
  };
}

/** The solids of a list of props (those that stand). */
export function propSolids(props) {
  return props.map(propSolid).filter(Boolean);
}
