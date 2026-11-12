import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSocket } from './GameSocket.mjs';
import { GameLink } from './GameLink.mjs';
import { LocalHost } from './LocalHost.mjs';

test('foundry build intent reaches the selected authoritative transport exactly once',()=>{
 const calls=[];
 const host=name=>({on:()=>{},highGroundsBuild:machine=>calls.push([name,machine])});
 const link=new GameLink({local:host('local'),remote:host('remote')});
 link.hosting='local';link.highGroundsBuild('fight-and-flight');
 link.hosting='remote';link.highGroundsBuild('so-fist-ication');
 assert.deepEqual(calls,[['local','fight-and-flight'],['remote','so-fist-ication']]);
});

test('socket sends one prepared cast intent containing identity and aim', () => {
  const messages = [];
  const socket = Object.create(GameSocket.prototype);
  socket.send = (message) => messages.push(message);
  socket.serverNow = () => 10;
  const direction = { x: 0, y: 0, z: -1 };
  socket.castPreparedSpell('frostfire', direction, { yaw: 0.3, pitch: 0.2, guard: true });
  socket.selectPreparedSpell('gale');
  socket.loadout('fireball', 'chivalry', ['fireball', 'gale', 'steel']);
  assert.deepEqual(messages, [
    { type: 'castPreparedSpell', spell: 'frostfire', direction, yaw: 0.3, pitch: 0.2, clientTime: 10 },
    { type: 'selectPreparedSpell', spell: 'gale' },
    { type: 'loadout', spell: 'fireball', ultimate: 'chivalry', preparedSpells: ['fireball', 'gale', 'steel'] },
  ]);
});

test('GameLink forwards prepared commands and the complete future loadout to each host', () => {
  const calls = [];
  const remote = { on: () => {}, loadout: (...args) => calls.push(['remoteLoadout', ...args]),
    castPreparedSpell: (...args) => calls.push(['remoteCast', ...args]), selectPreparedSpell: (id) => calls.push(['remoteSelect', id]) };
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} });
  const link = new GameLink({ remote, local });
  link.loadout('steel', 'chivalry', ['steel', 'frostfire', 'gale']);
  assert.deepEqual(local.preparedSpells, ['steel', 'frostfire', 'gale']);
  link.castPreparedSpell('gale', { x: 1, y: 0, z: 0 });
  link.selectPreparedSpell('frostfire');
  assert.deepEqual(calls.at(-2), ['remoteCast', 'gale', { x: 1, y: 0, z: 0 }]);
  assert.deepEqual(calls.at(-1), ['remoteSelect', 'frostfire']);
  local.startSolo('PRACTICE', 'Aden');
  assert.deepEqual(local.player.preparedSpells, ['steel', 'frostfire', 'gale']);
  assert.equal(local.player.startingSpell, 'steel');
  const carried = [...local.player.preparedSpells];
  local.room.state = 'PLAYING';
  local.player.spell = 'gale';
  link.loadout('fireball', 'sunder', ['fireball', 'gale', 'steel']);
  assert.equal(local.player.spell, 'gale');
  assert.deepEqual(local.player.preparedSpells, carried);
  assert.equal(local.player.startingSpell, 'fireball');
});

test('socket sends selection and current cast separately, with finite aim and no client identity', () => {
  const messages = [];
  const socket = Object.create(GameSocket.prototype);
  socket.send = message => messages.push(message); socket.serverNow = () => 10;
  socket.selectPreparedSlot(2);
  socket.castCurrentSpell({x:1,y:0,z:0}, {yaw:0.5,pitch:0.2,spell:'fireball'});
  socket.castCurrentSpell({x:0,y:0,z:-1}, {yaw:NaN,pitch:Infinity});
  assert.deepEqual(messages, [
    {type:'selectPreparedSlot',slot:2},
    {type:'castCurrentSpell',direction:{x:1,y:0,z:0},yaw:0.5,pitch:0.2,clientTime:10},
    {type:'castCurrentSpell',direction:{x:0,y:0,z:-1},clientTime:10},
  ]);
});

test('GameLink forwards slot and current cast intents to the active host', () => {
  const calls = [];
  const host = name => ({on:()=>{},selectPreparedSlot:slot=>calls.push([name,'select',slot]),
    castCurrentSpell:(...args)=>calls.push([name,'cast',...args])});
  const link = new GameLink({remote:host('remote'),local:host('local')});
  const direction = {x:1,y:0,z:0}; const aim = {yaw:0.2,pitch:0};
  link.selectPreparedSlot(2); link.castCurrentSpell(direction,aim);
  link.hosting = 'local';
  link.selectPreparedSlot(3); link.castCurrentSpell(direction,aim);
  assert.deepEqual(calls,[['remote','select',2],['remote','cast',direction,aim],['local','select',3],['local','cast',direction,aim]]);
});

test('offline host selects then casts its current identity without a client snapshot', () => {
  let now = 10;
  const local = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  local.loadout('fireball', 'chivalry', ['fireball','frostfire','gale']);
  local.startSolo('PRACTICE', 'Knight'); local.room.startMatch(now);
  local.player.prowess = 100; local.ultimate(); now = 10.65; local.tick();
  local.selectPreparedSlot(2);
  assert.equal(local.player.spell, 'frostfire'); assert.equal(local.player.pendingSpell, null);
  now = 10.7; local.castCurrentSpell({x:0,y:0,z:-1}, {yaw:1,pitch:0.2});
  assert.equal(local.player.pendingSpell.spell, 'frostfire');
  assert.equal(local.player.yaw, 1);
  local.selectPreparedSlot(3);
  assert.equal(local.player.spell, 'gale');
  assert.equal(local.player.pendingSpell.spell, 'frostfire', 'selection preserves an accepted gather');
  local.close();
});

test('atomic slot cast carries current aim through socket and local authority', () => {
  const socket = Object.create(GameSocket.prototype), messages=[];
  socket.send = message => messages.push(message); socket.serverNow = () => 10;
  socket.castPreparedSlot(2,{x:-1,y:0,z:0},{yaw:Math.PI/2,pitch:0});
  assert.deepEqual(messages,[{type:'castPreparedSlot',slot:2,direction:{x:-1,y:0,z:0},yaw:Math.PI/2,pitch:0,clientTime:10}]);
  let now = 10;
  const local = new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
  const link = new GameLink({remote:{on:()=>{}},local});
  link.startSolo('PRACTICE','Knight'); local.room.startMatch(now);
  local.player.ultimate='chivalry'; local.player.prowess=100; local.ultimate();
  now=10.65; local.tick();
  link.castPreparedSlot(2,{x:-1,y:0,z:0},{yaw:Math.PI/2,pitch:0});
  assert.equal(local.player.spell,'frostfire'); assert.equal(local.player.pendingSpell.spell,'frostfire');
  assert.equal(local.player.yaw,Math.PI/2); link.leaveRoom();
});

test('One Hit Practice settings reach authoritative LocalHost through the real GameLink transport',()=>{
 const local=new LocalHost({every:()=>1,cancel:()=>{},later:()=>{}});
 const commands=[];
 const remote={on:()=>{},practiceOneHit:command=>commands.push(['practice',command]),
   oneHitRelease:()=>commands.push(['release'])};
 const link=new GameLink({remote,local});
 local.loadout('fireball','one_hit_of_wonders');
 link.hosting='local';
 link.startSolo('PRACTICE','One Hit trainee');
 local.room.startMatch(local.now());
 assert.equal(local.player.ultimate,'one_hit_of_wonders');
 link.practiceOneHit({action:'level',element:'gale',tier:2});
 assert.equal(local.player.practiceOneHit?.stages?.gale,2,
   'the actual game link reaches LocalHost instead of silently omitting the method');
 link.practiceOneHit({action:'preset',preset:'full'});
 assert.equal(local.player.practiceOneHit.stages.lightning,2);
 link.practiceOneHit({action:'enabled',enabled:false});
 assert.equal(local.player.practiceOneHit.enabled,false);
 link.hosting='remote';
 link.practiceOneHit({action:'level',element:'fire',tier:1});
 link.oneHitRelease();
 assert.deepEqual(commands,[['practice',{action:'level',element:'fire',tier:1}],['release']],
   'the same forwarded methods work with online authoritative rooms');
 const wire=Object.create(GameSocket.prototype),sent=[];
 wire.send=message=>sent.push(message);
 wire.practiceOneHit({action:'level',element:'frost',tier:2});
 wire.oneHitRelease();
 assert.deepEqual(sent,[{type:'practiceOneHit',action:'level',element:'frost',tier:2},
   {type:'oneHitRelease'}]);
 local.close();
});

test('Disaster release packet preserves valid final camera aim on both transports',()=>{
  const wire=Object.create(GameSocket.prototype),out=[];
  wire.send=message=>out.push(message);
  wire.oneHitRelease({yaw:Math.PI,pitch:-.9});
  wire.oneHitRelease({cancel:true,yaw:NaN,pitch:Infinity});
  assert.deepEqual(out,[
    {type:'oneHitRelease',yaw:Math.PI,pitch:-.9},
    {type:'oneHitRelease',cancel:true},
  ]);
  const local=new LocalHost({every:()=>1,cancel:()=>{},later:()=>{}});
  const captured=[];
  // The transport contract is the same whether GameLink currently chooses
  // its remote or the browser's local authoritative host.
  const remote={on:()=>{},oneHitRelease:packet=>captured.push(packet)};
  const link=new GameLink({remote,local});
  link.oneHitRelease({yaw:2.4,pitch:.8});
  assert.deepEqual(captured,[{yaw:2.4,pitch:.8}]);
  local.close();
});
