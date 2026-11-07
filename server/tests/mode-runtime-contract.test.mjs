import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_MODES} from '../../shared/src/modes.mjs';
import {Room} from '../../shared/sim/Room.mjs';
import {modeHandler,modeCall,modeSnapshot,MODE_HOOKS,defineModeHandler} from '../../shared/sim/modeRuntime.mjs';
import {WORLD_IDS} from '../../shared/worlds/registry.mjs';

test('Only installed modes supply authoritative extensions; other modes preserve legacy flow',()=>{
 const base=new Room('BASE1',{mode:GAME_MODES.FFA,worldId:WORLD_IDS.CASTLEWARD});
 assert.equal(modeHandler(GAME_MODES.FFA),null);
 assert.equal(modeCall(base,'ownsTeamObjectives'),undefined);
 assert.equal(modeSnapshot(base,0),null);
 const newMode=modeHandler(GAME_MODES.RESTLESS_DAY);
 assert.ok(newMode&&Object.isFrozen(newMode));
 assert.equal(newMode.ownsTeamObjectives(),true);
 assert.equal(typeof newMode.beforeStructureDamage,'function');
 assert.equal(typeof newMode.composeWorld,'function');
});

test('Registration contract catches hook typos instead of bypassing time/structure arbitration',()=>{
 assert.ok(MODE_HOOKS.includes('beforeStructureDamage'));
 assert.ok(MODE_HOOKS.includes('onTime'));
 assert.ok(MODE_HOOKS.includes('beforeSpawns'));
 assert.ok(MODE_HOOKS.includes('botOccupation'));
 assert.throws(()=>defineModeHandler('FAKE_MODE',{onTim:()=>true}),/Unknown mode lifecycle hook/);
 assert.throws(()=>defineModeHandler('FAKE_MODE',{onTime:true}),/must be callable/);
 const empty=defineModeHandler('OTHER_MODE',{});
 assert.ok(Object.isFrozen(empty));
});
