// Pure private-room draft contract. The same authoritative limits are used
// by public rooms and the lobby; the banner is only a UI for these rules.
import {roomSettings} from '../../shared/src/roomSettings.mjs';
import {getModePolicy} from '../../shared/src/modes.mjs';

export const PRIVATE_MODES=Object.freeze(['FFA','BREAKTHROUGH','HIGH_GROUNDS']);
export const PRIVATE_MODE_DEFAULTS=Object.freeze({
 FFA:Object.freeze({worldId:'castleward',minutes:6,scoreToWin:10}),
 BREAKTHROUGH:Object.freeze({worldId:'bastion-breach',minutes:5,teamSize:3,botSkill:'knight',team:'AUTO'}),
 HIGH_GROUNDS:Object.freeze({worldId:'high-grounds',minutes:12,teamSize:3,botSkill:'knight',team:'AUTO'})
});
export const privateMode=(value)=>PRIVATE_MODES.includes(value)?value:'FFA';
export function privateRoomPreview(mode,form={}){
 const chosen=privateMode(mode),defs=PRIVATE_MODE_DEFAULTS[chosen];
 const minutes=form.minutes===undefined?defs.minutes:Number(form.minutes);
 const seconds=Number.isFinite(minutes)?Math.round(minutes*60):NaN;
 const score=form.scoreToWin===undefined?10:Number(form.scoreToWin);
 const teamSize=form.teamSize===undefined?3:Number(form.teamSize);
 const botSkill=form.botSkill??'knight',worldId=form.worldId??defs.worldId;
 const baseline={mode:'FFA',worldId:'castleward',scoreToWin:10,policy:getModePolicy('FFA')};
 const settings=roomSettings(baseline,{mode:chosen,worldId,matchSeconds:seconds,
   ...(chosen==='FFA'?{scoreToWin:score}:{teamSize,botSkill})});
 if(settings.error)return {ok:false,error:settings.error};
 const requestedTeam=chosen==='FFA'?null:
   ['ATTACKERS','DEFENDERS'].includes(form.team)?form.team:null;
 const summary=chosen==='FFA'
   ?`FREE-FOR-ALL · FIRST TO ${settings.scoreToWin} · ${minutes} MIN`
   :`${chosen==='BREAKTHROUGH'?'BREAKTHROUGH':'HIGH GROUNDS'} · ${settings.teamSize}V${settings.teamSize} · ${minutes} MIN`;
 return {ok:true,settings,team:requestedTeam,summary};
}
