import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ULTIMATE_MOMENTS, ULTIMATE_VOICES, UltimateLines } from './voiceRules.mjs';
import { VOICE_TAGS, voiceLine } from './voiceLines.mjs';
import { VoiceScenes } from './voiceScenes.mjs';

// One line for an ultimate, in turn: each use of one says one line of it (never "YOUR INTEGRITY WILL NOT SUFFIC- This
// sword is heavy now!"), and the next use the next line, round and round: a different line every time.

const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');

test('each use of an ultimate says the next of its lines: a different one every time, the cry first', () => {
  const lines = new UltimateLines();
  const sunders = Array.from({ length: 8 }, () => lines.begin('me', 'sunder'));
  assert.deepEqual(sunders, ['sunderCall', 'heavyNow', 'victory', 'sunderLeave', 'sunderCall', 'heavyNow', 'victory', 'sunderLeave']);
  for (let i = 1; i < sunders.length; i += 1) assert.notEqual(sunders[i], sunders[i - 1], 'never the same twice running');
  assert.deepEqual([lines.begin('me', 'chivalry'), lines.begin('me', 'chivalry'), lines.begin('me', 'chivalry')], ['masterCall', 'spellBlade', 'masterCall']);
  assert.deepEqual([lines.begin('me', 'vortex'), lines.begin('me', 'vortex')], ['distanceAdvice', 'vortexUse']);
  // (his own turns: another knight's first Sunder is its cry too)
  assert.equal(lines.begin('foe', 'sunder'), 'sunderCall');
  // every line in a turn is a real line of that ultimate's moments
  for (const [ultimate, order] of Object.entries(ULTIMATE_VOICES)) {
    assert.equal(new Set(order).size, order.length, `${ultimate}: each line once round`);
    for (const voice of order) {
      assert.ok(voiceLine(voice), `${ultimate}: ${voice}`);
      assert.ok(Object.keys(voiceLine(voice).triggers).some((tag) => ULTIMATE_MOMENTS.includes(tag)), `${voice} is said of the ultimate`);
    }
  }
  for (const tag of ULTIMATE_MOMENTS) assert.ok(VOICE_TAGS[tag], tag);
});

test('a use allows its one line and nothing else, that line whatever its odds', () => {
  const lines = new UltimateLines();
  assert.equal(lines.verdict('me', 'heavyNow'), 'yes', 'outside an ultimate, nothing is held back');
  lines.begin('me', 'sunder');
  assert.equal(lines.verdict('me', 'sunderCall'), 'force');
  assert.equal(lines.verdict('me', 'victory'), 'no', 'the other cry waits its turn');
  assert.equal(lines.verdict('me', 'heavyNow'), 'no', 'not "heavy now" over the cry');
  lines.said('me');
  assert.equal(lines.verdict('me', 'sunderCall'), 'no', 'once');
  lines.end('me');
  lines.begin('me', 'sunder');
  assert.equal(lines.verdict('me', 'sunderCall'), 'no', 'its turn passes the cry by');
  assert.equal(lines.verdict('me', 'sunderLeave'), 'no');
  assert.equal(lines.verdict('me', 'heavyNow'), 'force', 'its turn: said when its moment comes, whatever its odds');
  lines.said('me');
  assert.equal(lines.verdict('me', 'heavyNow'), 'no');
  assert.equal(lines.verdict('foe', 'heavyNow'), 'yes', 'his, not anyone else\'s');
  lines.reset();
  assert.equal(lines.verdict('me', 'heavyNow'), 'yes');
});

test('every line said of an ultimate goes through the turn; the activation begins at its start and ends with it', () => {
  assert.equal((runtime.match(/this\.#ultimateCry\(event\.playerId, cry, voice\);/g) ?? []).length, 2);
  assert.match(runtime, /#ultimateCry\(speaker, cry, voice\) \{\n\s+if \(!cry \|\| !voice \|\| !\(voiceLine\(voice\)\?\.triggers\?\.\[cry\] > 0\)\) return;\n\s+this\.#say\(voice, speaker, \{ cry: true, delay: VOICE_TAGS\[cry\]\.delay \?\? 0, ultimate: true \}\);/);
  assert.match(runtime, /this\.#sayUltimate\(event\.playerId, \['vortexSpin'\]\)/);
  assert.equal((runtime.match(/this\.#sayUltimate\(event\.playerId, \['ultimateActive'\]\)/g) ?? []).length, 2);
  assert.doesNotMatch(runtime, /this\.#sayMoment\(event\.playerId, \[cry\]\)|this\.#sayMoment\(event\.playerId, \['(ultimateActive|vortexSpin)'\]\)/);
  assert.match(runtime, /const verdict = this\.ultimateLines\.verdict\(playerId, line\);\n\s+if \(verdict === 'no'\) return false;\n\s+if \(verdict === 'force'\) force = true;/);
  assert.match(runtime, /if \(said && ultimate\) this\.ultimateLines\.said\(playerId\);/);
  assert.match(runtime, /const voice = this\.ultimateLines\.begin\(event\.playerId, event\.ultimate\);/);
  assert.match(runtime, /if \(event\.type === 'ultimateEnded'\) this\.ultimateLines\.end\(event\.playerId\);/);
  assert.match(runtime, /this\.ultimateLines\.end\(event\.victimId\);/);
  assert.match(runtime, /this\.ultimateLines\.reset\(\);/);
});

// (the runtime's #say, in miniature: the turn, then a voice that says whatever it is allowed to)
function rotation() {
  const lines = new UltimateLines();
  const heard = [];
  const say = (line, speaker, { ultimate = false } = {}) => {
    if (ultimate && lines.verdict(speaker, line) === 'no') return false;
    heard.push(line);
    if (ultimate) lines.said(speaker);
    return { seconds: 1.2, delay: 0 };
  };
  return { lines, heard, say, scenes: new VoiceScenes({ say }) };
}

// (its cry said as it is invoked, if its turn is a cry: as the runtime's #ultimateCry)
const cries = (ultimate) => ({ sunder: ['sunderCall', 'victory'], chivalry: ['masterCall'] })[ultimate] ?? [];

function sunder({ lines, say, scenes }, at) {
  const voice = lines.begin('me', 'sunder');
  if (cries('sunder').includes(voice)) say(voice, 'me', { ultimate: true });
  scenes.sunderBegan('me');
  scenes.groundSlam('me', at);
  scenes.slamSwung('me', at + 0.5);
  scenes.slamSwung('me', at + 1);
  scenes.sunderEnded('me');
  lines.end('me');
}

test('played through: Sunder after Sunder, a different line each time, never two in one use', () => {
  const run = rotation();
  sunder(run, 10);
  assert.deepEqual(run.heard, ['sunderCall'], 'the first: its cry, and nothing after it');
  run.heard.length = 0;
  sunder(run, 20);
  assert.deepEqual(run.heard, ['heavyNow'], 'the next: the weight of the sword, no cry');
  run.heard.length = 0;
  sunder(run, 30);
  assert.deepEqual(run.heard, ['victory'], 'then MIGHT MAKES... KNIGHT! as its cry');
  run.heard.length = 0;
  sunder(run, 40);
  assert.equal(run.heard[0], 'sunderLeave', 'then the sentence, begun at its first slam (its later words follow it)');
  assert.ok(!run.heard.includes('sunderCall') && !run.heard.includes('heavyNow'));
  // an ordinary line of the fight is not his ultimate's: still said
  run.say('killTaunt', 'me');
  assert.equal(run.heard.at(-1), 'killTaunt');
  // Spells & Chivalry: its cry, then the Spellblade's question
  const chivalry = rotation();
  for (let i = 0; i < 2; i += 1) {
    const voice = chivalry.lines.begin('me', 'chivalry');
    if (cries('chivalry').includes(voice)) chivalry.say(voice, 'me', { ultimate: true });
    chivalry.scenes.chivalryBegan('me');
    chivalry.scenes.chivalryUsed('me', 'spell');
    chivalry.scenes.chivalryUsed('me', 'sword');
    chivalry.scenes.chivalryEnded('me');
    chivalry.lines.end('me');
  }
  assert.deepEqual(chivalry.heard, ['masterCall', 'spellBlade']);
});
