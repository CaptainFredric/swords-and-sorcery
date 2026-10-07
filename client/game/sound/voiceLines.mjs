// Every line the Spellblade has, declared once. This file is the whole of what a line is: its words, when it may be
// said, how rarely, how it ranks, what the Credits say of it, and how its recording is processed. Everything else
// follows from here: the director's rules (voiceRules.mjs VOICE_LINES), the subtitles and the Credits' voice library
// (client/ui/voiceLibrary.mjs), and the recording tool's presets (tools/audio/voice-ingest.mjs).
//
// TO ADD A LINE: declare it below, drop its recording in tools/audio/inbox/ (named after its id, or its `file`), and
// run `npm run voice`. That converts, trims, levels and helms the take, writes it to client/assets/voice, registers it,
// and checks the lot. No other file needs touching unless the line belongs to a moment the game does not raise yet.
//
//   {
//     id: 'lateLine',                          // its name everywhere (camelCase; its files are late-line-1.m4a ...)
//     text: 'NOOoo! I am going to be late!',   // the words: the subtitle and the Credits' transcript
//     trigger: 'minorLethal',                  // the moment(s) it may be said at (VOICE_TAGS): 'a', ['a', 'b'], or
//                                              // { a: 1, b: 3 } (b three times as likely)
//     boost: { interrupted: 1.4 },             // other facts of the moment that make it likelier (VOICE_FACTS)
//     priority: 'high',                        // 'high' cuts a lesser line (a death, a cry); 'normal' waits its turn;
//                                              // 'low' never cuts anything
//     rarity: 0.12,                            // the chance it is said when its moment comes (0..1)
//     cooldown: 180,                           // seconds before the same knight may say it again ([a, b]: a spread)
//     section: 'Defeat & Death',               // where it stands in the Credits (VOICE_SECTIONS), authored here
//     credits: { title, description, note },   // the Credits' voice library: when he says it, and the dry word on it
//     // optional: kind: 'exertion' (a grunt, a breath: no subtitle, never counted as a sentence); gain; perLife: 1;
//     // order (within a moment: higher is tried sooner, the wildcard and the grunt last); coming: 'Blazing Vortex'
//     // (recorded or declared ahead of what it belongs to: never said until that exists); file: 'GoingToBeLate.mp3'
//     // (its recording's name in the inbox, if not its id); aliases; voice: { drive, rmsDb, expandBelowDb } (how its
//     // take is processed: the grit, the level, an eased expander for a line with a soft tail, and for a line that
//     // must carry weight: semitones further down, formants: how much of them stays put (0.6: a bigger chest), chest dB;
//     // edits: small repairs in the recording's own seconds: { cut: [a, b] } dead air out, { splice: [a, b], from:
//     // [c, d] } a clearer word of the same take in its place, { lift: [a, b], db } a buried word up, { rise: [a, b],
//     // semitones } a flat ending raised, { glide: [a, b], semitones } a word's onset begun that far off and swooping
//     // back by b; see tools/audio/knight_voice.py);
//     // parts: ['Wait, wait!!...', '...I TRICKED you!'] (a line said in parts, each when the game says so: its
//     // recordings are its parts in order, one take each, cut from one master with windows: see RECORDING.md);
//     // reply: true (an ordinary remark fit to be said back at a foe who has just spoken: the final duel's answer);
//     // cumulative: true (a line in parts subtitled as far as it has got, the Sunder sentence's way: otherwise each part
//     // is subtitled on its own);
//     // beats: [{ words: 'The Abyss calls me...' }, { at: 2.9, words: 'hello?' }] (a line with a pause that carries the
//     // joke, subtitled a beat at a time as he gets to it: each later beat begins `at` seconds into its recording, as
//     // edits are timed; the recording tool works out where that falls in the finished take. A part may have its own:
//     // parts: [..., { words: 'Three!.. where's the flee?', beats: [...] }]);
//     // outlasts: 'abyss' (begun as he falls: the fall's own death does not cut it short)
//   }
//
// A moment is raised by the game with its tags (voiceMoments.mjs, GameRuntime.mjs): linesFor() gives the lines
// subscribed to them, the most particular moment's first; the director (voiceRules.mjs) says the first that passes
// its odds, cooldown and rank. So a new joke for an old moment is one declaration; only a new kind of moment needs
// code (deciding that it has happened). Pure data and pure functions, so all of it is tested.

// Where each line stands in the Credits' library, authored on the line itself (never worked out from its triggers):
// his voice in its sections, then the sounds of the fight he makes.
export const VOICE_SECTIONS = Object.freeze({
  voice: Object.freeze(['Battle & Abilities', 'Challenges & Pursuit', 'Kills & Triumphs', 'Defeat & Death', 'Remarks & Oddities', 'Team']),
  sounds: Object.freeze(['Exertions', 'Injury']),
});

// how much likelier some lines are at their fitting moment
export const DEFEAT_ON_LOSS = 2.5;            // "But I am a knight!" on the fall that loses the match
export const KNIGHT_FALLEN_OVERKILL = 3.5;    // "The Knight has fallen!" after a blow far heavier than it needed to be
export const GALE_KILL = 3;                   // the wind's jibe when the drop it threw them into is what killed them
export const MINOR_LETHAL_INTERRUPTED = 1.4;  // "I am going to be late!" when the little blow cut something short
export const PLAN_FAILED = 4;                 // "But I am a knight!" when he is felled waiting on his own announced plan

// The moments a line can be said at. rank: when a moment carries several tags, the lines of the higher-ranked (more
// particular) one are tried first; delay: how long after the moment a line of it begins (s); cry: exactly one of its
// lines is said, always, chosen by share (an ultimate's own cry); opens: saying a line of it opens a window the game
// watches (the squire's question); future: nothing raises it yet (it waits on what it belongs to).
export const VOICE_TAGS = Object.freeze({
  // --- the one who falls
  matchLost: { rank: 70, delay: 0.4, about: 'the match is lost (heard by the one who lost it)' },
  minorLethal: { rank: 60, about: 'felled by a very small blow: no overkill, no ultimate, no fall' },
  chivalryDeath: { rank: 56, about: 'felled during Spells & Chivalry' },
  vortexDeath: { rank: 55, about: 'felled during Blazing Vortex, or still dizzy from it' },
  fairLoss: { rank: 45, about: 'felled by a sword after a real exchange of blows with the one who felled him' },
  appeal: { rank: 5, about: 'felled, and nothing else said of it: his case made late, until he returns (the runtime times it)' },
  magicDeath: { rank: 50, about: 'felled by a spell or the burn it left' },
  doomInterrupted: { rank: 99, about: 'felled while spelling a threat (what was left of it never said)' },
  matchDecided: { rank: 58, about: 'felled by the blow that wins the match against him' },
  committedDeath: { rank: 48, about: 'felled while committed to an attack: mid-swing, dashing, or charging or rushing at a foe' },
  fellSkyward: { rank: 16, about: 'felled on the ground and falling back (the blow from in front), his eyes level or raised' },
  restingBadly: { rank: 15, about: 'felled on the ground somewhere inconvenient: torn ground, a ramp, or alight' },
  fellBack: { rank: 14, about: 'felled on the ground and falling back (the blow from in front)' },
  death: { rank: 10, about: 'felled' },
  // --- the one who felled them (the fallen having kept quiet)
  sunderSentenceKill: { rank: 97, delay: 0.3, about: 'a foe felled near the end of the Sunder sentence (they left)' },
  sunderKill: { rank: 95, delay: 0.45, about: 'a kill by a Sundering blow or the ground it split' },
  knighthoodKill: { rank: 90, delay: 0.45, about: 'a sword kill after a run of near-perfect blows aimed high' },
  rushedKill: { rank: 82, delay: 0.5, about: 'felling a foe who had just rushed at him' },
  avengedLow: { rank: 84, delay: 0.5, about: 'felling the foe who had just left him nearly dead (and still standing himself)' },
  leaderFelled: { rank: 81, delay: 0.6, about: 'felling the knight who led the match (three kills or more, more than anyone)' },
  killStreak3: { rank: 79, delay: 0.5, about: 'his third kill without falling' },
  galeKill: { rank: 85, delay: 0.6, about: 'a kill by the drop a gust had just thrown them into' },
  practiceWin: { rank: 80, delay: 0.6, about: 'felling a Practice Yard opponent that fights' },
  steelKill: { rank: 78, delay: 0.5, about: 'felling an opponent who was still Sheathed in Steel as the killing blow landed' },
  rivalFelled: { rank: 77, delay: 0.5, about: 'felling a recurring rival: each has felled the other at least twice this match' },
  gauntletKill: { rank: 75, delay: 0.45, about: 'a kill with the gauntlet' },
  cleanSwordKill: { rank: 70, delay: 0.45, about: 'a sword kill at the cleanest contact' },
  subparKill: { rank: 65, delay: 0.6, about: 'felling another player who flies a standard other than the default' },
  messyKill: { rank: 60, delay: 0.6, about: 'a kill that arrived late and messily: a burn\'s last lick, a fall' },
  fairWin: { rank: 40, delay: 0.5, about: 'felling a foe by the sword after a real exchange of blows with them' },
  kill: { rank: 10, delay: 0.45, about: 'felling anyone' },
  // --- blows
  squireOpening: { rank: 40, delay: 0.45, opens: 'squire', about: 'a blow that leaves a foe all but finished' },
  counterHit: { rank: 30, delay: 0.4, about: 'the cleanest blow, through the foe\'s own swing' },
  blowDealt: { rank: 5, delay: 0.3, about: 'any blow landed (never a burn\'s lick)' },
  blowTaken: { rank: 5, delay: 0.3, about: 'any blow taken and survived' },
  hurt: { rank: 6, about: 'a real blow taken and survived' },
  coldHurt: { rank: 8, about: 'a small blow, after a long while unhurt' },
  heavyHurt: { rank: 7, about: 'a severe blow taken and survived' },
  firstSwing: { rank: 7, about: 'his first sword swing after a lull, as it begins' },
  finalStrike: { rank: 12, about: 'the heavy third strike swung at a foe it would fell, as it begins' },
  longChain: { rank: 8, delay: 0.1, about: 'his sword chain carrying on past its third strike' },
  engage: { rank: 25, delay: 0.25, about: 'the first blow he lands in a fresh encounter with a foe' },
  standsGround: { rank: 32, delay: 0.15, about: 'after giving ground to a foe, he turns and swings at them' },
  nearMiss: { rank: 10, delay: 0.25, about: 'a foe\'s sword swung at him missing as he moves' },
  steelSave: { rank: 42, delay: 0.5, about: 'a blow on Sheathe in Steel that left him badly hurt but standing' },
  survivedLow: { rank: 15, delay: 0.5, about: 'a blow that left him badly hurt but standing' },
  hurtToReady: { rank: 25, delay: 0.5, about: 'a blow taken that filled his Prowess' },
  heavySwing: { rank: 5, about: 'the heavy strike (and every Sundering slam) swung' },
  lightSwing: { rank: 5, about: 'a lighter strike swung' },
  bladeSnag: { rank: 20, delay: 0.55, about: 'the blade truly caught on some small furnishing in passing' },
  deniedOpening: { rank: 25, delay: 0.5, about: 'the same foe has blocked, parried or slipped his sword again and again' },
  miracle: { rank: 45, delay: 0.5, about: 'a heavy blow that leaves him alive with almost nothing' },
  lastStand: { rank: 35, delay: 0.4, about: 'struck while very low, the foe still a danger' },
  losingFace: { rank: 30, delay: 0.4, about: 'struck while clearly losing: low, and the foe comfortably ahead' },
  worthyFoe: { rank: 30, delay: 0.3, opens: 'finalDuel', about: 'the first blow of a fresh encounter with a foe, both still whole' },
  strikeCount: { rank: 28, delay: 0.2, opens: 'threeStrikes', about: 'his first sword blow on a foe in a fresh encounter, both still whole (the count of strikes may begin)' },
  matchPoint: { rank: 27, delay: 0.25, about: 'one kill from winning a scored match, in a fresh encounter (once a match)' },
  challengerBrief: { rank: 60, delay: 0.7, about: 'the challenger of the final duel felled quickly and cheaply after the quest continued' },
  regenWait: { rank: 30, about: 'a blow survived that left him low (its reveal waits until he has regenerated out of danger)' },
  // --- guards and balance
  catastrophicGuardBreak: { rank: 40, delay: 0.7, about: 'a guard broken by a Sundering blow' },
  guardBreak: { rank: 20, delay: 0.7, about: 'a guard broken' },
  guardClaim: { rank: 24, delay: 0.1, about: 'raising his guard against a foe close by and swinging at him (its claim disproved if that guard breaks)' },
  sunderStaggerBreak: { rank: 40, delay: 0.6, about: 'a knight\'s balance broken by one who is Sundering' },
  staggerBreakInflicted: { rank: 20, delay: 0.6, about: 'a knight\'s balance broken' },
  staggerEscaped: { rank: 20, delay: 0.2, about: 'a foe whose balance he broke finding it again before he struck them' },
  massiveSunder: { rank: 40, delay: 0.5, about: 'one Sundering slam\'s split ground catching two knights' },
  rescued: { rank: 30, delay: 0.7, about: 'near his end, and his threat felled, thrown or broken by somebody else' },
  // --- spells and the gauntlet
  spellCast: { rank: 20, about: 'a spell leaving the hand' },
  projectileGather: { rank: 25, delay: 0.12, about: 'a spell that flies (a Fireball, a Frostfire) gathering in the palm' },
  steelCalled: { rank: 20, delay: 0.45, about: 'calling Sheathe in Steel, as the armour hardens' },
  steelTurn: { rank: 20, delay: 0.35, about: 'Sheathe in Steel turning a spell aside' },
  galeDisplacement: { rank: 20, delay: 0.7, about: 'a gust really moving someone (likelier the harder it threw them)' },
  galeDismissal: { rank: 21, about: 'a moment after a gust really moved a foe who is still alive and not falling to their end' },
  frostChill: { rank: 22, delay: 0.35, about: 'his Frostfire leaving a living foe meaningfully chilled' },
  fireballThrown: { rank: 20, delay: 0.1, about: 'his own Fireball thrown: it has left the hand, on its way to wherever it was aimed' },
  magicHelped: { rank: 15, delay: 0.4, about: 'his own Fireball or Frostfire landing on a foe' },
  launched: { rank: 5, delay: 0.4, about: 'thrown off his feet by a gust\'s heart' },
  rebuttalOpening: { rank: 40, delay: 0.25, about: 'the gauntlet landing on a foe who has just spoken and is nearly beaten' },
  gauntletHit: { rank: 20, delay: 0.3, about: 'the gauntlet landing' },
  gauntletThrow: { rank: 5, about: 'the gauntlet thrown' },
  // --- the ultimate
  sunderInvoked: { rank: 100, delay: 0.05, cry: true, about: 'Sunder All That Rusts invoked: its cry' },
  chivalryInvoked: { rank: 100, delay: 0.05, cry: true, about: 'Spells & Chivalry invoked: its cry' },
  ultimateActive: { rank: 5, delay: 1.1, about: 'an ultimate taking hold' },
  sunderSentence: { rank: 30, about: 'the first slam of a Sunder driven into the ground (the sentence, a word to a slam, may begin)' },
  vortexSpin: { rank: 20, delay: 0.3, about: 'Blazing Vortex at full spin (once, as it takes hold)' },
  sunderHeavy: { rank: 22, about: 'a Sundering slam swung once its cry is over (once a Sunder, and only if the sentence has not begun)' },
  chivalryShown: { rank: 22, about: 'during Spells & Chivalry, once that activation has seen both a spell cast and a sword swung (once an activation)' },
  riposteOvershoot: { rank: 20, future: true, about: 'a Riposte or lunge carrying him over an edge' },
  // --- getting about
  dash: { rank: 5, about: 'a dash' },
  jump: { rank: 5, about: 'a jump' },
  hardLanding: { rank: 5, delay: 0.15, about: 'a hard landing' },
  sprintUnderPressure: { rank: 5, about: 'breaking into a sprint with a foe at his heels' },
  charge: { rank: 10, delay: 0.1, about: 'sprinting straight at a foe, closing fast' },
  steelCharge: { rank: 12, delay: 0.08, about: 'Sheathed in Steel, beginning a dash straight at a foe nearby (said as the dash begins, whether or not it lands)' },
  pursuit: { rank: 10, delay: 0.2, about: 'chasing a foe who is running from him' },
  arrive: { rank: 8, delay: 0.3, about: 'the first foe he meets since he (re)spawned' },
  battleBegins: { rank: 15, delay: 0.6, about: 'a battle beginning: a match (any but the Practice Yard) under way' },
  lull: { rank: 5, about: 'a genuine lull: nobody near, nothing struck or swung for a while' },
  abyssFall: { rank: 30, about: 'falling past saving into the Abyss (said as he falls)' },
  recklessSurvived: { rank: 20, delay: 0.3, about: 'still alive a few seconds after a reckless commitment: charging, dashing or ramming into a foe while low, or into two of them' },
  tombstoneSprint: { rank: 15, about: 'sprinting while low and burning, with a threat near (once a life)' },
  fleeDownward: { rank: 12, about: 'fleeing a foe close behind at a sprint, looking at the ground for a moment' },
  losingRun: { rank: 20, delay: 0.9, about: 'back on his feet after his third fall in a row without a kill of his own' },
  lateClock: { rank: 20, about: 'the last 25 seconds of a timed match, while he is not the one winning it (once a match)' },
  standoff: { rank: 6, about: 'a foe facing him at a distance, nothing struck or swung for a while: time enough to begin spelling a threat' },
  // --- waiting on what they belong to
  slushEnd: { rank: 20, about: 'the menu round\'s Slush: the slush he made of a rival, scooped up and drunk (the take is the drinking)' },
  teamEngage: { rank: 20, future: true, about: 'a team engagement beginning' },
  allyDefected: { rank: 20, future: true, about: 'a former ally appearing on the opposing side' },
});

// Facts of a moment that never raise a line by themselves, only make one likelier (a line's `boost`)
export const VOICE_FACTS = Object.freeze(['interrupted', 'overkill', 'decisive', 'highSwing', 'planFailed']);

export const VOICE_LINE_DECLARATIONS = Object.freeze([
  // --- the breath of things: exertions (heard often, each on its own short cooldown; they never cut anything)
  {
    id: 'effort', kind: 'exertion',
    text: '(HIYAAAAH!)',
    trigger: { heavySwing: 1, lightSwing: 0.2 },
    priority: 'low', rarity: 0.22, cooldown: 5, gain: 0.75,
    section: 'Exertions',
    credits: { title: 'Hiyaaaah', description: 'Occasionally, behind a hard sword swing.', note: 'The sword did not swing itself.' },
    voice: { drive: 2.4, rmsDb: -16 }, aliases: ['grunt', 'swing', 'attack', 'heave', 'strike'],
  },
  {
    id: 'hurt', kind: 'exertion',
    text: '(a blow taken)',
    trigger: 'hurt',
    priority: 'low', rarity: 0.35, cooldown: 4, gain: 0.85,
    section: 'Injury',
    credits: { title: 'Oof', description: 'After taking a proper hit.', note: 'A concise medical report.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['pain', 'hit', 'ow', 'ouch'],
  },
  {
    id: 'dash', kind: 'exertion',
    text: '(a quick breath out)',
    trigger: 'dash',
    priority: 'low', rarity: 0.25, cooldown: 3, gain: 0.55,
    section: 'Exertions',
    credits: { title: 'Dash', description: 'A short exhale sometimes forced out by a Dash.', note: 'The distance was brief. The effort was not.' },
    voice: { drive: 1.6, rmsDb: -20 }, aliases: ['breath', 'huff', 'exhale'],
  },
  {
    id: 'jump', kind: 'exertion',
    text: '(a grunt)',
    trigger: 'jump',
    priority: 'low', rarity: 0.3, cooldown: 2.5, gain: 0.7,
    section: 'Exertions',
    credits: { title: 'Jumps', description: 'Now and then, as he jumps.', note: 'Armour is heavy. Gravity is patient.' },
    voice: { drive: 2.2, rmsDb: -19 }, aliases: ['hop', 'leap'],
  },
  {
    id: 'fistEffort', kind: 'exertion',
    text: 'HYA!',
    trigger: 'gauntletThrow',
    priority: 'low', rarity: 0.55, cooldown: 1.5, gain: 0.8,
    section: 'Exertions',
    credits: { title: 'Gauntlet Effort', description: 'A short exertion behind the thrown gauntlet.', note: 'The throw is not effortless.' },
    voice: { drive: 2.4, rmsDb: -16 }, aliases: ['hya', 'hiyah', 'hiyaah', 'punch'],
  },
  // --- falling
  {
    id: 'lateLine',
    text: 'NOOoo! I am going to be late!',
    trigger: 'minorLethal', boost: { interrupted: MINOR_LETHAL_INTERRUPTED },
    priority: 'high', rarity: 0.12, cooldown: 180,
    section: 'Defeat & Death',
    credits: { title: 'Late', description: 'Rarely, when a very small amount of damage proves sufficient.', note: 'Apparently he had prior commitments.' },
    voice: { drive: 2.3, rmsDb: -16 }, aliases: ['late', 'noooo'],
  },
  {
    id: 'magicDefeat',
    text: "I don't believe in magic.",
    trigger: 'magicDeath',
    priority: 'high', rarity: 0.35, cooldown: 90,
    section: 'Defeat & Death',
    credits: { title: 'Magic Defeat', description: 'Now and then, when sorcery is what felled him.', note: 'His objection does not extend to personal use.' },
    voice: { drive: 2, rmsDb: -18 },
  },
  {
    id: 'knightFallen',
    text: 'The Knight has fallen!… no longer may day arrive…',
    trigger: 'death', boost: { overkill: KNIGHT_FALLEN_OVERKILL },
    priority: 'high', rarity: 0.06, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'The Knight Has Fallen', description: 'Very rarely, after an especially excessive death.', note: 'The sun has been informed.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['fallen', 'knightfallen'],
  },
  {
    id: 'neverThought',
    text: 'I had never thought this day would come...',
    trigger: 'matchLost', order: 5,
    priority: 'high', rarity: 0.3, cooldown: 200,
    section: 'Defeat & Death',
    credits: { title: 'This Day', description: 'Rarely upon defeat.', note: 'It has nevertheless arrived.' },
    // (the "day" a touch up: the word the line is about)
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42, edits: [{ lift: [1.665, 1.82], db: 2.5 }] }, file: 'NeverThoughtDayCome.mp3', aliases: ['thisday', 'never', 'neverthoughtdaycome'],
  },
  {
    id: 'defeat',
    text: 'What!? But I am a knight!',
    // (planFailed: felled with a plan still announced and not yet come off: "Wait, wait!!...")
    trigger: { death: 1, matchLost: DEFEAT_ON_LOSS }, boost: { decisive: DEFEAT_ON_LOSS, planFailed: PLAN_FAILED },
    priority: 'high', rarity: 0.25, cooldown: 150,
    section: 'Defeat & Death',
    credits: { title: 'But I Am a Knight', description: 'Occasionally upon being felled. More often when that proves decisive.', note: 'His title has failed as protective equipment.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'death', kind: 'exertion',
    text: '(going down)',
    trigger: 'death', order: -10,
    priority: 'high', rarity: 0.35, cooldown: 10,
    section: 'Injury',
    credits: { title: 'Death', description: 'When he dies without a better line.', note: 'Defeat has several accepted pronunciations.' },
    voice: { drive: 2, rmsDb: -16 }, aliases: ['die', 'dying', 'dead'],
  },
  // --- over a fallen foe
  {
    id: 'newKnighthood',
    text: 'You have achieved a new form of knight hood.',
    trigger: 'knighthoodKill', boost: { highSwing: 2 },
    priority: 'normal', rarity: 0.3, cooldown: 240,
    section: 'Kills & Triumphs',
    credits: { title: 'A New Knighthood', description: 'Rarely after an especially clean or unusual kill.', note: 'The ceremony is informal.' },
    voice: { drive: 2, rmsDb: -17 }, file: 'NewKnighthoodForm.mp3', aliases: ['knighthood', 'hood', 'newknighthoodform'],
  },
  {
    id: 'neverReach',
    text: 'If you keep practicing… you will still never reach me.',
    trigger: 'practiceWin',
    priority: 'normal', rarity: 0.25, cooldown: 120, gain: 0.95,
    section: 'Kills & Triumphs',
    credits: { title: 'Never Reach Me', description: 'Rarely, after a Practice Yard victory.', note: 'Instruction has concluded.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['practicing', 'reach'],
  },
  {
    id: 'fistKill',
    text: 'I am quite soFISTicated.',
    trigger: 'gauntletKill',
    priority: 'normal', rarity: 0.35, cooldown: 180,
    section: 'Kills & Triumphs',
    credits: { title: 'SoFISTicated', description: 'Very rarely, after a gauntlet kill.', note: 'He has been waiting to say this.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['sofisticated', 'fistkill'],
  },
  {
    id: 'hackSlash',
    text: 'You are the hack. I will be the slash.',
    trigger: { cleanSwordKill: 1, counterHit: 0.6 },
    priority: 'normal', rarity: 0.25, cooldown: 120, gain: 0.95,
    section: 'Kills & Triumphs',
    credits: { title: 'The Hack and the Slash', description: 'Occasionally, after a very clean sword kill or counter.', note: 'He has divided the responsibilities.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['hack', 'slash'], reply: true,
  },
  {
    id: 'subparStandard',
    text: 'Your standard is subpar.',
    trigger: 'subparKill',
    priority: 'normal', rarity: 0.08, cooldown: 300, gain: 0.95,
    section: 'Kills & Triumphs',
    credits: { title: 'Subpar Standard', description: 'Very rarely, after killing someone flying a non-default standard.', note: 'The assessment was unsolicited.' },
    voice: { drive: 2, rmsDb: -18 }, aliases: ['standard', 'subpar'],
  },
  {
    id: 'alwaysKnew',
    text: 'I always knew that I thought this would happen.',
    trigger: { rescued: 1, messyKill: 0.35 },
    priority: 'normal', rarity: 0.35, cooldown: 300,
    section: 'Remarks & Oddities',
    credits: { title: 'Always Knew', description: 'Rarely, after luck or somebody else saves the situation.', note: 'He knew that would happen. Apparently.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['always', 'knew'],
  },
  {
    id: 'tinManHeart',
    text: 'You have quite the heart for a Tin Man.',
    trigger: 'steelKill',
    priority: 'normal', rarity: 0.15, cooldown: 240,
    section: 'Kills & Triumphs',
    credits: { title: 'Tin Man', description: 'Rarely, after killing an opponent who was protected by Sheathe in Steel.', note: 'No cardiologist was consulted.' },
    voice: { drive: 2.0, rmsDb: -17 },
  },
  {
    id: 'workHard',
    text: "At least work hard if you can't be smart.",
    trigger: 'kill', order: -1,
    priority: 'normal', rarity: 0.08, cooldown: 210, gain: 0.95,
    section: 'Kills & Triumphs',
    credits: { title: 'Work Hard', description: 'Very rarely, over a fallen opponent.', note: 'He believes this is constructive.' },
    voice: { drive: 2.0, rmsDb: -17 }, reply: true,
  },
  {
    id: 'killTaunt',
    text: 'Good knight? That will not be you.',
    trigger: 'kill',
    priority: 'normal', rarity: 0.3, cooldown: 30, gain: 0.95,
    section: 'Kills & Triumphs',
    credits: { title: 'Good Knight', description: 'Now and then, over a fallen foe.', note: 'Sportsmanship, loosely interpreted.' },
    voice: { drive: 2.3, rmsDb: -16, semitones: -4, formants: 0.65, chest: 2.5 }, reply: true,
  },
  // --- in the fight
  {
    id: 'sorcery',
    text: 'SORCERY!!',
    trigger: 'spellCast',
    priority: 'normal', rarity: 0.08, cooldown: 45,
    section: 'Battle & Abilities',
    credits: { title: 'Sorcery', description: 'Occasionally, as sorcery leaves his hand.', note: 'Apparently this clarifies matters.' },
    voice: { drive: 2.2, rmsDb: -16, semitones: -5.5, formants: 0.6, chest: 2.5 }, aliases: ['spell', 'cast', 'fireball'],
  },
  {
    id: 'galeTaunt',
    text: 'What did you say? Must have been the wind…',
    trigger: { galeDisplacement: 1, galeKill: GALE_KILL },
    priority: 'normal', rarity: 0.3, cooldown: 60, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'Must Have Been the Wind', description: 'Occasionally, after Gale appreciably relocates someone.', note: 'The wind has declined to comment.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 },
  },
  {
    id: 'steelBoast',
    text: 'My armor works now!',
    trigger: 'steelTurn',
    priority: 'normal', rarity: 0.3, cooldown: 75, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'My Armor Works', description: 'Now and then, when Sheathe in Steel turns a spell aside.', note: '"Now." It had not, previously.' },
    // (the mouth clicks before the words cut)
    voice: { drive: 2.2, rmsDb: -16, edits: [{ cut: [0, 0.43] }] },
  },
  {
    id: 'squireSetup',
    text: 'What did the squire say to the Spellblade?',
    trigger: 'squireOpening',
    priority: 'normal', rarity: 0.1, cooldown: 240,
    section: 'Remarks & Oddities',
    credits: { title: 'The Squire', description: 'Very rarely, after leaving an opponent close to death.', note: 'He never gets to the punchline.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['squire'],
  },
  {
    id: 'staggerDisplay',
    text: 'A staggering display.',
    trigger: 'staggerBreakInflicted',
    priority: 'normal', rarity: 0.3, cooldown: 90, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'A Staggering Display', description: "Occasionally, after breaking an opponent's balance.", note: 'He noticed.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['staggering', 'display'],
  },
  {
    id: 'lowerGuard',
    text: 'I helped you lower your guard.',
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.3, cooldown: 60, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'Lower Your Guard', description: "Occasionally, after breaking an opponent's Guard.", note: 'The instruction was eventually obeyed.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['lower', 'helped'],
  },
  {
    id: 'breakTaunt',
    text: "You should've hired a REAL guard.",
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.15, cooldown: 90, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'A Real Guard', description: 'Rarely, after demonstrating a personnel concern.', note: 'Recruitment remains closed.' },
    voice: { drive: 2.3, rmsDb: -16, semitones: -4, formants: 0.65, chest: 2.5 },
  },
  {
    id: 'offGuard',
    text: 'En garde! … Off Guard!',
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.12, cooldown: 120, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'Off Guard', description: "Rarely, after breaking an opponent's Guard.", note: 'The warning was brief.' },
    voice: { drive: 2.1, rmsDb: -16, expandBelowDb: -42 },
  },
  {
    id: 'steelPolished',
    text: 'I had it polished.',
    trigger: 'steelCalled',
    priority: 'normal', rarity: 0.18, cooldown: 90, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'Polished', description: 'Occasionally, when Sheathe in Steel activates.', note: 'He is omitting several details.' },
    voice: { drive: 2.0, rmsDb: -17 },
  },
  {
    id: 'rebuttal',
    text: 'I present my rebuttal.',
    trigger: 'rebuttalOpening',
    priority: 'normal', rarity: 0.5, cooldown: 120,
    section: 'Battle & Abilities',
    credits: { title: 'Rebuttal', description: 'Rarely, when an opponent has just spoken and the gauntlet has an answer.', note: 'A formal response, delivered by fist.' },
    voice: { drive: 2, rmsDb: -17 },
  },
  {
    id: 'fistThrow',
    text: 'I throw you my gauntlet.',
    trigger: 'gauntletHit',
    priority: 'normal', rarity: 0.12, cooldown: 90, gain: 0.95,
    section: 'Battle & Abilities',
    credits: { title: 'I Throw You My Gauntlet', description: 'Rarely, at very close quarters.', note: 'Tradition has been interpreted loosely.' },
    // (the hum before the words cut: it would only delay them)
    voice: { drive: 2.2, rmsDb: -16, edits: [{ cut: [0, 0.42] }] }, aliases: ['gauntlet'],
  },
  {
    id: 'bladeCaught',
    text: 'Ah! My blade caught on the edge of a flower pot! I must rest. You may slay me. Quickly!',
    trigger: 'bladeSnag',
    priority: 'normal', rarity: 0.12, cooldown: 900,
    section: 'Remarks & Oddities',
    credits: { title: 'The Flower Pot', description: 'Extremely rarely, after the blade genuinely catches on some insignificant scenery.', note: 'The surrender is non-binding.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['snag', 'flowerpot'],
  },
  // --- the ultimate
  {
    id: 'sunderCall',
    text: 'Your integrity will not suffice!',
    trigger: { sunderInvoked: 0.65 },
    priority: 'high', rarity: 1, cooldown: 0,
    section: 'Battle & Abilities',
    credits: { title: 'Sunder All That Rusts', description: 'Usually, when Sunder All That Rusts is invoked.', note: 'His definition of integrity is broad.' },
    voice: { drive: 2.4, rmsDb: -15 }, aliases: ['sunder', 'integrity', 'ultimate'],
  },
  {
    id: 'victory',
    text: 'MIGHT MAKES… KNIGHT!',
    trigger: { sunderInvoked: 0.35, sunderKill: 1, catastrophicGuardBreak: 1, sunderStaggerBreak: 1, massiveSunder: 1 },
    priority: 'normal', rarity: 0.3, cooldown: 120,
    section: 'Kills & Triumphs',
    credits: { title: 'Might Makes Knight', description: 'Occasionally, after force has settled the argument. Now and then, as Sunder All That Rusts is invoked.', note: 'The argument is not examined further.' },
    voice: { drive: 2.3, rmsDb: -16, semitones: -5.5, formants: 0.6, chest: 2.5 }, aliases: ['win', 'might', 'cheer', 'triumph'],
  },
  // --- the wildcard
  {
    id: 'laugh',
    text: 'aaaAAH, hahaHAH!',
    trigger: ['blowDealt', 'blowTaken', 'kill', 'death', 'dash', 'launched', 'hardLanding', 'sprintUnderPressure', 'spellCast', 'ultimateActive'], order: -5,
    priority: 'low', rarity: 0.02, cooldown: [45, 75], gain: 0.95, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'The Laugh', description: 'Very rarely, in the middle of almost anything sufficiently reckless.', note: 'This does not narrow it down.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['haha', 'chuckle'], reply: true,
  },
  {
    id: 'sunderLeave',
    text: 'How. Many. More. Times. Need. I. Do. This. For. You. To. LEAVE!?',
    parts: ['How.', 'Many.', 'More.', 'Times.', 'Need.', 'I.', 'Do.', 'This.', 'For.', 'You.', 'To.', 'LEAVE!?'], cumulative: true,
    trigger: 'sunderSentence',
    priority: 'normal', rarity: 0.12, cooldown: 120,
    section: 'Battle & Abilities',
    credits: { title: 'How Many More Times', description: 'Rarely, during Sunder All That Rusts. One word to a slam.', note: 'He would like you to leave.' },
    voice: { drive: 2.6, rmsDb: -15, semitones: -5.5, formants: 0.55, chest: 3 }, file: 'SunderLeave_1.mp3', aliases: ['sunderleave', 'leave'],
  },
  {
    id: 'thankYou',
    text: 'Thank. You.',
    trigger: 'sunderSentenceKill',
    priority: 'high', rarity: 1, cooldown: 0,
    section: 'Kills & Triumphs',
    credits: { title: 'Thank You', description: 'When an opponent dies near the end of that question.', note: 'They left.' },
    voice: { drive: 2.3, rmsDb: -16, semitones: -5.5, formants: 0.6, chest: 3 }, file: 'ThankYouSunder.mp3', aliases: ['thankyousunder', 'thanks'],
  },
  // --- the longer scenes (each part said when the game has earned it: voiceScenes.mjs)
  {
    id: 'finalDuel',
    text: 'All of my life, I have sought a challenger, worthy of one glorious final duel... ...the quest continues.',
    parts: ['All of my life, I have sought a challenger, worthy of one glorious final duel...', '...the quest continues.'],
    trigger: 'worthyFoe',
    priority: 'normal', rarity: 0.03, cooldown: 600, perLife: 1,
    section: 'Challenges & Pursuit',
    credits: { title: 'The Final Duel', description: 'Rarely when an opponent answers his dramatic challenge inadequately.', note: 'The search criteria remain unmet.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'FinalDuelChallengerQuest.mp3', aliases: ['finalduelchallengerquest', 'quest'],
  },
  {
    id: 'herald',
    text: "HERAAAAAALD! I HAD THOUGHT I'D ASKED FOR A CHALLENGE.",
    trigger: 'challengerBrief',
    priority: 'normal', rarity: 1, cooldown: 300,
    section: 'Challenges & Pursuit',
    credits: { title: 'Herald!', description: 'Rarely when the opposition has failed to meet expectations.', note: 'A higher authority has been requested.' },
    voice: { drive: 2.4, rmsDb: -15 }, file: 'HeraldAskChallenge.mp3', aliases: ['heraldaskchallenge'],
  },
  {
    id: 'regenTrick',
    text: 'Wait, wait!!... ...ahahahaha! I TRICKED you!',
    parts: ['Wait, wait!!...', '...ahahahaha! I TRICKED you!'],
    trigger: 'regenWait',
    priority: 'normal', rarity: 0.06, cooldown: 300, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'The Trick', description: 'Occasionally, while waiting for an apparently deliberate recovery plan to succeed.', note: 'The plan was disclosed after succeeding.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'WaitRegenTrick.mp3', aliases: ['waitregentrick', 'tricked'],
  },
  {
    id: 'openUp',
    text: 'When will you open up? Hold still.',
    trigger: 'deniedOpening',
    priority: 'normal', rarity: 0.12, cooldown: 240, perLife: 1,
    section: 'Challenges & Pursuit',
    credits: { title: 'Open Up', description: 'While attempting to hit an evasive opponent.', note: 'Cooperation would simplify matters.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'OpenUpWhen.mp3', aliases: ['openupwhen', 'holdstill'],
  },
  {
    id: 'standFight',
    text: "No. I've had enough. I will stand. And I will fight.",
    trigger: { standsGround: 1, lastStand: 0.5 },
    priority: 'normal', rarity: 0.12, cooldown: 300, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'Stand and Fight', description: 'When deciding to stop yielding ground and commit to the fight.', note: 'Negotiations have concluded.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'StandFight.mp3', aliases: ['standfight'],
  },
  {
    id: 'chivalryTest',
    text: 'In accordance with chivalry, I now allow you to surrender. I was merely testing you.',
    trigger: 'losingFace',
    priority: 'normal', rarity: 0.1, cooldown: 300, perLife: 1,
    section: 'Challenges & Pursuit',
    credits: { title: 'Chivalry', description: 'Rarely, when he is clearly losing.', note: 'The examination criteria were revised during testing.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'ChivalryTest.mp3', aliases: ['chivalry'],
  },
  {
    id: 'getThingOff',
    text: 'Get this thing off of me!',
    trigger: 'projectileGather',
    priority: 'normal', rarity: 0.05, cooldown: 120,
    section: 'Battle & Abilities',
    credits: { title: 'This Thing', description: 'Occasionally, while gathering a projectile spell.', note: 'The thing was his.' },
    voice: { drive: 2.3, rmsDb: -16 }, file: 'GetThingOff.mp3', aliases: ['getthingoff', 'thing'],
  },
  {
    id: 'acceptSaint',
    text: 'I accept sainthood with my usual humility.',
    trigger: 'miracle',
    priority: 'normal', rarity: 0.35, cooldown: 300, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'Sainthood', description: 'Rarely, after surviving a blow that should have finished him.', note: 'The church has not been consulted.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'AcceptSaint.mp3', aliases: ['acceptsaint', 'saint'],
  },
  {
    id: 'deftlyDodge',
    text: 'Deftly dodge.',
    trigger: 'nearMiss',
    priority: 'low', rarity: 0.1, cooldown: 40,
    section: 'Battle & Abilities',
    credits: { title: 'Deftly Dodge', description: 'Occasionally after narrowly avoiding an attack.', note: 'A factual assessment of his own movement.' },
    voice: { drive: 2.3, rmsDb: -16 }, file: 'DeftlyDodge.mp3', aliases: ['deftlydodge', 'deftly'],
  },
  // --- Blazing Vortex
  {
    id: 'vortexUse',
    text: 'Bleublurblurblur blurburrrbluuurrr!!',
    trigger: 'vortexSpin',
    priority: 'normal', rarity: 0.4, cooldown: 60,
    section: 'Battle & Abilities',
    credits: { title: 'Blazing Vortex', description: 'Occasionally, as Blazing Vortex reaches full speed.', note: 'Speech has become impractical.' },
    voice: { drive: 2.3, rmsDb: -16 }, aliases: ['vortex'],
  },
  {
    id: 'vortexDefeat',
    text: 'I was dizzy anyway.',
    trigger: 'vortexDeath',
    priority: 'high', rarity: 0.5, cooldown: 120,
    section: 'Defeat & Death',
    credits: { title: 'Dizzy Anyway', description: 'Rarely, when he dies spinning or shortly afterward.', note: 'The defense was entered after death.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -40 }, aliases: ['dizzy'],
  },
  // --- the fight joined, and pursued
  {
    id: 'thePlan',
    text: 'If I charge in, defeat everyone, and ignore getting stabbed, I shall achieve victory.',
    trigger: 'charge', order: 2,
    priority: 'normal', rarity: 0.06, cooldown: 180, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'The Plan', description: 'Rarely when charging aggressively into a fight.', note: 'Injury has been removed from the plan by omission.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'AchieveVictoryViaCharge.mp3',
  },
  {
    id: 'chargeDefeat',
    text: 'I CHARRRRRGE YOU! With defeat!!',
    trigger: 'charge', order: 3,
    priority: 'normal', rarity: 0.4, cooldown: 60,
    section: 'Battle & Abilities',
    credits: { title: 'Charged with Defeat', description: 'While charging or rapidly closing on an enemy.', note: 'The accusation is delivered personally.' },
    voice: { drive: 2.5, rmsDb: -15, semitones: -4, formants: 0.6, chest: 3 }, file: 'IChargeYouDefeat.mp3',
  },
  {
    id: 'bestManWin',
    text: 'May the best man here win. There. You may lose now.',
    trigger: 'battleBegins',
    priority: 'normal', rarity: 0.35, cooldown: 120,
    section: 'Challenges & Pursuit',
    credits: { title: 'May the Best Man Win', description: 'Occasionally at the beginning of a duel or direct contest.', note: 'The result has been certified in advance.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'BestmanWinYouLose.mp3',
  },
  {
    id: 'headOn',
    text: 'I confront my foes head on!',
    // most of all as he rams in Steel (the sentence demonstrated); now and then charging, or the first blow of a fight
    trigger: { steelCharge: 5, charge: 1, engage: 0.5 },
    priority: 'normal', rarity: 0.1, cooldown: 120,
    section: 'Challenges & Pursuit',
    credits: { title: 'Head On', description: 'When charging straight at an opponent, most of all dashing at one in Steel.', note: 'Other orientations have been rejected.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'ConfrontHeadOn.mp3',
  },
  {
    id: 'stopRunning',
    text: 'If you stop running, I will personally ensure this is over soon.',
    trigger: 'pursuit',
    priority: 'normal', rarity: 0.25, cooldown: 120,
    section: 'Challenges & Pursuit',
    credits: { title: 'Stop Running', description: 'While pursuing a fleeing opponent.', note: 'Prompt service is available.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'EnsureOverStopRun.mp3',
  },
  {
    id: 'savedFromPeace',
    text: 'Do not save yourself the trouble... I am here. And I will save you from peace.',
    trigger: 'arrive',
    priority: 'normal', rarity: 0.12, cooldown: 300,
    section: 'Challenges & Pursuit',
    credits: { title: 'Saved from Peace', description: 'When arriving at or beginning a fight.', note: 'Relief has arrived.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'ISaveYouTrouble.mp3',
  },
  {
    id: 'masterCall',
    text: 'I am the master... of SWORDS & SORCERY!!!',
    trigger: 'chivalryInvoked',
    priority: 'high', rarity: 1, cooldown: 0,
    section: 'Battle & Abilities',
    credits: { title: 'Master of Swords & Sorcery', description: 'When activating Spells & Chivalry.', note: 'The demonstration is temporary.' },
    // (weighted, but less than the threats: a declaration, still his own voice)
    voice: { drive: 2.5, rmsDb: -15, semitones: -3.5, formants: 0.75, chest: 1.5 }, file: 'MasterSwordsSorcery.mp3',
  },
  {
    id: 'constitution',
    text: 'I have plenty of constitution left.',
    trigger: { steelSave: 1, survivedLow: 0.4 },
    priority: 'normal', rarity: 0.25, cooldown: 300, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'Constitution', description: 'Rarely after surviving while badly hurt, particularly after an appropriate Steel save.', note: 'His reserves have been self-assessed.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'Plenty Constitution.mp3',
  },
  {
    id: 'preferNoPain',
    text: 'Despite making me stronger, I prefer not possessing pain.',
    trigger: 'hurtToReady',
    priority: 'normal', rarity: 0.3, cooldown: 300,
    section: 'Battle & Abilities',
    credits: { title: 'Prefer No Pain', description: 'Rarely after being hurt despite benefiting from the situation.', note: 'Strength has not improved the experience.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'PreferNoPain.mp3',
  },
  {
    id: 'downUpSideways',
    text: 'I strike you down! Then up. Then sideways! And then back down!',
    trigger: 'longChain',
    priority: 'normal', rarity: 0.1, cooldown: 180,
    section: 'Battle & Abilities',
    credits: { title: 'Down, Up, Sideways', description: 'Rarely during a continuing sword sequence.', note: 'The lesson now includes direction.' },
    // (the take's "and" before "sideways" replaced by the clear "then" of "and then back down")
    voice: { drive: 2.2, rmsDb: -16, edits: [{ splice: [3.38, 3.625], from: [5.197, 5.41] }] }, file: 'StrikeUpDownSide.mp3',
  },
  {
    id: 'believeMagic',
    text: 'Unless it helps me, I do not believe in magic.',
    trigger: 'magicHelped',
    priority: 'normal', rarity: 0.05, cooldown: 300,
    section: 'Battle & Abilities',
    credits: { title: 'Belief in Magic', description: 'Rarely when magic has just benefited him.', note: 'His standard of evidence remains flexible.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'UnlessHelpDisbelieveMagic.mp3',
  },
  {
    id: 'remainStaggered',
    text: 'You dare not remain staggered for longer!?',
    trigger: 'staggerEscaped',
    priority: 'normal', rarity: 0.3, cooldown: 150,
    section: 'Battle & Abilities',
    credits: { title: 'Remain Staggered', description: 'Rarely when an opponent recovers from Stagger before he approves.', note: 'Recovery was premature.' },
    // (the end of "longer!?" lifted into a question: outrage that it is even possible)
    voice: { drive: 2.4, rmsDb: -16, semitones: -4.5, formants: 0.6, chest: 3, edits: [{ rise: [2.46, 2.83], semitones: 3 }] }, file: 'YouDareNotStaggered.mp3',
  },
  // --- kills
  {
    id: 'noSpare',
    text: 'I do not SPARE, I strike! Haha!',
    trigger: 'killStreak3',
    priority: 'normal', rarity: 0.5, cooldown: 120,
    section: 'Kills & Triumphs',
    credits: { title: 'I Do Not Spare', description: 'Occasionally on a three-kill streak.', note: 'Bowling is otherwise uninvolved.' },
    voice: { drive: 2.3, rmsDb: -16, semitones: -3.5, formants: 0.65, chest: 2.5 }, file: 'NospareJustStrike.mp3',
  },
  {
    id: 'toldToWait',
    text: 'I told you to wait.',
    trigger: 'rushedKill',
    priority: 'normal', rarity: 0.25, cooldown: 150,
    section: 'Kills & Triumphs',
    credits: { title: 'I Told You to Wait', description: 'Rarely after killing someone who rushed him or ignored his imagined procedure.', note: 'The wait has been extended considerably.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'ToldtoWait.mp3',
  },
  {
    id: 'renownDisowned',
    text: 'Your renown has been disowned. AhHAHAHA!!!!!',
    trigger: 'leaderFelled',
    priority: 'normal', rarity: 0.12, cooldown: 600,
    section: 'Kills & Triumphs',
    credits: { title: 'Renown Disowned', description: 'Very rarely after an appropriate victory or Renown event.', note: 'He is substantially more pleased with this wording than necessary.' },
    voice: { drive: 2.3, rmsDb: -16 }, file: 'RenownDisownedHahaha.mp3',
  },
  // --- falls
  {
    id: 'fairSquare',
    text: 'You are not allowed to win fair and square!',
    // (fit for a clean fight either way: felled in one, or felling the other; rare, so the more particular falls and
    // kills keep their turn)
    trigger: { fairLoss: 1, fairWin: 0.5 },
    priority: 'high', rarity: 0.1, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Fair and Square', description: 'Rarely after an apparently legitimate fight, whichever way it went.', note: 'Fairness still requires authorization.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'CantWinFairSquare.mp3',
  },
  {
    id: 'underworld',
    text: 'My expedition to the underworld... begins now.',
    trigger: 'death', order: -2,
    priority: 'high', rarity: 0.04, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Underworld Expedition', description: 'Rarely upon death.', note: 'Apparently this was the next destination.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'ExpeditionUnderworldNowBegin.mp3',
  },
  {
    id: 'masterBreak',
    text: 'The master!... takes... a break...',
    trigger: 'chivalryDeath',
    priority: 'high', rarity: 0.6, cooldown: 90,
    section: 'Defeat & Death',
    credits: { title: 'The Master Takes a Break', description: 'Upon defeat during Spells & Chivalry.', note: 'Mastery has entered a scheduled recess.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'MasterBreak.mp3',
  },
  {
    id: 'notFall',
    text: 'Why I should not fall. One: I am a knight. Two: Knights do not fall. Three—',
    trigger: 'appeal',
    priority: 'normal', rarity: 0.06, cooldown: 600,
    section: 'Defeat & Death',
    credits: { title: 'Why I Should Not Fall', description: 'Very rarely after defeat, to the rustle of his notes, interrupted by respawn.', note: 'The appeal is supported by documentation.' },
    // (dead air out, never the words: a stretch of the rustle after the title, the silence before "One", a little
    // before "Two", so "Three—" arrives with the respawn; no word is hurried. "One:" and "Two:" a touch up: the list)
    voice: {
      drive: 2.0, rmsDb: -17, expandBelowDb: -44,
      edits: [{ cut: [1.2, 1.36] }, { cut: [1.425, 1.58] }, { cut: [2.335, 2.445] }, { lift: [1.6, 1.86], db: 2.5 }, { lift: [2.53, 2.73], db: 2.5 }],
    },
    file: 'NotFall.mp3',
  },
  // --- lulls
  {
    id: 'abolishBattle',
    text: 'Could we abolish the battle, for one day? And spend time with those whom we cherish most?... Haha! I jest!',
    trigger: 'lull', order: 2,
    priority: 'normal', rarity: 0.06, cooldown: 1200, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'Abolish the Battle', description: 'Very rarely during a genuine lull in combat.', note: 'Phew. We were nearly threatened with dimensionality.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'AbolishBattleIsJest.mp3',
  },
  {
    id: 'noSquire',
    text: 'I need no squire. For I... am a knight.',
    trigger: 'lull', order: 1,
    priority: 'normal', rarity: 0.15, cooldown: 600, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'No Squire', description: 'Very rarely during a lull or self-important moment.', note: 'Knighthood has rendered assistance unnecessary.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'INeedNoSquire.mp3',
  },
  // --- the sounds of the fight
  {
    id: 'firstStrike', kind: 'exertion',
    text: '(a low, forceful "mmmmHHHMHM")',
    trigger: { firstSwing: 1, finalStrike: 1 },
    priority: 'low', rarity: 0.5, cooldown: 6, gain: 0.8,
    section: 'Exertions',
    credits: { title: 'First Swing / Final Strike', description: 'A first swing after a meaningful lull or an especially emphatic final strike.', note: 'Considerable thought has been applied to swinging.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'FirstSwingAfterHiatusOrFinalStrike1.mp3',
  },
  {
    id: 'coldHurt', kind: 'exertion',
    text: '(teeth sucked in, then a small exhale)',
    trigger: 'coldHurt',
    priority: 'low', rarity: 0.7, cooldown: 15, gain: 0.8,
    section: 'Injury',
    credits: { title: 'Minor Injury — Cold Start', description: 'A minor hit after enough time without being hurt.', note: 'Pain has resumed.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'MinorHitAfterHiatus1.mp3',
  },
  {
    id: 'heavyHurt', kind: 'exertion',
    text: '(a hard, strong hurt, scoffing down into a lower finish)',
    trigger: 'heavyHurt', order: 1,
    priority: 'low', rarity: 0.12, cooldown: 25, gain: 0.85,
    section: 'Injury',
    credits: { title: 'Heavy Injury I', description: 'One severe-hit variant.', note: 'The objection loses momentum near the end.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'LargeInjureSound.mp3',
  },
  {
    id: 'heavyHurt2', kind: 'exertion',
    text: '(a cough, then a couple of forced, hurt laughs)',
    trigger: 'heavyHurt',
    priority: 'low', rarity: 0.15, cooldown: 25, gain: 0.85,
    section: 'Injury',
    credits: { title: 'Heavy Injury II', description: 'Alternate severe-hit reaction.', note: 'He has elected to find this amusing.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'LargeInjure2.mp3',
  },
  // --- the recordings of 2026-10-06. A line with a pause in it that carries the joke is subtitled a beat at a time
  // (`beats`: its words as he gets to them, each beginning `at` seconds into the recording: the take is never cut)
  {
    id: 'heavyNow',
    text: 'This sword is heavy now!!',
    // (the Sunder's own: weighed once a Sunder, at its first slam after the cry, unless the sentence has begun:
    // voiceScenes.mjs)
    trigger: 'sunderHeavy',
    priority: 'normal', rarity: 0.35, cooldown: 90,
    section: 'Battle & Abilities',
    credits: { title: 'Heavy Now', description: 'Occasionally, once Sunder has taken hold and its heavy blows begin.', note: 'The change has been noticed.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'SwordHeavy.mp3',
  },
  {
    id: 'spellBlade',
    text: 'Why do you think I am called the Spellblade?... Because I can spell ‘blade’!',
    beats: [{ words: 'Why do you think I am called the Spellblade?...' }, { at: 4.88, words: 'Because I can spell ‘blade’!' }],
    // (weighed once a Chivalry, once it has shown both halves: voiceScenes.mjs)
    trigger: 'chivalryShown',
    priority: 'normal', rarity: 0.25, cooldown: 300,
    section: 'Battle & Abilities',
    credits: { title: 'Spell Blade', description: 'Rarely during Spells & Chivalry, after both sword and sorcery have actually been used.', note: 'The etymology is self-certified.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'WhySpellBlade.mp3',
  },
  {
    id: 'stopMoving',
    text: 'This will help you stop moving.',
    trigger: 'frostChill',
    priority: 'normal', rarity: 0.2, cooldown: 120,
    section: 'Battle & Abilities',
    credits: { title: 'Stop Moving', description: 'Occasionally when Frostfire meaningfully chills an opponent.', note: 'Assistance was provided without request.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'ThisHelpStopMove.mp3',
  },
  {
    id: 'scorchMark',
    text: 'I would like to see a scorch mark there.',
    trigger: 'fireballThrown',
    priority: 'normal', rarity: 0.1, cooldown: 120,
    section: 'Battle & Abilities',
    credits: { title: 'Scorch Mark', description: 'Occasionally as a Fireball is committed toward a target.', note: 'Placement remains aspirational.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'IWouldLikeSeeScorch.mp3',
  },
  {
    id: 'dismissed',
    text: 'I am dismissing you for now.',
    trigger: 'galeDismissal',
    priority: 'normal', rarity: 0.3, cooldown: 90,
    section: 'Battle & Abilities',
    credits: { title: 'Dismissed', description: 'Occasionally after Gale appreciably relocates a living opponent.', note: 'Reinstatement has not been discussed.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'DismissingForNow.mp3',
  },
  {
    id: 'distanceAdvice',
    text: 'Do not get too close! Do not get too far!',
    // (beside the Vortex's own noise, never in its place: one or the other, about as often)
    trigger: 'vortexSpin', order: 1,
    priority: 'normal', rarity: 0.3, cooldown: 60,
    section: 'Battle & Abilities',
    credits: { title: 'Distance Advice', description: 'Occasionally as Blazing Vortex reaches full speed.', note: 'A compliant distance has not been supplied.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'DoNotGetCloseFar.mp3',
  },
  {
    id: 'bodyWilling',
    text: 'My mind is willing... and my body... was willing.',
    beats: [{ words: 'My mind is willing...' }, { at: 2.34, words: 'and my body...' }, { at: 3.52, words: 'was willing.' }],
    trigger: 'committedDeath',
    priority: 'high', rarity: 0.2, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Body Was Willing', description: 'Rarely when an aggressive commitment ends in his death.', note: 'The body revised its position.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'MindIsBodyWas.mp3',
  },
  {
    id: 'almostThere',
    text: 'Don’t surrender! I am almost there!',
    // (two performances of it, alternate takes: DontSurrender.mp3 and "DoNot Surrender.mp3")
    trigger: 'matchPoint',
    priority: 'normal', rarity: 0.4, cooldown: 300,
    section: 'Challenges & Pursuit',
    credits: { title: 'Almost There', description: 'Rarely when one kill from victory and entering a fresh engagement.', note: 'The encouragement is not disinterested.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'thinkAbout',
    text: 'Now think about what you’ve done!',
    // (the same words either way: over the foe who nearly finished him, or to the one who just finished the match)
    trigger: { avengedLow: 1, matchDecided: 1 },
    priority: 'normal', rarity: 0.3, cooldown: 240,
    section: 'Remarks & Oddities',
    credits: { title: 'Think About It', description: 'Rarely after avenging a near-fatal attack—or receiving the final blow that loses the match.', note: 'Responsibility has been assigned outward.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'NowThinkDone.mp3',
  },
  {
    id: 'abyssCalls',
    text: 'The Abyss calls me... hello?',
    beats: [{ words: 'The Abyss calls me...' }, { at: 2.90, words: 'hello?' }],
    // (begun as he falls: the fall's own end does not cut it short; anything else that fells him on the way does)
    trigger: 'abyssFall', outlasts: 'abyss',
    priority: 'high', rarity: 0.3, cooldown: 240,
    section: 'Defeat & Death',
    credits: { title: 'The Abyss Calls', description: 'Rarely during an unrecoverable fall into the Abyss.', note: 'The call was answered.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'TheAbyssCallsHello.mp3',
  },
  {
    id: 'braveFoolish',
    text: 'The difference between bravery or foolishness?... When I do it.',
    beats: [{ words: 'The difference between bravery or foolishness?...' }, { at: 4.31, words: 'When I do it.' }],
    trigger: 'recklessSurvived',
    priority: 'normal', rarity: 0.2, cooldown: 300, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'Bravery or Foolishness', description: 'Rarely after surviving a conspicuously reckless commitment.', note: 'The distinction has been made personally.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'DifferenceBraveFoolIsI.mp3',
  },
  {
    id: 'findTombstone',
    text: 'I must find my tombstone, quickly!',
    // (two performances of it, alternate takes: MustFindTombstone.mp3 and 2026_10_06_21_04_49.mp3)
    trigger: 'tombstoneSprint',
    priority: 'normal', rarity: 0.35, cooldown: 300, perLife: 1,
    section: 'Defeat & Death',
    credits: { title: 'Find My Tombstone', description: 'Rarely while sprinting at low health under continuing damage.', note: 'Preparations have begun prematurely.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'oneMoreDefeat',
    text: 'I shall quit if I receive one more defeat.',
    // (and if he is felled again, he simply gets up again: nothing more is said of it)
    trigger: 'losingRun',
    priority: 'normal', rarity: 0.3, cooldown: 600,
    section: 'Defeat & Death',
    credits: { title: 'One More Defeat', description: 'Rarely after a short run of defeats without an answering kill.', note: 'The resignation was not submitted.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'ShallQuitDefeat.mp3',
  },
  {
    id: 'outOfTime',
    text: 'I no longer have the time for this!',
    trigger: 'lateClock',
    priority: 'normal', rarity: 0.3, cooldown: 300,
    section: 'Challenges & Pursuit',
    credits: { title: 'Out of Time', description: 'Rarely near the end of a timed match while he still has unfinished business.', note: 'The clock has become personally inconvenient.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'NoLongerTime.mp3',
  },
  {
    id: 'stopYou',
    text: 'There! That should stop you. That did not stop you!',
    // (the claim as the guard goes up against a threat; its correction only if that guard breaks moments later:
    // voiceScenes.mjs. Two recordings, the two parts)
    parts: ['There! That should stop you.', 'That did not stop you!'],
    trigger: 'guardClaim',
    priority: 'normal', rarity: 0.15, cooldown: 180,
    section: 'Battle & Abilities',
    credits: { title: 'That Should Stop You', description: 'When Guard is raised against an immediate threat—and, if it breaks moments later, when the claim is disproved.', note: 'The conclusion was revised promptly.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'trapdoor',
    text: 'Where have I placed that trapdoor?',
    trigger: 'fleeDownward',
    priority: 'normal', rarity: 0.2, cooldown: 600, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'Trapdoor', description: 'Very rarely while fleeing under pressure and searching the ground.', note: 'The architecture has failed to cooperate.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'WhereTrapDoor.mp3',
  },
  {
    id: 'theDeceased',
    text: 'Even after 500 years I shall still compare myself to the deceased!!',
    beats: [{ words: 'Even after 500 years,' }, { at: 2.22, words: 'I shall still compare myself to the deceased!!' }],
    trigger: 'rivalFelled',
    priority: 'normal', rarity: 0.12, cooldown: 600,
    section: 'Challenges & Pursuit',
    credits: { title: 'The Deceased', description: 'Very rarely after felling an opponent who has become a recurring rival.', note: 'The rivalry has been granted an unusually long maintenance period.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: '500YearCompare.mp3',
  },
  {
    id: 'laidBack',
    text: 'I have decided for a more.. laid-back approach.',
    trigger: 'fellBack',
    priority: 'high', rarity: 0.1, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Laid-Back Approach', description: 'Rarely when defeat leaves him falling or lying back.', note: 'The change in posture was apparently voluntary.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'LaudBackApproach.mp3',
  },
  {
    id: 'theSky',
    text: 'The sky has become more interesting than you!',
    trigger: 'fellSkyward',
    priority: 'high', rarity: 0.15, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'The Sky', description: 'Rarely when defeat leaves his attention pointed upward.', note: 'Attention has been reassigned upward.' },
    voice: { drive: 2.2, rmsDb: -16 }, file: 'SkyInterstingThanU.mp3',
  },
  {
    id: 'wrongRest',
    text: 'This was the wrong resting spot!',
    trigger: 'restingBadly',
    priority: 'high', rarity: 0.15, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Wrong Resting Spot', description: 'Rarely when defeat leaves him lying somewhere inconvenient.', note: 'Accommodation was not included.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'WrongRestSpot_1.mp3',
  },
  {
    id: 'notTired',
    text: 'What!? But I’m not tired!',
    trigger: 'death', order: -3,
    priority: 'high', rarity: 0.06, cooldown: 300,
    section: 'Defeat & Death',
    credits: { title: 'Not Tired', description: 'Rarely upon being felled.', note: 'Rest remains unauthorized.' },
    // (it opens on the fabled "What!?" itself, take 2 of 'defeat', before its own "But I'm not tired!": the source is
    // that join, made across the pause: not-tired-fabled-what.wav; his own "What?" as recorded is kept, not-tired-1.mp3)
    voice: { drive: 2.2, rmsDb: -16 }, file: 'WhatNotTired.mp3',
  },
  {
    id: 'spellDoom',
    text: 'I shall spell your doom. D-O-O-O-O-O-O-O-O-O-O-O-O-O... You get the idea.',
    // (one take, as performed: a letter at a time on the screen as he gets to it; felled on the way, the rest is never
    // said or shown, and doomCut has the last word)
    beats: [
      { words: 'I shall spell your doom.' },
      { at: 2.72, words: 'D...' },
      ...[3.37, 4.02, 4.72, 5.42, 6.12, 6.82, 7.52, 8.22, 8.92, 9.62, 10.32, 11.02, 11.77]
        .map((at, i) => ({ at, words: `D-${Array(i + 1).fill('O').join('-')}...` })),
      { at: 12.32, words: 'You get the idea.' },
    ],
    trigger: 'standoff',
    priority: 'normal', rarity: 0.1, cooldown: 900, perLife: 1,
    section: 'Remarks & Oddities',
    credits: { title: 'Spell Your Doom', description: 'Very rarely, when he has enough uninterrupted time to begin spelling a threat.', note: 'Completion is not required for grading.' },
    voice: { drive: 2.0, rmsDb: -17, expandBelowDb: -42 }, file: 'Spell Doom.mp3',
  },
  {
    id: 'doomCut',
    text: 'OHHHH—',
    trigger: 'doomInterrupted',
    priority: 'high', rarity: 1, cooldown: 0,
    section: 'Remarks & Oddities',
    credits: { title: 'Doom, Interrupted', description: 'When he is felled before he has finished spelling it.', note: 'The word was left unfinished.' },
    // (a knock after the cry is over, not of it: out)
    voice: { drive: 2.2, rmsDb: -16, edits: [{ cut: [2.68, 3.2] }] }, file: 'OHHHHinteruption.mp3',
  },
  {
    id: 'threeStrikes',
    text: 'Strikes I count Three! And you will be forced to Flee! One! And done— Two! You will be through! Three!.. where’s the flee? Wha—!? A fourth strike!?',
    // (the count is of his sword's blows landing on that same foe, each word when its blow has landed and the last
    // word is said: voiceScenes.mjs. Five recordings, the five parts)
    parts: [
      { words: 'Strikes I count Three! And you will be forced to Flee!', beats: [{ words: 'Strikes I count Three!' }, { at: 2.21, words: 'And you will be forced to Flee!' }] },
      'One! And done—',
      'Two! You will be through!',
      { words: 'Three!.. where’s the flee?', beats: [{ words: 'Three!..' }, { at: 1.62, words: 'where’s the flee?' }] },
      { words: 'Wha—!? A fourth strike!?', beats: [{ words: 'Wha—!?' }, { at: 1.14, words: 'A fourth strike!?' }] },
    ],
    trigger: 'strikeCount',
    priority: 'normal', rarity: 0.1, cooldown: 300, perLife: 1,
    section: 'Battle & Abilities',
    credits: { title: 'Three Strikes', description: 'During a continuing run of sword hits on the same surviving opponent.', note: 'The theorem has encountered additional data.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  // --- waiting on what they belong to (declared, never said yet)
  {
    id: 'misaddressed', coming: 'the Riposte',
    text: 'I have misaddressed.',
    trigger: 'riposteOvershoot',
    priority: 'normal', rarity: 0.2, cooldown: 300,
    section: 'Remarks & Oddities',
    credits: { title: 'Misaddressed', description: "Very rarely, after a Riposte takes him somewhere it shouldn't.", note: 'The destination was incorrect.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['misaddressed', 'riposte'],
  },
  {
    id: 'poorTaste',
    text: 'Poor taste.',
    // (the take is the drinking: a long slurp, two small smacks and a considered "Ahhh" before the words, so it begins
    // as the vessel reaches his visor, and nothing is written out until the words come: client/menu/tour/tourFights.mjs)
    beats: [{ words: '' }, { at: 4.86, words: 'Poor taste.' }],
    trigger: 'slushEnd',
    priority: 'normal', rarity: 1, cooldown: 0,
    section: 'Remarks & Oddities',
    credits: { title: 'Poor Taste', description: 'At the end of the frozen-enemy slush sequence.', note: 'The review was unsolicited.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'PoorTaste.mp3',
  },
  {
    id: 'fightAsMe', coming: 'team matches',
    text: 'We fight as ME!',
    trigger: 'teamEngage',
    priority: 'normal', rarity: 0.3, cooldown: 300,
    section: 'Team',
    credits: { title: 'We Fight as Me', description: 'Occasionally at the beginning of a team engagement.', note: 'Collective action has been centralized.' },
    voice: { drive: 2.3, rmsDb: -16 }, file: 'We fight as me.mp3',
  },
  {
    id: 'otherSide', coming: 'team matches',
    text: 'I had hoped to see you on the other side.',
    trigger: 'allyDefected',
    priority: 'normal', rarity: 0.5, cooldown: 300,
    section: 'Team',
    credits: { title: 'The Other Side', description: 'When a former ally appears on the opposing side.', note: 'The phrase was unfortunately well chosen.' },
    voice: { drive: 2.0, rmsDb: -17 }, file: 'HopeOtherSide.mp3',
  },
]);

const PRIORITIES = Object.freeze({ low: 1, normal: 2, high: 3 });
const camel = /^[a-z][A-Za-z0-9]*$/;

// a line's triggers as { tag: scale }, whichever way they were written
function triggersOf(declaration) {
  const trigger = declaration.trigger;
  if (!trigger) return {};
  if (typeof trigger === 'string') return { [trigger]: 1 };
  if (Array.isArray(trigger)) return Object.fromEntries(trigger.map((tag) => [tag, 1]));
  return { ...trigger };
}

/** A declaration made whole: its defaults filled in, its triggers as { tag: scale }. */
export function normalizeLine(declaration) {
  return Object.freeze({
    kind: 'sentence',
    priority: 'normal',
    rarity: 1,
    cooldown: 0,
    gain: 1,
    order: 0,
    coming: null,
    ...declaration,
    triggers: Object.freeze(triggersOf(declaration)),
    boost: Object.freeze({ ...(declaration.boost ?? {}) }),
    credits: Object.freeze({ ...(declaration.credits ?? {}) }),
    voice: Object.freeze({ drive: 2.0, rmsDb: -17, ...(declaration.voice ?? {}) }),
  });
}

/** Every line, whole, in the order declared. */
export const VOICE_LINE_LIST = Object.freeze(VOICE_LINE_DECLARATIONS.map(normalizeLine));
const BY_ID = new Map(VOICE_LINE_LIST.map((line) => [line.id, line]));

/** A line by its id (undefined for anything else). */
export function voiceLine(id) {
  return BY_ID.get(id);
}

// a part as declared: its words, or { words, beats }
const wordsOf = (part) => (typeof part === 'string' ? part : part?.words ?? null);

/** The words of one part of a line said in parts (the whole line's words for any other line, or no such part). */
export function partText(id, part = null) {
  const line = BY_ID.get(id);
  if (!line) return null;
  return Number.isInteger(part) && line.parts?.[part] ? wordsOf(line.parts[part]) : line.text;
}

/**
 * The beats a line (or one part of a line in parts) is subtitled in, as declared ([{ words, at }]: `at` in its
 * recording's own seconds, none for the first), or null for one subtitled whole.
 */
export function beatsOf(id, part = null) {
  const line = BY_ID.get(id);
  if (!line) return null;
  if (line.parts) return Number.isInteger(part) ? line.parts[part]?.beats ?? null : null;
  return line.beats ?? null;
}

/**
 * Where each later beat of each take begins in its recording (seconds), for the recording tool: [[...], ...] one list
 * per take (null for a take with no beats), or null for a line with none at all.
 */
export function beatSources(declaration) {
  const line = normalizeLine(declaration);
  const later = (beats) => (beats ? beats.slice(1).map((beat) => beat.at) : null);
  const takes = line.parts ? line.parts.map((part) => later(part?.beats)) : [later(line.beats)];
  return takes.some(Boolean) ? takes : null;
}

/** The ordinary remarks fit to be said back at a foe who has just spoken (their ids): the final duel's answer. */
export const REPLY_LINES = Object.freeze(VOICE_LINE_LIST.filter((line) => line.reply && !line.coming).map((line) => line.id));

/** A line's rank as the director counts it (1 an exertion, 2 a situational line, 3 a line of state). */
export function priorityRank(priority) {
  return PRIORITIES[priority] ?? PRIORITIES.normal;
}

/** A line's files' name: lateLine -> late-line (late-line-1.m4a, ...). */
export function fileStem(id) {
  return String(id).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The lines worth trying for a moment, in the order to try them (the first that is said is the only one).
 * tags: the moment's tags, { tag: scale } (a scale of 1 unless the moment itself says how fitting it is: how hard a
 * gust threw them) or a list; facts: what else is true of it (VOICE_FACTS), for the lines' boosts.
 * Order: the most particular tag's lines first (VOICE_TAGS rank), then by the lines' own `order`, then as declared.
 * A line waiting on something not yet in the game (`coming`) is never offered. A cry's tag gives exactly one line,
 * chosen by share and always said. force: every line offered is said whatever its odds (the squire's answer), and
 * only lines of state that are sentences are offered (no grunt, no wildcard), those of one moment in a random order.
 */
export function linesFor(speaker, tags, { facts = [], force = false, rand = Math.random, lines = VOICE_LINE_LIST } = {}) {
  const present = Array.isArray(tags) ? Object.fromEntries(tags.map((tag) => [tag, 1])) : { ...tags };
  const known = Object.keys(present).filter((tag) => VOICE_TAGS[tag] && present[tag] > 0);
  const cry = known.find((tag) => VOICE_TAGS[tag].cry);
  if (cry) {
    const voices = lines.filter((line) => !line.coming && line.triggers[cry] > 0);
    let roll = rand() * voices.reduce((sum, line) => sum + line.triggers[cry], 0);
    const chosen = voices.find((line) => (roll -= line.triggers[cry]) < 0) ?? voices[0];
    return chosen ? [{ line: chosen.id, speaker, delay: VOICE_TAGS[cry].delay ?? 0, cry: true }] : [];
  }
  const offered = [];
  lines.forEach((line, index) => {
    if (line.coming) return;
    if (force && (line.kind !== 'sentence' || line.priority !== 'high')) return;
    // the tag it is offered through: the most particular of its triggers that the moment carries
    const through = known.filter((tag) => line.triggers[tag] > 0).sort((a, b) => VOICE_TAGS[b].rank - VOICE_TAGS[a].rank)[0];
    if (!through) return;
    let chanceScale = line.triggers[through] * present[through];
    for (const fact of facts) if (line.boost[fact]) chanceScale *= line.boost[fact];
    const tag = VOICE_TAGS[through];
    offered.push({
      say: { line: line.id, speaker, chanceScale, delay: tag.delay ?? 0, ...(force ? { force: true } : {}), ...(tag.opens ? { opens: tag.opens } : {}) },
      rank: tag.rank, order: line.order, index, shuffle: force ? rand() : 0,
    });
  });
  offered.sort((a, b) => b.rank - a.rank || (force ? a.shuffle - b.shuffle : 0) || b.order - a.order || a.index - b.index);
  return offered.map((entry) => entry.say);
}

// a span of a recording: [from, to] seconds, in order
const isSpan = (span) => Array.isArray(span) && span.length === 2 && span.every(Number.isFinite) && span[0] >= 0 && span[1] > span[0];
const EDIT_KINDS = Object.freeze({ cut: [], splice: ['from'], lift: ['db'], rise: ['semitones'], glide: ['semitones'] });

// what is wrong with a line's beats, as sentences: two or more, each with its words (the first may have none: what
// comes before the words, a slurp, written out as nothing), every later one at a time in its recording after the one
// before
function beatProblems(beats) {
  if (!Array.isArray(beats) || beats.length < 2) return ['beats must be two or more'];
  const problems = [];
  beats.forEach((beat, i) => {
    if (!(typeof beat?.words === 'string' && (beat.words || i === 0))) problems.push(`beat ${i + 1} needs its words`);
    if (i === 0 && beat?.at !== undefined) problems.push('the first beat begins with its recording (no at)');
    if (i > 0 && !(Number.isFinite(beat?.at) && beat.at > (beats[i - 1]?.at ?? 0))) problems.push(`beat ${i + 1} needs an at after the beat before`);
  });
  return problems;
}

// what is wrong with a line's take edits (voice.edits), as sentences
function editProblems(edits) {
  if (edits === undefined) return [];
  if (!Array.isArray(edits)) return ['voice.edits must be a list'];
  const problems = [];
  edits.forEach((edit, i) => {
    const kinds = Object.keys(EDIT_KINDS).filter((kind) => kind in (edit ?? {}));
    if (kinds.length !== 1) { problems.push(`edit ${i + 1} must be exactly one of ${Object.keys(EDIT_KINDS).join(', ')}`); return; }
    const [kind] = kinds;
    if (!isSpan(edit[kind])) problems.push(`edit ${i + 1}: ${kind} must be [from, to] seconds`);
    if (kind === 'splice' && !isSpan(edit.from)) problems.push(`edit ${i + 1}: splice needs from: [from, to] seconds`);
    for (const need of EDIT_KINDS[kind].filter((name) => name !== 'from')) if (!Number.isFinite(edit[need])) problems.push(`edit ${i + 1}: ${kind} needs ${need}`);
    if (edit.take !== undefined && !(Number.isInteger(edit.take) && edit.take >= 1)) problems.push(`edit ${i + 1}: take must be 1 or more`);
  });
  return problems;
}

/**
 * Everything that is wrong with the declarations ({ errors, warnings }: lists of sentences). manifest: the recorded
 * takes (client/assets/voice/manifest.json), to say which lines are still silent and whether any recording is
 * undeclared; files: the names in client/assets/voice, to check that every take the manifest lists is really there.
 */
export function validateVoiceLines({ declarations = VOICE_LINE_DECLARATIONS, manifest = null, files = null } = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const names = new Map();
  for (const raw of declarations) {
    const line = normalizeLine(raw);
    const at = `${line.id ?? '(no id)'}:`;
    if (!line.id || !camel.test(line.id)) errors.push(`${at} an id in camelCase is needed`);
    if (seen.has(line.id)) errors.push(`${at} declared twice`);
    seen.add(line.id);
    if (!line.text) errors.push(`${at} its words are missing (text)`);
    if (!['sentence', 'exertion'].includes(line.kind)) errors.push(`${at} kind must be 'sentence' or 'exertion'`);
    if (!PRIORITIES[line.priority]) errors.push(`${at} priority must be 'high', 'normal' or 'low'`);
    if (!(line.rarity > 0 && line.rarity <= 1)) errors.push(`${at} rarity must be above 0 and at most 1`);
    const cooldown = Array.isArray(line.cooldown) ? line.cooldown : [line.cooldown, line.cooldown];
    if (cooldown.length !== 2 || !(cooldown[0] >= 0) || !(cooldown[1] >= cooldown[0])) errors.push(`${at} cooldown must be seconds, or [least, most]`);
    if (!line.credits.title || !line.credits.description || !line.credits.note) errors.push(`${at} the Credits need its title, description and note`);
    // (where it stands in the Credits is authored, and it matches what it is: a sentence among his voice, a grunt
    // among the sounds of the fight)
    const shelf = line.kind === 'exertion' ? VOICE_SECTIONS.sounds : VOICE_SECTIONS.voice;
    if (!shelf.includes(line.section)) errors.push(`${at} section must be one of ${shelf.join(', ')}`);
    if (line.parts !== undefined && (!Array.isArray(line.parts) || line.parts.length < 2 || !line.parts.every((part) => wordsOf(part)))) {
      errors.push(`${at} parts must be the words of each part, two or more`);
    }
    if (line.cumulative !== undefined && !line.parts) errors.push(`${at} cumulative is for a line said in parts`);
    if (line.beats !== undefined && line.parts) errors.push(`${at} a line in parts gives each part its own beats`);
    const beatLists = [line.beats, ...(Array.isArray(line.parts) ? line.parts.map((part) => part?.beats) : [])].filter((beats) => beats !== undefined);
    for (const beats of beatLists) for (const problem of beatProblems(beats)) errors.push(`${at} ${problem}`);
    const tags = Object.keys(line.triggers);
    if (!tags.length) errors.push(`${at} it has no trigger: nothing would ever say it`);
    for (const tag of tags) {
      if (!VOICE_TAGS[tag]) errors.push(`${at} unknown trigger '${tag}' (see VOICE_TAGS)`);
      else if (!(line.triggers[tag] > 0)) errors.push(`${at} trigger '${tag}' needs a scale above 0`);
      else if (VOICE_TAGS[tag].future && !line.coming) errors.push(`${at} '${tag}' is not raised by the game yet: mark the line coming: '...'`);
    }
    if (line.coming && tags.length && tags.every((tag) => VOICE_TAGS[tag] && !VOICE_TAGS[tag].future)) {
      warnings.push(`${at} marked coming, yet every moment it waits for is already raised`);
    }
    for (const fact of Object.keys(line.boost)) if (!VOICE_FACTS.includes(fact)) errors.push(`${at} unknown boost '${fact}' (see VOICE_FACTS)`);
    for (const problem of editProblems(line.voice.edits)) errors.push(`${at} ${problem}`);
    for (const name of [line.id, fileStem(line.id), ...(line.aliases ?? []), ...(line.file ? [line.file] : [])]) {
      const key = String(name).toLowerCase();
      if (names.has(key) && names.get(key) !== line.id) errors.push(`${at} '${name}' is also a name of ${names.get(key)}`);
      names.set(key, line.id);
    }
  }
  if (manifest) {
    const recorded = manifest.lines ?? {};
    for (const [id, takes] of Object.entries(recorded)) {
      if (!seen.has(id)) errors.push(`${id}: recorded (in the manifest) but not declared`);
      // (a line said in parts has one recording for each, in order: never alternates of one another)
      const parts = declarations.find((raw) => raw.id === id)?.parts;
      if (parts && takes.length !== parts.length) errors.push(`${id}: ${parts.length} parts are declared and ${takes.length} recorded (each part needs its own, in order)`);
      // (a line subtitled in beats: one recording, its beats timed for it; and every take with beats knows where they fall)
      const declared = declarations.find((raw) => raw.id === id);
      const sources = declared ? beatSources(declared) : null;
      if (declared?.beats && takes.length !== 1) errors.push(`${id}: its beats are timed for one recording, and ${takes.length} are recorded`);
      takes.forEach((take, i) => {
        const wanted = sources?.[parts ? i : 0];
        if (wanted && !(Array.isArray(take.beats) && take.beats.length === wanted.length + 1)) errors.push(`${id}: ${take.file} does not say where its beats fall (process it again: npm run voice -- --redo ${id})`);
      });
      for (const take of takes) {
        for (const extension of files ? ['m4a', 'wav'] : []) {
          if (!files.includes(`${take.file}.${extension}`)) errors.push(`${id}: ${take.file}.${extension} is listed but missing`);
        }
      }
    }
    for (const raw of declarations) if (!recorded[raw.id]?.length) warnings.push(`${raw.id}: not recorded yet (silent until it is)`);
  }
  return { errors, warnings };
}
