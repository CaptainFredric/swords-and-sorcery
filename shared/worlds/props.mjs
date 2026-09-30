// A world's furnishings (barrels, crates, a rack of practice blades...), as data both sides share: the renderer draws
// each prop in a world's `props` list, and each kind that stands in the way also becomes a solid of its size, the same
// for a knight walking into it and for a blade swung through it. What only decorates (flowers, a pennant on a post that
// is itself solid) stands in nobody's way. One table, not a rule per prop: a new prop kind is a new row here.
//
// A kind's footprint is given along its own facing (`width` across it, `depth` along it); facings are quarter turns.

export const PROP_KINDS = Object.freeze({
  barrel: Object.freeze({ width: 0.64, depth: 0.64, height: 0.84, material: 'timber' }),
  crate: Object.freeze({ width: 0.68, depth: 0.68, height: 0.62, stacked: 1.22, material: 'timber' }),
  // split logs, stacked three rows high, their cut ends out (length: how long the logs are, along the facing)
  woodpile: Object.freeze({ width: 0.98, height: 0.64, material: 'timber' }),
  sacks: Object.freeze({ width: 0.8, depth: 0.8, height: 0.46, material: 'cloth' }),
  lantern: Object.freeze({ width: 0.2, depth: 0.2, height: 2.5, material: 'timber' }),
  target: Object.freeze({ width: 1.2, depth: 0.6, height: 1.6, material: 'straw' }),
  rack: Object.freeze({ width: 1.7, depth: 0.25, height: 1.3, material: 'timber' }),
  flowers: null,
  pennant: null,
});

/** The solid a prop stands as (a box for bodies and blades alike), or null for one that stands in nobody's way. */
export function propSolid(prop) {
  const kind = PROP_KINDS[prop.kind];
  if (!kind) return null;
  const quarter = Math.round((prop.facing ?? 0) / (Math.PI / 2));
  const turned = Math.abs(quarter) % 2 === 1;
  const width = kind.width;
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
  };
}

/** The solids of a list of props (those that stand). */
export function propSolids(props) {
  return props.map(propSolid).filter(Boolean);
}
