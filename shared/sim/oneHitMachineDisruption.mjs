// Siege components are not Spellblades. Disaster statuses mildly inhibit
// motion and steering rather than freezing the entire machine or interrupting
// its operator's inputs. Recover gradually and expire automatically.
export function siegeDisasterImpairment(machine,nowSec) {
  const effect=machine?.disasterAffliction;
  if(!effect||!Number.isFinite(nowSec)||nowSec>=effect.until)return {speed:1,steering:1};
  const remaining=Math.max(0,Math.min(1,(effect.until-nowSec)/
    Math.max(.001,effect.until-effect.at)));
  const frost=Math.max(0,Math.min(.2,effect.frost??0));
  const gale=Math.max(0,Math.min(.25,effect.gale??0));
  const lightning=Math.max(0,Math.min(.2,effect.lightning??0));
  return {speed:Math.max(.65,1-remaining*(frost+lightning*.5)),
    steering:Math.max(.7,1-remaining*(gale+lightning*.25))};
}
