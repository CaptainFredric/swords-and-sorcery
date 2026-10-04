import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEALTH_REGEN } from '../../../shared/src/combat.mjs';
import { REPLY_LINES, VOICE_LINE_LIST, voiceLine } from './voiceLines.mjs';
import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { MOMENTS, VoiceMoments } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';

// The longer scenes (voiceScenes.mjs): each part is said only when the game has earned it, and the whole thing is
// dropped the moment it stops making sense.

// a voice that says whatever it is allowed to (`allow`), and remembers what it said: [{ line, speaker, part, ... }]
function voice(allow = () => true, seconds = 1) {
  const said = [];
  const say = (line, speaker, options = {}) => {
    if (!allow(line, speaker, options)) return false;
    said.push({ line, speaker, ...options });
    return { seconds, delay: options.delay ?? 0 };
  };
  return { said, say, heard: () => said.map((entry) => (entry.part === null || entry.part === undefined ? `${entry.speaker}:${entry.line}` : `${entry.speaker}:${entry.line}#${entry.part}`)) };
}
const everyone = (table = {}) => ['me', 'foe', 'other'].map((id) => ({ id, alive: true, health: 100, ...(table[id] ?? {}) }));
const blow = (victimId, attackerId, amount, at) => ({ type: 'damage', victimId, attackerId, amount, at });
const fall = (victimId, killerId, at, source = 'sword') => ({ type: 'death', victimId, killerId, source, at });

// the final duel, as far as "...The quest continues." (the declaration said at 10, running 5 s)
function duelToVerdict(allow) {
  const { said, say, heard } = voice(allow, 1);
  const scenes = new VoiceScenes({ say, rand: () => 0.5 });
  scenes.duelDeclared('me', 'foe', 10, 5);
  scenes.step(15.3, everyone());
  const beforeReply = heard().length;
  scenes.step(15 + SCENES.finalDuel.replyAfter, everyone());
  const replyAt = 15 + SCENES.finalDuel.replyAfter;
  scenes.step(replyAt + 1 + SCENES.finalDuel.questAfter - 0.05, everyone());
  const beforeQuest = heard().length;
  scenes.step(replyAt + 1 + SCENES.finalDuel.questAfter, everyone());
  return { scenes, said, heard, beforeReply, beforeQuest, questAt: replyAt + 1 + SCENES.finalDuel.questAfter };
}

test('the final duel: the declaration, one ordinary remark from the foe, then "...The quest continues."', () => {
  const { said, beforeReply, beforeQuest } = duelToVerdict();
  assert.equal(beforeReply, 0, 'nothing until the declaration is over and a beat has passed');
  assert.equal(beforeQuest, 1, 'the answer waits for the remark to end, and a beat');
  assert.equal(said.length, 2);
  const [reply, quest] = said;
  assert.equal(reply.speaker, 'foe');
  assert.ok(REPLY_LINES.includes(reply.line), 'one of their own ordinary lines');
  assert.equal(reply.earned, true);
  assert.deepEqual([quest.speaker, quest.line, quest.part, quest.earned], ['me', 'finalDuel', 1, true]);
  // the remarks a foe may answer with: ordinary sentences already in the game, nothing written for the joke, no death
  // line, no ultimate's cry, no part of another scene
  assert.ok(REPLY_LINES.length >= 2);
  for (const id of REPLY_LINES) {
    const line = voiceLine(id);
    assert.equal(line.kind, 'sentence', id);
    assert.ok(!line.parts && !line.coming, id);
    assert.notEqual(line.priority, 'high', `${id} is no line of state (a fall, a cry)`);
    for (const tag of ['matchLost', 'sunderInvoked', 'vortexSpin', 'worthyFoe', 'challengerBrief', 'regenWait', 'sunderSentence']) assert.ok(!line.triggers[tag], `${id} is not a ${tag} line`);
  }
  // the pauses are the brief's: a beat before the remark, a beat before the answer
  assert.ok(SCENES.finalDuel.replyAfter >= 0.25 && SCENES.finalDuel.replyAfter <= 0.6);
  assert.ok(SCENES.finalDuel.questAfter >= 0.25 && SCENES.finalDuel.questAfter <= 0.5);
});

test('the final duel: a foe with nothing fit to say (or unheard) lets the declaration stand alone', () => {
  const { said, scenes, questAt } = duelToVerdict((line) => !REPLY_LINES.includes(line));
  assert.equal(said.length, 0, 'no remark is made up for them, and no answer follows one that was never given');
  // and nothing is armed: the foe falling at once is just a kill
  assert.deepEqual(scenes.death(fall('foe', 'me', questAt + 1)), { planFailed: false, victor: false });
  scenes.step(questAt + 3, everyone({ foe: { alive: false } }));
  assert.equal(said.length, 0);
});

test('the herald is complained to only when that same foe then falls to him quickly and at little cost', () => {
  const { scenes, heard, questAt } = duelToVerdict();
  // hurt a little meanwhile: within what the verdict allows
  scenes.damage(blow('me', 'foe', SCENES.finalDuel.verdictHurt - 2, questAt + 2));
  const killedAt = questAt + 4;
  assert.deepEqual(scenes.death(fall('foe', 'me', killedAt)), { planFailed: false, victor: true }, 'the victor\'s ordinary taunt keeps quiet for it');
  scenes.step(killedAt + SCENES.finalDuel.heraldAfter - 0.05, everyone({ foe: { alive: false } }));
  assert.equal(heard().length, 2, 'a beat first');
  scenes.step(killedAt + SCENES.finalDuel.heraldAfter, everyone({ foe: { alive: false } }));
  assert.equal(heard()[2], 'me:herald');
  scenes.step(killedAt + 5, everyone({ foe: { alive: false } }));
  assert.equal(heard().length, 3, 'once');
  assert.ok(SCENES.finalDuel.verdictSec >= 8 && SCENES.finalDuel.verdictSec <= 12);
  assert.ok(SCENES.finalDuel.verdictHurt >= 20 && SCENES.finalDuel.verdictHurt <= 25);
  assert.ok(SCENES.finalDuel.heraldAfter >= 0.5 && SCENES.finalDuel.heraldAfter <= 0.9);
});

test('no herald when the duel went any other way: hurt too much, too slow, his own fall, somebody else\'s kill, a kill mid-speech', () => {
  const after = (play) => {
    const duel = duelToVerdict();
    const result = play(duel);
    duel.scenes.step(duel.questAt + 30, everyone({ foe: { alive: false } }));
    assert.ok(!duel.heard().includes('me:herald'));
    return result;
  };
  // reversed: he took more than the verdict allows before they fell
  after(({ scenes, questAt }) => {
    scenes.damage(blow('me', 'foe', 15, questAt + 1));
    scenes.damage(blow('me', 'foe', 15, questAt + 2));
    assert.equal(scenes.death(fall('foe', 'me', questAt + 3)).victor, false);
  });
  // too slow: the verdict had closed (the answer runs a second; then the window)
  after(({ scenes, questAt }) => {
    scenes.step(questAt + 1 + SCENES.finalDuel.verdictSec + 0.1, everyone());
    assert.equal(scenes.death(fall('foe', 'me', questAt + 1 + SCENES.finalDuel.verdictSec + 0.2)).victor, false);
  });
  // he fell: the bit is not rescued
  after(({ scenes, questAt }) => {
    scenes.death(fall('me', 'foe', questAt + 2));
    assert.equal(scenes.death(fall('foe', 'me', questAt + 3)).victor, false);
  });
  // somebody else felled them
  after(({ scenes, questAt }) => assert.equal(scenes.death(fall('foe', 'other', questAt + 2)).victor, false));
  // felled before "...The quest continues." was ever said: the exchange is simply over
  const { said, say } = voice();
  const scenes = new VoiceScenes({ say });
  scenes.duelDeclared('me', 'foe', 10, 5);
  assert.equal(scenes.death(fall('foe', 'me', 12)).victor, false);
  scenes.step(40, everyone({ foe: { alive: false } }));
  assert.equal(said.length, 0);
});

test('the declaration is rare, once a life, and opened only by the first blow of a fresh encounter between two whole knights', () => {
  const rule = VOICE_LINES.finalDuel;
  assert.ok(rule.chance >= 0.02 && rule.chance <= 0.04);
  assert.equal(rule.perLife, 1);
  assert.ok(rule.cooldown >= 300);
  const moments = new VoiceMoments();
  const table = { a: { alive: true, health: 100 }, v: { alive: true, health: 100 } };
  const world = { knight: (id) => table[id] ?? null, positionOf: () => null };
  const offered = (groups, speaker = 'a') => groups.flat().filter((say) => say.speaker === speaker).map((say) => say.line);
  const first = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 74, at: 1 }, world);
  assert.ok(offered(first).includes('finalDuel'));
  assert.equal(first.flat().find((say) => say.line === 'finalDuel').opens, 'finalDuel');
  assert.equal(moments.duelFoe('a'), 'v', 'the scene knows whom it was declared to');
  const second = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 48, at: 2 }, world);
  assert.ok(!offered(second).includes('finalDuel'), 'an encounter is fresh once');
  // already decided: a foe (or a challenger) already worn down is no fresh encounter
  const worn = new VoiceMoments();
  const late = worn.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: MOMENTS.worthy.health - 1, at: 1 }, world);
  assert.ok(!offered(late).includes('finalDuel'));
  const tired = new VoiceMoments();
  const weak = tired.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 74, at: 1 }, { ...world, knight: (id) => (id === 'a' ? { alive: true, health: 30 } : table[id]) });
  assert.ok(!offered(weak).includes('finalDuel'));
  // a training dummy never speaks: nothing is declared to one
  const yard = new VoiceMoments();
  const dummy = yard.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 74, at: 1 }, { ...world, knight: (id) => (id === 'v' ? { alive: true, health: 74, actorKind: 'dummy' } : table[id]) });
  assert.ok(!offered(dummy).includes('finalDuel'));
  // a burn's lick opens nothing; a new life is a new encounter
  const burnt = new VoiceMoments();
  assert.ok(!offered(burnt.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'burn', amount: 3, health: 97, at: 1 }, world)).includes('finalDuel'));
  moments.death({ type: 'death', victimId: 'v', killerId: 'a', source: 'sword', at: 5 }, world);
  const again = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 74, at: 20 }, world);
  assert.ok(offered(again).includes('finalDuel'));
});

test('the trick: "Wait, wait!!..." a moment short of his health coming back, only when badly hurt, weighed once for each hurt', () => {
  const { said, say, heard } = voice();
  const scenes = new VoiceScenes({ say });
  const due = 10 + HEALTH_REGEN.delaySec;
  scenes.damage(blow('me', 'foe', 50, 10));
  scenes.step(due - SCENES.regenTrick.early - 0.2, everyone({ me: { health: 50 } }));
  assert.equal(said.length, 0, 'not yet');
  scenes.step(due - SCENES.regenTrick.early + 0.05, everyone({ me: { health: 50 } }));
  assert.deepEqual(heard(), ['me:regenTrick#0']);
  assert.ok(!said[0].earned, 'the setup takes the line\'s own odds, cooldown and once-a-life');
  scenes.step(due - SCENES.regenTrick.early + 0.1, everyone({ me: { health: 50 } }));
  assert.equal(said.length, 1, 'said once');
  assert.ok(SCENES.regenTrick.early <= 1.0 && SCENES.regenTrick.late >= 0.6);
  assert.ok(VOICE_LINES.regenTrick.chance <= 0.08 && VOICE_LINES.regenTrick.perLife === 1, 'very rare, once a life');
  // three health missing is no plan worth announcing
  const scratch = voice();
  const light = new VoiceScenes({ say: scratch.say });
  light.damage(blow('me', 'foe', 3, 10));
  light.step(due - SCENES.regenTrick.early + 0.05, everyone({ me: { health: 97 } }));
  assert.equal(scratch.said.length, 0);
  // the dice said no: it is not asked again every frame of the window
  let asked = 0;
  const refused = new VoiceScenes({ say: () => { asked += 1; return false; } });
  refused.damage(blow('me', 'foe', 50, 10));
  for (let t = due - SCENES.regenTrick.early; t < due; t += 0.016) refused.step(t, everyone({ me: { health: 50 } }));
  assert.equal(asked, 1);
});

test('the trick is revealed only when his health is truly seen to rise; hurt again first, it is only "Wait, wait!!..."', () => {
  const due = 10 + HEALTH_REGEN.delaySec;
  const setup = () => {
    const spoken = voice();
    const scenes = new VoiceScenes({ say: spoken.say });
    scenes.damage(blow('me', 'foe', 50, 10));
    scenes.step(due - SCENES.regenTrick.early + 0.05, everyone({ me: { health: 50 } }));
    return { scenes, ...spoken };
  };
  // it comes off
  const worked = setup();
  worked.scenes.step(due + 0.3, everyone({ me: { health: 50 } }));
  assert.equal(worked.said.length, 1, 'the time alone proves nothing: his health has not moved');
  worked.scenes.step(due + 0.4, everyone({ me: { health: 54 } }));
  assert.deepEqual(worked.heard(), ['me:regenTrick#0', 'me:regenTrick#1']);
  assert.equal(worked.said[1].earned, true);
  worked.scenes.step(due + 0.6, everyone({ me: { health: 60 } }));
  assert.equal(worked.said.length, 2, 'once');
  assert.equal(worked.scenes.death(fall('me', 'foe', due + 2)).planFailed, false, 'a plan that came off did not fail');
  // hurt again before it could
  const spoiled = setup();
  spoiled.scenes.damage(blow('me', 'foe', 10, due - 0.2));
  spoiled.scenes.step(due + 0.1, everyone({ me: { health: 40 } }));
  spoiled.scenes.step(due - 0.2 + HEALTH_REGEN.delaySec + 0.5, everyone({ me: { health: 55 } }));
  assert.deepEqual(spoiled.heard(), ['me:regenTrick#0'], 'no reveal, then or when his health later does come back');
  // felled while waiting on it: the plan failed, and the fall is likelier to be protested
  const felled = setup();
  assert.equal(felled.scenes.death(fall('me', 'foe', due - 0.3)).planFailed, true);
  const fallen = new VoiceMoments().death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at: 20 }, { knight: () => null, positionOf: () => null, planFailed: true }).fallen;
  const plain = new VoiceMoments().death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at: 20 }, { knight: () => null, positionOf: () => null }).fallen;
  const odds = (group) => group.find((say) => say.line === 'defeat').chanceScale;
  assert.ok(odds(fallen) > odds(plain), '"What!? But I am a knight!"');
});

test('the Sunder sentence begins at that Sunder\'s first slam into the ground, on one roll, and each slam after is its next word', () => {
  const { said, say, heard } = voice();
  const scenes = new VoiceScenes({ say });
  const words = voiceLine('sunderLeave').parts;
  assert.equal(words.length, 12);
  assert.equal(words.join(' '), voiceLine('sunderLeave').text);
  scenes.slamSwung('me', 0.5);
  scenes.groundSlam('me', 0.6);
  assert.equal(said.length, 0, 'no Sunder, no sentence');
  scenes.sunderBegan('me');
  scenes.slamSwung('me', 1.0);
  assert.equal(said.length, 0, 'a slam swung is not yet a slam into the ground');
  assert.equal(scenes.sentenceRunning('me', 1.0), false);
  scenes.groundSlam('me', 1.2);
  assert.deepEqual(heard(), ['me:sunderLeave#0']);
  assert.ok(!said[0].earned && said[0].opening, 'the first word is the roll: the line\'s own odds and cooldown');
  assert.equal(scenes.sentenceRunning('me', 1.3), true, 'his ordinary swing lines keep quiet under it');
  // every slam after: the next word, hit or miss (a slam into the ground again is not a second word)
  let at = 1.2;
  for (let word = 1; word < words.length; word += 1) {
    at += 0.7;
    scenes.slamSwung('me', at);
    scenes.groundSlam('me', at + 0.1);
    assert.equal(said.length, word + 1);
    assert.deepEqual([said[word].part, said[word].earned], [word, true]);
  }
  scenes.slamSwung('me', at + 0.7);
  assert.equal(said.length, words.length, 'the sentence ends with its last word');
  assert.equal(scenes.sentenceRunning('me', at + 0.8), false);
  assert.ok(VOICE_LINES.sunderLeave.chance >= 0.1 && VOICE_LINES.sunderLeave.chance <= 0.15);
});

test('the roll is made once for each Sunder, and a sentence dropped is not taken up again in that Sunder', () => {
  // the dice said no at the first slam: no later slam of that Sunder asks again
  let asked = 0;
  const unlucky = new VoiceScenes({ say: () => { asked += 1; return false; } });
  unlucky.sunderBegan('me');
  for (let i = 0; i < 6; i += 1) { unlucky.slamSwung('me', 1 + i * 0.7); unlucky.groundSlam('me', 1.1 + i * 0.7); }
  assert.equal(asked, 1);
  // the next Sunder rolls afresh
  unlucky.sunderEnded('me');
  unlucky.sunderBegan('me');
  unlucky.groundSlam('me', 20);
  assert.equal(asked, 2);
  // he stopped swinging for longer than the chain's own pace allows: dropped, for the rest of that Sunder
  const { said, say } = voice();
  const scenes = new VoiceScenes({ say });
  scenes.sunderBegan('me');
  scenes.groundSlam('me', 1);
  scenes.slamSwung('me', 1.7);
  scenes.slamSwung('me', 1.7 + SCENES.sunderSentence.graceSec + 0.1);
  assert.equal(said.length, 2, 'the swing after the pause is not a word');
  assert.equal(scenes.sentenceRunning('me', 4), false);
  scenes.slamSwung('me', 4.2);
  scenes.groundSlam('me', 4.3);
  assert.equal(said.length, 2, 'and it does not begin again');
  // the Sunder over: one that never began will not; one being said keeps the last slams of the chain he was in
  const ended = voice();
  const over = new VoiceScenes({ say: ended.say });
  over.sunderBegan('me');
  over.sunderEnded('me');
  over.groundSlam('me', 1);
  assert.equal(ended.said.length, 0);
  over.sunderBegan('me');
  over.groundSlam('me', 5);
  over.sunderEnded('me');
  over.slamSwung('me', 5.7);
  assert.equal(ended.said.length, 2, 'a slam already coming is still its word');
  over.slamSwung('me', 5.7 + SCENES.sunderSentence.graceSec + 0.5);
  assert.equal(ended.said.length, 2);
});

test('"Thank. You.": a foe felled by the Sunder once the sentence has reached "For." takes the rest of it', () => {
  const sentenceTo = (count) => {
    const spoken = voice();
    const scenes = new VoiceScenes({ say: spoken.say });
    scenes.sunderBegan('me');
    scenes.groundSlam('me', 1);
    for (let word = 1; word < count; word += 1) scenes.slamSwung('me', 1 + word * 0.7);
    return { scenes, ...spoken, at: 1 + count * 0.7 };
  };
  assert.equal(voiceLine('sunderLeave').parts[SCENES.sunderSentence.thanksFrom - 1], 'For.');
  // too early in it: an ordinary kill (the ordinary victor's lines are free to follow)
  const early = sentenceTo(SCENES.sunderSentence.thanksFrom - 1);
  assert.deepEqual(early.scenes.death(fall('foe', 'me', early.at)), { planFailed: false, victor: false });
  assert.ok(!early.heard().includes('me:thankYou'));
  // as far as "For.": thanked, after a beat, over whatever word was in his mouth, and the sentence is over
  const late = sentenceTo(SCENES.sunderSentence.thanksFrom);
  assert.deepEqual(late.scenes.death(fall('foe', 'me', late.at, 'rupture')), { planFailed: false, victor: true });
  const thanks = late.said.at(-1);
  assert.deepEqual([thanks.line, thanks.speaker, thanks.force], ['thankYou', 'me', true]);
  assert.ok(thanks.delay >= 0.2 && thanks.delay <= 0.45);
  assert.equal(VOICE_LINES.thankYou.priority, 3, 'a line of state: it cuts the word before it');
  const count = late.said.length;
  late.scenes.slamSwung('me', late.at + 0.3);
  assert.equal(late.said.length, count, 'nothing more is shouted at the fallen');
  assert.equal(late.scenes.sentenceRunning('me', late.at + 0.3), false);
  // on "LEAVE!?" itself
  const whole = sentenceTo(12);
  assert.equal(whole.scenes.death(fall('foe', 'me', whole.at)).victor, true);
  // somebody else's kill, or a kill that was not the Sunder's (a spell), is not an answer to the question
  const others = sentenceTo(10);
  assert.equal(others.scenes.death(fall('foe', 'other', others.at)).victor, false);
  const spell = sentenceTo(10);
  assert.equal(spell.scenes.death(fall('foe', 'me', spell.at, 'fireball')).victor, false);
});

test('a part that has earned its turn is said whatever the odds, follows its own line on, and gives way only to a line of state', () => {
  const director = new VoiceDirector({ rand: () => 0.999 });
  assert.ok(!director.allow('sunderLeave', 'k', 10), 'the roll itself can fail');
  const lucky = new VoiceDirector({ rand: () => 0 });
  assert.ok(lucky.allow('sunderLeave', 'k', 10, { duration: 0.75 }));
  // the next words: no odds, no cooldown, and each over the tail of the one before
  const strict = new VoiceDirector({ rand: () => 0.999 });
  strict.consider('sunderLeave', 'k', 10, { earned: true, duration: 0.75 });
  const next = strict.consider('sunderLeave', 'k', 10.5, { earned: true, duration: 0.75 });
  assert.deepEqual(next, { stop: ['k'] }, 'the next word follows on, cutting the last one\'s tail');
  assert.ok(strict.consider('sunderLeave', 'k', 11.0, { earned: true, duration: 0.75 }));
  // an ordinary remark does not talk over a part; an exertion never; a line of state does
  assert.equal(strict.consider('killTaunt', 'k', 11.2, { force: true }), null);
  assert.equal(strict.consider('effort', 'k', 11.2), null);
  assert.ok(strict.consider('thankYou', 'k', 11.2, { force: true }), '"Thank. You." cuts the word before it');
  // the sentence's first word: its own odds (the roll), but begun it takes the voice from the cry that called the Sunder
  const crying = new VoiceDirector({ rand: () => 0 });
  crying.consider('sunderCall', 'k', 30, { cry: true, duration: 3.2 });
  assert.equal(crying.consider('killTaunt', 'k', 30.8, { force: true }), null, 'an ordinary line waits for a cry');
  assert.deepEqual(crying.consider('sunderLeave', 'k', 30.8, { opening: true, duration: 0.7 }), { stop: ['k'] });
  const unlucky = new VoiceDirector({ rand: () => 0.999 });
  unlucky.consider('sunderCall', 'k', 30, { cry: true, duration: 3.2 });
  assert.equal(unlucky.consider('sunderLeave', 'k', 30.8, { opening: true }), null, 'the roll can still fail');
  const rested = new VoiceDirector({ rand: () => 0 });
  assert.ok(rested.consider('sunderLeave', 'k', 0, { opening: true }));
  assert.equal(rested.consider('sunderLeave', 'k', 60, { opening: true }), null, 'and its cooldown still holds');
  // and a part never cuts a line of state: a death line is finished
  const dying = new VoiceDirector({ rand: () => 0 });
  dying.consider('defeat', 'k', 20, { force: true, duration: 2 });
  assert.equal(dying.consider('regenTrick', 'k', 20.5, { earned: true }), null);
});

test('the low moments keep apart: the last stand when desperate, saving face when merely losing, a miracle only after a real blow', () => {
  const said = new Map();
  const table = { a: { alive: true, health: 100 }, v: { alive: true, health: 100 } };
  const world = { knight: (id) => table[id] ?? null, positionOf: () => null, saidAgo: (speaker, line) => said.get(`${speaker}:${line}`) ?? Infinity };
  const struck = (health, amount = 26, extra = {}) => {
    const moments = new VoiceMoments();
    // (an old acquaintance: the fresh encounter is not what is being looked at)
    moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 1, health: 99, at: 0 }, world);
    const groups = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount, health, at: 1, ...extra }, world);
    return groups.flat().filter((say) => say.speaker === 'v').map((say) => say.line);
  };
  // desperate: the last stand, never the chivalry
  const desperate = struck(MOMENTS.lastStand.health);
  assert.ok(desperate.includes('standFight') && !desperate.includes('chivalryTest'));
  // losing, with room left to save face: the chivalry, never the last stand
  const losing = struck(MOMENTS.losingFace.health);
  assert.ok(losing.includes('chivalryTest') && !losing.includes('standFight'));
  assert.ok(!struck(MOMENTS.losingFace.health + 1).some((line) => ['chivalryTest', 'standFight'].includes(line)), 'not losing yet');
  // (clearly losing: the foe must be well ahead)
  table.a.health = MOMENTS.losingFace.foe - 1;
  assert.ok(!struck(30).includes('chivalryTest'));
  table.a.health = 100;
  // one having just been said, the other waits (the same low moment is not narrated twice)
  said.set('v:chivalryTest', 5);
  assert.ok(!struck(15).includes('standFight'));
  said.clear();
  said.set('v:standFight', 5);
  assert.ok(!struck(30).includes('chivalryTest'));
  said.clear();
  // the bands are the brief's
  assert.ok(MOMENTS.lastStand.health >= 20 && MOMENTS.lastStand.health <= 25);
  assert.ok(MOMENTS.losingFace.health >= 30 && MOMENTS.losingFace.health <= 35 && MOMENTS.losingFace.foe >= 55 && MOMENTS.losingFace.foe <= 60);
  for (const id of ['standFight', 'chivalryTest', 'acceptSaint']) assert.equal(VOICE_LINES[id].perLife, 1, `${id}: once a life`);
  // a miracle: a real blow that leaves almost nothing; two health lost at nine is not one, nor is a burn's lick
  assert.equal(struck(MOMENTS.miracle.left, MOMENTS.miracle.blow)[0], 'acceptSaint', 'ahead of anything else he might say');
  assert.ok(!struck(MOMENTS.miracle.left, 2).includes('acceptSaint'));
  assert.ok(!struck(MOMENTS.miracle.left + 1, 40).includes('acceptSaint'));
  assert.ok(!struck(0, 40).includes('acceptSaint'), 'he must live');
  assert.ok(!struck(5, 30, { source: 'burn' }).includes('acceptSaint'));
  assert.ok(MOMENTS.miracle.left >= 8 && MOMENTS.miracle.left <= 10);
});

test('"Hold still.": the same foe denying his sword again and again within a few seconds, never one ordinary block', () => {
  const moments = new VoiceMoments();
  const lines = (groups) => groups.flat().map((say) => `${say.speaker}:${say.line}`);
  assert.deepEqual(lines(moments.denied('a', 'v', 1)), []);
  assert.deepEqual(lines(moments.denied('a', 'v', 2)), []);
  assert.deepEqual(lines(moments.denied('a', 'v', 3)), ['a:openUp']);
  assert.deepEqual(lines(moments.denied('a', 'v', 3.5)), [], 'the count begins again');
  // spread out, it is not a pattern
  const slow = new VoiceMoments();
  slow.denied('a', 'v', 1);
  slow.denied('a', 'v', 4);
  assert.deepEqual(lines(slow.denied('a', 'v', 1 + MOMENTS.denied.withinSec + 3.5)), []);
  // different foes are different patterns; a miss with nobody near is nobody's doing; a blow landed ends it
  const mixed = new VoiceMoments();
  mixed.denied('a', 'v', 1);
  mixed.denied('a', 'w', 1.5);
  assert.deepEqual(lines(mixed.denied('a', null, 2)), []);
  assert.deepEqual(lines(mixed.denied('a', 'v', 2.5)), []);
  mixed.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 74, at: 2.8 }, { knight: () => ({ alive: true, health: 100 }) });
  assert.deepEqual(lines(mixed.denied('a', 'v', 3)), [], 'he got through: the count is forgotten');
  assert.ok(MOMENTS.denied.count >= 2 && MOMENTS.denied.count <= 3 && MOMENTS.denied.withinSec >= 4 && MOMENTS.denied.withinSec <= 6);
  assert.ok(VOICE_LINES.openUp.chance >= 0.1 && VOICE_LINES.openUp.chance <= 0.15 && VOICE_LINES.openUp.perLife === 1);
});

test('"Deftly Dodge!" is a small bark for a dash that really happened: now and then, long between, losing to any sentence', () => {
  const rule = VOICE_LINES.deftlyDodge;
  assert.ok(rule.chance >= 0.08 && rule.chance <= 0.12);
  assert.ok(rule.cooldown >= 35 && rule.cooldown <= 50);
  assert.equal(rule.priority, 1, 'the least of the lines with words');
  assert.equal(voiceLine('deftlyDodge').text, 'Deftly Dodge!');
  assert.deepEqual(Object.keys(voiceLine('deftlyDodge').triggers), ['dash'], 'its only moment is a dash');
  const director = new VoiceDirector({ rand: () => 0 });
  director.consider('killTaunt', 'k', 10, { force: true, duration: 2 });
  assert.equal(director.consider('deftlyDodge', 'k', 10.5), null, 'never over his own sentence');
  assert.ok(director.consider('deftlyDodge', 'k', 60));
  assert.equal(director.consider('deftlyDodge', 'k', 60 + rule.cooldown - 1), null, 'not again so soon');
  // the game raises a dash's moment in two places only: my own dash once it is allowed and begun (never on the key
  // alone), and another knight's on the host's word that they dashed
  const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');
  const raised = [...runtime.matchAll(/#sayMoment\([^\n]*\['dash'\]\)/g)];
  assert.equal(raised.length, 2);
  const mine = runtime.slice(runtime.indexOf("canPresentLocalAction('dash'"), raised[0].index);
  assert.match(mine, /canPresentLocalAction\('dash'[^\n]*\) return;/, 'a dash that is not allowed returns before anything is said');
  assert.match(mine, /recordUse\(this\.localState, 'dash'/, 'and it is said after the dash is begun');
  assert.match(runtime.slice(raised[1].index - 80, raised[1].index), /event\.type === 'dash' && event\.playerId !== me/);
});

test('a projectile gathering may be complained about, never a gust or a ward; and every scene\'s line is one the declarations own', () => {
  const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /\['spellCast', !spell\.kind && 'projectileGather'\]/);
  const rule = VOICE_LINES.getThingOff;
  assert.ok(rule.chance <= 0.08 && rule.cooldown >= 60);
  for (const tag of ['worthyFoe', 'challengerBrief', 'regenWait', 'sunderSentence', 'sunderSentenceKill']) {
    assert.equal(VOICE_LINE_LIST.filter((line) => line.triggers[tag] > 0).length, 1, `${tag}: exactly one line`);
  }
});
