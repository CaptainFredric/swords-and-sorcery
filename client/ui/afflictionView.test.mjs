import assert from 'node:assert/strict';
import test from 'node:test';
import { AFFLICTIONS, afflictionView } from './afflictionView.mjs';

const player = overrides => ({ id: 'me', alive: true, ...overrides });
const find = (effects, id) => effects.find(effect => effect.id === id);

test('all Disaster ailments, burn, Chill, Stagger and field appear independently without invented statuses', () => {
  const effects = afflictionView(player({
    oneHitFrozenUntil: 10.9,
    staggerUntil: 11,
    electricalBacklash: { at: 10, initial: 12 },
    blustered: { at: 10, severity: 1 },
    shaken: { at: 10, severity: 1 },
    burningUntil: 12,
    chill: { startedAt: 10, until: 13, slow: .55 },
    oneHitFrostSlow: { until: 13.8, depth: .35 },
    oneHitField: { id: 'rupture', ownerId: 'enemy', strength: .7 },
    tornGround: true,
  }), 10);
  assert.deepEqual(effects.map(effect => effect.id),
    ['frozen', 'staggered', 'conduct', 'blustered', 'shaken',
     'burning', 'chilled', 'frostbound', 'tornGround', 'rupture']);
  for (const effect of effects) {
    assert.equal(effect.name, AFFLICTIONS[effect.id].name);
    assert.ok(effect.icon.startsWith('affliction'));
    assert.ok(effect.description.length > 25);
    assert.ok(effect.strength > 0 && effect.strength <= 1);
    assert.equal(/(?:\d+\s*(?:s|sec|seconds)|%)/i.test(effect.description), false,
      'no timer or percentage in the detail panel');
  }
});

test('the HUD draws potency, not a fake duration countdown', () => {
  const snapshot = player({
    oneHitFrozenUntil: 10.9,
    staggerUntil: 10.9,
    burningUntil: 11,
    electricalBacklash: { at: 10, initial: 12 },
    blustered: { at: 10, severity: 1 },
    shaken: { at: 10, severity: 1 },
    chill: { startedAt: 10, until: 13, slow: .55 },
    oneHitFrostSlow: { until: 13, depth: .2 },
  });
  const early = afflictionView(snapshot, 10.1);
  const late = afflictionView(snapshot, 10.6);
  for (const fixed of ['frozen', 'staggered', 'burning', 'frostbound']) {
    assert.equal(find(early, fixed).strength, find(late, fixed).strength,
      fixed + ' does not weaken in combat; the icon must not pretend otherwise');
  }
  for (const fading of ['conduct', 'blustered', 'shaken', 'chilled']) {
    assert.ok(find(early, fading).strength > find(late, fading).strength, fading);
  }
  assert.equal(find(afflictionView(snapshot, 11), 'frozen'), undefined);
  assert.equal(find(afflictionView(snapshot, 11), 'staggered'), undefined);
  assert.equal(find(afflictionView(snapshot, 11), 'burning'), undefined);
  assert.equal(find(afflictionView(snapshot, 14), 'conduct'), undefined);
});

test('a glancing Chill displays less strength than a full Frostfire hit', () => {
  const mild = afflictionView(player({ chill: { startedAt: 10, until: 13, slow: .11 } }), 10);
  const full = afflictionView(player({ chill: { startedAt: 10, until: 13, slow: .55 } }), 10);
  assert.ok(find(mild, 'chilled').strength < find(full, 'chilled').strength);
  assert.ok(find(mild, 'chilled').strength < .25);
});

test('field entry and Frost status follow authoritative strength and ownership', () => {
  const local = player({
    oneHitField: { id: 'x', ownerId: 'other', strength: .26 },
    oneHitFrostSlow: { until: 24, depth: .1 },
    electricalBacklash: { at: 20, initial: 4 },
  });
  const effects = afflictionView(local, 20);
  assert.equal(find(effects, 'rupture').strength, .26);
  assert.ok(find(effects, 'frostbound').strength < .3);
  assert.ok(find(effects, 'conduct').strength < .34);
  const self = afflictionView(player({ ...local, oneHitField: { ownerId: 'me', strength: 1 } }), 20);
  assert.equal(find(self, 'rupture'), undefined, 'your own rupture should not warn of hostile field drain');
});

test('dead, missing, or invalid snapshots have no interactive afflictions', () => {
  assert.deepEqual(afflictionView(null, 10), []);
  assert.deepEqual(afflictionView({ alive: false, burningUntil: 300 }, 10), []);
  assert.deepEqual(afflictionView(player({ burningUntil: 300 }), Number.NaN), []);
  assert.deepEqual(afflictionView(player({}), 10), []);
  const torn = afflictionView(player({tornGround:true}),10);
  assert.equal(torn[0].name,'Torn Ground');
  assert.equal(torn[0].strength,1);
});
