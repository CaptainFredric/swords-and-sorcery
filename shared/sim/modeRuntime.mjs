// Single extension contract for optional authoritative modes. The registry imports
// only modes that actually exist. Later agents register Renown Trials and Edge of Victory here.
import { GAME_MODES } from '../src/modes.mjs';
import { RESTLESS_DAY_HANDLER } from './restlessDayMode.mjs';
const handlers=new Map([[GAME_MODES.RESTLESS_DAY,RESTLESS_DAY_HANDLER]]);
export function modeHandler(mode){return handlers.get(mode)??null;}
export function modeCall(room,hook,...args){return modeHandler(room.mode)?.[hook]?.(room,...args);}
export function modeSnapshot(room,now){return modeCall(room,'serialize',now)??null;}
