const REQUIRED_CLIPS = Object.freeze([
  'Idle',
  'Run',
  'Sprint',
  'Air',
  'Guard',
  'Slash_1',
  'Slash_2',
  'Slash_3',
  'Cast',
  'Dash',
  'Stagger',
  'Death',
]);

const REQUIRED_SOCKETS = Object.freeze(['socket_sword', 'socket_sorcery']);
const REQUIRED_MUTABLE_MATERIALS = Object.freeze(['VisorGlow', 'SorceryAccent']);
const SHA40 = /^[0-9a-f]{40}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requirePositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
  return value;
}

function requireStringList(value, required, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  for (const name of required) if (!value.includes(name)) throw new Error(`${label} must include ${name}`);
  return Object.freeze([...value]);
}

function freezeBudget(raw, label) {
  const value = requireObject(raw, label);
  return Object.freeze({
    maxTriangles: requirePositiveNumber(value.maxTriangles, `${label}.maxTriangles`),
    targetBytes: requirePositiveNumber(value.targetBytes, `${label}.targetBytes`),
  });
}

export function loadSpellbladeContract(raw) {
  const value = requireObject(raw, 'Spellblade asset contract');
  if (value.version !== 1) throw new Error('Spellblade asset contract version must be 1');
  if (value.facing !== '-Z') throw new Error('Spellblade asset facing must be -Z');
  if (value.up !== '+Y') throw new Error('Spellblade asset up axis must be +Y');
  if (value.unitMeters !== 1) throw new Error('Spellblade asset unitMeters must be 1');

  return Object.freeze({
    version: 1,
    facing: '-Z',
    up: '+Y',
    unitMeters: 1,
    clips: requireStringList(value.clips, REQUIRED_CLIPS, 'clips'),
    sockets: requireStringList(value.sockets, REQUIRED_SOCKETS, 'sockets'),
    mutableMaterials: requireStringList(value.mutableMaterials, REQUIRED_MUTABLE_MATERIALS, 'mutableMaterials'),
    thirdPerson: freezeBudget(value.thirdPerson, 'thirdPerson'),
    firstPerson: freezeBudget(value.firstPerson, 'firstPerson'),
  });
}

export function runtimeSpellbladeManifest(contract, raw) {
  const value = requireObject(raw, 'Spellblade runtime manifest');
  const sourceRevision = String(value.sourceRevision || '').toLowerCase();
  if (!SHA40.test(sourceRevision)) {
    throw new Error('Spellblade source revision must be a 40-character lowercase hexadecimal SHA');
  }

  const base = '/assets/characters/spellblade';
  return Object.freeze({
    version: 1,
    sourceRevision,
    thirdPerson: Object.freeze({
      url: `${base}/spellblade.glb?v=${sourceRevision}`,
      clips: contract.clips,
    }),
    firstPerson: Object.freeze({
      url: `${base}/spellblade-fp.glb?v=${sourceRevision}`,
    }),
    sockets: contract.sockets,
    mutableMaterials: contract.mutableMaterials,
  });
}
