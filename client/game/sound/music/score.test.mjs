import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTLE, battleBars, CHORDS, HALL, hallBars, midiToFreq, noteToMidi, parseLine, STINGERS } from './score.mjs';
import { INSTRUMENT_LEVELS } from './MusicPlayer.mjs';

const pitchClass = (midi) => ((midi % 12) + 12) % 12;
const classes = (names) => new Set(names.map((name) => pitchClass(noteToMidi(`${name}4`))));
const D_DORIAN = classes(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
// natural minor, plus the raised seventh the A major chord leans on
const D_MINOR = classes(['D', 'E', 'F', 'G', 'A', 'Bb', 'C', 'C#']);

function take(generator, count) {
  const bars = [];
  for (let i = 0; i < count; i += 1) bars.push(generator.next().value);
  return bars;
}

test('note names read as MIDI numbers and frequencies', () => {
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('Bb2'), 46);
  assert.equal(noteToMidi('C#4'), 61);
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(noteToMidi('D3')) - 146.83) < 0.01, 'the bell of the keep is tuned to this D');
  assert.throws(() => noteToMidi('H2'));
  assert.deepEqual(parseLine('D5:1 r:.5 A4:1.5'), [[{ midi: 74, beats: 1 }, { midi: null, beats: 0.5 }, { midi: 69, beats: 1.5 }]]);
});

test('every written bar fills its meter exactly', () => {
  for (const piece of [HALL, BATTLE]) {
    for (const [name, line] of Object.entries(piece.melody)) {
      line.forEach((bar, i) => {
        const beats = bar.reduce((sum, note) => sum + note.beats, 0);
        assert.equal(beats, piece.beatsPerBar, `${piece.name} ${name} bar ${i + 1}`);
      });
      const chords = name === 'call' ? piece.chords.B : piece.chords.A;
      assert.equal(line.length, chords.length, `${piece.name} ${name} has a bar for every chord`);
    }
  }
});

test('the melodies stay in their modes, and every chord voicing is in the key', () => {
  for (const line of Object.values(HALL.melody)) {
    for (const note of line.flat()) if (note.midi !== null) assert.ok(D_DORIAN.has(pitchClass(note.midi)), `hall note ${note.midi}`);
  }
  for (const line of Object.values(BATTLE.melody)) {
    for (const note of line.flat()) if (note.midi !== null) assert.ok(D_MINOR.has(pitchClass(note.midi)), `battle note ${note.midi}`);
  }
  for (const chord of new Set(Object.values(HALL.chords).flat())) {
    for (const midi of CHORDS[chord].lute) assert.ok(D_DORIAN.has(pitchClass(midi)), `hall chord ${chord}`);
  }
  for (const chord of new Set(Object.values(BATTLE.chords).flat())) {
    for (const midi of CHORDS[chord].lute) assert.ok(D_MINOR.has(pitchClass(midi)), `battle chord ${chord}`);
  }
});

test('most melody downbeats land on a tone of their chord', () => {
  for (const [piece, lines] of [[HALL, ['A', 'B', 'A2']], [BATTLE, ['A']]]) {
    let landed = 0;
    let total = 0;
    for (const name of lines) {
      const chords = name === 'B' ? piece.chords.B : piece.chords.A;
      piece.melody[name].forEach((bar, i) => {
        const first = bar.find((note) => note.midi !== null);
        const tones = new Set(CHORDS[chords[i]].lute.map(pitchClass));
        total += 1;
        if (tones.has(pitchClass(first.midi))) landed += 1;
      });
    }
    assert.ok(landed / total >= 0.85, `${piece.name}: ${landed}/${total} downbeats on chord tones`);
  }
});

test('the hall theme opens, then goes round A, B, A and a resting strain', () => {
  const bars = take(hallBars(() => 0.3), 4 + 8 + 8 + 8 + 4 + 2);
  const sections = bars.map((bar) => bar.section);
  assert.deepEqual(sections.slice(0, 4), ['intro', 'intro', 'intro', 'intro']);
  assert.deepEqual([...new Set(sections.slice(4))], ['A', 'B', 'rest']);
  // intro 0-3, A 4-11, B 12-19, A 20-27, rest 28-31, then round again
  assert.equal(sections[28], 'rest');
  assert.equal(sections[32], 'A', 'and round again');
  // the melody moves from harp to flute between passes
  const leadOf = (bar) => bar.events.find((e) => e.inst === 'harp' || e.inst === 'flute')?.inst;
  assert.equal(leadOf(bars[4]), 'harp');
  assert.equal(leadOf(bars[32]), 'flute');
  for (const bar of bars) {
    for (const event of bar.events) {
      assert.ok(INSTRUMENT_LEVELS[event.inst] > 0, `known instrument ${event.inst}`);
      assert.ok(event.beat >= 0 && event.beat < HALL.beatsPerBar, 'events start inside their bar');
    }
  }
});

test('the battle theme builds in layers: drone and lute always, drums at 1, horn and choir at 2', () => {
  const bars = take(battleBars(() => 0.5), 32);
  assert.deepEqual([...new Set(bars.map((bar) => bar.section))], ['A', 'B']);
  const byLayer = [new Set(), new Set(), new Set()];
  for (const bar of bars) for (const event of bar.events) byLayer[event.layer].add(event.inst);
  assert.deepEqual([...byLayer[0]].sort(), ['drone', 'lute']);
  assert.ok(byLayer[1].has('war') && byLayer[1].has('tek'));
  assert.ok(byLayer[2].has('horn') && byLayer[2].has('choir') && byLayer[2].has('jingle'));
  assert.ok(!bars.slice(0, 8).some((bar) => bar.events.some((e) => e.inst === 'horn')), 'the first strain holds the horn back');
});

test('stingers are short and use known instruments', () => {
  for (const [name, stinger] of Object.entries(STINGERS)) {
    const beat = 60 / stinger.bpm;
    const end = Math.max(...stinger.events.map((e) => (e.beat + e.beats) * beat));
    assert.ok(end > 1.5 && end < 6, `${name} lasts ${end.toFixed(1)} s`);
    for (const event of stinger.events) assert.ok(INSTRUMENT_LEVELS[event.inst] > 0, `${name}: ${event.inst}`);
  }
});
