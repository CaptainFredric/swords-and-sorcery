// Draft dialogue/cue sequence. Not a published tutorial or final voice script.
// Recording keys are stable IDs; edit text freely before recording.
// No tutorial-only damage, health, invulnerability or unblockable attack is introduced.
export const TUTORIAL_STATUS = Object.freeze({
  phase: 'in-development',
  title: 'THE TUTORIAL',
  question: 'Is this a joke?',
  answer: 'Technically.',
  notice: 'The tutorial is still in progress. Coming shortly.',
});

// Stable beat identifiers belong to chapters. Moving a beat never changes its recording key.
function authored(beat, chapter = null) {
  return Object.freeze({ kind: 'dialogue', speaker: null, line: null, advanceOn: 'continue', ...beat,
    chapter, recordingKey: ['stage', 'prompt'].includes(beat.kind) ? null : `tutorial.${beat.id}` });
}

export const TUTORIAL_CHAPTERS = Object.freeze([
  Object.freeze({ id: 'spellblade', title: 'I. THE SPELLBLADE', implemented: true, beats: Object.freeze([
  { id: 'greeting', speaker: 'narrator', line: 'Greetings, Spellblade. You are a knight. And a mage. A master of swords and... wizardry.' },
  { id: 'exemplary', speaker: 'spellblade', line: 'That is quite exemplary of me! If I do say so myself.' },
  { id: 'you-did', speaker: 'narrator', line: 'You did.' },
  { id: 'another-like-you', speaker: 'narrator', line: 'Oh look! There is another just like you!' },
  ].map(beat => authored(beat, 'spellblade'))) }),
  Object.freeze({ id: 'approach', title: 'II. THE APPROACH', implemented: true, beats: Object.freeze([
  { id: 'look-prompt', kind: 'prompt', speaker: 'instruction', line: 'LOOK', advanceOn: 'player-looked', mechanic: 'look' },
  { id: 'introduce-yourself', speaker: 'narrator', line: 'Go on. Introduce yourself now. You can do it.' },
  { id: 'he-may-introduce', speaker: 'spellblade', line: 'I am a Knight. And a mage. He may choose to do so himself.' },
  { id: 'also-walk', speaker: 'narrator', line: 'You can also walk.' },
  { id: 'walk-prompt', kind: 'prompt', speaker: 'instruction', line: 'WALK TOWARD RIVAL', advanceOn: 'approach-progress', mechanic: 'move' },
  { id: 'quite-a-distance', speaker: 'spellblade', line: 'He is quite a distance away. Is there any way of moving faster' },
  { id: 'run-faster', speaker: 'narrator', line: 'Yes... you can run faster.' },
  { id: 'reminding-me', speaker: 'spellblade', line: 'Aha! Thank you for reminding me.' },
  { id: 'sprint-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT', advanceOn: 'sprint-started', mechanic: 'sprint' },
  { id: 'what-is-below', speaker: 'spellblade', line: 'This is indeed much faster. Wait, what is that below?' },
  { id: 'your-stamina', speaker: 'narrator', line: 'That is your stamina' },
  { id: 'stamina-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT USES GUARD STAMINA', advanceOn: 'stamina-decreased', mechanic: 'sprint' },
  { id: 'did-not-order', speaker: 'spellblade', line: 'Why is it going down? I did not order it to.' },
  { id: 'consumes-energy', speaker: 'narrator', line: 'Sprinting typically consumes more energy' },
  { id: 'not-typical', speaker: 'spellblade', line: 'I am not typical!' },
  { id: 'clearly', speaker: 'narrator', line: 'Clearly.' },
  { id: 'winded-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT UNTIL WINDED', advanceOn: 'player-winded', mechanic: 'sprint' },
  { id: 'cannot-sprint', speaker: 'spellblade', line: 'Hello? I can no longer sprint!' },
  { id: 'time-to-recover', speaker: 'narrator', line: 'You need time to recover' },
  { id: 'sound-recover', speaker: 'spellblade', line: 'Do I SOUND as though I need to recover!?' },
  { id: 'good-question', speaker: 'narrator', line: '... Good question.' },
  { id: 'recover-prompt', kind: 'prompt', speaker: 'instruction', line: 'RELEASE SPRINT TO RECOVER STAMINA', advanceOn: 'stamina-recovered', mechanic: 'recover' },
  { id: 'reach-rival', kind: 'prompt', speaker: 'instruction', line: 'APPROACH RIVAL', advanceOn: 'rival-reached', mechanic: 'move' },
  ].map(beat => authored(beat, 'approach'))) }),
  Object.freeze({ id: 'introductions', title: 'III. INTRODUCTIONS', implemented: true, beats: Object.freeze([
  { id: 'say-hello', speaker: 'narrator', line: 'Say hello.' },
  { id: 'admire-me', speaker: 'spellblade', line: 'Admire me.' },
  { id: 'one-job', speaker: 'narrator', line: 'You had one job.' },
  { id: 'resemblance', speaker: 'rival', line: 'You resemble me.' },
  { id: 'likewise', speaker: 'spellblade', line: 'Likewise.' },
  { id: 'despise-this', speaker: 'rival', line: 'I despise this.' },
  { id: 'worth-speaking', speaker: 'spellblade', line: 'When am I to find someone worth speaking to?' },
  { id: 'seem-certain', speaker: 'rival', line: 'You seem certain that you will be able to' },
  { id: 'name-matters', speaker: 'spellblade', line: 'Of course. I have a name.' },
  { id: 'properly-defeat', speaker: 'rival', line: 'I only give my name to those who I properly defeat!' },
  { id: 'remain-strangers', speaker: 'spellblade', line: 'Then it seems best we remain strangers!' },
  ].map(beat => authored(beat, 'introductions'))) }),
  Object.freeze({ id: 'negotiations', title: 'IV. NEGOTIATIONS', implemented: false, beats: Object.freeze([
  { id: 'negotiations', speaker: 'narrator', line: 'Woah. It appears negotiations have gone hostile.' },
  { id: 'placate', speaker: 'narrator', line: 'Try placating him.' },
  { id: 'stand-down', speaker: 'spellblade', line: 'Stand down where you belong. Please?' },
  { id: 'sword-pen', speaker: 'rival', line: 'The sword is mightier than the pen!' },
  { id: 'own-pen', speaker: 'narrator', line: "Oh brother. Tell him off. With your own 'pen'..." },
  { id: 'attack-prompt', kind: 'prompt', speaker: 'instruction', line: 'ATTACK', advanceOn: 'sword-contact', mechanic: 'attack' },
  { id: 'teach-you', speaker: 'spellblade', line: 'That should teach you.' },
  { id: 'harsh-lesson', speaker: 'narrator', line: 'A harsh lesson.' },
  ].map(beat => authored(beat, 'negotiations'))) }),
  Object.freeze({ id: 'correspondence', title: 'V. CORRESPONDENCE', implemented: false, beats: Object.freeze([
  { id: 'opinion', speaker: 'rival', line: 'Ow! I was simply stating my opinion on the comparative qualities between swords and pens!' },
  { id: 'revise', speaker: 'rival', line: 'You have taught me to revise my response.' },
  { id: 'draw-sword', kind: 'stage', direction: 'Rival visibly draws his sword. No attack until the appropriate cue.' },
  { id: 'good-health', speaker: 'rival', line: 'May you receive my message in good health.' },
  { id: 'mixed-message', speaker: 'narrator', line: 'Your health will receive a more mixed message.' },
  { id: 'disallow', speaker: 'narrator', line: 'Disallow this.' },
  { id: 'guard-prompt', kind: 'prompt', speaker: 'instruction', line: 'GUARD', advanceOn: 'successful-guard', mechanic: 'guard' },
  { id: 'interception', speaker: 'spellblade', line: 'Interception!' },
  { id: 'blocked-message', speaker: 'rival', line: 'You blocked my message!' },
  { id: 'guarded', speaker: 'spellblade', line: 'No, I had guarded.' },
  { id: 'technically-correct', speaker: 'narrator', line: 'You are technically correct.' },
  { id: 'lower-guard', kind: 'stage', advanceOn: 'guard-lowered', direction: 'Wait until the player actually lowers Guard. Never force it down or bypass a held Guard.' },
  { id: 'postscript-hit', kind: 'stage', advanceOn: 'player-damaged', direction: 'After the first guard succeeds, the player has lowered Guard. Rival abruptly lands an ordinary sword strike. Show existing 100-HP damage feedback. NOT an unblockable attack.' },
  { id: 'extra', speaker: 'rival', line: 'There was an extra.' },
  { id: 'hint', speaker: 'rival', line: 'May you receive the hint.' },
  { id: 'no-hints', speaker: 'spellblade', line: 'I do not get hints.' },
  { id: 'imminent-demise', speaker: 'rival', line: 'Of your imminent demise?' },
  { id: 'not-my-plan', speaker: 'spellblade', line: 'Ah... no, that was not my plan today.' },
  ].map(beat => authored(beat, 'correspondence'))) }),
  Object.freeze({ id: 'duel', title: 'VI. ACTUAL DUEL', implemented: false, beats: Object.freeze([
  { id: 'real-duel', kind: 'stage', advanceOn: 'duel-complete', direction: 'Release scripted guidance into an actual fair, responsive duel. Keep combat rules and opponent behavior authentic.' },
  { id: 'plans-change', speaker: 'rival', line: 'Well, things do not always go according to plan.' },
  { id: 'indeed', speaker: 'narrator', line: 'Indeed.' },
  ].map(beat => authored(beat, 'duel'))) }),
 ]);

export const TUTORIAL_BEATS = Object.freeze(TUTORIAL_CHAPTERS.flatMap(chapter => chapter.beats));
export const TUTORIAL_BRANCHES = Object.freeze({
  frolic: Object.freeze([
    { id: 'frolic-fields', speaker: 'narrator', line: 'The Spellblade decides to frolic in the fields, as he may one day never do so again' },
    { id: 'remembering-move', speaker: 'spellblade', line: 'I am not frolicking. I am remembering how to move!' },
  ].map(beat => authored(beat, 'approach'))),
});
export const TUTORIAL_PREVIEW_STOP = 'introductions';
