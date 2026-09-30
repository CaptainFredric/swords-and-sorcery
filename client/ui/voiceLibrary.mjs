// The credits, and the Spellblade's voice library: every line he has (or will have), what he says, when he says it,
// and a word on why. Shown from the settings' footer (a quiet button, not a menu item). Pure data, so a test can hold
// it to the game: every line the game can speak is listed here.

export const CREDITS = Object.freeze({
  title: 'SWORDS & SORCERY',
  lines: Object.freeze([
    Object.freeze({ role: 'Conceived and designed by', name: 'CaptainFredric' }),
    Object.freeze({ role: 'The Spellblade voiced by', name: 'CaptainFredric' }),
  ]),
  note: 'Every word he says was said first, in earnest, by the man who made him.',
});

// status: 'live' (in the game now), 'coming' (recorded, waiting on what it belongs to), 'unrecorded' (a place kept).
// `when` is the credits' description of when he says it, `note` the dry word on it (both as the voice's author
// wrote them).
export const VOICE_LIBRARY = Object.freeze([
  // in the game
  {
    line: 'sorcery', title: 'Sorcery', status: 'live',
    words: 'SORCERY!!',
    when: 'Occasionally, as sorcery leaves his hand.',
    note: 'Apparently this clarifies matters.',
  },
  {
    line: 'defeat', title: 'But I Am a Knight', status: 'live',
    words: 'What!? But I am a knight!',
    when: 'Occasionally upon being felled. More often when that proves decisive.',
    note: 'His title has failed as protective equipment.',
  },
  {
    line: 'knightFallen', title: 'The Knight Has Fallen', status: 'live',
    words: 'The Knight has fallen!… no longer may day arrive…',
    when: 'Very rarely, after an especially excessive death.',
    note: 'The sun has been informed.',
  },
  {
    line: 'magicDefeat', title: 'Magic Defeat', status: 'live',
    words: "I don't believe in magic.",
    when: 'Now and then, when sorcery is what felled him.',
    note: 'Said by a man who throws fireballs for a living.',
  },
  {
    line: 'laugh', title: 'The Laugh', status: 'live',
    words: 'AHHHhh, hahaHAH!',
    when: 'Very rarely, during nearly anything sufficiently ill-advised.',
    note: 'No useful pattern has been identified.',
  },
  {
    line: 'killTaunt', title: 'Good Knight', status: 'live',
    words: 'Good knight? That will not be you.',
    when: 'Now and then, over a fallen foe.',
    note: 'Sportsmanship, loosely interpreted.',
  },
  {
    line: 'victory', title: 'Might Makes Knight', status: 'live',
    words: 'MIGHT MAKES… KNIGHT!',
    when: 'Occasionally, after force has settled the argument. Now and then, as Sunder All That Rusts is invoked.',
    note: 'The argument is not examined further.',
  },
  {
    line: 'sunderCall', title: 'Sunder All That Rusts', status: 'live',
    words: 'Your integrity will not suffice!',
    when: 'Usually, when Sunder All That Rusts is invoked.',
    note: 'His definition of integrity is broad.',
  },
  {
    line: 'galeTaunt', title: 'Must Have Been the Wind', status: 'live',
    words: 'What did you say? Must have been the wind…',
    when: 'Occasionally, after Gale appreciably relocates someone.',
    note: 'The wind has declined to comment.',
  },
  {
    line: 'rebuttal', title: 'Rebuttal', status: 'live',
    words: 'I present my rebuttal.',
    when: 'Rarely, when an opponent has just spoken and the gauntlet has an answer.',
    note: 'A formal response, delivered by fist.',
  },
  {
    line: 'fistThrow', title: 'I Throw You My Gauntlet', status: 'live',
    words: 'I throw you my gauntlet.',
    when: 'Rarely, at very close quarters.',
    note: 'Tradition has been interpreted loosely.',
  },
  {
    line: 'breakTaunt', title: 'A Real Guard', status: 'live',
    words: "You should've hired a REAL guard.",
    when: 'Rarely, after demonstrating a personnel concern.',
    note: 'Recruitment remains closed.',
  },
  {
    line: 'steelBoast', title: 'My Armor Works', status: 'live',
    words: 'My armor works now!',
    when: 'Now and then, when Sheathe in Steel turns a spell aside.',
    note: '"Now." It had not, previously.',
  },
  {
    line: 'bladeCaught', title: 'The Flower Pot', status: 'live',
    words: 'Ah! My blade caught on the edge of a flower pot! I must rest. You may slay me. Quickly!',
    when: 'Extremely rarely, after the blade genuinely catches on some insignificant scenery.',
    note: 'The surrender is non-binding.',
  },
  {
    line: 'jump', title: 'Jumps', status: 'live',
    words: '(a grunt)',
    when: 'Now and then, as he jumps.',
    note: 'Armour is heavy. Gravity is patient.',
  },
  // recorded, waiting on what they belong to
  {
    line: 'vortexUse', title: 'Blazing Vortex', status: 'coming',
    words: 'Bleublurblurblur blurburrrbluuurrr!!',
    when: 'Occasionally, once rotation has exceeded useful speech.',
    note: 'No transcript was requested.',
  },
  {
    line: 'vortexDefeat', title: 'Dizzy Anyway', status: 'coming',
    words: 'I was dizzy anyway.',
    when: 'Rarely, when Blazing Vortex ends somewhat earlier than intended.',
    note: 'The defense was entered after death.',
  },
  // places kept for lines not yet recorded (each is wired, and silent until it is)
  {
    line: 'neverThought', title: 'This Day', status: 'unrecorded',
    words: 'I had never thought this day would come…',
    when: 'Rarely, when defeat becomes official.',
    note: 'Me neither, Spellblade.',
  },
  {
    line: 'lateLine', title: 'Late', status: 'unrecorded',
    words: 'NOOoo! I am going to be late!',
    when: 'Rarely, when a very small amount of damage proves sufficient.',
    note: 'Apparently he had prior commitments.',
  },
  {
    line: 'squireSetup', title: 'The Squire', status: 'unrecorded',
    words: 'What did the squire say to the Spellblade?',
    when: 'Very rarely, when an answer appears likely to present itself.',
    note: 'The setup is considered legally binding. No answer has ever survived transcription.',
  },
  {
    line: 'newKnighthood', title: 'A New Knighthood', status: 'unrecorded',
    words: 'You have achieved a new form of knight hood.',
    when: 'Rarely, after an unusually clean and elevated sword lesson.',
    note: 'The ceremony has been shortened.',
  },
  {
    line: 'staggerDisplay', title: 'A Staggering Display', status: 'unrecorded',
    words: 'A staggering display.',
    when: "Occasionally, after somebody's balance ceases to cooperate.",
    note: 'He has chosen to notice.',
  },
  {
    line: 'lowerGuard', title: 'Lower Your Guard', status: 'unrecorded',
    words: 'I helped you lower your guard.',
    when: "Occasionally, after breaking an opponent's Guard.",
    note: 'Assistance was neither requested nor gentle.',
  },
  {
    line: 'hackSlash', title: 'The Hack and the Slash', status: 'unrecorded',
    words: 'You are the hack. I will be the slash.',
    when: 'Occasionally, after a particularly tidy sword exchange.',
    note: 'He has divided the responsibilities.',
  },
  {
    line: 'subparStandard', title: 'Subpar Standard', status: 'unrecorded',
    words: 'Your standard is subpar.',
    when: 'Very rarely, when heraldry and homicide coincide.',
    note: 'The assessment was unsolicited.',
  },
  {
    line: 'alwaysKnew', title: 'Always Knew', status: 'unrecorded',
    words: 'I always knew that I thought this would happen.',
    when: 'Rarely, after events rescue him in a manner he immediately claims to have anticipated.',
    note: 'Confidence has been reconstructed.',
  },
  {
    line: 'neverReach', title: 'Never Reach Me', status: 'unrecorded',
    words: 'If you keep practicing… you will still never reach me.',
    when: 'Rarely, after a Practice Yard victory.',
    note: 'Instruction has concluded.',
  },
  {
    line: 'fistKill', title: 'SoFISTicated', status: 'unrecorded',
    words: 'I am quite soFISTicated.',
    when: 'Very rarely, after the gauntlet settles matters.',
    note: 'Regrettably, he prepared this one.',
  },
  {
    line: 'misaddressed', title: 'Misaddressed', status: 'unrecorded',
    words: 'I have misaddressed.',
    when: 'Very rarely, after delivering himself somewhere unintended.',
    note: 'The destination was incorrect.',
  },
  {
    line: 'fistEffort', title: 'Hya', status: 'unrecorded',
    words: 'HYA!',
    when: 'The breath behind the gauntlet.',
    note: 'Awaiting a sufficiently dramatic breath.',
  },
  {
    line: 'effort', title: 'Effort', status: 'unrecorded',
    words: '(the breath behind a heavy swing)',
    when: 'The heavy strike, and now and then a lighter one.',
    note: 'Currently swung in dignified silence.',
  },
  {
    line: 'hurt', title: 'Hurt', status: 'unrecorded',
    words: '(a blow taken)',
    when: 'Taking a real blow.',
    note: 'For now he suffers in silence, which he considers knightly.',
  },
  {
    line: 'death', title: 'Death', status: 'unrecorded',
    words: '(going down)',
    when: 'When nothing better comes to him.',
    note: 'The quiet option.',
  },
  {
    line: 'dash', title: 'Dash', status: 'unrecorded',
    words: '(a quick breath out)',
    when: 'Now and then on a dash.',
    note: 'Too fast to comment.',
  },
].map((entry) => Object.freeze(entry)));

const BY_LINE = new Map(VOICE_LIBRARY.map((entry) => [entry.line, entry]));

/** A line's words as its subtitle shows them: null for anything without words (a grunt, a breath). */
export function subtitleFor(line) {
  const words = BY_LINE.get(line)?.words;
  return words && !words.startsWith('(') ? words : null;
}

export const LIBRARY_STATUS = Object.freeze({
  live: 'IN THE GAME',
  coming: 'COMING WITH BLAZING VORTEX',
  unrecorded: 'NOT YET RECORDED',
});
