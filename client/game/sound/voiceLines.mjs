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
//     credits: { title, description, note },   // the Credits' voice library: when he says it, and the dry word on it
//     // optional: kind: 'exertion' (a grunt, a breath: no subtitle, never counted as a sentence); gain; perLife: 1;
//     // order (within a moment: higher is tried sooner, the wildcard and the grunt last); coming: 'Blazing Vortex'
//     // (recorded or declared ahead of what it belongs to: never said until that exists); file: 'GoingToBeLate.mp3'
//     // (its recording's name in the inbox, if not its id); aliases; voice: { drive, rmsDb, expandBelowDb } (how its
//     // take is processed: the grit, the level, and an eased expander for a line with a soft tail)
//   }
//
// A moment is raised by the game with its tags (voiceMoments.mjs, GameRuntime.mjs): linesFor() gives the lines
// subscribed to them, the most particular moment's first; the director (voiceRules.mjs) says the first that passes
// its odds, cooldown and rank. So a new joke for an old moment is one declaration; only a new kind of moment needs
// code (deciding that it has happened). Pure data and pure functions, so all of it is tested.

// how much likelier some lines are at their fitting moment
export const DEFEAT_ON_LOSS = 2.5;            // "But I am a knight!" on the fall that loses the match
export const KNIGHT_FALLEN_OVERKILL = 3.5;    // "The Knight has fallen!" after a blow far heavier than it needed to be
export const GALE_KILL = 3;                   // the wind's jibe when the drop it threw them into is what killed them
export const MINOR_LETHAL_INTERRUPTED = 1.4;  // "I am going to be late!" when the little blow cut something short

// The moments a line can be said at. rank: when a moment carries several tags, the lines of the higher-ranked (more
// particular) one are tried first; delay: how long after the moment a line of it begins (s); cry: exactly one of its
// lines is said, always, chosen by share (an ultimate's own cry); opens: saying a line of it opens a window the game
// watches (the squire's question); future: nothing raises it yet (it waits on what it belongs to).
export const VOICE_TAGS = Object.freeze({
  // --- the one who falls
  matchLost: { rank: 70, delay: 0.4, about: 'the match is lost (heard by the one who lost it)' },
  minorLethal: { rank: 60, about: 'felled by a very small blow: no overkill, no ultimate, no fall' },
  vortexDeath: { rank: 55, future: true, about: 'felled during Blazing Vortex, or still dizzy from it' },
  magicDeath: { rank: 50, about: 'felled by a spell or the burn it left' },
  death: { rank: 10, about: 'felled' },
  // --- the one who felled them (the fallen having kept quiet)
  sunderKill: { rank: 95, delay: 0.45, about: 'a kill by a Sundering blow or the ground it split' },
  knighthoodKill: { rank: 90, delay: 0.45, about: 'a sword kill after a run of near-perfect blows aimed high' },
  galeKill: { rank: 85, delay: 0.6, about: 'a kill by the drop a gust had just thrown them into' },
  practiceWin: { rank: 80, delay: 0.6, about: 'felling a Practice Yard opponent that fights' },
  steelKill: { rank: 78, delay: 0.5, about: 'felling an opponent who was still Sheathed in Steel as the killing blow landed' },
  gauntletKill: { rank: 75, delay: 0.45, about: 'a kill with the gauntlet' },
  cleanSwordKill: { rank: 70, delay: 0.45, about: 'a sword kill at the cleanest contact' },
  subparKill: { rank: 65, delay: 0.6, about: 'felling another player who flies a standard other than the default' },
  messyKill: { rank: 60, delay: 0.6, about: 'a kill that arrived late and messily: a burn\'s last lick, a fall' },
  kill: { rank: 10, delay: 0.45, about: 'felling anyone' },
  // --- blows
  squireOpening: { rank: 40, delay: 0.45, opens: 'squire', about: 'a blow that leaves a foe all but finished' },
  counterHit: { rank: 30, delay: 0.4, about: 'the cleanest blow, through the foe\'s own swing' },
  blowDealt: { rank: 5, delay: 0.3, about: 'any blow landed (never a burn\'s lick)' },
  blowTaken: { rank: 5, delay: 0.3, about: 'any blow taken and survived' },
  hurt: { rank: 6, about: 'a real blow taken and survived' },
  heavySwing: { rank: 5, about: 'the heavy strike (and every Sundering slam) swung' },
  lightSwing: { rank: 5, about: 'a lighter strike swung' },
  bladeSnag: { rank: 20, delay: 0.55, about: 'the blade truly caught on some small furnishing in passing' },
  // --- guards and balance
  catastrophicGuardBreak: { rank: 40, delay: 0.7, about: 'a guard broken by a Sundering blow' },
  guardBreak: { rank: 20, delay: 0.7, about: 'a guard broken' },
  sunderStaggerBreak: { rank: 40, delay: 0.6, about: 'a knight\'s balance broken by one who is Sundering' },
  staggerBreakInflicted: { rank: 20, delay: 0.6, about: 'a knight\'s balance broken' },
  massiveSunder: { rank: 40, delay: 0.5, about: 'one Sundering slam\'s split ground catching two knights' },
  rescued: { rank: 30, delay: 0.7, about: 'near his end, and his threat felled, thrown or broken by somebody else' },
  // --- spells and the gauntlet
  spellCast: { rank: 20, about: 'a spell leaving the hand' },
  steelCalled: { rank: 20, delay: 0.45, about: 'calling Sheathe in Steel, as the armour hardens' },
  steelTurn: { rank: 20, delay: 0.35, about: 'Sheathe in Steel turning a spell aside' },
  galeDisplacement: { rank: 20, delay: 0.7, about: 'a gust really moving someone (likelier the harder it threw them)' },
  launched: { rank: 5, delay: 0.4, about: 'thrown off his feet by a gust\'s heart' },
  rebuttalOpening: { rank: 40, delay: 0.25, about: 'the gauntlet landing on a foe who has just spoken and is nearly beaten' },
  gauntletHit: { rank: 20, delay: 0.3, about: 'the gauntlet landing' },
  gauntletThrow: { rank: 5, about: 'the gauntlet thrown' },
  // --- the ultimate
  sunderInvoked: { rank: 100, delay: 0.05, cry: true, about: 'Sunder All That Rusts invoked: its cry' },
  ultimateActive: { rank: 5, delay: 1.1, about: 'an ultimate taking hold' },
  vortexSpin: { rank: 20, future: true, about: 'Blazing Vortex at full spin' },
  riposteOvershoot: { rank: 20, future: true, about: 'a Riposte or lunge carrying him over an edge' },
  // --- getting about
  dash: { rank: 5, about: 'a dash' },
  jump: { rank: 5, about: 'a jump' },
  hardLanding: { rank: 5, delay: 0.15, about: 'a hard landing' },
  sprintUnderPressure: { rank: 5, about: 'breaking into a sprint with a foe at his heels' },
});

// Facts of a moment that never raise a line by themselves, only make one likelier (a line's `boost`)
export const VOICE_FACTS = Object.freeze(['interrupted', 'overkill', 'decisive', 'highSwing']);

export const VOICE_LINE_DECLARATIONS = Object.freeze([
  // --- the breath of things: exertions (heard often, each on its own short cooldown; they never cut anything)
  {
    id: 'effort', kind: 'exertion',
    text: '(HIYAAAAH!)',
    trigger: { heavySwing: 1, lightSwing: 0.2 },
    priority: 'low', rarity: 0.22, cooldown: 5, gain: 0.75,
    credits: { title: 'Hiyaaaah', description: 'Occasionally, behind a hard sword swing.', note: 'The sword did not swing itself.' },
    voice: { drive: 2.4, rmsDb: -16 }, aliases: ['grunt', 'swing', 'attack', 'heave', 'strike'],
  },
  {
    id: 'hurt', kind: 'exertion',
    text: '(a blow taken)',
    trigger: 'hurt',
    priority: 'low', rarity: 0.35, cooldown: 4, gain: 0.85,
    credits: { title: 'Oof', description: 'After taking a proper hit.', note: 'A concise medical report.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['pain', 'hit', 'ow', 'ouch'],
  },
  {
    id: 'dash', kind: 'exertion',
    text: '(a quick breath out)',
    trigger: 'dash',
    priority: 'low', rarity: 0.25, cooldown: 3, gain: 0.55,
    credits: { title: 'Dash', description: 'Now and then on a dash.', note: 'Too fast to comment.' },
    voice: { drive: 1.6, rmsDb: -20 }, aliases: ['breath', 'huff', 'exhale'],
  },
  {
    id: 'jump', kind: 'exertion',
    text: '(a grunt)',
    trigger: 'jump',
    priority: 'low', rarity: 0.3, cooldown: 2.5, gain: 0.7,
    credits: { title: 'Jumps', description: 'Now and then, as he jumps.', note: 'Armour is heavy. Gravity is patient.' },
    voice: { drive: 2.2, rmsDb: -19 }, aliases: ['hop', 'leap'],
  },
  {
    id: 'fistEffort', kind: 'exertion',
    text: 'HYA!',
    trigger: 'gauntletThrow',
    priority: 'low', rarity: 0.55, cooldown: 1.5, gain: 0.8,
    credits: { title: 'Hya', description: 'The breath behind the gauntlet.', note: 'Awaiting a sufficiently dramatic breath.' },
    voice: { drive: 2.4, rmsDb: -16 }, aliases: ['hya', 'hiyah', 'hiyaah', 'punch'],
  },
  // --- falling
  {
    id: 'lateLine',
    text: 'NOOoo! I am going to be late!',
    trigger: 'minorLethal', boost: { interrupted: MINOR_LETHAL_INTERRUPTED },
    priority: 'high', rarity: 0.12, cooldown: 180,
    credits: { title: 'Late', description: 'Rarely, when a very small amount of damage proves sufficient.', note: 'Apparently he had prior commitments.' },
    voice: { drive: 2.3, rmsDb: -16 }, aliases: ['late', 'noooo'],
  },
  {
    id: 'magicDefeat',
    text: "I don't believe in magic.",
    trigger: 'magicDeath',
    priority: 'high', rarity: 0.35, cooldown: 90,
    credits: { title: 'Magic Defeat', description: 'Now and then, when sorcery is what felled him.', note: 'Said by a man who throws fireballs for a living.' },
    voice: { drive: 2, rmsDb: -18 },
  },
  {
    id: 'knightFallen',
    text: 'The Knight has fallen!… no longer may day arrive…',
    trigger: 'death', boost: { overkill: KNIGHT_FALLEN_OVERKILL },
    priority: 'high', rarity: 0.06, cooldown: 300,
    credits: { title: 'The Knight Has Fallen', description: 'Very rarely, after an especially excessive death.', note: 'The sun has been informed.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['fallen', 'knightfallen'],
  },
  {
    id: 'neverThought',
    text: 'I had never thought this day would come…',
    trigger: 'matchLost', order: 5,
    priority: 'high', rarity: 0.3, cooldown: 200,
    credits: { title: 'This Day', description: 'Rarely, when defeat becomes official.', note: 'Me neither, Spellblade.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['thisday', 'never'],
  },
  {
    id: 'defeat',
    text: 'What!? But I am a knight!',
    trigger: { death: 1, matchLost: DEFEAT_ON_LOSS }, boost: { decisive: DEFEAT_ON_LOSS },
    priority: 'high', rarity: 0.25, cooldown: 150,
    credits: { title: 'But I Am a Knight', description: 'Occasionally upon being felled. More often when that proves decisive.', note: 'His title has failed as protective equipment.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'death', kind: 'exertion',
    text: '(going down)',
    trigger: 'death', order: -10,
    priority: 'high', rarity: 1, cooldown: 0,
    credits: { title: 'Death', description: 'When he dies without a better line.', note: 'Defeat has several accepted pronunciations.' },
    voice: { drive: 2, rmsDb: -16 }, aliases: ['die', 'dying', 'dead'],
  },
  // --- over a fallen foe
  {
    id: 'newKnighthood',
    text: 'You have achieved a new form of knight hood.',
    trigger: 'knighthoodKill', boost: { highSwing: 2 },
    priority: 'normal', rarity: 0.3, cooldown: 240,
    credits: { title: 'A New Knighthood', description: 'Rarely, after an unusually clean and elevated sword lesson.', note: 'The ceremony has been shortened.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['knighthood', 'hood'],
  },
  {
    id: 'neverReach',
    text: 'If you keep practicing… you will still never reach me.',
    trigger: 'practiceWin',
    priority: 'normal', rarity: 0.25, cooldown: 120, gain: 0.95,
    credits: { title: 'Never Reach Me', description: 'Rarely, after a Practice Yard victory.', note: 'Instruction has concluded.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['practicing', 'reach'],
  },
  {
    id: 'fistKill',
    text: 'I am quite soFISTicated.',
    trigger: 'gauntletKill',
    priority: 'normal', rarity: 0.35, cooldown: 180,
    credits: { title: 'SoFISTicated', description: 'Very rarely, after a gauntlet kill.', note: 'He has been waiting to say this.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['sofisticated', 'fistkill'],
  },
  {
    id: 'hackSlash',
    text: 'You are the hack. I will be the slash.',
    trigger: { cleanSwordKill: 1, counterHit: 0.6 },
    priority: 'normal', rarity: 0.25, cooldown: 120, gain: 0.95,
    credits: { title: 'The Hack and the Slash', description: 'Occasionally, after a very clean sword kill or counter.', note: 'He has divided the responsibilities.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['hack', 'slash'],
  },
  {
    id: 'subparStandard',
    text: 'Your standard is subpar.',
    trigger: 'subparKill',
    priority: 'normal', rarity: 0.08, cooldown: 300, gain: 0.95,
    credits: { title: 'Subpar Standard', description: 'Very rarely, after killing someone flying a non-default standard.', note: 'The assessment was unsolicited.' },
    voice: { drive: 2, rmsDb: -18 }, aliases: ['standard', 'subpar'],
  },
  {
    id: 'alwaysKnew',
    text: 'I always knew that I thought this would happen.',
    trigger: { rescued: 1, messyKill: 0.35 },
    priority: 'normal', rarity: 0.35, cooldown: 300,
    credits: { title: 'Always Knew', description: 'Rarely, after luck or somebody else saves the situation.', note: 'He knew that would happen. Apparently.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['always', 'knew'],
  },
  {
    id: 'tinManHeart',
    text: 'You have quite the heart for a Tin Man.',
    trigger: 'steelKill',
    priority: 'normal', rarity: 0.15, cooldown: 240,
    credits: { title: 'Tin Man', description: 'Rarely, after killing an opponent who was protected by Sheathe in Steel.', note: 'No cardiologist was consulted.' },
    voice: { drive: 2.0, rmsDb: -17 },
  },
  {
    id: 'workHard',
    text: "At least work hard if you can't be smart.",
    trigger: 'kill', order: -1,
    priority: 'normal', rarity: 0.08, cooldown: 210, gain: 0.95,
    credits: { title: 'Work Hard', description: 'Very rarely, over a fallen opponent.', note: 'He believes this is constructive.' },
    voice: { drive: 2.0, rmsDb: -17 },
  },
  {
    id: 'killTaunt',
    text: 'Good knight? That will not be you.',
    trigger: 'kill',
    priority: 'normal', rarity: 0.3, cooldown: 30, gain: 0.95,
    credits: { title: 'Good Knight', description: 'Now and then, over a fallen foe.', note: 'Sportsmanship, loosely interpreted.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  // --- in the fight
  {
    id: 'sorcery',
    text: 'SORCERY!!',
    trigger: 'spellCast',
    priority: 'normal', rarity: 0.08, cooldown: 45,
    credits: { title: 'Sorcery', description: 'Occasionally, as sorcery leaves his hand.', note: 'Apparently this clarifies matters.' },
    voice: { drive: 2.5, rmsDb: -15 }, aliases: ['spell', 'cast', 'fireball'],
  },
  {
    id: 'galeTaunt',
    text: 'What did you say? Must have been the wind…',
    trigger: { galeDisplacement: 1, galeKill: GALE_KILL },
    priority: 'normal', rarity: 0.3, cooldown: 60, gain: 0.95,
    credits: { title: 'Must Have Been the Wind', description: 'Occasionally, after Gale appreciably relocates someone.', note: 'The wind has declined to comment.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 },
  },
  {
    id: 'steelBoast',
    text: 'My armor works now!',
    trigger: 'steelTurn',
    priority: 'normal', rarity: 0.3, cooldown: 75, gain: 0.95,
    credits: { title: 'My Armor Works', description: 'Now and then, when Sheathe in Steel turns a spell aside.', note: '"Now." It had not, previously.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'squireSetup',
    text: 'What did the squire say to the Spellblade?',
    trigger: 'squireOpening',
    priority: 'normal', rarity: 0.1, cooldown: 240,
    credits: { title: 'The Squire', description: 'Very rarely, after leaving an opponent close to death.', note: 'He never gets to the punchline.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['squire'],
  },
  {
    id: 'staggerDisplay',
    text: 'A staggering display.',
    trigger: 'staggerBreakInflicted',
    priority: 'normal', rarity: 0.3, cooldown: 90, gain: 0.95,
    credits: { title: 'A Staggering Display', description: "Occasionally, after breaking an opponent's balance.", note: 'He noticed.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['staggering', 'display'],
  },
  {
    id: 'lowerGuard',
    text: 'I helped you lower your guard.',
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.3, cooldown: 60, gain: 0.95,
    credits: { title: 'Lower Your Guard', description: "Occasionally, after breaking an opponent's Guard.", note: "You're welcome." },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['lower', 'helped'],
  },
  {
    id: 'breakTaunt',
    text: "You should've hired a REAL guard.",
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.15, cooldown: 90, gain: 0.95,
    credits: { title: 'A Real Guard', description: 'Rarely, after demonstrating a personnel concern.', note: 'Recruitment remains closed.' },
    voice: { drive: 2.2, rmsDb: -16 },
  },
  {
    id: 'offGuard',
    text: 'En garde! … Off Guard!',
    trigger: 'guardBreak',
    priority: 'normal', rarity: 0.12, cooldown: 120, gain: 0.95,
    credits: { title: 'Off Guard', description: "Rarely, after breaking an opponent's Guard.", note: 'The warning was brief.' },
    voice: { drive: 2.1, rmsDb: -16, expandBelowDb: -42 },
  },
  {
    id: 'steelPolished',
    text: 'I had it polished.',
    trigger: 'steelCalled',
    priority: 'normal', rarity: 0.18, cooldown: 90, gain: 0.95,
    credits: { title: 'Polished', description: 'Occasionally, when Sheathe in Steel activates.', note: 'He is omitting several details.' },
    voice: { drive: 2.0, rmsDb: -17 },
  },
  {
    id: 'rebuttal',
    text: 'I present my rebuttal.',
    trigger: 'rebuttalOpening',
    priority: 'normal', rarity: 0.5, cooldown: 120,
    credits: { title: 'Rebuttal', description: 'Rarely, when an opponent has just spoken and the gauntlet has an answer.', note: 'A formal response, delivered by fist.' },
    voice: { drive: 2, rmsDb: -17 },
  },
  {
    id: 'fistThrow',
    text: 'I throw you my gauntlet.',
    trigger: 'gauntletHit',
    priority: 'normal', rarity: 0.12, cooldown: 90, gain: 0.95,
    credits: { title: 'I Throw You My Gauntlet', description: 'Rarely, at very close quarters.', note: 'Tradition has been interpreted loosely.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['gauntlet'],
  },
  {
    id: 'bladeCaught',
    text: 'Ah! My blade caught on the edge of a flower pot! I must rest. You may slay me. Quickly!',
    trigger: 'bladeSnag',
    priority: 'normal', rarity: 0.12, cooldown: 900,
    credits: { title: 'The Flower Pot', description: 'Extremely rarely, after the blade genuinely catches on some insignificant scenery.', note: 'The surrender is non-binding.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -42 }, aliases: ['snag', 'flowerpot'],
  },
  // --- the ultimate
  {
    id: 'sunderCall',
    text: 'Your integrity will not suffice!',
    trigger: { sunderInvoked: 0.65 },
    priority: 'high', rarity: 1, cooldown: 0,
    credits: { title: 'Sunder All That Rusts', description: 'Usually, when Sunder All That Rusts is invoked.', note: 'His definition of integrity is broad.' },
    voice: { drive: 2.4, rmsDb: -15 }, aliases: ['sunder', 'integrity', 'ultimate'],
  },
  {
    id: 'victory',
    text: 'MIGHT MAKES… KNIGHT!',
    trigger: { sunderInvoked: 0.35, sunderKill: 1, catastrophicGuardBreak: 1, sunderStaggerBreak: 1, massiveSunder: 1 },
    priority: 'normal', rarity: 0.3, cooldown: 120,
    credits: { title: 'Might Makes Knight', description: 'Occasionally, after force has settled the argument. Now and then, as Sunder All That Rusts is invoked.', note: 'The argument is not examined further.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['win', 'might', 'cheer', 'triumph'],
  },
  // --- the wildcard
  {
    id: 'laugh',
    text: 'aaaAAH, hahaHAH!',
    trigger: ['blowDealt', 'blowTaken', 'kill', 'death', 'dash', 'launched', 'hardLanding', 'sprintUnderPressure', 'spellCast', 'ultimateActive'], order: -5,
    priority: 'low', rarity: 0.02, cooldown: [45, 75], gain: 0.95, perLife: 1,
    credits: { title: 'The Laugh', description: 'Very rarely, in the middle of almost anything sufficiently reckless.', note: 'This does not narrow it down.' },
    voice: { drive: 2.2, rmsDb: -16 }, aliases: ['haha', 'chuckle'],
  },
  // --- waiting on what they belong to (declared, never said yet)
  {
    id: 'vortexUse', coming: 'Blazing Vortex',
    text: 'Bleublurblurblur blurburrrbluuurrr!!',
    trigger: 'vortexSpin',
    priority: 'normal', rarity: 0.4, cooldown: 60,
    credits: { title: 'Blazing Vortex', description: 'Occasionally, once rotation has exceeded useful speech.', note: 'No transcript was requested.' },
    voice: { drive: 2.3, rmsDb: -16 }, aliases: ['vortex'],
  },
  {
    id: 'vortexDefeat', coming: 'Blazing Vortex',
    text: 'I was dizzy anyway.',
    trigger: 'vortexDeath',
    priority: 'high', rarity: 0.5, cooldown: 120,
    credits: { title: 'Dizzy Anyway', description: 'Rarely, when Blazing Vortex ends somewhat earlier than intended.', note: 'The defense was entered after death.' },
    voice: { drive: 2, rmsDb: -17, expandBelowDb: -40 }, aliases: ['dizzy'],
  },
  {
    id: 'misaddressed', coming: 'the Riposte',
    text: 'I have misaddressed.',
    trigger: 'riposteOvershoot',
    priority: 'normal', rarity: 0.2, cooldown: 300,
    credits: { title: 'Misaddressed', description: "Very rarely, after a Riposte takes him somewhere it shouldn't.", note: 'The destination was incorrect.' },
    voice: { drive: 2, rmsDb: -17 }, aliases: ['misaddressed', 'riposte'],
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
