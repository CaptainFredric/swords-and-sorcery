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
      { id: 'truly-look-around', speaker: 'narrator', line: 'No. Truly look around.' },
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
        direction: 'Observe the current uninterrupted Sprint episode while meaningful stamina remains.', stageCue: 'observe-sprint' },
      { id: 'can-do-all-day', speaker: 'spellblade', line: 'Ah, hahaha! I can do this all day!' },
      { id: 'winded-prompt', kind: 'prompt', speaker: 'instruction', line: 'SPRINT UNTIL WINDED', advanceOn: 'player-winded', mechanic: 'sprint' },
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
      { id: 'negotiations', speaker: 'narrator', line: 'Woah. It appears negotiations have gone hostile.' },
      { id: 'placate', speaker: 'narrator', line: 'Try placating him.' },
      { id: 'stand-down', speaker: 'spellblade', line: 'Stand down where you belong. Please?' },
      { id: 'sword-pen', speaker: 'rival', line: 'The sword is mightier than the pen!' },
      { id: 'own-pen', speaker: 'narrator', line: 'Oh brother. Tell him off. With your own ‘pen’...' },
      { id: 'attack-prompt', kind: 'prompt', speaker: 'instruction', line: 'ATTACK', advanceOn: 'sword-contact', mechanic: 'attack' },
      { id: 'teach-you', speaker: 'spellblade', line: 'That should teach you.' },
      { id: 'harsh-lesson', speaker: 'narrator', line: 'A harsh lesson.' },
      { id: 'opinion', speaker: 'rival', line: 'Ow! I was simply stating my opinion on the comparative qualities between swords and pens!' },
      { id: 'revise', speaker: 'rival', line: 'You have taught me to revise my response.' },
      { id: 'draw-sword', kind: 'stage', advanceOn: 'rival-sword-drawn', stageCue: 'rival-draw-sword',
        direction: 'Rival visibly draws his sword, preparing the ordinary Guard lesson.' },
    ],
  },
  {
    id: 'first-guard', chapter: 'correspondence', permissions: GUARD,
    entryCondition: 'sword-contact', completionCue: 'player-damaged',
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
    entryCondition: 'player-damaged', completionCue: 'health-regenerated',
    requiresSegments: ['first-guard'],
    scene: { enter: 'rival-give-space', checkpoint: 'introductions', gates: ['health-regenerated'] },
    beats: [
      { id: 'need-a-moment', speaker: 'spellblade', line: 'I need a moment.' },
      { id: 'health-regen-prompt', kind: 'prompt', speaker: 'instruction', line: 'HEALTH REGENERATES', advanceOn: 'health-regenerated', mechanic: 'health-regen' },
      { id: 'no-hints', speaker: 'spellblade', line: 'I do not get hints.' },
      { id: 'imminent-demise', speaker: 'rival', line: 'Of your imminent demise?' },
      { id: 'not-my-plan', speaker: 'spellblade', line: 'Ah... no, that was not my plan today.' },
    ],
  },
  {
    id: 'real-duel', chapter: 'duel', permissions: GUARD, checkpoint: true, presentation: 'reactive',
    entryCondition: 'health-regenerated', completionCue: 'duel-damage-threshold',
    scene: { enter: 'rival-idle', checkpoint: 'duel', gates: ['rival-attack-started', 'duel-damage-threshold'] },
    beats: [
      { id: 'well', speaker: 'rival', line: 'Well.' },
      { id: 'duel-onset', kind: 'stage', advanceOn: 'rival-attack-started', stageCue: 'rival-attack',
        direction: 'Launch Rival’s ordinary attack at the onset of the following line.' },
      { id: 'plans-change', speaker: 'rival', line: 'Things do not always go according to plan.',
        performanceCue: Object.freeze({ at: 'onset', action: 'rival-attack', stageBeat: 'duel-onset', precedingBeat: 'well' }) },
      { id: 'indeed', speaker: 'narrator', line: 'Indeed.' },
      { id: 'strike-you-first', speaker: 'spellblade', line: 'If I strike you down first, will you cease attacking me?' },
      { id: 'depends-go-down', speaker: 'rival', line: 'That depends, if you go down, I will cease as well' },
      { id: 'prevent-arrangement', speaker: 'narrator', line: 'Prevent this arrangement.' },
      { id: 'real-duel', kind: 'stage', advanceOn: 'duel-damage-threshold', stageCue: 'rival-real-duel',
        direction: 'Observe cumulative legitimate Rival damage during responsive ordinary combat.' },
      { id: 'taking-a-while', speaker: 'spellblade', line: 'You are taking a while to go down!' },
      { id: 'not-yet', speaker: 'rival', line: 'Haha! I do not feel like it yet!' },
      { id: 'informative', speaker: 'narrator', line: 'How informative.' },
    ],
  },
  {
    id: 'escape-head-start', chapter: 'pursuit', permissions: LOOK, checkpoint: true, presentation: 'reactive',
    entryCondition: 'duel-damage-threshold', completionCue: 'rival-escaping',
    captionRehearsal: Object.freeze({ scale: 0.45, minSec: 0.8 }),
    objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-escape', checkpoint: 'pursuit', gates: ['rival-escaping'] },
    beats: [
      { id: 'escape-start', kind: 'stage', advanceOn: 'rival-escaping',
        direction: 'Rival disengages and runs along the authored pursuit route.' },
      { id: 'successful-expulsion', speaker: 'narrator', line: 'And thus the Spellblade had successfully convinced the meddlesome miscommunication Rival to return to sender' },
      { id: 'not-admired', speaker: 'spellblade', line: 'He did not admire me.' },
      { id: 'overstayed-welcome', speaker: 'rival', line: 'I believe I have overstayed my welcome!' },
      { id: 'never-welcome', speaker: 'spellblade', line: 'You were never welcome!' },
      { id: 'say-hello-reminder', speaker: 'narrator', line: 'I told you to say hello...' },
      { id: 'escape-made-fun', speaker: 'rival', line: 'If I manage to successfully escape alive, you will be made fun of!' },
      { id: 'pursuit-release', kind: 'stage', advanceOn: 'pursuit-released', stageCue: 'pursuit-release', permissions: GUARD,
        direction: 'Release ordinary pursuit while Rival continues fleeing. The temporary escape head start ends here.' },
      { id: 'hardly-wellbeing', speaker: 'narrator', line: 'Oh dear, that hardly seems conducive toward your wellbeing, Spellblade.', permissions: GUARD },
    ],
  },
  {
    id: 'rival-escape', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive',
    entryCondition: 'rival-escaping', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-escape', checkpoint: 'pursuit', gates: [] },
    beats: [
      { id: 'remains-ahead', speaker: 'spellblade', line: 'I would like to keep attacking, but he remains ahead!' },
      { id: 'few-steps', speaker: 'narrator', line: 'A few steps ahead.' },
    ],
  },
  {
    id: 'jump-obstacle', chapter: 'pursuit', permissions: GUARD, presentation: 'reactive', checkpoint: true,
    entryCondition: 'rival-escaping', completionCue: 'jump-crossed', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-jump', checkpoint: 'jump', gates: ['jump-reached', 'jump-used', 'jump-crossed'] },
    beats: [
      { id: 'jump-arrival', kind: 'stage', advanceOn: 'jump-reached',
        direction: 'Pursue Rival to the low field stile. Rival crosses and stops on its far side to gloat.' },
      { id: 'minor-obstacle-gloat', speaker: 'rival', line: 'Ahahaha! You cannot overcome this!' },
      { id: 'what-should-do', speaker: 'spellblade', line: 'What should I do?' },
      { id: 'minor-ledges', speaker: 'narrator', line: "The Spellblade's journey is not impeded by minor ledges." },
      { id: 'what-does-mean', speaker: 'spellblade', line: 'What does that mean?' },
      { id: 'rises-occasion', speaker: 'narrator', line: 'He rises to the occasion, climbs the ranks, and bounds onward toward greater glory.' },
      { id: 'jump-no-hints', speaker: 'spellblade', line: 'I do not get hints.' },
      { id: 'jump-instruction', speaker: 'narrator', line: 'Jump.' },
      { id: 'jump-prompt', kind: 'prompt', speaker: 'instruction', line: 'JUMP', advanceOn: 'jump-used', mechanic: 'jump', permissions: JUMP },
      { id: 'jump-crossing', kind: 'stage', advanceOn: 'jump-crossed', mechanic: 'jump', permissions: JUMP,
        direction: 'Observe the player cross the named stile through an ordinary Jump.' },
      { id: 'took-us-long', speaker: 'spellblade', line: 'Haha! Took US long enough.', permissions: JUMP },
      { id: 'us', speaker: 'narrator', line: 'Us?', permissions: JUMP },
      { id: 'minor-tactical-regret', speaker: 'rival', line: 'No! I should not have stopped running for such a minor tactical advantage!', permissions: JUMP },
    ],
  },
  {
    id: 'fireball', chapter: 'fireball', permissions: FIREBALL, presentation: 'reactive', branches: ['first-fireball-miss', 'rival-constitution'],
    entryCondition: 'rival-escaping', completionCue: 'fireball-hit', objective: PURSUIT_OBJECTIVE,
    scene: { checkpoint: 'pursuit', gates: ['fireball-hit'] },
    beats: [
      { id: 'why-spellblade', speaker: 'narrator', line: 'Why are you called the Spellblade?' },
      { id: 'spell-blade', speaker: 'spellblade', line: 'Because I can spell ‘blade’!' },
      { id: 'impressive', speaker: 'narrator', line: 'Impressive.' },
      { id: 'magic-disposal', speaker: 'narrator', line: 'But also, you have magic at your disposal' },
      { id: 'waiting-reminder', speaker: 'spellblade', line: 'I knew that! I had just been waiting for you to remind me!' },
      { id: 'almost-there', speaker: 'rival', line: 'I am almost there!' },
      { id: 'fireball-prompt', kind: 'prompt', speaker: 'instruction', line: 'CAST FIREBALL', advanceOn: 'fireball-hit', mechanic: 'fireball' },
      { id: 'rival-cold', speaker: 'rival', line: 'That was cold of you, ow!' },
      { id: 'warm-feelings', speaker: 'spellblade', line: 'I am developing warm feelings about this!' },
      { id: 'concerning', speaker: 'narrator', line: 'Concerning.' },
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
      { id: 'tattle-reveal-arrival', kind: 'stage', advanceOn: 'tattle-reveal-reached',
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
    id: 'bridge-dash', chapter: 'bridge', permissions: FIREBALL, checkpoint: true, presentation: 'reactive',
    entryCondition: 'fireball-hit', completionCue: 'bridge-crossed', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution', 'bridge-growth'],
    scene: { enter: 'rival-bridge', checkpoint: 'bridge', gates: ['bridge-reached', 'dash-used', 'bridge-crossed'] },
    beats: [
      { id: 'bridge-arrival', kind: 'stage', advanceOn: 'bridge-reached',
        direction: 'Continue the real chase until the broken stone bridge comes into play.' },
      { id: 'get-over-this', speaker: 'rival', line: 'Aha, try getting over this!' },
      { id: 'decent-suggestion', speaker: 'narrator', line: 'He makes a decent suggestion, sir.' },
      { id: 'get-over-it', speaker: 'spellblade', line: 'I will get over it! But not in the way you think!' },
      { id: 'dash-prompt', kind: 'prompt', speaker: 'instruction', line: 'DASH', advanceOn: 'dash-used', mechanic: 'dash', permissions: DASH },
      { id: 'bridge-crossing', kind: 'stage', advanceOn: 'bridge-crossed', stageCue: 'observe-bridge-crossing', permissions: DASH,
        direction: 'Observe genuine bridge traversal and a genuine Dash opportunity.' },
      { id: 'surpass-obstacle', speaker: 'spellblade', recordingKey: 'tutorial.small-gaps', line: 'Small gaps have never stopped anybody important.', permissions: DASH },
      { id: 'grow-maturity', speaker: 'narrator', line: 'You have grown, maturity awaits you after all, Spellblade.', permissions: DASH },
      { id: 'but-knight', speaker: 'spellblade', line: 'Never! I am a knight!', permissions: DASH },
    ],
  },
  {
    id: 'counterfire', chapter: 'counterfire', permissions: DASH, presentation: 'reactive', branches: ['burned', 'rival-constitution', 'permission-to-stop'],
    entryCondition: 'bridge-crossed', completionCue: 'counterfire-complete', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-pursuit', checkpoint: 'counterfire', gates: ['subsequent-fireball-hit', 'rival-counterfire-started', 'counterfire-complete'] },
    beats: [
      { id: 'counterfire-hit', kind: 'stage', advanceOn: 'subsequent-fireball-hit',
        direction: 'Observe another genuine Fireball hit while the chase continues.' },
      { id: 'cease-singeing', speaker: 'rival', line: 'Cease this singeing, I insist' },
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
      { id: 'complaint-arrival', kind: 'stage', advanceOn: 'complaint-approached',
        direction: 'Continue the moving chase until TATTLE ON YOU is readable and Rival is approaching its entrance.' },
      { id: 'legend-ends', speaker: 'narrator', line: 'This is not where your legend ends, Spellblade. Knights are not supposed to get made fun of.' },
    ],
  },
  {
    id: 'pride-stop', chapter: 'final-guard', permissions: DASH, presentation: 'reactive', checkpoint: true,
    entryCondition: 'complaint-approached', completionCue: 'rival-turned', objective: PURSUIT_OBJECTIVE,
    branches: ['rival-constitution'],
    scene: { enter: 'rival-complaint-approach', checkpoint: 'final', gates: ['rival-turned'] },
    beats: [
      { id: 'knight-help', speaker: 'spellblade', line: 'A real knight never asks for help!' },
      { id: 'pride-turn', kind: 'stage', advanceOn: 'rival-turned', stageCue: 'rival-pride',
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
    id: 'final-confrontation', chapter: 'final-guard', permissions: DASH, presentation: 'reactive', required: false,
    branches: ['final-guard-reaction', 'final-guard-broken'],
    entryCondition: 'rival-turned', completionCue: 'continue', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-final-fight', checkpoint: 'final', gates: [] },
    beats: [
      { id: 'final-hello', speaker: 'spellblade', line: 'Hello!' },
      { id: 'too-late-hello', speaker: 'rival', line: 'It is too late for that!' },
      { id: 'reconsider-meeting', speaker: 'spellblade', line: 'Then allow me to reconsider ever meeting you!' },
      { id: 'sword-remains', speaker: 'rival', line: 'The sword remains mightier than the pen...' },
      { id: 'remain-mightier', speaker: 'rival', line: '...and I remain mightier than anything that is not me!' },
      { id: 'lot-of-things', speaker: 'narrator', line: 'That is a lot of things.' },
    ],
  },
  {
    id: 'rival-defeat', chapter: 'final-guard', permissions: DASH, presentation: 'reactive',
    branches: ['final-guard-reaction', 'final-guard-broken'],
    entryCondition: 'rival-turned', completionCue: 'rival-defeated', objective: PURSUIT_OBJECTIVE,
    scene: { enter: 'rival-final-fight', checkpoint: 'final', gates: ['rival-defeated'] },
    beats: [
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
      { id: 'frolic-fields', speaker: 'narrator', line: 'The Spellblade decides to frolic in the fields, as he may one day never do so again' },
      { id: 'remembering-move', speaker: 'spellblade', line: 'I am not frolicking. I am remembering how to move!' },
    ],
  },
  'rival-constitution': {
    segment: 'rival-escape', chapter: 'pursuit', triggerCue: 'rival-survived-lethal',
    beats: [
      { id: 'constitution-strange', speaker: 'narrator', line: 'Hmm. This is strange.' },
      { id: 'not-strange', speaker: 'spellblade', line: 'No I am not!', pauseAfterSec: .15 },
      { id: 'not-fallen', speaker: 'narrator', line: 'Your rival appears not to have fallen yet.' },
      { id: 'thank-noticing', speaker: 'rival', line: 'Thank you for noticing!!' },
      { id: 'what-condition', speaker: 'narrator', line: 'This one is tougher than usual. What is his condition?' },
      { id: 'current-constitution', speaker: 'spellblade', line: 'What is your current constitution!?' },
      { id: 'constitution-amended', speaker: 'rival', line: 'My constitution... has been amended many times.' },
      { id: 'cannot-settled', speaker: 'narrator', line: 'Ah... then it appears it cannot be settled.' },
    ],
  },
  'first-fireball-miss': {
    segment: 'fireball', chapter: 'fireball', triggerCue: 'fireball-missed',
    beats: [
      { id: 'rival-over-there', speaker: 'narrator', line: 'Your rival is over there' },
      { id: 'scorch-mark', speaker: 'spellblade', line: 'And I wanted a scorch mark, over there.' },
    ],
  },
  'bridge-growth': {
    segment: 'bridge-dash', chapter: 'bridge', triggerCue: 'bridge-retry-extended',
    beats: [
      { id: 'bridge-senses-failure', speaker: 'narrator', line: 'The bridge grows longer when it senses failure' },
      { id: 'hence-i-crossed', speaker: 'rival', line: 'Hence why I crossed it!' },
    ],
  },
  'permission-to-stop': {
    segment: 'counterfire', chapter: 'counterfire', triggerCue: 'repeated-pursuit-fireballs',
    beats: [
      { id: 'permission-stop', speaker: 'rival', line: 'I give you permission to stop' },
      { id: 'no-longer-ruin', speaker: 'spellblade', line: 'Will you no longer ruin my reputation, honor, status and therefore livelihood? And health?' },
      { id: 'permission-no', speaker: 'rival', line: 'No.', pauseAfterSec: .08 },
      { id: 'then-no', speaker: 'spellblade', line: 'Then no.' },
    ],
  },
  burned: {
    segment: 'counterfire', chapter: 'counterfire', triggerCue: 'player-burned',
    beats: [
      { id: 'burn-subsided', speaker: 'spellblade', line: 'AHH, AH AH- Oh it has subsided.',
        performanceCue: Object.freeze({ at: 'burn-ended', action: 'continue-reaction' }) },
      { id: 'reforged', speaker: 'spellblade', line: 'I have been reforged!' },
      { id: 'not-too-many', speaker: 'narrator', line: 'Not too many times, now' },
    ],
  },
  'final-guard-reaction': {
    segment: 'rival-defeat', chapter: 'final-guard', triggerCue: 'rival-guard-started',
    beats: [
      { id: 'stop-you', speaker: 'rival', line: 'This should stop you!' },
      { id: 'convince-unblock', speaker: 'narrator', line: 'Convince him to unblock you.' },
    ],
  },
  'final-guard-broken': {
    segment: 'rival-defeat', chapter: 'final-guard', triggerCue: 'rival-guard-broken',
    beats: [{ id: 'did-not-stop', speaker: 'rival', line: 'That did not stop you!!' }],
  },
};

export const TUTORIAL_BRANCH_METADATA = Object.freeze(Object.fromEntries(Object.entries(branchDeclarations)
  .map(([id, branch]) => [id, Object.freeze({ id, segment: branch.segment, chapter: branch.chapter,
    triggerCue: branch.triggerCue, oncePerRun: true, required: false, blocking: false })])));
export const TUTORIAL_BRANCHES = Object.freeze(Object.fromEntries(Object.entries(branchDeclarations)
  .map(([id, branch]) => [id, Object.freeze(branch.beats.map(beat => authored(beat, branch.chapter, branch.segment, 'reactive', id)))])));

// Retained for consumers of the former preview boundary. The full route has no cutoff.
export const TUTORIAL_PREVIEW_STOP = null;
