// Pure private-room draft contract. The same authoritative limits are used
// by public rooms and the lobby; the banner is only a UI for these rules.
import {roomSettings} from '../../shared/src/roomSettings.mjs';
import {getModePolicy} from '../../shared/src/modes.mjs';

export const PRIVATE_MODES=Object.freeze(['FFA','BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY','EDGE_OF_VICTORY','SIEGE_BLADES']);
export const PRIVATE_MODE_DEFAULTS=Object.freeze({
 FFA:Object.freeze({worldId:'castleward',minutes:6,scoreToWin:10}),
 BREAKTHROUGH:Object.freeze({worldId:'bastion-breach',minutes:5,teamSize:3,botSkill:'knight',team:'AUTO'}),
 HIGH_GROUNDS:Object.freeze({worldId:'high-grounds',minutes:12,teamSize:3,botSkill:'knight',team:'AUTO'}),
 RESTLESS_DAY:Object.freeze({worldId:'restless-day',minutes:13,teamSize:5,botSkill:'knight',team:'AUTO'}),
 EDGE_OF_VICTORY:Object.freeze({worldId:'ruined-keep',minutes:5,botSkill:'knight'}),
 SIEGE_BLADES:Object.freeze({worldId:'high-grounds',teamSize:1,botSkill:'knight',team:'AUTO',format:'MATCH',matchRounds:3,endlessRoundCap:25})
});
export const siegeRoundsLabel=(rules)=>rules?.format==='ENDLESS'
 ?(rules.endlessRoundCap?`ENDLESS · CAP ${rules.endlessRoundCap}`:'ENDLESS · NO CAP'):`${rules?.matchRounds??3} ROUNDS`;
export const privateMode=(value)=>PRIVATE_MODES.includes(value)?value:'FFA';
export function privateRoomPreview(mode,form={}){
 const chosen=privateMode(mode),defs=PRIVATE_MODE_DEFAULTS[chosen];
 const minutes=form.minutes===undefined?defs.minutes:Number(form.minutes);
 const seconds=Number.isFinite(minutes)?Math.round(minutes*60):NaN;
 const score=form.scoreToWin===undefined?10:Number(form.scoreToWin);
 const teamSize=chosen==='RESTLESS_DAY'?5:chosen==='SIEGE_BLADES'?(form.teamSize===undefined?1:Number(form.teamSize)):form.teamSize===undefined?3:Number(form.teamSize);
 const botSkill=form.botSkill??'knight',worldId=form.worldId??defs.worldId;
 const baseline={mode:'FFA',worldId:'castleward',scoreToWin:10,policy:getModePolicy('FFA')};
 const siege=chosen==='SIEGE_BLADES';
 // (Siege Blades plays rounds on its own clock: a format and a number of rounds, never a match time)
 const siegeRules=siege?{format:form.format??defs.format,
   matchRounds:Number(form.matchRounds??defs.matchRounds),endlessRoundCap:Number(form.endlessRoundCap??defs.endlessRoundCap)}:{};
 const settings=roomSettings(baseline,{mode:chosen,worldId,...(siege?siegeRules:{matchSeconds:seconds}),
   ...(chosen==='FFA'?{scoreToWin:score}:{teamSize,botSkill})});
 if(settings.error)return {ok:false,error:settings.error};
 const requestedTeam=(chosen==='FFA'||chosen==='EDGE_OF_VICTORY'||siege)?null:
   ['ATTACKERS','DEFENDERS'].includes(form.team)?form.team:null;
 const summary=chosen==='EDGE_OF_VICTORY' ? 'EDGE OF VICTORY · FOUR KNIGHTS · LAST STANDING'
    : chosen==='FFA'
   ?`FREE-FOR-ALL · FIRST TO ${settings.scoreToWin} · ${minutes} MIN`
   : chosen==='SIEGE_BLADES'
   ?`SIEGE BLADES · ${settings.teamSize}V${settings.teamSize} · ${siegeRoundsLabel(settings.siegeBladesSettings)}`
   :`${chosen==='BREAKTHROUGH'?'BREAKTHROUGH':chosen==='RESTLESS_DAY'?'RESTLESS DAY':'HIGH GROUNDS'} · ${settings.teamSize}V${settings.teamSize} · ${minutes} MIN`;
 return {ok:true,settings,team:requestedTeam,summary};
}
