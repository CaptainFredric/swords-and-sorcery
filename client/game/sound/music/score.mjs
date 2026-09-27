// The music of Castleward, written out. Two pieces and three stingers, all in D so they sit with the bell of the keep:
//
//   The Castleward Hall (menus): D dorian, 3/4, slow. A lute and a drone; the melody passes between harp and flute;
//     a choir and a frame drum join in the second strain, and a quiet strain lets it breathe before it comes round.
//   Steel at the Gate (fights): D minor, 6/8 at a gallop over the old i-VII-VI-V descent. A drone and the lute always;
//     the drums join once blades are out (intensity 1), the horn melody and choir when the fight is on (intensity 2).
//
// Plain data and generators, so tests can check every note; the MusicPlayer turns bars into sound. An event is
//   { inst, midi (or a list for chords), beat (from the bar's start), beats (length), vel 0..1, layer (0-2), pan }.

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) throw new Error(`Bad note ${name}`);
  const [, letter, accidental, octave] = match;
  return 12 * (Number(octave) + 1) + LETTERS[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** "D5:1 A4:.5 r:.5 | ..." -> bars of { midi (null for a rest), beats }. */
export function parseLine(text) {
  return text.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map((token) => {
    const [note, beats] = token.split(':');
    return { midi: note === 'r' ? null : noteToMidi(note), beats: Number(beats) };
  }));
}

const voicing = (names) => names.map(noteToMidi);

// lute voicings (bass, fifth, octave, third) and close choir voicings; parallel motion is the medieval sound
export const CHORDS = Object.freeze({
  Dm: { lute: voicing(['D3', 'A3', 'D4', 'F4']), choir: voicing(['D3', 'F3', 'A3']) },
  C: { lute: voicing(['C3', 'G3', 'C4', 'E4']), choir: voicing(['C3', 'E3', 'G3']) },
  G: { lute: voicing(['G2', 'D3', 'G3', 'B3']), choir: voicing(['D3', 'G3', 'B3']) },
  F: { lute: voicing(['F2', 'C3', 'F3', 'A3']), choir: voicing(['C3', 'F3', 'A3']) },
  Am: { lute: voicing(['A2', 'E3', 'A3', 'C4']), choir: voicing(['C3', 'E3', 'A3']) },
  Bb: { lute: voicing(['Bb2', 'F3', 'Bb3', 'D4']), choir: voicing(['D3', 'F3', 'Bb3']) },
  A: { lute: voicing(['A2', 'E3', 'A3', 'C#4']), choir: voicing(['C#3', 'E3', 'A3']) },
  Gm: { lute: voicing(['G2', 'D3', 'G3', 'Bb3']), choir: voicing(['D3', 'G3', 'Bb3']) },
  D: { lute: voicing(['D3', 'A3', 'D4', 'F#4']), choir: voicing(['D3', 'F#3', 'A3']) },
});

export const HALL = Object.freeze({
  name: 'hall',
  bpm: 72,
  beatsPerBar: 3,
  hall: 0.55,
  scale: 'D dorian',
  chords: {
    intro: ['Dm', 'C', 'G', 'Dm'],
    A: ['Dm', 'C', 'Dm', 'G', 'F', 'C', 'Am', 'Dm'],
    B: ['F', 'C', 'Dm', 'Am', 'F', 'G', 'C', 'Dm'],
    rest: ['Dm', 'Dm', 'C', 'Dm'],
  },
  melody: {
    A: parseLine('A4:1 D5:1 E5:1 | E5:1.5 D5:.5 C5:1 | D5:2 A4:1 | B4:1.5 C5:.5 D5:1 | C5:1 A4:1 F4:1 | G4:1 C5:1 E5:1 | D5:1.5 C5:.5 A4:1 | D5:3'),
    B: parseLine('F5:1 E5:.5 D5:.5 C5:1 | E5:1.5 D5:.5 E5:1 | F5:1 A5:1 F5:1 | E5:2 C5:1 | A4:1 C5:1 F5:1 | D5:1.5 B4:.5 G4:1 | G5:1 E5:1 C5:1 | D5:3'),
    A2: parseLine('A4:1 D5:1 E5:1 | E5:1.5 D5:.5 C5:1 | D5:2 A4:1 | B4:1.5 C5:.5 D5:1 | C5:1 A4:1 F4:1 | G4:1 C5:1 E5:1 | D5:1.5 C5:.5 A4:1 | D5:1 A4:1 D4:1'),
  },
});

export const BATTLE = Object.freeze({
  name: 'battle',
  bpm: 252,
  beatsPerBar: 6,
  hall: 0.35,
  scale: 'D minor',
  chords: {
    A: ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A'],
    B: ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'A', 'A'],
  },
  melody: {
    A: parseLine('D5:3 E5:2 F5:1 | E5:3 D5:2 C5:1 | D5:3 Bb4:3 | A4:6 | F5:3 G5:2 A5:1 | G5:3 F5:2 E5:1 | F5:2 E5:1 D5:3 | E5:3 C#5:3'),
    call: parseLine('D4:1 r:1 D4:1 G4:3 | A4:6 | r:6 | r:6 | D4:1 r:1 D4:1 G4:3 | F4:3 A4:3 | A4:6 | r:6'),
  },
});

// notes of a parsed melody bar as events
function lineEvents(bar, inst, { vel = 0.8, layer = 0, octave = 0, pan = 0 } = {}) {
  const events = [];
  let beat = 0;
  for (const note of bar) {
    if (note.midi !== null) events.push({ inst, midi: note.midi + octave * 12, beat, beats: note.beats, vel, layer, pan });
    beat += note.beats;
  }
  return events;
}

// an arpeggio over a voicing: steps of `step` beats through `order` (indexes into the voicing)
function arpeggio(chord, order, step, { vel = 0.6, layer = 0, accent = 0.15, pan = -0.25 } = {}) {
  return order.map((index, i) => ({
    inst: 'lute', midi: CHORDS[chord].lute[index], beat: i * step, beats: step * 2, vel: vel + (i === 0 ? accent : 0), layer, pan,
  }));
}

// a chord rolled from the bass up, as a lute player strums slowly
function rolled(chord, beat, { vel = 0.55, spread = 0.06, pan = -0.25, layer = 0 } = {}) {
  return CHORDS[chord].lute.map((midi, i) => ({ inst: 'lute', midi, beat: beat + i * spread, beats: 2, vel: vel * (1 - i * 0.06), layer, pan }));
}

function* hallSection(section, rand, { melody = null, lute = 'arp', choir = false, drum = false, sparkle = false }) {
  const chords = HALL.chords[section];
  const line = melody ? HALL.melody[melody.line] : null;
  for (let i = 0; i < chords.length; i += 1) {
    const chord = chords[i];
    const events = [];
    if (i === 0) {
      // the drone holds the whole strain: D, and the fifth above it unless the strain is resting
      const beats = chords.length * HALL.beatsPerBar + 1;
      events.push({ inst: 'drone', midi: noteToMidi('D2'), beat: 0, beats, vel: 1, layer: 0, pan: 0 });
      if (section !== 'rest') events.push({ inst: 'drone', midi: noteToMidi('A2'), beat: 0, beats, vel: 0.8, layer: 0, pan: 0.1 });
    }
    if (lute === 'arp') events.push(...arpeggio(chord, [0, 1, 2, 3, 2, 1], 0.5));
    else if (lute === 'roll') events.push(...rolled(chord, 0), ...rolled(chord, 2, { vel: 0.35 }).slice(2));
    else if (lute === 'sparse') events.push({ inst: 'lute', midi: CHORDS[chord].lute[0], beat: 0, beats: 3, vel: 0.55, layer: 0, pan: -0.25 });
    if (line) events.push(...lineEvents(line[i], melody.inst, { vel: melody.inst === 'harp' ? 0.85 : 0.8, octave: melody.octave ?? 0, pan: 0.2 }));
    if (choir) events.push({ inst: 'choir', midi: CHORDS[chord].choir, beat: 0, beats: HALL.beatsPerBar + 0.6, vel: 1, layer: 0, pan: 0 });
    if (drum) {
      events.push({ inst: 'dum', beat: 0, beats: 1, vel: 0.55, layer: 0, pan: 0.1 });
      events.push({ inst: 'tek', beat: 1.5, beats: 0.5, vel: 0.4, layer: 0, pan: 0.15 });
      events.push({ inst: 'ghost', beat: 2, beats: 0.5, vel: 0.35, layer: 0, pan: 0.15 });
      if (i % 4 === 3) events.push({ inst: 'tek', beat: 2.5, beats: 0.5, vel: 0.35, layer: 0, pan: 0.15 });
    }
    if (sparkle) {
      // high chord tones, like light catching the water: one or two a bar
      const tones = CHORDS[chord].lute.slice(1);
      const count = 1 + (rand() < 0.45 ? 1 : 0);
      for (let k = 0; k < count; k += 1) {
        const beat = [0, 1, 1.5, 2][Math.floor(rand() * 4)];
        events.push({ inst: 'harp', midi: tones[Math.floor(rand() * tones.length)] + 24, beat, beats: 2, vel: 0.45, layer: 0, pan: 0.35 });
      }
    }
    yield { piece: 'hall', section, index: i, chord, events };
  }
}

/** The hall theme, forever: an introduction, then strains that trade melody between harp and flute. */
export function* hallBars(rand = Math.random) {
  yield* hallSection('intro', rand, { lute: 'arp' });
  for (let pass = 0; ; pass += 1) {
    const lead = pass % 2 === 0 ? 'harp' : 'flute';
    const other = lead === 'harp' ? 'flute' : 'harp';
    yield* hallSection('A', rand, { melody: { line: 'A', inst: lead }, lute: 'arp' });
    yield* hallSection('B', rand, { melody: { line: 'B', inst: other }, lute: 'roll', choir: true, drum: true });
    yield* hallSection('A', rand, { melody: { line: 'A2', inst: lead, octave: lead === 'flute' ? -1 : 0 }, lute: 'arp', choir: true, drum: rand() < 0.5 });
    yield* hallSection('rest', rand, { lute: 'sparse', choir: true, sparkle: true });
  }
}

function* battleSection(section, rand, { melody = false }) {
  const chords = BATTLE.chords[section];
  for (let i = 0; i < chords.length; i += 1) {
    const chord = chords[i];
    const events = [];
    if (i === 0) {
      const beats = chords.length * BATTLE.beatsPerBar + 2;
      events.push({ inst: 'drone', midi: noteToMidi('D2'), beat: 0, beats, vel: 1.1, layer: 0, pan: 0 });
      events.push({ inst: 'drone', midi: noteToMidi('A2'), beat: 0, beats, vel: 0.8, layer: 0, pan: 0.1 });
    }
    // the gallop: bass, fifth, octave, fifth, third, fifth
    events.push(...arpeggio(chord, [0, 1, 2, 1, 3, 1], 1, { vel: 0.55, accent: 0.2 }));
    // drums once blades are out
    const fill = i % 4 === 3;
    events.push({ inst: 'war', beat: 0, beats: 3, vel: 0.9, layer: 1, pan: 0 });
    events.push({ inst: 'war', beat: 3, beats: 3, vel: 0.7, layer: 1, pan: 0 });
    if (fill) {
      events.push({ inst: 'war', beat: 4, beats: 1, vel: 0.6, layer: 1, pan: 0 });
      events.push({ inst: 'war', beat: 5, beats: 1, vel: 0.75, layer: 1, pan: 0 });
    }
    for (const [beat, inst, vel] of [[0, 'dum', 0.6], [1, 'ghost', 0.35], [2, 'tek', 0.5], [3, 'dum', 0.5], [4, 'ghost', 0.35], [5, 'tek', 0.5]]) {
      events.push({ inst, beat, beats: 1, vel, layer: 1, pan: 0.2 });
    }
    // and when the fight is on: jingles, the horn, the choir
    events.push({ inst: 'jingle', beat: 3, beats: 1, vel: 0.5, layer: 2, pan: -0.3 });
    if (i % 2 === 0) events.push({ inst: 'jingle', beat: 0, beats: 1, vel: 0.4, layer: 2, pan: -0.3 });
    if (melody && section === 'A') events.push(...lineEvents(BATTLE.melody.A[i], 'horn', { vel: 0.8, layer: 2, pan: 0.15 }));
    if (section === 'B') {
      events.push(...lineEvents(BATTLE.melody.call[i], 'horn', { vel: 0.75, layer: 2, pan: 0.15 }));
      events.push({ inst: 'choir', midi: CHORDS[chord].choir, beat: 0, beats: BATTLE.beatsPerBar + 1, vel: 1, layer: 2, pan: 0 });
    }
    yield { piece: 'battle', section, index: i, chord, events };
  }
}

/** The battle theme, forever: A, A with the horn, B (the call), A with the horn. */
export function* battleBars(rand = Math.random) {
  for (;;) {
    yield* battleSection('A', rand, { melody: false });
    yield* battleSection('A', rand, { melody: true });
    yield* battleSection('B', rand, {});
    yield* battleSection('A', rand, { melody: true });
  }
}

export const PIECES = Object.freeze({ hall: { ...HALL, bars: hallBars }, battle: { ...BATTLE, bars: battleBars } });

const n = noteToMidi;

// one-shot phrases (beats at their own tempo)
export const STINGERS = Object.freeze({
  // a worthy challenger: the drum, a low choir and the horn calling D-A-D
  challenge: {
    bpm: 80,
    events: [
      { inst: 'war', beat: 0, beats: 2, vel: 1 },
      { inst: 'drone', midi: n('D2'), beat: 0, beats: 4.5, vel: 1.2, attack: 0.3, release: 1.6 },
      { inst: 'choir', midi: CHORDS.Dm.choir, beat: 0, beats: 4, vel: 1.3, attack: 0.5, release: 1.6 },
      { inst: 'horn', midi: n('D4'), beat: 0.25, beats: 0.45, vel: 0.9 },
      { inst: 'horn', midi: n('A4'), beat: 0.75, beats: 0.45, vel: 0.9 },
      { inst: 'horn', midi: n('D5'), beat: 1.25, beats: 2.2, vel: 1 },
    ],
  },
  // victory: a strummed D major (the bright third after all that minor), the horn rising and a scatter of harp
  victory: {
    bpm: 90,
    events: [
      ...rolled('D', 0, { vel: 0.8, spread: 0.08, pan: -0.2 }),
      { inst: 'horn', midi: n('A4'), beat: 0, beats: 0.33, vel: 0.85 },
      { inst: 'horn', midi: n('D5'), beat: 0.33, beats: 0.33, vel: 0.85 },
      { inst: 'horn', midi: n('F#5'), beat: 0.66, beats: 0.34, vel: 0.9 },
      { inst: 'horn', midi: n('A5'), beat: 1, beats: 2.5, vel: 1 },
      { inst: 'choir', midi: [...CHORDS.D.choir, n('D4')], beat: 0.9, beats: 3.5, vel: 1.2, attack: 0.6, release: 2 },
      ...['D5', 'F#5', 'A5', 'D6'].map((note, i) => ({ inst: 'harp', midi: n(note), beat: 1 + i * 0.16, beats: 2, vel: 0.6, pan: 0.35 })),
    ],
  },
  // defeat: a low choir and the lute walking down to D
  defeat: {
    bpm: 70,
    events: [
      { inst: 'war', beat: 0, beats: 2, vel: 0.6 },
      { inst: 'choir', midi: CHORDS.Dm.choir, beat: 0, beats: 4, vel: 1.1, attack: 1, release: 2 },
      { inst: 'drone', midi: n('D2'), beat: 0, beats: 4.5, vel: 1, attack: 0.8, release: 2 },
      ...['A3', 'G3', 'F3', 'E3', 'D3'].map((note, i) => ({ inst: 'lute', midi: n(note), beat: 0.5 + i * 0.5, beats: i === 4 ? 3 : 1, vel: 0.7, pan: -0.2 })),
    ],
  },
});
