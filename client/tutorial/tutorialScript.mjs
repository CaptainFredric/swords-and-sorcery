// Creator authored Tutorial 1. Recording keys remain stable when text or route changes.
// Gameplay gates observe ordinary simulation facts; rehearsal timing belongs to captions.
export const TUTORIAL_STATUS = Object.freeze({
  phase: 'ready',
  title: 'THE TUTORIAL',
  question: 'Is this a joke?',
  answer: 'Technically.',
  notice: 'Tutorial 1 complete.',
  visibility: 'completion',
});

// Readability timing is temporary presentation data. Recorded audio supersedes it.
export function tutorialRehearsalSec(line) {
  const words = String(line ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(1.5, Math.min(6, words / 3)) * 100) / 100;
}

function authored(beat, chapter, segment, presentation = 'blocking', branch = null) {
  const kind = beat.kind ?? 'dialogue';
  const spoken = kind === 'dialogue';
  const mode = beat.presentation ?? presentation;
  return Object.freeze({ kind, speaker: null, line: null, advanceOn: 'continue',
    ...(spoken ? { presentation: mode, ...(mode === 'reactive' ? { rehearsalSec: tutorialRehearsalSec(beat.line) } : {}) } : {}),
    ...beat, chapter, segment, ...(branch ? { branch } : {}),
    ...(beat.permissions ? { permissions: Object.freeze([...beat.permissions]) } : {}),
    recordingKey: spoken ? beat.recordingKey ?? `tutorial.${beat.id}` : null,
  });
}

const LOCKED = [];
const LOOK = ['look'];
const MOVE = [...LOOK, 'move'];
const SPRINT = [...MOVE, 'sprint'];
const ATTACK = [...SPRINT, 'attack'];
const GUARD = [...ATTACK, 'guard'];
const JUMP = [...GUARD, 'jump', 'crouch'];
const FIREBALL = [...JUMP, 'spell'];
const DASH = [...FIREBALL, 'dash'];
const PURSUIT_OBJECTIVE = Object.freeze({ title: 'OBJECTIVE', text: 'STOP THE RIVAL FROM TELLING ON YOU' });
const EXIT_OBJECTIVE = Object.freeze({ title: 'OBJECTIVE', text: 'LEAVE GREENER PASTURES' });
const FINAL_OBJECTIVE = Object.freeze({ title: 'OBJECTIVE', text: 'Defeat The Rival', compact: true });
// health regenerates: shown from the hit itself, under the lines that follow it, until health is back and settled
const HEALTH_STANDING = Object.freeze({ from: 'player-damaged', until: 'health-settled', line: 'HEALTH REGENERATES', mechanic: 'health-regen' });
// the mill lane's brook (between the sheepfold and the bridge): wanted from over the wain's fence until it is crossed
const BROOK_STANDING = Object.freeze({ from: 'mill-brook-near', until: 'mill-brook-crossed', line: 'SPRINT, THEN JUMP', mechanic: 'sprint-jump' });
// "Jump." is called at the stile's immediate approach, by the Spellblade's own pace (metres from the wall's near face,
// at an approach speed in m/s). A Jump from too far out lands short of the wall (one more hop clears it); one from right
// at it always clears. So the call is placed for the quickest answer to the JUMP prompt that appears with it (a third
// of a second) to leave the ground at the far edge of the clearance window: a slow walk 4.6 m out (window 1.2-2.6 m), a
// run 6.5 m (1.4-3.9 m), a Sprint 10 m (1.9-6.2 m). Answered on hearing the word, the takeoff is nearer: still clear.
export function jumpCallDistance(speed) {
  return Math.max(2.5, Math.min(11, speed - 1));
}
// the stile's JUMP prompt stays up from the call until the Spellblade is over (a failed attempt keeps it)
const STILE_STANDING = Object.freeze({ from: 'jump-approach-ready', until: 'jump-crossed', line: 'JUMP', mechanic: 'jump' });

const segments = [
  {
    id: 'greener-introduction', chapter: 'spellblade', permissions: LOCKED,
    entryCondition: 'tutorial-started', completionCue: 'continue',
    scene: { enter: 'rival-idle', checkpoint: 'opening', gates: [] },
    beats: [
      { id: 'greeting', speaker: 'narrator', line: 'Greetings, Spellblade. You are a knight. And a mage. A master of swords and... wizardry.' },
      { id: 'exemplary', speaker: 'spellblade', line: 'That is quite exemplary of me! If I do say so myself.' },
      { id: 'you-did', speaker: 'narrator', line: 'You did.' },
      { id: 'greener-pastures', speaker: 'narrator', line: 'This is Greener Pastures, a land fertile of hope and opportunity.' },
      { id: 'much-to-do', speaker: 'spellblade', line: 'Yes... there is...much to do here..' },
      { id: 'need-look-around', speaker: 'narrator', line: 'You need to look around' },
      { id: 'nothing-of-value', speaker: 'spellblade', line: 'I have. I see nothing of value' },
      { id: 'truly-look-around', speaker: 'narrator', line: 'With your eyes.' },
    ],
  },
  {
    id: 'meaningful-look', chapter: 'spellblade', permissions: LOOK,
    entryCondition: 'greener-introduction', completionCue: 'player-looked',
    scene: { checkpoint: 'opening', gates: ['player-looked'] },
    beats: [
      { id: 'look-prompt', kind: 'prompt', speaker: 'instruction', line: 'LOOK', advanceOn: 'player-looked', mechanic: 'look' },
      { id: 'look-ah', speaker: 'spellblade', line: 'Ah...' },
      { id: 'still-nothing', speaker: 'spellblade', line: 'Still nothing' },
      { id: 'another-like-you', speaker: 'narrator', line: 'Oh look! There is another just like you!' },
    ],
  },
  {
    id: 'approach', chapter: 'approach', permissions: LOOK, branches: ['frolic'],
    entryCondition: 'player-looked', completionCue: 'approach-progress',
    scene: { checkpoint: 'opening', gates: ['approach-progress'] },
    beats: [
      { id: 'introduce-yourself', speaker: 'narrator', line: 'Go on. Introduce yourself now. You can do it.' },
      { id: 'he-may-introduce', speaker: 'spellblade', line: 'I am a Knight. And a mage. He may choose to do so himself.' },
      { id: 'also-walk', speaker: 'narrator', line: 'You can also walk.' },
      { id: 'walk-prompt', kind: 'prompt', speaker: 'instruction', line: 'WALK TOWARD RIVAL', advanceOn: 'approach-progress', mechanic: 'move', permissions: MOVE },
      { id: 'quite-a-distance', speaker: 'spellblade', line: 'He is quite a distance away. Do I have any method of moving faster?', permissions: MOVE },
      { id: 'run-faster', speaker: 'narrator', line: 'Yes... you can sprint.', permissions: MOVE },
      { id: 'reminding-me', speaker: 'spellblade', line: 'Aha! Thank you for reminding me.', permissions: MOVE },
      { id: 'think-more', speaker: 'narrator', line: 'Mhm. Remember to think more often as well.', permissions: MOVE },
    ],
  },
  {
    id: 'stamina', chapter: 'approach', permissions: SPRINT, branches: ['frolic'],
    entryCondition: 'approach-progress', completionCue: 'rival-reached', presentation: 'reactive',
    captionRehearsal: Object.freeze({ scale: 0.55, minSec: 1 }),
    scene: { checkpoint: 'opening', gates: ['sprint-started', 'stamina-decreased', 'sprint-sustained', 'player-winded', 'stamina-recovered', 'rival-reached'] },
    beats: [
      { id: 'sprint-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT', advanceOn: 'sprint-started', mechanic: 'sprint' },
      { id: 'what-is-below', speaker: 'spellblade', line: 'This is indeed much faster. Wait, what is that down there?',
        touchLine: 'This is indeed much faster. Wait, what is that up there?', touchBeatId: 'what-is-above', touchRecordingKey: 'tutorial.what-is-above' },
      { id: 'your-stamina', speaker: 'narrator', line: 'That is your stamina' },
      { id: 'stamina-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT USES GUARD STAMINA', advanceOn: 'stamina-decreased', mechanic: 'sprint' },
      { id: 'did-not-order', speaker: 'spellblade', line: 'Why is it going down? I did not order it to.' },
      { id: 'consumes-energy', speaker: 'narrator', line: 'Sprinting typically consumes more energy' },
      { id: 'not-typical', speaker: 'spellblade', line: 'I am not typical!' },
      { id: 'clearly', speaker: 'narrator', line: 'Clearly.' },
      { id: 'sustained-sprint', kind: 'stage', advanceOn: 'sprint-sustained', mechanic: 'sprint',
        direction: 'Observe or recall a genuinely sustained Sprint episode with meaningful stamina remaining at the time.', stageCue: 'observe-sprint' },
      { id: 'can-do-all-day', speaker: 'spellblade', line: 'Ah, hahaha! I can do this all day!' },
      // (live: taken only while the Spellblade really is winded and nothing is being said, never from an earlier bout)
      { id: 'winded-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT UNTIL WINDED', advanceOn: 'player-winded', mechanic: 'sprint', live: true },
      { id: 'cannot-sprint', speaker: 'spellblade', line: 'Hello? I can no longer sprint!' },
      { id: 'time-to-recover', speaker: 'narrator', line: 'You need time to recover' },
      { id: 'sound-recover', speaker: 'spellblade', line: 'Do I SOUND as though I need to recover!?' },
      { id: 'good-question', speaker: 'narrator', line: '...A sound argument...' },
      { id: 'recover-prompt', kind: 'prompt', speaker: 'instruction', line: 'RECOVER STAMINA', advanceOn: 'stamina-recovered', mechanic: 'recover' },
      { id: 'reach-rival', kind: 'prompt', speaker: 'instruction', line: 'APPROACH RIVAL', advanceOn: 'rival-reached', mechanic: 'move' },
    ],
  },
  {
    id: 'introductions', chapter: 'introductions', permissions: SPRINT, checkpoint: true,
    entryCondition: 'rival-reached', completionCue: 'continue',
    scene: { enter: 'rival-idle', checkpoint: 'introductions', gates: [] },
    beats: [
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
    ],
  },
  {
    id: 'first-attack', chapter: 'negotiations', permissions: ATTACK,
    entryCondition: 'introductions', completionCue: 'sword-contact',
    scene: { enter: 'first-attack', checkpoint: 'introductions', gates: ['sword-contact', 'rival-sword-drawn'] },
    beats: [
      { id: 'negotiations', speaker: 'narrator', line: 'Woah. It appears negotiations have gone hostile.', permissions: SPRINT },
      { id: 'placate', speaker: 'narrator', line: 'Try placating him.', permissions: ATTACK },
      { id: 'stand-down', speaker: 'spellblade', line: 'Stand down where you belong. Please?' },
      { id: 'sword-pen', speaker: 'rival', line: 'The sword is mightier than the pen!' },
      { id: 'own-pen', speaker: 'narrator', line: 'Oh brother. Tell him off. With your own ‘pen’...' },
      { id: 'attack-prompt', kind: 'prompt', speaker: 'instruction', line: 'ATTACK', advanceOn: 'sword-contact', mechanic: 'attack' },
      { id: 'teach-you', speaker: 'spellblade', line: 'That should teach you.' },
      { id: 'harsh-lesson', speaker: 'narrator', line: 'Rather harsh lesson.' },
      { id: 'opinion', speaker: 'rival', line: 'Ow! I was simply stating my opinion on the comparative qualities between swords and pens!' },
      { id: 'revise', speaker: 'rival', line: 'You have taught me to revise my response.' },
      { id: 'draw-sword', kind: 'stage', advanceOn: 'rival-sword-drawn', stageCue: 'rival-draw-sword',
        direction: 'Rival visibly draws his sword, preparing the ordinary Guard lesson.' },
    ],
  },
  {
    id: 'first-guard', chapter: 'correspondence', permissions: GUARD,
    entryCondition: 'sword-contact', completionCue: 'player-damaged', standingPrompt: HEALTH_STANDING,
    scene: { enter: 'rival-idle', checkpoint: 'introductions', gates: ['guard-attack-started', 'successful-guard', 'guard-lowered', 'player-damaged'] },
    beats: [
      { id: 'good-health', speaker: 'rival', line: 'May you receive my message in good health.' },
      { id: 'mixed-message', speaker: 'narrator', line: 'Your health will receive a more mixed message.' },
      { id: 'disallow', speaker: 'narrator', line: 'Disallow this.' },
      { id: 'guard-attack-start', kind: 'stage', advanceOn: 'guard-attack-started', stageCue: 'rival-guard-lesson',
        direction: 'Begin the ordinary Rival attack that the player can genuinely Guard.' },
      { id: 'guard-prompt', kind: 'prompt', speaker: 'instruction', line: 'GUARD', advanceOn: 'successful-guard', mechanic: 'guard' },
      { id: 'interception', speaker: 'spellblade', line: 'Interception!' },
      { id: 'blocked-message', speaker: 'rival', line: 'You blocked me!' },
      { id: 'guarded', speaker: 'spellblade', line: 'No. I was guarding.' },
      { id: 'technically-correct', speaker: 'narrator', line: 'You are technically correct.' },
      { id: 'lower-guard', kind: 'stage', advanceOn: 'guard-lowered', mechanic: 'lower-guard', stageCue: 'observe-guard-lowered',
        direction: 'Wait for the player to lower Guard through ordinary input.' },
      { id: 'postscript-hit', kind: 'stage', advanceOn: 'player-damaged', stageCue: 'rival-postscript',
        direction: 'Rival attempts an ordinary sword strike after Guard lowers. Held Guard still works; observe ordinary 100 HP damage feedback.' },
      { id: 'extra', speaker: 'rival', line: 'There was an extra.' },
      { id: 'hint', speaker: 'rival', line: 'May you receive the hint.' },
    ],
  },
  {
    id: 'health-regen', chapter: 'correspondence', permissions: GUARD,
    entryCondition: 'player-damaged', completionCue: 'health-settled', standingPrompt: HEALTH_STANDING,
    requiresSegments: ['first-guard'],
    scene: { enter: 'rival-give-space', checkpoint: 'introductions', gates: ['health-regenerated', 'health-settled'] },
    beats: [
      { id: 'need-a-moment', speaker: 'spellblade', line: 'I need a moment.' },
      // (the reminder stays through the real delay and the real regeneration, and a second at full health)
      { id: 'health-regen-prompt', kind: 'prompt', speaker: 'instruction', line: 'HEALTH REGENERATES', advanceOn: 'health-settled', mechanic: 'health-regen' },
      { id: 'no-hints', speaker: 'spellblade', line: 'I do not get hints.' },
      { id: 'imminent-demise', speaker: 'rival', line: 'Of your imminent demise?' },
      { id: 'not-my-plan', speaker: 'spellblade', line: 'Ah... no, that was not my plan today.' },
    ],
  },
  {
    id: 'real-duel', chapter: 'duel', permissions: GUARD, checkpoint: true, presentation: 'reactive',
    entryCondition: 'health-settled', completionCue: 'duel-first-knockdown',
    scene: { enter: 'rival-idle', checkpoint: 'duel', gates: ['rival-attack-started', 'duel-first-knockdown'] },
    beats: [
      { id: 'well', speaker: 'rival', line: 'Well.' },
      { id: 'duel-onset', kind: 'stage', advanceOn: 'rival-attack-started', stageCue: 'rival-attack',
        direction: 'Launch Rival’s ordinary attack at the onset of the following line.' },
      { id: 'plans-change', speaker: 'rival', line: 'Things do not always go according to plan.',
        performanceCue: Object.freeze({ at: 'onset', action: 'rival-attack', stageBeat: 'duel-onset', precedingBeat: 'well' }) },
      { id: 'indeed', speaker: 'narrator', line: 'Indeed.' },
      // (the fight goes on; the boast is had once he has taken some real punishment, and he does not go down until
      // he has made it: the blow after "...not feel like it yet!" that has earned it brings him down)
      { id: 'duel-midway', kind: 'stage', advanceOn: 'duel-damage-midway', stageCue: 'rival-real-duel',
        direction: 'Responsive ordinary combat until Rival has taken real punishment.' },
      { id: 'taking-a-while', speaker: 'spellblade', line: 'You are taking a while to go down!' },
      { id: 'not-yet', speaker: 'rival', line: 'Haha! I do not feel like it yet!' },
      { id: 'informative', skipWhen: 'duel-first-knockdown', speaker: 'narrator', line: 'How informative.' },
      { id: 'first-knockdown', kind: 'stage', advanceOn: 'duel-first-knockdown', stageCue: 'rival-real-duel',
        direction: 'Observe cumulative legitimate Rival damage: the blow that has earned it, once he has boasted, knocks him down.' },
    ],
  },
  {
    // Down for the first time, he is asked about it; he gets up as he answers (his health has come back meanwhile, by
    // the ordinary rule), and the fight is on again.
    id: 'duel-constitution', chapter: 'duel', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'duel-first-knockdown', completionCue: 'rival-first-recovered',
    scene: { checkpoint: 'duel', gates: ['rival-first-downed', 'rival-first-recovered'] },
    beats: [
      { id: 'rival-first-downed', kind: 'stage', advanceOn: 'rival-first-downed',
        direction: 'The legitimate blow puts Rival on the ground: a real, temporary knockdown.' },
      { id: 'what-condition', speaker: 'narrator', line: 'Perhaps his armor is better tailored than yours. What is his condition?' },
      { id: 'current-constitution', speaker: 'spellblade', line: 'What is your current constitution!?' },
      { id: 'constitution-amended', speaker: 'rival', line: 'My constitution... has been amended many times.' },
      { id: 'cannot-settled', speaker: 'narrator', line: 'Ah... then it appears it cannot be settled.',
        stageDuring: Object.freeze({ cue: 'rival-rise', atSec: 0 }) },
      { id: 'rival-first-rising', kind: 'stage', advanceOn: 'rival-first-recovered', stageCue: 'rival-rise',
        direction: 'Rival is back on his feet.' },
    ],
  },
  {
    // Up again, he comes at the Spellblade again, and terms are discussed mid-fight; down he goes for good only once
    // they have been (the blow that has earned it, after "Prevent this arrangement.").
    id: 'duel-arrangement', chapter: 'duel', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'rival-first-recovered', completionCue: 'duel-damage-threshold',
    scene: { enter: 'rival-real-duel', checkpoint: 'duel', gates: ['duel-damage-threshold'] },
    beats: [
      { id: 'strike-you-first', speaker: 'spellblade', line: 'If I strike you down first, will you cease attacking me?' },
      { id: 'depends-go-down', speaker: 'rival', line: 'That depends, if you go down, I will cease as well' },
      { id: 'prevent-arrangement', speaker: 'narrator', line: 'Prevent this arrangement.' },
      { id: 'real-duel', kind: 'stage', advanceOn: 'duel-damage-threshold', stageCue: 'rival-real-duel',
        direction: 'Observe cumulative legitimate Rival damage during responsive ordinary combat.' },
    ],
  },
  {
    // The threshold blow brings Rival down. He is still down for his excuse, then rises and turns to go.
    id: 'duel-knockdown', chapter: 'duel', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'duel-damage-threshold', completionCue: 'rival-recovered',
    scene: { checkpoint: 'duel', gates: ['rival-downed', 'rival-recovered'] },
    beats: [
      { id: 'rival-downed', kind: 'stage', advanceOn: 'rival-downed',
        direction: 'The legitimate threshold blow buckles Rival to the ground: a brief, readable downed hold.' },
      { id: 'wrong-address', speaker: 'rival', line: 'Argh!... Perhaps I had the wrong address!!' },
      { id: 'rival-rising', kind: 'stage', advanceOn: 'rival-recovered', stageCue: 'rival-rise',
        direction: 'Rival gets up, reaches his feet and turns away.' },
    ],
  },
  {
    // The narration starts as Rival starts to walk away: it narrates the departure, never a sprint already under way.
    id: 'escape-head-start', chapter: 'pursuit', permissions: GUARD, checkpoint: true, presentation: 'reactive',
    entryCondition: 'rival-recovered', completionCue: 'rival-departed',
    captionRehearsal: Object.freeze({ scale: 0.45, minSec: 0.8 }),
    scene: { enter: 'rival-depart', checkpoint: 'pursuit', gates: [] },
    beats: [
      { id: 'departure-start', kind: 'stage', advanceOn: 'rival-departing', stageCue: 'rival-depart',
        direction: 'Rival begins walking away toward the far wall.' },
      { id: 'successful-expulsion', speaker: 'narrator', line: 'And thus the Spellblade had successfully convinced the meddlesome miscommunication Rival to return to sender' },
      { id: 'not-admired', speaker: 'spellblade', line: 'He did not admire me.' },
      { id: 'overstayed-welcome', speaker: 'rival', line: 'I believe I have overstayed my welcome!' },
      { id: 'never-welcome', speaker: 'spellblade', line: 'You were never welcome!' },
      { id: 'say-hello-reminder', speaker: 'narrator', line: 'I told you to say hello...' },
    ],
  },
  {
    // The apparent end: a quiet instruction to the way out, a joke on the way there, and a moment of quiet.
    id: 'false-exit', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'rival-departed', completionCue: 'exit-near', objective: EXIT_OBJECTIVE,
    scene: { enter: 'rival-hold-afar', checkpoint: 'pursuit', gates: [
      { cue: 'exit-walk-started', kind: 'toward-landmark', actor: 'player', landmark: 'exit', distance: 4, activeOnly: true },
      { cue: 'exit-near', kind: 'near-landmark', actor: 'player', landmark: 'exit', distance: 16, activeOnly: true },
    ] },
    beats: [
      { id: 'leave-prompt', kind: 'prompt', speaker: 'instruction', line: 'LEAVE GREENER PASTURES', advanceOn: 'exit-walk-started', mechanic: 'exit' },
      { id: 'time-to-exit', speaker: 'spellblade', line: 'Time to exit like a proper Spellblade.' },
      { id: 'barely-did-anything', speaker: 'narrator', line: 'You barely did anything.' },
      { id: 'exit-quiet', kind: 'stage', advanceOn: 'exit-quiet-ended', advanceAfterSec: 1.8,
        direction: 'Leave the joke alone for a moment while the Spellblade walks on.' },
      { id: 'exit-approach', kind: 'stage', advanceOn: 'exit-near',
        direction: 'The Spellblade nears the way out.' },
    ],
  },
  {
    // Near the way out, Rival threatens his reputation. The Spellblade stops dead at the threat's first word.
    id: 'tattle-threat', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'exit-near', completionCue: 'rival-escaping',
    scene: { enter: 'rival-hold-afar', checkpoint: 'pursuit', gates: ['rival-escaping'] },
    beats: [
      { id: 'threat-halt', kind: 'stage', advanceOn: 'player-halted', stageCue: 'player-halt',
        direction: 'Hold the Spellblade’s locomotion for a moment as the threat begins. Look stays free.' },
      { id: 'escape-made-fun', speaker: 'rival', line: 'If I manage to successfully escape alive, you will be made fun of!' },
      { id: 'realization', kind: 'stage', advanceOn: 'realized', advanceAfterSec: 0.7,
        direction: 'A brief realization before the new objective.' },
      { id: 'pursuit-release', kind: 'stage', advanceOn: 'rival-escaping', stageCue: 'pursuit-release', objective: PURSUIT_OBJECTIVE,
        direction: 'STOP THE RIVAL FROM TELLING ON YOU: Rival flees for real and the pursuit begins.' },
    ],
  },
  {
    id: 'rival-escape', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'rival-escaping', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-escape', checkpoint: 'pursuit', gates: [] },
    beats: [
      // (stopped dead by the threat, the Spellblade's head turns slowly after Rival as he runs off, and is let go)
      { id: 'hardly-wellbeing', speaker: 'narrator', line: 'Oh dear, that hardly seems conducive toward your wellbeing, Spellblade.',
        lookGuide: Object.freeze({ at: 'rival', leadSec: .8, turnSec: 1.6, holdSec: .9 }) },
      { id: 'remains-ahead', speaker: 'spellblade', line: 'My reputation will become dead if he remains ahead!' },
      { id: 'few-steps', speaker: 'narrator', line: 'A few steps ahead.' },
    ],
  },
  {
    // Rival gets ahead, really jumps the stile, lands and gloats while the player is still coming: the wall, and his
    // whole plan, are what the Spellblade "cannot overcome". Jump is the player's from the moment Rival demonstrates it.
    // The hints are had on the move, each pair only if it is over before the Spellblade is at the wall ("jump-call":
    // TutorialSession), and give way to the narrator's one direct word there. A player who jumps on their own is
    // spared whatever is left; one who tries and fails keeps the JUMP prompt.
    id: 'jump-obstacle', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive', checkpoint: true,
    entryCondition: 'rival-escaping', completionCue: 'jump-crossed', objective: PURSUIT_OBJECTIVE, standingPrompt: STILE_STANDING,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-jump', checkpoint: 'jump', releaseControls: { afterCue: 'rival-jumped', permissions: JUMP },
      gates: ['rival-jumped', 'jump-reached', 'jump-approach-ready', 'jump-used', 'jump-crossed'] },
    beats: [
      // (the gloat begins as he lands, while he turns back to face the Spellblade still coming)
      { id: 'jump-arrival', place: 'jump', kind: 'stage', advanceOn: 'rival-jumped', skipWhen: 'jump-crossed',
        direction: 'Pursue Rival to the low field stile. Rival jumps it for real and stops on its far side to gloat.' },
      { id: 'minor-obstacle-gloat', skipWhen:'jump-crossed', speaker: 'rival', line: 'Ahahaha! You cannot overcome this!' },
      // (each question goes with its answer, or neither is had; "I do not get hints." only after a hint has been given)
      { id: 'what-should-do', fitsBefore: 'jump-call', unit: 'ledges', skipWhen:['jump-crossed','jump-used','jump-approach-ready'], speaker: 'spellblade', line: 'What should I do?' },
      { id: 'minor-ledges', fitsBefore: 'jump-call', unit: 'ledges', skipWhen:['jump-crossed','jump-used','jump-approach-ready'], speaker: 'narrator', line: "The Spellblade's journey is not impeded by minor ledges." },
      { id: 'what-does-mean', fitsBefore: 'jump-call', unit: 'occasion', skipWhen:['jump-crossed','jump-used','jump-approach-ready'], speaker: 'spellblade', line: 'What does that mean?' },
      { id: 'rises-occasion', fitsBefore: 'jump-call', unit: 'occasion', skipWhen:['jump-crossed','jump-used','jump-approach-ready'], speaker: 'narrator', line: 'He rises to the occasion, climbs the ranks, and bounds onward toward greater glory.' },
      { id: 'jump-no-hints', fitsBefore: 'jump-call', skipWhen:['jump-crossed','jump-used','jump-approach-ready','ledges-cut'], speaker: 'spellblade', line: 'I do not get hints.' },
      { id: 'jump-near-approach', skipWhen:['jump-crossed','jump-used'], kind:'stage', advanceOn:'jump-approach-ready', direction:'Only the final hint waits for the player nearing the takeoff.' },
      { id: 'jump-instruction', skipWhen:['jump-crossed','jump-used'], speaker: 'narrator', line: 'Jump.' },
      { id: 'jump-prompt', skipWhen:'jump-crossed', kind: 'prompt', speaker: 'instruction', line: 'JUMP', advanceOn: 'jump-used', mechanic: 'jump', permissions: JUMP },
      { id: 'jump-crossing', place: 'jump-crossing', skipWhen:'jump-crossed', kind: 'stage', advanceOn: 'jump-crossed', mechanic: 'jump', permissions: JUMP,
        direction: 'Observe the player cross the named stile through an ordinary Jump.' },
      { id: 'took-us-long', speaker: 'spellblade', line: 'Haha! Took US long enough.', permissions: JUMP },
      { id: 'us', speaker: 'narrator', line: 'Us?', permissions: JUMP },
      { id: 'minor-tactical-regret', speaker: 'rival', line: 'No! I should not have stopped running for such a minor tactical advantage!', permissions: JUMP },
    ],
  },
  {
    id: 'pursuit-banter', chapter: 'pursuit', permissions: JUMP, presentation: 'reactive', required: false,
    branches: [],
    entryCondition: 'jump-crossed', completionCue: 'pursuit-banter-ended', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-escape', checkpoint: 'fireball', gates: [
      { cue: 'pursuit-banter-reached', kind: 'past-landmark', actor: 'player', landmark: 'pursuit-banter' },
    ] },
    beats: [
      { id: 'pursuit-banter-arrival', place: 'pursuit-banter', kind: 'stage', advanceOn: 'pursuit-banter-reached',
        direction: 'Continue through the orchard lane before shouting another exchange at the fleeing Rival.' },
      { id: 'final-hello', speaker: 'spellblade', line: 'Hello!' },
      { id: 'too-late-hello', speaker: 'rival', line: 'It is too late for that!' },
      { id: 'reconsider-meeting', speaker: 'spellblade', line: 'Then allow me to reconsider ever meeting you!' },
      { id: 'sword-remains', speaker: 'rival', line: 'The sword remains mightier than the pen...' },
      { id: 'remain-mightier', speaker: 'rival', line: '...and I remain mightier than anything that is not me!' },
      { id: 'lot-of-things', speaker: 'narrator', line: 'That is a lot of things.' },
      { id: 'pursuit-banter-clear', kind: 'stage', advanceOn: 'pursuit-banter-ended', advanceAfterSec: 2.5,
        direction: 'Let the exchange land during continued pursuit before introducing Fireball.' },
    ],
  },
  {
    id: 'fireball', chapter: 'fireball', permissions: FIREBALL, presentation: 'reactive', branches: ['first-fireball-miss', 'rival-constitution'],
    entryCondition: 'rival-escaping', completionCue: 'fireball-hit', objective: PURSUIT_OBJECTIVE,
    scene: { checkpoint: 'pursuit', gates: ['fireball-hit'] },
    beats: [
      // (a Fireball that has found him already: the lesson's lead-in and its hints are not had; a joke begun is finished)
      { id: 'why-spellblade', skipWhen: 'fireball-hit', speaker: 'narrator', line: 'Why are you called the Spellblade?' },
      { id: 'spell-blade', speaker: 'spellblade', line: 'Because I can spell ‘blade’!' },
      { id: 'impressive', speaker: 'narrator', line: 'Impressive.' },
      { id: 'magic-disposal', skipWhen: 'fireball-hit', speaker: 'narrator', line: 'But also, you have magic at your disposal' },
      { id: 'waiting-reminder', skipWhen: 'fireball-hit', speaker: 'spellblade', line: 'I knew that! I had just been waiting for you to remind me!' },
      { id: 'almost-there', skipWhen: 'fireball-hit', speaker: 'rival', line: 'I am almost there!' },
      { id: 'fireball-prompt', kind: 'prompt', speaker: 'instruction', line: 'CAST FIREBALL', advanceOn: 'fireball-hit', mechanic: 'fireball' },
      { id: 'rival-cold', reactionFor: 'fireball-hit', speaker: 'rival', line: 'That was cold of you, ow!' },
      { id: 'warm-feelings', reactionFor: 'fireball-hit', speaker: 'spellblade', line: 'I am developing warm feelings about this!' },
      { id: 'concerning', reactionFor: 'fireball-hit', speaker: 'narrator', line: 'Concerning.' },
    ],
  },
  {
    id: 'tattle-reveal', chapter: 'fireball', permissions: FIREBALL, presentation: 'reactive',
    entryCondition: 'fireball-hit', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { checkpoint: 'pursuit', gates: [
      { cue: 'tattle-reveal-reached', kind: 'past-landmark', actor: 'player', landmark: 'tattle-reveal' },
    ] },
    beats: [
      { id: 'tattle-reveal-arrival', place: 'tattle-reveal', kind: 'stage', advanceOn: 'tattle-reveal-reached',
        direction: 'Reach the named pursuit landmark while the complaint office remains a distant destination.' },
      { id: 'matter-settled', speaker: 'rival', line: 'I know exactly how this matter must be settled.' },
      { id: 'how-settled', speaker: 'narrator', line: 'How?' },
      { id: 'utmost-dignity', speaker: 'rival', line: 'It will be at a place of utmost dignity!' },
      { id: 'rightfully-condemned', speaker: 'rival', line: 'Where you will be rightfully condemned!' },
      { id: 'told-on', speaker: 'rival', line: '...and be told on.' },
      { id: 'acquired-attention', speaker: 'spellblade', line: 'NOW this has acquired my attention!' },
    ],
  },
  {
    // The sheepfold's low wall: Rival vaults it and calls it the end of the story; the Spellblade's own leap answers.
    id: 'dead-end', chapter: 'fireball', permissions: FIREBALL, presentation: 'reactive',
    entryCondition: 'tattle-reveal-reached', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { checkpoint: 'pursuit', gates: ['dead-end-rival-over', 'dead-end-crossed'] },
    beats: [
      // (skipped only if the Spellblade was over first: one leaping after him still hears the gloat, and answers it)
      { id: 'dead-end-arrival', place: 'dead-end', kind: 'stage', advanceOn: 'dead-end-rival-over', skipWhen: 'dead-end-first',
        direction: 'Rival vaults the sheepfold wall and calls it the end of the road.' },
      { id: 'your-dead-end', skipWhen: 'dead-end-first', speaker: 'rival', line: 'Yes! Alas we have reached the end of your story. Your dead-end!' },
      { id: 'more-pages', skipWhen: 'dead-end-crossed', speaker: 'narrator', line: 'You have more pages, Spellblade.' },
      { id: 'dead-end-crossing', place: 'dead-end-crossing', kind: 'stage', advanceOn: 'dead-end-crossed',
        direction: 'The Spellblade leaps the wall (or takes the side gate).' },
      // (a phonetic joke: "a LIE!" for a moment, then the last /v/ makes it "alive": nothing may clip its pause)
      { id: 'dead-end-alive', speaker: 'spellblade', line: 'The dead-end is a LIE—ve!' },
    ],
  },
  {
    id: 'bridge-dash', chapter: 'bridge', permissions: FIREBALL, checkpoint: true, presentation: 'reactive',
    entryCondition: 'fireball-hit', completionCue: 'bridge-crossed', objective: PURSUIT_OBJECTIVE, standingPrompt: BROOK_STANDING,
    branches: ['rival-constitution', 'bridge-growth'],
    scene: { enter: 'rival-bridge', checkpoint: 'bridge', gates: ['bridge-reached', 'dash-used', 'bridge-crossed'] },
    beats: [
      { id: 'bridge-arrival', place: 'bridge', kind: 'stage', advanceOn: 'bridge-reached',
        direction: 'Continue the real chase until the broken stone bridge comes into play.' },
      { id: 'get-over-this', speaker: 'rival', line: 'Aha, try getting over this!' },
      { id: 'decent-suggestion', speaker: 'narrator', line: 'He makes a decent suggestion, sir.' },
      { id: 'get-over-it', speaker: 'spellblade', line: 'I will get over it! But not in the way you think!' },
      { id: 'dash-prompt', kind: 'prompt', speaker: 'instruction', line: 'DASH', advanceOn: 'dash-used', mechanic: 'dash', permissions: DASH },
      { id: 'bridge-crossing', place: 'bridge-crossing', kind: 'stage', advanceOn: 'bridge-crossed', stageCue: 'observe-bridge-crossing', permissions: DASH,
        direction: 'Observe genuine bridge traversal and a genuine Dash opportunity.' },
      { id: 'surpass-obstacle', speaker: 'spellblade', recordingKey: 'tutorial.small-gaps', line: 'Small gaps have never stopped anybody important.', permissions: DASH },
      { id: 'grow-maturity', speaker: 'narrator', line: 'You have grown, maturity awaits you after all, Spellblade.', permissions: DASH },
      { id: 'but-knight', speaker: 'spellblade', line: 'Never! I am a knight!', permissions: DASH },
    ],
  },
  {
    id: 'counterfire', chapter: 'counterfire', permissions: DASH, presentation: 'reactive', branches: ['burned', 'rival-constitution', 'permission-to-stop'],
    entryCondition: 'bridge-crossed', completionCue: 'counterfire-complete', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-pursuit', checkpoint: 'counterfire', gates: ['subsequent-fireball-hit', 'counterfire-pressure', 'rival-counterfire-started', 'counterfire-complete'] },
    beats: [
      { id: 'counterfire-hit', kind: 'stage', advanceOn: 'subsequent-fireball-hit', skipWhen: 'counterfire-pressure',
        direction: 'Observe another genuine Fireball hit while the chase continues.' },
      { id: 'cease-singeing', skipWhen: 'counterfire-pressure', speaker: 'rival', line: 'Cease this singeing, I insist' },
      { id: 'counterfire-response', kind: 'stage', advanceOn: 'rival-counterfire-started', stageCue: 'rival-counterfire',
        direction: 'Rival answers with ordinary Fireball while continuing to flee.' },
      { id: 'follow-footsteps', speaker: 'narrator', line: 'I recommend following in his footsteps.' },
      { id: 'counterfire-pursuit', kind: 'stage', advanceOn: 'counterfire-complete', stageCue: 'rival-combined-pursuit',
        direction: 'Continue pursuit using ordinary Sprint, Dash, projectile evasion and counterfire.' },
    ],
  },
  {
    id: 'complaint-approach', chapter: 'final-guard', permissions: DASH, presentation: 'reactive', checkpoint: true,
    entryCondition: 'counterfire-complete', completionCue: 'complaint-approached', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution', 'permission-to-stop'],
    scene: { enter: 'rival-complaint-approach', checkpoint: 'counterfire', gates: [
      { cue: 'complaint-approached', kind: 'near-entrance', actor: 'rival', distance: 100 },
    ] },
    beats: [
      { id: 'complaint-arrival', place: 'complaint', kind: 'stage', advanceOn: 'complaint-approached',
        direction: 'Continue the moving chase until TATTLE ON YOU is readable and Rival is approaching its entrance.' },
      { id: 'legend-ends', speaker: 'narrator', line: 'This is not where your legend ends, Spellblade. Knights are not made to be made fun of.' },
    ],
  },
  {
    id: 'pride-stop', chapter: 'final-guard', permissions: DASH, presentation: 'reactive', checkpoint: true,
    entryCondition: 'complaint-approached', completionCue: 'rival-turned', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-complaint-approach', checkpoint: 'final', gates: ['rival-turned'] },
    beats: [
      { id: 'knight-help', speaker: 'spellblade', line: 'A real knight never asks for help!' },
      { id: 'pride-turn', place: 'pride', kind: 'stage', advanceOn: 'rival-turned', stageCue: 'rival-pride',
        direction: 'Rival hesitates near the entrance, slows, stops, turns toward YOU and chooses to fight.' },
    ],
  },
  {
    id: 'duel-terms', chapter: 'final-guard', permissions: DASH, presentation: 'reactive',
    entryCondition: 'rival-turned', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-ready', checkpoint: 'final', gates: [] },
    beats: [
      { id: 'blast-not-considered', speaker: 'rival', line: "Blast! I hadn't considered that!" },
      { id: 'fine-we-duel', speaker: 'rival', line: 'Fine then, we duel!' },
      { id: 'if-i-win-tell', speaker: 'rival', line: 'If I win! I tell on you!' },
      { id: 'if-you-lose-told', speaker: 'rival', line: 'If you lose, you lie on the ground and wait to be told on!' },
      { id: 'when-i-win', speaker: 'spellblade', line: 'And when I win?' },
      { id: 'not-part-terms', speaker: 'rival', line: 'That was not part of the terms' },
      { id: 'scripted-against-you', speaker: 'narrator', line: 'This seems scripted against you.' },
      { id: 'come-prove-it', speaker: 'rival', line: 'Come here and prove it!' },
    ],
  },
  {
    // The final Rival has learned something: he turns the first strike away with a real Parry, holds his Guard,
    // and only once it is genuinely broken does the fight become an ordinary one to the end.
    id: 'rival-defeat', chapter: 'final-guard', permissions: DASH, presentation: 'reactive',
    branches: ['final-feelings', 'final-loss-1', 'final-loss-2'],
    entryCondition: 'rival-turned', completionCue: 'rival-defeated', objective: FINAL_OBJECTIVE,
    scene: { enter: 'rival-final-opening', checkpoint: 'final', gates: ['final-first-parry', 'rival-guard-broken', 'rival-defeated'] },
    beats: [
      { id: 'final-opening', kind: 'stage', advanceOn: 'final-first-parry', stageCue: 'rival-final-opening',
        direction: 'Rival holds his post in Guard and turns the first sword strike away with a genuine Parry.' },
      { id: 'stop-you', speaker: 'rival', line: 'This should stop you!' },
      { id: 'convince-unblock', speaker: 'narrator', line: 'Convince him to unblock you.' },
      { id: 'final-guard', kind: 'stage', advanceOn: 'rival-guard-broken', stageCue: 'rival-final-guard', mechanic: 'guard-break',
        direction: 'Ordinary combat against a purposeful Guard until the player genuinely breaks it.' },
      { id: 'did-not-stop', speaker: 'rival', line: 'That did not stop you!!' },
      { id: 'defeat-rival', kind: 'stage', advanceOn: 'rival-defeated', stageCue: 'rival-final-fight',
        direction: 'Observe a genuine Rival defeat during responsive ordinary combat.' },
    ],
  },
  {
    id: 'title-ending', chapter: 'ending', permissions: DASH, presentation: 'reactive',
    entryCondition: 'rival-defeated', completionCue: 'title-ended',
    scene: { checkpoint: 'final', gates: ['title-first-ended', 'title-final-ended', 'departure-complete', 'title-ended'] },
    beats: [
      { id: 'who-are-you', speaker: 'rival', line: 'Who are you?' },
      { id: 'i-am', speaker: 'spellblade', line: 'I am...' },
      { id: 'title-first', kind: 'stage', advanceOn: 'title-first-ended', stageCue: 'title-first',
        presentation: 'title', brandTitle: true, rehearsalSec: 2.5, direction: 'Present the existing SWORDS & SORCERY title.' },
      { id: 'strange-name', speaker: 'rival', line: 'What a strange name.' },
      { id: 'true-master', speaker: 'spellblade', line: 'If I see ANYONE else who dares to resemble me, as you did... I shall correct their ignorance... and show who is the true master of' },
      { id: 'title-final', kind: 'stage', advanceOn: 'title-final-ended', stageCue: 'title-final',
        presentation: 'title', brandTitle: true, rehearsalSec: 2.5, direction: 'Present SWORDS & SORCERY again as the final title payoff.' },
      { id: 'player-departure', kind: 'stage', advanceOn: 'departure-complete', stageCue: 'player-departure',
        direction: 'Stage the departure in first person or with an appropriate fade.' },
      { id: 'closing-hope', speaker: 'narrator', line: 'Let us hope there are not many like him.' },
      { id: 'tutorial-ended', kind: 'stage', advanceOn: 'title-ended', stageCue: 'tutorial-complete',
        direction: 'The title payoff and closing line have finished. Tutorial 1 is complete.' },
    ],
  },
];

export const TUTORIAL_SEGMENTS = Object.freeze(segments.map((segment, index) => Object.freeze({
  required: true, enabled: true, checkpoint: false, entryCondition: null, branches: Object.freeze([]),
  retry: Object.freeze({ behavior: 'checkpoint', clearProjectiles: true, resetRivalPhase: true }),
  cleanup: Object.freeze(['segment-caption']),
  ...segment,
  permissions: Object.freeze([...segment.permissions]),
  requiresSegments: Object.freeze([...(segment.requiresSegments ?? [])]),
  scene: Object.freeze({ ...segment.scene, gates: Object.freeze(segment.scene.gates.map(gate =>
    Object.freeze(typeof gate === 'string' ? { cue: gate, kind: 'fact' } : { ...gate }))) }),
  branches: Object.freeze([...(segment.branches ?? [])]),
  next: segments[index + 1]?.id ?? null,
  beats: Object.freeze(segment.beats.map(beat => authored({ ...beat,
    ...(segment.required === false ? { optionalSegment: segment.id } : {}),
  }, segment.chapter, segment.id, segment.presentation))),
})));

// Route selection is data driven: callers may provide a revised segment list.
// Enabled optional scenes are included by default and can be removed independently.
// Explicit dependencies suppress only scenes whose declared provider was removed.
export function tutorialRouteSegments(route = TUTORIAL_SEGMENTS, { omitSegments = [], includeOptional = true } = {}) {
  const omitted = new Set(omitSegments);
  let selected = route.filter(segment => segment.enabled !== false && !omitted.has(segment.id)
    && (includeOptional || segment.required !== false));
  let previousCount;
  do {
    previousCount = selected.length;
    const available = new Set(selected.map(segment => segment.id));
    selected = selected.filter(segment => (segment.requiresSegments ?? []).every(id => available.has(id)));
  } while (selected.length !== previousCount);
  const compiled = [];
  for (const [index, segment] of selected.entries()) {
    const previous = compiled.at(-1);
    const chapter = segment.chapter ?? previous?.chapter ?? 'spellblade';
    const presentation = segment.presentation
      ?? segment.beats?.find(beat => (beat.kind ?? 'dialogue') === 'dialogue' && beat.presentation)?.presentation
      ?? previous?.presentation ?? 'blocking';
    const beats = Object.freeze((segment.beats ?? []).map(beat => authored({ ...beat,
      ...(segment.required === false ? { optionalSegment: segment.id } : {}),
    }, chapter, segment.id, presentation)));
    const scene = segment.scene ?? {};
    compiled.push(Object.freeze({
      required: true, enabled: true, checkpoint: false, entryCondition: null,
      retry: Object.freeze({ behavior: 'checkpoint', clearProjectiles: true, resetRivalPhase: true }),
      cleanup: Object.freeze(['segment-caption']),
      ...segment,
      enabled: segment.enabled ?? true,
      chapter, presentation, beats,
      permissions: Object.freeze([...(segment.permissions ?? previous?.permissions ?? [])]),
      requiresSegments: Object.freeze([...(segment.requiresSegments ?? [])]),
      branches: Object.freeze([...(segment.branches ?? [])]),
      scene: Object.freeze({ ...scene, ...(scene.gates ? {
        gates: Object.freeze(scene.gates.map(gate => Object.freeze(typeof gate === 'string' ? { cue: gate, kind: 'fact' } : { ...gate }))),
      } : {}) }),
      completionCue: segment.completionCue ?? beats.at(-1)?.advanceOn ?? 'continue',
      next: selected[index + 1]?.id ?? null,
    }));
  }
  return Object.freeze(compiled);
}

export function tutorialRouteBeats(route = TUTORIAL_SEGMENTS, options = {}) {
  return Object.freeze(tutorialRouteSegments(route, options).flatMap(segment => segment.beats));
}

export const TUTORIAL_BEATS = tutorialRouteBeats();

const chapterTitles = [
  ['spellblade', 'I. THE SPELLBLADE'], ['approach', 'II. THE APPROACH'],
  ['introductions', 'III. INTRODUCTIONS'], ['negotiations', 'IV. NEGOTIATIONS'],
  ['correspondence', 'V. CORRESPONDENCE'], ['duel', 'VI. THE ARRANGEMENT'],
  ['pursuit', 'VII. THE PURSUIT'], ['fireball', 'VIII. FIREBALL'],
  ['bridge', 'IX. THE BRIDGE'], ['counterfire', 'X. COUNTERFIRE'],
  ['final-guard', 'XI. FINAL STAND'], ['ending', 'ENDING'],
];
export const TUTORIAL_CHAPTERS = Object.freeze(chapterTitles.map(([id, title]) => Object.freeze({
  id, title, implemented: true,
  segments: Object.freeze(TUTORIAL_SEGMENTS.filter(segment => segment.chapter === id)),
  beats: Object.freeze(TUTORIAL_BEATS.filter(beat => beat.chapter === id)),
})));

const branchDeclarations = {
  frolic: {
    segment: 'approach', chapter: 'approach', triggerCue: 'player-frolicking',
    beats: [
      { id: 'frolic-fields', exchange: 'frolic', speaker: 'narrator', line: 'The Spellblade decides to frolic in the fields, as he may one day never do so again' },
      { id: 'remembering-move', exchange: 'frolic', speaker: 'spellblade', line: 'I am not frolicking. I am remembering how to move!' },
    ],
  },
  // (the pursuit's own asides: one not yet begun when he turns at his door to fight is not had)
  'rival-constitution': {
    segment: 'rival-escape', chapter: 'pursuit', triggerCue: 'rival-survived-lethal', until: 'rival-turned',
    beats: [
      { id: 'constitution-strange', exchange: 'constitution-strange', speaker: 'narrator', line: 'Hmm. This is strange.' },
      { id: 'not-strange', exchange: 'constitution-strange', replyGroup: 'constitution-correction', speaker: 'spellblade', line: 'No I am not!', pauseAfterSec: .15 },
      { id: 'not-fallen', exchange: 'constitution-strange', replyGroup: 'constitution-correction', speaker: 'narrator', line: 'Your rival appears not to have fallen yet.' },
      { id: 'thank-noticing', exchange: 'constitution-strange', speaker: 'rival', line: 'Thank you for noticing!!' },
      // (his condition was asked after at the first duel's knockdown: the pursuit only notices he has not fallen)
    ],
  },
  // (until: an aside not yet begun is dropped once this has happened: after the hit, a miss is no longer news)
  'first-fireball-miss': {
    segment: 'fireball', chapter: 'fireball', triggerCue: 'fireball-missed', until: 'fireball-hit',
    beats: [
      { id: 'rival-over-there', exchange: 'scorch-mark', replyGroup: 'scorch-mark', speaker: 'narrator', line: 'Your rival is over there' },
      { id: 'scorch-mark', exchange: 'scorch-mark', replyGroup: 'scorch-mark', speaker: 'spellblade', line: 'And I wanted a scorch mark, over there.' },
    ],
  },
  'bridge-growth': {
    segment: 'bridge-dash', chapter: 'bridge', triggerCue: 'bridge-retry-extended', until: 'bridge-crossed',
    beats: [
      { id: 'bridge-senses-failure', exchange: 'bridge-growth', speaker: 'narrator', line: 'The bridge grows longer when it senses failure' },
      { id: 'hence-i-crossed', exchange: 'bridge-growth', speaker: 'rival', line: 'Hence why I crossed it!' },
    ],
  },
  'permission-to-stop': {
    segment: 'counterfire', chapter: 'counterfire', triggerCue: 'repeated-pursuit-fireballs', until: 'rival-turned',
    beats: [
      { id: 'permission-stop', exchange: 'permission', speaker: 'rival', line: 'I give you permission to stop' },
      { id: 'no-longer-ruin', exchange: 'permission', speaker: 'spellblade', line: 'Will you no longer ruin my reputation, honor, status and therefore livelihood? And health?' },
      { id: 'permission-no', exchange: 'permission', replyGroup: 'permission-refusal', speaker: 'rival', line: 'No.', pauseAfterSec: .08 },
      { id: 'then-no', exchange: 'permission', replyGroup: 'permission-refusal', speaker: 'spellblade', line: 'Then no.' },
    ],
  },
  burned: {
    segment: 'counterfire', chapter: 'counterfire', triggerCue: 'player-burned', until: 'rival-turned',
    beats: [
      { id: 'burn-subsided', exchange: 'burned', speaker: 'spellblade', line: 'AHH, AH AH- Oh it has subsided.',
        performanceCue: Object.freeze({ at: 'burn-ended', action: 'continue-reaction' }) },
      { id: 'reforged', exchange: 'burned', speaker: 'spellblade', line: 'I have been reforged!' },
      { id: 'not-too-many', exchange: 'burned', speaker: 'narrator', line: 'Not too many times, now' },
    ],
  },
  // When Rival wins the final duel: the first loss and the second each have their line; after that, quiet.
  'final-loss-1': {
    segment: 'rival-defeat', chapter: 'final-guard', triggerCue: 'player-defeated-final',
    beats: [{ id: 'fight-yourself', speaker: 'rival', line: 'How will you fight yourself, if you cannot defeat your Rival?' }],
  },
  'final-loss-2': {
    segment: 'rival-defeat', chapter: 'final-guard', triggerCue: 'player-defeated-final',
    beats: [{ id: 'already-told', speaker: 'rival', line: 'Perhaps I won’t tell on you. You have already done so for me.' }],
  },
  // A Fireball in the final duel ("I am developing warm feelings about this!" earlier)
  'final-feelings': {
    segment: 'rival-defeat', chapter: 'final-guard', triggerCue: 'final-fireball-hit',
    beats: [{ id: 'feelings-health', speaker: 'rival', line: 'Your feelings shall not affect my health.' }],
  },
};

export const TUTORIAL_BRANCH_METADATA = Object.freeze(Object.fromEntries(Object.entries(branchDeclarations)
  .map(([id, branch]) => [id, Object.freeze({ id, segment: branch.segment, chapter: branch.chapter,
    triggerCue: branch.triggerCue, oncePerRun: true, required: false, blocking: false })])));
export const TUTORIAL_BRANCHES = Object.freeze(Object.fromEntries(Object.entries(branchDeclarations)
  .map(([id, branch]) => [id, Object.freeze(branch.beats.map(beat => authored({ ...beat, ...(branch.until ? { until: branch.until } : {}) },
    branch.chapter, branch.segment, 'reactive', id)))])));

// Retained for consumers of the former preview boundary. The full route has no cutoff.
export const TUTORIAL_PREVIEW_STOP = null;
