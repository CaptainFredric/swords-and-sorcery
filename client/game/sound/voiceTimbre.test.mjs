import test from 'node:test';
import assert from 'node:assert/strict';
import { OTHER_KNIGHTS, TIMBRE, VoiceTimbre } from './voiceTimbre.mjs';
import { VOICE_LINES, voiceRate } from './voiceRules.mjs';
import { VoiceBank } from './VoiceBank.mjs';

// Each other knight is given a timbre of his own: the same knight's tone, as if another man said it behind another
// helm (voiceTimbre.mjs). Mine is never touched.

test('each other knight sounds like himself every time, and not like the next: the same tone, another man', () => {
  const timbre = new VoiceTimbre();
  const ids = ['alpha', 'beta', 'gamma', 'delta', 'e29636d3-c1f7', 'bot-1', 'bot-2'];
  const all = ids.map((id) => timbre.of(id));
  assert.deepEqual(timbre.of('alpha'), new VoiceTimbre().of('alpha'), 'from the id alone: the same wherever he is heard');
  for (const t of all) {
    assert.ok(Math.abs(t.rate - 1) <= TIMBRE.rate, 'pitch within two thirds of a semitone: the same voice');
    assert.ok(t.drive >= TIMBRE.drive[0] && t.drive <= TIMBRE.drive[1] && t.wet >= TIMBRE.wet[0] && t.wet <= TIMBRE.wet[1], 'a little rougher than mine');
    assert.ok(t.resonance.freq >= TIMBRE.resonance.low && t.resonance.freq <= TIMBRE.resonance.high);
    assert.ok(t.chest >= TIMBRE.chest[0] && t.air <= TIMBRE.air[1]);
  }
  // no two alike: their helms ring in different places, at different pitches
  assert.equal(new Set(all.map((t) => Math.round(t.resonance.freq / 25))).size, ids.length);
  assert.equal(new Set(all.map((t) => t.rate.toFixed(4))).size, ids.length);
  // the pitch the game plays another knight at is his timbre's
  assert.equal(voiceRate('beta'), OTHER_KNIGHTS.of('beta').rate);
});

// a toy audio context: every node it makes, and what connects to what
function context() {
  const made = [];
  const node = (kind) => {
    const n = { kind, links: [], connect(to) { n.links.push(to); return to; }, frequency: { value: 0 }, gain: { value: 1 }, Q: { value: 1 } };
    made.push(n);
    return n;
  };
  return { made, createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createWaveShaper: () => node('shaper') };
}

test('his timbre as nodes: chest and air, his helm\'s ring, and the grit mixed under the clean voice', () => {
  const ctx = context();
  const { input, output, nodes } = new VoiceTimbre().build(ctx, 'alpha');
  const t = OTHER_KNIGHTS.of('alpha');
  const filters = nodes.filter((n) => n.kind === 'filter');
  assert.deepEqual(filters.map((f) => f.type), ['highpass', 'peaking', 'lowpass']);
  assert.equal(filters[1].frequency.value, t.resonance.freq);
  const shaper = nodes.find((n) => n.kind === 'shaper');
  assert.ok(shaper.curve.length > 100 && Math.abs(shaper.curve.at(-1) - Math.tanh(t.drive)) < 1e-6);
  // both the clean and the driven voice reach the output (every word survives the grit)
  const reaches = (from, to, seen = new Set()) => from === to || (!seen.has(from) && (seen.add(from), from.links.some((next) => reaches(next, to, seen))));
  assert.ok(reaches(input, output));
  assert.ok(reaches(shaper, output));
  assert.equal(output.links.length, 0, 'the line connects it on to the voice bus itself');
  // level-neutral through the body of the voice: the driven half rises as steeply as the clean one there
  const wet = shaper.links[0];
  const dry = nodes.find((n) => n.kind === 'gain' && n !== input && n !== output && n !== wet);
  assert.ok(Math.abs(dry.gain.value + wet.gain.value * t.drive - 1) < 1e-9);
});

test('another knight\'s line moves with him while he speaks; mine never does', () => {
  const placed = [];
  let now = 0;
  const engine = {
    running: true, get now() { return now; }, onReady() {},
    playBuffer: () => ({ stop() {}, place: (to) => placed.push(to) }),
  };
  const bank = new VoiceBank(engine, { base: '/nowhere/' });
  bank.takes.set('chargeDefeat', [{ duration: 5 }]);
  bank.director.rand = () => 0;
  assert.ok(bank.say('chargeDefeat', { speaker: 'rival', force: true }));
  assert.equal(bank.speakingLine('rival'), 'chargeDefeat');
  bank.place('rival', { pan: 0.3, gain: 0.7 });
  assert.deepEqual(placed, [{ pan: 0.3, gain: 0.7 * VOICE_LINES.chargeDefeat.gain }]);
  now = 6;
  assert.equal(bank.speakingLine('rival'), null, 'said and done: nothing left to move');
  bank.director.speaking.clear();
  bank.director.sentence = null;
  bank.director.lastSpoke.clear();
  assert.ok(bank.say('chargeDefeat', { speaker: 'me', close: true, force: true }));
  bank.place('me', { pan: 1, gain: 0.1 });
  assert.equal(bank.speakingLine('me'), null);
  assert.equal(placed.length, 1, 'my own voice stays where it is: in my helm');
});

test('another knight\'s line plays through his timbre; mine plays as recorded', async () => {
  const played = [];
  const engine = {
    running: true, now: 0, onReady() {},
    playBuffer: (buffer, options) => { played.push(options); return { stop() {} }; },
  };
  const bank = new VoiceBank(engine, { base: '/nowhere/' });
  bank.takes.set('killTaunt', [{ duration: 1 }]);
  bank.director.rand = () => 0;
  assert.ok(bank.say('killTaunt', { speaker: 'other', force: true }));
  assert.equal(typeof played[0].shape, 'function');
  bank.director.speaking.clear();
  bank.director.lastSpoke.clear();
  bank.director.sentence = null;
  assert.ok(bank.say('killTaunt', { speaker: 'me', close: true, force: true }));
  assert.equal(played[1].shape, undefined, 'my own voice is dry');
});

test('a knight cut off (felled, or as he rises again) is no longer speaking: his caption goes, and others may speak', () => {
  const played = [];
  const engine = { running: true, now: 0, onReady() {}, playBuffer: (b, o) => { played.push(o); return { stop() {} }; } };
  const bank = new VoiceBank(engine, { base: '/nowhere/' });
  bank.takes.set('remainStaggered', [{ duration: 3 }]);
  bank.takes.set('killTaunt', [{ duration: 1 }]);
  bank.director.rand = () => 0;
  const cut = [];
  bank.onCut = (speaker) => cut.push(speaker);
  assert.ok(bank.say('remainStaggered', { speaker: 'me', close: true, force: true }));
  bank.cut('me');
  assert.deepEqual(cut, ['me']);
  assert.ok(bank.say('killTaunt', { speaker: 'other', force: true }), 'his sentence is over: another knight may speak');
});
