// Pure terminal-dive eligibility shared by client HUD and authoritative host.
// A UI inspection must not load the simulation/AI dependency graph.
import {PROWESS} from './prowess.mjs';
export const TERMINAL_ASCENSION_ID='doNotStopMyAscension';
// `practice` must be derived from the authoritative room, never a client
// command. Practice pilots always hold a full PERSONAL Ultimate even during
// an in-tick rotor drain; active/spent Chivalry and one-use machine limits
// continue to apply.
export function ascensionValkyrieReady(m,p,now,{practice=false}={}){
 return Boolean(m&&!m.retired&&m.mode!=='DESTROYED'&&m.health>0&&
   !m.terminalDive&&!m.terminalDiveSpent&&m.rotorHP>0&&m.flightCharge>0&&
   p?.alive&&p.ultimate==='chivalry'&&!p.ultimateState&&
   (practice||(p.prowess??0)>=PROWESS.full)&&m.skill?.id===TERMINAL_ASCENSION_ID&&
   m.skill.phase==='active'&&(m.skill.activeUntil==null||now+1e-8<m.skill.activeUntil));
}
