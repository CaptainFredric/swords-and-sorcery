#!/usr/bin/env node
// The voice's front door: from a recording dropped in the inbox to a line in the game, in one command.
//
//   npm run voice                                   every recording in tools/audio/inbox/, then a check of the lot
//   npm run voice -- --check                        only the check (what is declared, recorded, silent, wrong)
//   npm run voice -- ~/Desktop/Late.mp3 --line lateLine      a recording from anywhere, for a named line
//   npm run voice -- master.wav:0.38-1.93 --line sorcery     a window of a longer recording (seconds)
//   npm run voice -- --add ...                      keep the line's earlier takes and add these to them
//   npm run voice -- --redo [line ...]              process lines again from their archived recordings (after
//                                                   changing the chain), every line if none is named
//
// A line is declared once, in client/game/sound/voiceLines.mjs (its words, its moment, its rarity, its Credits copy).
// A recording is matched to its line by its name: the line's id (lateLine.mp3, late-line-2.m4a), its declared `file`,
// or one of its aliases; or by --line. Each is then converted, trimmed, cleaned of its room, put in the helm, levelled
// and encoded by tools/audio/knight_voice.py with the line's own settings, written to client/assets/voice with the
// manifest the game loads, and the recording itself is moved to artifacts/voice-sources/ (kept out of git) with a note
// of it in tools/audio/voice-sources.json, so --redo can make every take again. Then everything is checked: every
// declaration sound, every recording declared, every listed take really there, and which lines are still silent.
// Processing a line replaces its earlier takes (unless --add).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_LINE_LIST, beatSources, fileStem, validateVoiceLines, voiceLine } from '../../client/game/sound/voiceLines.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const PATHS = Object.freeze({
  inbox: join(HERE, 'inbox'),
  archive: join(ROOT, 'artifacts', 'voice-sources'),
  index: join(HERE, 'voice-sources.json'),
  voice: join(ROOT, 'client', 'assets', 'voice'),
  processor: join(HERE, 'knight_voice.py'),
});

const AUDIO = /\.(m4a|mp3|wav|aiff?|mov|mp4|caf|flac|ogg)$/i;
const WINDOW = /^(.+):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;

/** A name as it is compared: its letters and digits, lower case, without its extension or a take number at its end. */
export function nameKey(name) {
  return basename(String(name)).replace(AUDIO, '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/\d+$/, '');
}

/** The line a recording's name says it is (its id, its file stem, its declared `file`, an alias), or null. */
export function lineForFile(fileName, lines = VOICE_LINE_LIST) {
  const key = nameKey(fileName);
  if (!key) return null;
  for (const line of lines) {
    const names = [line.id, fileStem(line.id), ...[].concat(line.file ?? []), ...(line.aliases ?? [])];
    if (names.some((name) => nameKey(name) === key)) return line.id;
  }
  return null;
}

/** A recording given on the command line or found in the inbox: { path, window ('a-b' or null), name }. */
export function parseSource(given) {
  const match = WINDOW.exec(given);
  const windowed = match && !existsSync(given);
  const path = windowed ? match[1] : given;
  return { path, window: windowed ? `${match[2]}-${match[3]}` : null, name: basename(path) };
}

/** Which line each recording is for: { byLine: Map(id -> [source]), unknown: [source] }. line: one line for them all. */
export function planIngest(given, { line = null, lines = VOICE_LINE_LIST } = {}) {
  const byLine = new Map();
  const unknown = [];
  for (const item of given) {
    const source = parseSource(item);
    const id = line ?? lineForFile(source.name, lines);
    if (!id || !lines.some((declared) => declared.id === id)) { unknown.push(source); continue; }
    if (!byLine.has(id)) byLine.set(id, []);
    byLine.get(id).push(source);
  }
  return { byLine, unknown };
}

/** The processor's arguments for a line's takes: its own settings (voiceLines.mjs `voice`), then the recordings. */
export function processorArgs(id, sources, lines = VOICE_LINE_LIST) {
  const line = lines.find((each) => each.id === id);
  const voice = line?.voice ?? {};
  const args = ['--line', id];
  if (Number.isFinite(voice.drive)) args.push('--drive', String(voice.drive));
  if (Number.isFinite(voice.rmsDb)) args.push('--rms-db', String(voice.rmsDb));
  if (Number.isFinite(voice.expandBelowDb)) args.push('--expand-below-db', String(voice.expandBelowDb));
  if (Number.isFinite(voice.semitones)) args.push('--semitones', String(voice.semitones));
  if (Number.isFinite(voice.formants)) args.push('--formants', String(voice.formants));
  if (Number.isFinite(voice.chest)) args.push('--chest', String(voice.chest));
  if (voice.edits?.length) args.push('--edits', JSON.stringify(voice.edits));
  // (a line subtitled a beat at a time: where each later beat begins in each take's recording)
  const beats = line ? beatSources(line) : null;
  if (beats) args.push('--beats', JSON.stringify(beats));
  return [...args, ...sources];
}

// ---------------------------------------------------------------------------------------------------------- the run

function readIndex() {
  return existsSync(PATHS.index) ? JSON.parse(readFileSync(PATHS.index, 'utf8')) : {};
}

function writeIndex(index) {
  const sorted = Object.fromEntries(Object.keys(index).sort().map((id) => [id, index[id]]));
  writeFileSync(PATHS.index, `${JSON.stringify(sorted, null, 2)}\n`);
}

// a Python that has numpy (the processing needs it)
function findPython(preferred) {
  for (const candidate of [preferred, process.env.VOICE_PYTHON, '/usr/local/bin/python3', 'python3'].filter(Boolean)) {
    const probe = spawnSync(candidate, ['-c', 'import numpy'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

// a recording into the archive under its line's name; returns its name there (with its window, if it has one)
function archive(source, id, number, { move }) {
  mkdirSync(PATHS.archive, { recursive: true });
  const inArchive = resolve(dirname(source.path)) === resolve(PATHS.archive);
  // a windowed recording keeps its own name (several lines are cut from one master); a take is named for its line
  const name = inArchive || source.window ? source.name : `${fileStem(id)}-${number}${extname(source.name).toLowerCase()}`;
  const target = join(PATHS.archive, name);
  if (!inArchive && resolve(source.path) !== resolve(target)) {
    if (move) {
      try { renameSync(source.path, target); } catch { copyFileSync(source.path, target); }
    } else {
      copyFileSync(source.path, target);
    }
  }
  return source.window ? `${name}:${source.window}` : name;
}

function check({ quiet = false } = {}) {
  const manifest = existsSync(join(PATHS.voice, 'manifest.json')) ? JSON.parse(readFileSync(join(PATHS.voice, 'manifest.json'), 'utf8')) : { lines: {} };
  const files = existsSync(PATHS.voice) ? readdirSync(PATHS.voice) : [];
  const { errors, warnings } = validateVoiceLines({ manifest, files });
  const recorded = Object.keys(manifest.lines ?? {});
  const silent = VOICE_LINE_LIST.filter((line) => !recorded.includes(line.id));
  if (!quiet) {
    console.log(`\n${VOICE_LINE_LIST.length} lines declared, ${recorded.length} recorded (${recorded.reduce((sum, id) => sum + manifest.lines[id].length, 0)} takes).`);
    if (silent.length) {
      console.log(`Silent until recorded (${silent.length}):`);
      for (const line of silent) console.log(`  ${line.id.padEnd(16)} ${line.coming ? `[for ${line.coming}] ` : ''}${line.text}`);
    }
    for (const warning of warnings.filter((text) => !/not recorded yet/.test(text))) console.log(`note: ${warning}`);
  }
  for (const error of errors) console.error(`WRONG: ${error}`);
  if (!errors.length && !quiet) console.log('Everything declared is sound.');
  return errors.length === 0;
}

function run(argv) {
  const options = { check: false, redo: false, add: false, line: null, python: null, inputs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--redo') options.redo = true;
    else if (arg === '--add') options.add = true;
    else if (arg === '--line') options.line = argv[++i];
    else if (arg === '--python') options.python = argv[++i];
    else if (arg === '--help' || arg === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map((line) => line.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
    else options.inputs.push(arg);
  }
  if (options.line && !voiceLine(options.line)) {
    console.error(`--line ${options.line}: no such line is declared (client/game/sound/voiceLines.mjs)`);
    return 1;
  }
  if (options.check) return check() ? 0 : 1;

  const index = readIndex();
  let plan;
  let fromInbox = false;
  if (options.redo) {
    const wanted = options.inputs.length ? options.inputs : Object.keys(index);
    plan = { byLine: new Map(), unknown: [] };
    for (const id of wanted) {
      if (!index[id]?.length) { console.error(`${id}: no archived recording is noted for it (tools/audio/voice-sources.json)`); continue; }
      plan.byLine.set(id, index[id].map((noted) => parseSource(join(PATHS.archive, noted))));
    }
  } else {
    let given = options.inputs;
    if (!given.length) {
      fromInbox = true;
      mkdirSync(PATHS.inbox, { recursive: true });
      given = readdirSync(PATHS.inbox).filter((name) => AUDIO.test(name) && statSync(join(PATHS.inbox, name)).isFile()).sort().map((name) => join(PATHS.inbox, name));
      if (!given.length) console.log('Nothing in tools/audio/inbox/ to bring in.');
    }
    plan = planIngest(given, { line: options.line });
  }
  for (const source of plan.unknown) {
    console.error(`${source.name}: which line is this? Name it after its line's id (or give --line), and declare the line in client/game/sound/voiceLines.mjs.`);
  }

  let failed = plan.unknown.length > 0;
  if (plan.byLine.size) {
    const python = findPython(options.python);
    if (!python) {
      console.error('No Python with numpy was found (tried /usr/local/bin/python3 and python3). Give one with --python or VOICE_PYTHON.');
      return 1;
    }
    for (const [id, sources] of plan.byLine) {
      const missing = sources.filter((source) => !existsSync(source.path));
      if (missing.length) {
        for (const source of missing) console.error(`${id}: ${source.path} is not there`);
        failed = true;
        continue;
      }
      // (--add: the line's earlier recordings, from the archive, then these)
      const earlier = options.add && !options.redo ? (index[id] ?? []).map((noted) => parseSource(join(PATHS.archive, noted))).filter((source) => existsSync(source.path)) : [];
      const all = [...earlier, ...sources];
      const result = spawnSync(python, [PATHS.processor, ...processorArgs(id, all.map((source) => (source.window ? `${source.path}:${source.window}` : source.path)))], { cwd: ROOT, encoding: 'utf8' });
      const said = `${result.stdout ?? ''}`.split('\n').filter((text) => /^\s{2}\S/.test(text));
      if (result.status !== 0) {
        console.error(`${id}: the processing failed\n${result.stderr}`);
        failed = true;
        continue;
      }
      console.log(`${id}: "${voiceLine(id).text}"`);
      for (const text of said) console.log(text);
      if (!options.redo) {
        const noted = earlier.map((source) => (source.window ? `${source.name}:${source.window}` : source.name));
        sources.forEach((source, i) => noted.push(archive(source, id, earlier.length + i + 1, { move: fromInbox })));
        index[id] = noted;
      }
    }
    if (!options.redo) writeIndex(index);
  }
  return check() && !failed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(run(process.argv.slice(2)));
