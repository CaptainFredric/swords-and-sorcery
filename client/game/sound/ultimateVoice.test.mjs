import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ULTIMATE_MOMENTS, UltimateLines } from './voiceRules.mjs';
import { VOICE_TAGS } from './voiceLines.mjs';
import { VoiceScenes } from './voiceScenes.mjs';

// One line for an ultimate: whatever is said of an activation first (its cry, as a rule) is the only thing said of it.
// Never "YOUR INTEGRITY WILL NOT SUFFIC- This sword is heavy now!".

const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');

test('an activation allows one line, and the next activation one of its own', () => {
  const lines = new UltimateLines();
  assert.equal(lines.allows('me'), true, 'outside an ultimate, nothing is held back');
  lines.begin('me');
  assert.equal(lines.allows('me'), true);
  lines.said('me');
  assert.equal(lines.allows('me'), false, 'the cry said: nothing more of it');
  assert.equal(lines.allows('foe'), true, 'his, not anyone else\'s');
  lines.end('me');
  lines.begin('me');
  assert.equal(lines.allows('me'), true, 'a new activation');
  lines.said('me');
  lines.reset();
  assert.equal(lines.allows('me'), true);
  for (const tag of ULTIMATE_MOMENTS) assert.ok(VOICE_TAGS[tag], tag);
});

test('every line said of an ultimate goes through the one-line rule; the activation begins at its start and ends with it', () => {
  // the cries, the word as it takes hold, the Vortex's spin
  assert.equal((runtime.match(/this\.#sayUltimate\(event\.playerId, \[cry\]\)/g) ?? []).length, 2);
  assert.match(runtime, /this\.#sayUltimate\(event\.playerId, \['vortexSpin'\]\)/);
  assert.equal((runtime.match(/this\.#sayUltimate\(event\.playerId, \['ultimateActive'\]\)/g) ?? []).length, 2);
  assert.doesNotMatch(runtime, /this\.#sayMoment\(event\.playerId, \[cry\]\)|this\.#sayMoment\(event\.playerId, \['(ultimateActive|vortexSpin)'\]\)/);
  assert.match(runtime, /if \(ultimate && !this\.ultimateLines\.allows\(playerId\)\) return false;/);
  assert.match(runtime, /if \(said && ultimate\) this\.ultimateLines\.said\(playerId\);/);
  assert.match(runtime, /#ultimateStart\(event\) \{\n\s+const me = [^\n]+\n\s+\/\/[^\n]+\n\s+this\.ultimateLines\.begin\(event\.playerId\);/);
  assert.match(runtime, /if \(event\.type === 'ultimateEnded'\) this\.ultimateLines\.end\(event\.playerId\);/);
  assert.match(runtime, /this\.ultimateLines\.end\(event\.victimId\);/);
  assert.match(runtime, /this\.ultimateLines\.reset\(\);/);
});

test('the scenes\' own words of an ultimate ask for the same rule; their later parts follow the one line that was said', () => {
  const asked = [];
  const scenes = new VoiceScenes({ say: (line, speaker, options) => { asked.push({ line, ...options }); return { seconds: 0.5, delay: 0 }; } });
  scenes.sunderBegan('me');
  scenes.groundSlam('me', 10);
  scenes.slamSwung('me', 10.5);
  assert.equal(asked[0].ultimate, true, 'the sentence begun: the activation\'s line');
  assert.ok(!asked[1].ultimate && asked[1].earned, 'its next word follows it');
  const heavy = [];
  const weighed = new VoiceScenes({ say: (line, speaker, options) => { heavy.push({ line, ...options }); return false; } });
  weighed.sunderBegan('me');
  weighed.groundSlam('me', 10);
  weighed.slamSwung('me', 10.5);
  assert.ok(heavy.some((said) => said.line === 'heavyNow' && said.ultimate), '"heavy now": the activation\'s line, or nothing');
  const chivalry = [];
  const shown = new VoiceScenes({ say: (line, speaker, options) => { chivalry.push({ line, ...options }); return { seconds: 1 }; } });
  shown.chivalryBegan('me');
  shown.chivalryUsed('me', 'spell');
  shown.chivalryUsed('me', 'sword');
  assert.ok(chivalry.some((said) => said.line === 'spellBlade' && said.ultimate));
});

test('the cry first, then nothing more of that Sunder: the rule played through', () => {
  // (the runtime's #say, in miniature: the rule, then a voice that would say anything)
  const lines = new UltimateLines();
  const heard = [];
  const say = (line, speaker, { ultimate = false } = {}) => {
    if (ultimate && !lines.allows(speaker)) return false;
    heard.push(line);
    if (ultimate) lines.said(speaker);
    return { seconds: 1.5, delay: 0 };
  };
  const scenes = new VoiceScenes({ say });
  lines.begin('me');
  say('sunderCall', 'me', { ultimate: true });
  scenes.sunderBegan('me');
  scenes.groundSlam('me', 10);
  scenes.slamSwung('me', 10.5);
  scenes.slamSwung('me', 11);
  assert.deepEqual(heard, ['sunderCall'], 'no sentence, no "heavy now" after the cry');
  // an ordinary line of the fight is not his ultimate's: still said
  say('killTaunt', 'me');
  assert.deepEqual(heard, ['sunderCall', 'killTaunt']);
});
