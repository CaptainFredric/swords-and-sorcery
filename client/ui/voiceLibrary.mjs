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

// status: 'live' (in the game now), 'coming' (recorded, waiting on what it belongs to), 'unrecorded' (a place kept)
export const VOICE_LIBRARY = Object.freeze([
  // --- in the game
  {
    line: 'sorcery', title: 'Sorcery', status: 'live',
    words: 'SORCERY!',
    when: 'Now and then as a spell leaves his hand: about one cast in twelve, never twice within 45 seconds.',
    note: 'He feels it every time. He only says it when it counts.',
  },
  {
    line: 'victory', title: 'Victory', status: 'live',
    words: 'Might makes... KNIGHT!',
    when: 'Winning a match.',
    note: 'The pun is load-bearing.',
  },
  {
    line: 'defeat', title: 'Defeat', status: 'live',
    words: 'What? But I am a knight!',
    when: 'Now and then when felled; a little likelier when the match is lost.',
    note: 'He regards it as a clerical error.',
  },
  {
    line: 'magicDefeat', title: 'Magic Defeat', status: 'live',
    words: "I don't believe in magic.",
    when: 'Killed by a spell, or by the burn it left.',
    note: 'Said by a man who throws fireballs for a living.',
  },
  {
    line: 'knightFallen', title: 'The Knight Has Fallen', status: 'live',
    words: 'The knight has fallen! ...and day may arrive no longer...',
    when: 'A rare fall; likelier after a blow far heavier than it needed to be.',
    note: 'A scheduling dispute between knight and day. The wording stays.',
  },
  {
    line: 'killTaunt', title: 'Good Knight', status: 'live',
    words: 'Good knight? That will not be you.',
    when: 'Over a fallen foe, now and then, if the foe had nothing to say. (Sometimes only a laugh.)',
    note: 'Sportsmanship, loosely interpreted.',
  },
  {
    line: 'breakTaunt', title: 'Real Guard', status: 'live',
    words: 'You should have hired a REAL guard!',
    when: 'After breaking a guard, now and then.',
    note: 'Unsolicited staffing advice.',
  },
  {
    line: 'galeTaunt', title: 'Must Have Been the Wind', status: 'live',
    words: 'What did you say? Must have been the wind...',
    when: 'After a Gale Garner has really thrown someone: likelier the harder it threw them.',
    note: 'He heard nothing. He was busy being the weather.',
  },
  {
    line: 'steelBoast', title: 'My Armor Works', status: 'live',
    words: 'My armor works now!',
    when: 'Sheathe in Steel has turned a spell aside, now and then.',
    note: '"Now." It had not, previously.',
  },
  {
    line: 'sunderCall', title: 'Sunder All That Rusts', status: 'live',
    words: 'YOUR INTEGRITY WILL NOT SUFFICE!',
    when: 'Every Sunder All That Rusts, as the brace begins. The ultimate does not wait for him to finish.',
    note: 'Structural, and personal.',
  },
  {
    line: 'fistThrow', title: 'I Throw You My Gauntlet', status: 'live',
    words: 'I throw you my gauntlet.',
    when: 'Now and then as the gauntlet lands.',
    note: 'A formal challenge, delivered at speed.',
  },
  {
    line: 'rebuttal', title: 'Rebuttal', status: 'live',
    words: 'I present my rebuttal.',
    when: 'The gauntlet, on a foe who has just spoken and is nearly beaten.',
    note: 'Debate club, with fists.',
  },
  {
    line: 'bladeCaught', title: 'The Flower Pot', status: 'live',
    words: 'Ah! My blade caught on the edge of a flower pot! I must rest. You may slay me. Quickly!',
    when: 'Almost never: only when his blade snags on some small furnishing in passing, and even then rarely.',
    note: 'He surrenders with honour. Nobody has ever accepted.',
  },
  {
    line: 'jump', title: 'Jumps', status: 'live',
    words: '(a grunt)',
    when: 'Now and then as he jumps; never the same one twice running.',
    note: 'Armour is heavy. Gravity is patient.',
  },
  // --- recorded, waiting on what they belong to
  {
    line: 'vortexUse', title: 'Blazing Vortex', status: 'coming',
    words: '(spinning, at length)',
    when: 'As Blazing Vortex begins to spin. Coming with the ultimate.',
    note: 'Words were never the point.',
  },
  {
    line: 'vortexDefeat', title: 'Dizzy Anyway', status: 'coming',
    words: 'I was dizzy anyway.',
    when: 'Felled during Blazing Vortex, or while still dizzy from it. Coming with the ultimate.',
    note: 'An excuse, prepared well in advance.',
  },
  // --- places kept for lines not yet recorded
  {
    line: 'fistKill', title: 'SoFISTicated', status: 'unrecorded',
    words: 'I am quite soFISTicated.',
    when: 'When the gauntlet fells someone.',
    note: 'He is, in fairness, quite pleased.',
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
    when: 'The third strike, and now and then a lighter one.',
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

export const LIBRARY_STATUS = Object.freeze({
  live: 'IN THE GAME',
  coming: 'COMING WITH BLAZING VORTEX',
  unrecorded: 'NOT YET RECORDED',
});
