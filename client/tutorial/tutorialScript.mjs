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

// "continue" is an editable dialogue cut; the other cues must be earned in the game.
// stage beats name actions for the future local encounter director, not hidden damage cheats.
export const TUTORIAL_BEATS = Object.freeze([
  { id: 'greeting', speaker: 'narrator', line: 'Greetings, Spellblade. You are a knight. And a mage. A master of swords and... wizardry.' },
  { id: 'exemplary', speaker: 'spellblade', line: 'That is quite exemplary of me! If I do say so myself.' },
  { id: 'you-did', speaker: 'narrator', line: 'You did.' },
  { id: 'another-like-you', speaker: 'narrator', line: 'Oh look! There is another just like you!' },
  { id: 'say-hello', speaker: 'narrator', line: 'Say hello.' },
  { id: 'admire-me', speaker: 'spellblade', line: 'Admire me.' },
  { id: 'one-job', speaker: 'narrator', line: 'You had one job.' },
  { id: 'resemblance', speaker: 'rival', line: 'You resemble me.' },
  { id: 'likewise', speaker: 'spellblade', line: 'Likewise.' },
  { id: 'despise-this', speaker: 'rival', line: 'I despise this.' },
  { id: 'negotiations', speaker: 'narrator', line: 'Woah. It appears negotiations have gone hostile.' },
  { id: 'placate', speaker: 'narrator', line: 'Try placating him.' },
  { id: 'stand-down', speaker: 'spellblade', line: 'Stand down where you belong. Please?' },
  { id: 'sword-pen', speaker: 'rival', line: 'The sword is mightier than the pen!' },
  { id: 'own-pen', speaker: 'narrator', line: "Oh brother. Tell him off. With your own 'pen'..." },
  { id: 'attack-prompt', kind: 'prompt', speaker: 'instruction', line: 'ATTACK', advanceOn: 'sword-contact', mechanic: 'attack' },
  { id: 'teach-you', speaker: 'spellblade', line: 'That should teach you.' },
  { id: 'harsh-lesson', speaker: 'narrator', line: 'A harsh lesson.' },
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
  { id: 'postscript-hit', kind: 'stage', advanceOn: 'player-damaged', direction: 'After the first guard succeeds, the player has lowered Guard. Rival abruptly lands an ordinary sword strike. Show existing 100-HP damage feedback. NOT an unblockable attack.' },
  { id: 'extra', speaker: 'rival', line: 'There was an extra.' },
  { id: 'hint', speaker: 'rival', line: 'May you receive the hint.' },
  { id: 'no-hints', speaker: 'spellblade', line: 'I do not get hints.' },
  { id: 'imminent-demise', speaker: 'rival', line: 'Of your imminent demise?' },
  { id: 'not-my-plan', speaker: 'spellblade', line: 'Ah... no, that was not my plan today.' },
  { id: 'real-duel', kind: 'stage', advanceOn: 'duel-complete', direction: 'Release scripted guidance into an actual fair, responsive duel. Keep combat rules and opponent behavior authentic.' },
  { id: 'plans-change', speaker: 'rival', line: 'Well, things do not always go according to plan.' },
  { id: 'indeed', speaker: 'narrator', line: 'Indeed.' },
].map(beat => Object.freeze({ kind: 'dialogue', speaker: null, line: null, advanceOn: 'continue', ...beat, recordingKey: beat.kind === 'stage' || beat.kind === 'prompt' ? null : `tutorial.${beat.id}` })));
