import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIVATE_MODES,PRIVATE_MODE_DEFAULTS,privateRoomPreview} from './privateRoomRules.mjs';

test('Private creation defaults to Free-for-All and a six-minute first-to-ten room',()=>{
 assert.deepEqual(PRIVATE_MODES,['FFA','BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY','EDGE_OF_VICTORY','SIEGE_BLADES']);
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
 for(const mode of PRIVATE_MODES)if(mode!=='SIEGE_BLADES')assert.equal(PRIVATE_MODE_DEFAULTS[mode].minutes>0,true);
 assert.equal(PRIVATE_MODE_DEFAULTS.SIEGE_BLADES.minutes,undefined,'Siege Blades rooms choose rounds, not a match time');
});
test('A private Siege Blades room carries its format and rounds to the mode, not a match time',()=>{
 const match=privateRoomPreview('SIEGE_BLADES',{teamSize:2,format:'MATCH',matchRounds:5,minutes:20});
 assert.equal(match.ok,true);
 assert.deepEqual({...match.settings.siegeBladesSettings},
  {format:'MATCH',matchRounds:5,endlessRoundCap:25,clashStarts:null,teamSize:2,botDifficulty:'knight'});
 assert.equal(match.summary,'SIEGE BLADES · 2V2 · 5 ROUNDS');
 assert.equal(match.team,null,'sides are drawn by the mode');
 const endless=privateRoomPreview('SIEGE_BLADES',{teamSize:1,format:'ENDLESS',endlessRoundCap:0});
 assert.equal(endless.ok,true);assert.equal(endless.summary,'SIEGE BLADES · 1V1 · ENDLESS · NO CAP');
 const endlessClashOff=privateRoomPreview('SIEGE_BLADES',{teamSize:1,format:'ENDLESS',endlessRoundCap:25,clashStarts:false});
 assert.equal(endlessClashOff.ok,true);
 assert.equal(endlessClashOff.settings.siegeBladesSettings.clashStarts,false);
 assert.equal(endlessClashOff.summary,'SIEGE BLADES · 1V1 · ENDLESS · CAP 25 · CLASH OFF');
 for(const bad of [{matchRounds:4},{format:'MARATHON'},{format:'ENDLESS',endlessRoundCap:99},{teamSize:4}])
  assert.equal(privateRoomPreview('SIEGE_BLADES',bad).ok,false,JSON.stringify(bad));
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
