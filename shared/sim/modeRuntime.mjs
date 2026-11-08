// Opt-in authoritative game-mode extension registry.
// The mode implements ONLY its own hooks, never importing unrelated modes.
// See docs/modes/mode-runtime-contract.md for timing, return types and testing.
import { GAME_MODES } from '../src/modes.mjs';
import { RESTLESS_DAY_HANDLER } from './restlessDayMode.mjs';

export const MODE_HOOKS=Object.freeze([
  'ownsTeamObjectives','init','beforeSpawns','reset','baseWorld','composeWorld',
  'step','command','spawn','botGoal','botOccupation',
  'beforeStructureDamage','onStructureDamage','onTime','serialize',
]);
const supported=new Set(MODE_HOOKS);

/** Validate registration eagerly: a misspelled hook must never silently
 * reopen legacy Breakthrough overtime or skip a victory guard. */
export function defineModeHandler(mode,handler){
  if(typeof mode!=='string'||!mode||!handler||typeof handler!=='object')
    throw new TypeError('A registered game mode needs a stable id and hook object.');
  for(const [name,fn]of Object.entries(handler)){
    if(!supported.has(name))throw new TypeError(`Unknown mode lifecycle hook: ${mode}.${name}`);
    if(typeof fn!=='function')throw new TypeError(`Mode lifecycle hook must be callable: ${mode}.${name}`);
  }
  return Object.freeze(handler);
}
const handlers=new Map([
  [GAME_MODES.RESTLESS_DAY,defineModeHandler(GAME_MODES.RESTLESS_DAY,RESTLESS_DAY_HANDLER)],
]);
export function modeHandler(mode){return handlers.get(mode)??null;}
export function modeCall(room,hook,...args){return modeHandler(room.mode)?.[hook]?.(room,...args);}
export function modeSnapshot(room,now){return modeCall(room,'serialize',now)??null;}
