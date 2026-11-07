import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIVATE_MODES,PRIVATE_MODE_DEFAULTS,privateRoomPreview} from './privateRoomRules.mjs';

test('Private creation defaults to Free-for-All and a six-minute first-to-ten room',()=>{
 assert.deepEqual(PRIVATE_MODES,['FFA','BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY','EDGE_OF_VICTORY']);
 const p=privateRoomPreview('FFA');
 assert.equal(p.ok,true);
 assert.deepEqual({mode:p.settings.mode,world:p.settings.worldId,score:p.settings.scoreToWin,
   seconds:p.settings.matchSeconds,team:p.team},
   {mode:'FFA',world:'castleward',score:10,seconds:360,team:null});
});
test('Mode changes use compatible arenas and team defaults',()=>{
 const b=privateRoomPreview('BREAKTHROUGH');
 const h=privateRoomPreview('HIGH_GROUNDS');
 assert.equal(b.ok,true);assert.equal(b.settings.worldId,'bastion-breach');
 assert.equal(b.settings.teamSize,3);
 assert.equal(b.settings.matchSeconds,300);
 assert.equal(h.ok,true);assert.equal(h.settings.worldId,'high-grounds');
 assert.equal(h.settings.matchSeconds,720);
 assert.equal(h.settings.teamSize,3);
  const r=privateRoomPreview('RESTLESS_DAY');
  assert.equal(r.ok,true);assert.equal(r.settings.worldId,'restless-day');
  assert.equal(r.settings.teamSize,5);assert.equal(r.settings.matchSeconds,780);
 for(const mode of PRIVATE_MODES)assert.equal(PRIVATE_MODE_DEFAULTS[mode].minutes>0,true);
});
test('Private host chooses real limits, world, skill and side rather than cosmetic-only controls',()=>{
 const f=privateRoomPreview('FFA',{worldId:'ruined-keep',scoreToWin:18,minutes:9});
 assert.equal(f.ok,true);assert.equal(f.settings.scoreToWin,18);
 assert.equal(f.settings.matchSeconds,540);assert.equal(f.settings.worldId,'ruined-keep');
 const team=privateRoomPreview('BREAKTHROUGH',{worldId:'outerworks',teamSize:2,minutes:7,
  botSkill:'champion',team:'DEFENDERS'});
 assert.equal(team.ok,true);
 assert.equal(team.settings.teamSize,2);assert.equal(team.team,'DEFENDERS');
 assert.equal(team.settings.botSkill,'champion');
 assert.equal(team.settings.matchSeconds,420);
 assert.match(team.summary,/2V2/);
});
test('Private host cannot submit out-of-range numbers, invalid arenas or bogus bot settings',()=>{
 for(const bad of [{minutes:0},{minutes:31},{scoreToWin:101},{scoreToWin:2.5},
   {worldId:'high-grounds'}])assert.equal(privateRoomPreview('FFA',bad).ok,false);
 for(const bad of [{teamSize:5},{botSkill:'super-knight'},{worldId:'castleward'}])
   assert.equal(privateRoomPreview('BREAKTHROUGH',bad).ok,false);
});
