// Authored feats. Combat facts and settlement remain authoritative; this table describes the curriculum.
export const CHALLENGE_FAMILIES = Object.freeze({ swordsmanship:'SWORDSMANSHIP', sorcery:'SORCERY', chivalry:'CHIVALRY', oddities:'ODDITIES' });
const feat=(id,family,title,condition,renown,{hint=null,goal=1,flavor=null}={})=>Object.freeze({id,family,title,condition,visibility:hint?'hinted':'visible',hint,goal,reward:Object.freeze({renown}),flavor});
export const CHALLENGES = Object.freeze({
  three_part_argument:feat('three_part_argument','swordsmanship','THREE PART ARGUMENT','Land all three strikes of one uninterrupted ordinary sword chain on the same opponent.',15,{goal:3}),
  turnabout:feat('turnabout','swordsmanship','TURNABOUT','Perfect parry an opponent, then kill that same opponent within 5 seconds.',20),
  mind_the_gap:feat('mind_the_gap','sorcery','MIND THE GAP','Earn an abyss kill attributed to your Gale displacement.',20),
  wind_correction:feat('wind_correction','sorcery','WIND CORRECTION','Hit an enemy with an ordinary projectile after that same owned projectile was bent by your Gale.',20,{hint:'The wind is not particular about straight lines.',flavor:'The wind was apparently not particular about straight lines.'}),
  polished_under_pressure:feat('polished_under_pressure','sorcery','POLISHED UNDER PRESSURE','While Steel is active, survive a damaging contact whose unmitigated damage would have killed you.',20,{hint:'Armor is most convincing when tested.'}),
  not_yet:feat('not_yet','chivalry','NOT YET','Interrupt an enemy ultimate during vulnerable startup, before it commits.',20),
  against_better_judgment:feat('against_better_judgment','chivalry','AGAINST BETTER JUDGMENT','Win a Duel after reaching 15 HP or less during that Duel.',20),
  both_hands_full:feat('both_hands_full','chivalry','BOTH HANDS FULL','During Chivalry, damage the same enemy with sword and a prepared spell within 1.5 seconds, with Guard active during at least one contact.',25,{hint:'A knight need not choose one thing at a time.'}),
  passing_remark:feat('passing_remark','chivalry','PASSING REMARK','During Chivalry, land an ordinary sword contact while in Dash.',15,{hint:'Momentum is an argument too.'}),
});

/** Never transmit numeric progress for an unrevealed hinted feat. Unknown IDs are retained on disk only. */
export function publicChallengeState(state={}) {
  const progress={},completed={};
  for(const c of Object.values(CHALLENGES)) {
    if(state.completed?.[c.id]) completed[c.id]=state.completed[c.id];
    if(c.visibility==='visible' || completed[c.id]) {
      const value=state.progress?.[c.id];
      if(Number.isFinite(value) && value>0) progress[c.id]=Math.min(c.goal,Math.floor(value));
    }
  }
  return {progress,completed};
}

export function challengeView(state={}) {
  return Object.values(CHALLENGES).map(c=>{
    const complete=Boolean(state?.completed?.[c.id]);
    if(c.visibility==='hinted' && !complete) return {id:c.id,family:c.family,title:'HIDDEN CHALLENGE',hint:c.hint,complete:false};
    return {...c,progress:complete?c.goal:Math.max(0,Math.min(c.goal,Number(state?.progress?.[c.id])||0)),complete};
  });
}
