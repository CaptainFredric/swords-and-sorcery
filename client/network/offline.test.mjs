import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost, OFFLINE_MESSAGE } from './LocalHost.mjs';
import { GameLink, linkStatusView } from './GameLink.mjs';

// a local host on a hand-turned clock: nothing happens until the test says so
function handHost() {
  let clock = 100;
  const queue = [];
  const host = new LocalHost({ now: () => clock, every: () => 1, cancel: () => {}, later: (fn) => queue.push(fn) });
  const heard = [];
  host.on('*', ({ type, payload }) => heard.push({ type, payload }));
  const flush = () => { while (queue.length) queue.shift()(); };
  const advance = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 30) { clock += 1 / 30; host.tick(); }
    flush();
  };
  return { host, heard, flush, advance, time: () => clock };
}

test('the browser hosts a Practice Yard on its own: joined, a lobby, then the match in snapshots', () => {
  const { host, heard, flush, advance } = handHost();
  host.startSolo('PRACTICE', 'Aden');
  assert.equal(heard.length, 0, 'nothing arrives at once: messages come as if over the wire');
  flush();
  const joined = heard.find((message) => message.type === 'joined');
  assert.ok(joined && joined.payload.mode === 'PRACTICE' && joined.payload.local === true);
  assert.equal(host.playerId, joined.payload.playerId);
  assert.ok(heard.some((message) => message.type === 'lobby'));
  host.arenaReady(true);
  advance(1);
  const snapshot = host.latestSnapshot;
  assert.equal(snapshot.type, 'snapshot');
  assert.equal(snapshot.roomState, 'PLAYING');
  assert.ok(snapshot.players.some((player) => player.id === host.playerId));
  assert.ok(Math.abs(host.serverNow() - snapshot.serverTime) < 0.05);
});

test('it plays: moving, swinging and the yard\'s controls go through the same rules as on the server', () => {
  const { host, heard, flush, advance } = handHost();
  host.startSolo('PRACTICE', 'Aden');
  flush();
  host.arenaReady(true);
  advance(0.5);
  const me = () => host.latestSnapshot.players.find((player) => player.id === host.playerId);
  const start = { ...me().position };
  host.input({ seq: 1, forward: 1, right: 0, jump: false, sprint: false, yaw: 0, pitch: 0 });
  advance(1);
  assert.ok(Math.hypot(me().position.x - start.x, me().position.z - start.z) > 2, 'it walked');
  host.attack(true);
  advance(0.5);
  host.attack(false);
  assert.ok(heard.some((message) => message.type === 'events' && message.payload.events.some((event) => event.type === 'swordSwing')), 'it swung');
  const before = host.latestSnapshot.players.filter((player) => player.actorKind === 'dummy').length;
  host.practiceSpawnDummy('GUARDING');
  advance(0.2);
  assert.equal(host.latestSnapshot.players.filter((player) => player.actorKind === 'dummy').length, before + 1, 'a dummy stepped in');
  // what the client receives is its own copy: changing it changes nothing in the match
  host.latestSnapshot.players[0].position.x = 999;
  advance(0.1);
  assert.notEqual(host.latestSnapshot.players[0].position.x, 999);
});

test('every command the controls send reaches whichever host is playing: the server or the browser', async () => {
  // what the controls send (InputController calls these on the link in play)
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../game/InputController.mjs', import.meta.url), 'utf8');
  const sent = [...new Set([...source.matchAll(/this\.socket\.(\w+)\(/g)].map((match) => match[1]))];
  assert.ok(sent.includes('cast') && sent.includes('dash'), `found the controls' commands: ${sent.join(', ')}`);
  // (Sheathe in Steel is no key of its own: it is carried in the spell's place and called on the spell's key)
  assert.ok(!sent.includes('steel'));
  const { GameSocket } = await import('./GameSocket.mjs');
  const link = new GameLink({ remote: fakeRemote(), local: new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} }) });
  for (const command of sent) {
    assert.equal(typeof link[command], 'function', `the link passes on ${command}`);
    assert.equal(typeof GameSocket.prototype[command], 'function', `the server connection sends ${command}`);
    assert.equal(typeof LocalHost.prototype[command], 'function', `the browser host answers ${command}`);
  }
});

test('Sheathe in Steel, carried from the Armory, works in a match the browser hosts', () => {
  const { host, advance } = handHost();
  host.loadout('steel');
  host.startSolo('PRACTICE', 'Aden');
  host.arenaReady(true);
  advance(0.5);
  host.cast({ x: 0, y: 0, z: -1 });
  advance(0.2);
  const me = host.latestSnapshot.players.find((player) => player.id === host.playerId);
  assert.equal(me.spell, 'steel');
  assert.ok(me.steel && me.steel.fullUntil > host.serverNow(), 'sheathed');
  assert.ok(me.spellReadyAt > host.serverNow(), 'and it waits to be called again');
});

test('a Bot Duel comes with its bot; online play is refused with a plain word; leaving ends the match', () => {
  const { host, heard, flush, advance } = handHost();
  host.startSolo('BOT_DUEL', 'Aden');
  flush();
  host.arenaReady(true);
  advance(4);
  assert.ok(host.latestSnapshot.players.some((player) => player.actorKind === 'bot'));
  host.seekDuel('Aden');
  host.joinRoom('ABCDE', 'Aden');
  flush();
  assert.equal(heard.filter((message) => message.type === 'error' && message.payload.message === OFFLINE_MESSAGE).length, 2);
  host.leaveRoom();
  flush();
  assert.ok(heard.some((message) => message.type === 'left'));
  assert.equal(host.room, null);
  const count = heard.length;
  host.tick();
  flush();
  assert.equal(heard.length, count, 'no match, no snapshots');
});

// a stand-in for the game server's socket
function fakeRemote({ answers = true } = {}) {
  const handlers = new Set();
  const remote = {
    calls: [],
    answers,
    pending: null,
    on: (type, handler) => { handlers.add(handler); return () => handlers.delete(handler); },
    emit: (type, payload) => { for (const handler of handlers) handler({ type, payload }); },
    connect() {
      remote.calls.push('connect');
      if (remote.answers === 'hang') return new Promise((resolve, reject) => { remote.pending = { resolve, reject }; });
      return remote.answers ? Promise.resolve() : Promise.reject(new Error('down'));
    },
    serverNow: () => 7,
    playerId: 'remote-player',
  };
  for (const method of ['startSolo', 'seekDuel', 'leaveRoom', 'loadout', 'input', 'quickPlay', 'close']) remote[method] = (...args) => remote.calls.push([method, ...args]);
  return remote;
}

function fakeTimers() {
  const timers = [];
  return {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    run: async (ms) => { for (const timer of timers.splice(0)) if (timer.fn && timer.ms <= ms) await timer.fn(); else if (timer.fn) timers.push(timer); },
  };
}

test('online solo stays local, carries the chosen arena and returns to the server for multiplayer', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });
  const heard = [];
  link.on('connection', (payload) => heard.push(payload));
  assert.equal(await link.connect(), true);
  assert.equal(link.status, 'online');
  assert.deepEqual(heard, [{ connected: true }]);
  link.loadout('frostfire', 'chivalry', ['frostfire', 'gale', 'steel']);
  link.startSolo('PRACTICE', 'Aden', 'ruined-keep');
  assert.equal(link.playingLocally, true);
  assert.equal(local.room.worldId, 'ruined-keep');
  assert.equal(local.player.spell, 'frostfire');
  assert.equal(local.player.ultimate, 'chivalry');
  assert.deepEqual(local.player.preparedSpells, ['frostfire', 'gale', 'steel']);
  assert.equal(remote.calls.some(c => c[0] === 'startSolo'), false);
  link.leaveRoom();
  link.seekDuel('Aden');
  assert.equal(link.playerId, 'remote-player');
  assert.equal(local.room, null);
  assert.equal(link.serverNow(), 7);
});

test('with the server gone, solo play runs in the browser, online play waits, and it is tried again until it answers', async () => {
  const remote = fakeRemote({ answers: false });
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });
  const statuses = [];
  const joined = [];
  const notices = [];
  link.on('status', ({ status }) => statuses.push(status));
  link.on('joined', (message) => joined.push(message));
  link.on('notice', (notice) => notices.push(notice));
  assert.equal(await link.connect(), false);
  assert.equal(link.status, 'offline');
  assert.ok(!linkStatusView(link.status).online);
  link.startSolo('PRACTICE', 'Aden');
  assert.equal(link.playingLocally, true);
  assert.equal(joined.length, 1, 'the local host\'s match reaches the game');
  // the server's own chatter does not interrupt a local match
  remote.emit('snapshot', { type: 'snapshot', roomState: 'PLAYING' });
  assert.equal(link.latestSnapshot, local.latestSnapshot);
  // Seek a Duel without a server: said plainly, and a bot steps in
  link.leaveRoom();
  link.seekDuel('Aden');
  assert.equal(notices.length, 1);
  assert.equal(local.room.mode, 'BOT_DUEL');
  // the server comes back on a later try: online again, the match is left alone, the next choice goes online
  remote.answers = true;
  await timers.run(5000);
  assert.equal(link.status, 'online');
  assert.deepEqual(statuses.slice(-2), ['offline', 'online']);
  assert.equal(link.playingLocally, true, 'nobody is pulled out of the match');
  link.leaveRoom();
  link.startSolo('BOT_DUEL', 'Aden');
  assert.equal(link.playingLocally, true);
  assert.equal(local.room.mode, 'BOT_DUEL');
});

test('remote reconnect, stale room messages and profile updates cannot replace a local match', async () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: fn => fn() });
  const link = new GameLink({ remote, local, timers: fakeTimers() });
  await link.connect();
  remote.emit('profile', { profile: { equipped: 'violet' } });
  link.startSolo('BOT_DUEL', 'Aden', 'castleward', 'CHAMPION');
  const room = local.room;
  const received = [];
  for (const type of ['joined','left','snapshot','events','connection','error']) link.on(type, message => received.push(message));
  remote.emit('connection', { connected: false });
  remote.emit('joined', { playerId: 'someone-else' });
  remote.emit('snapshot', { roomCode: 'OLD', roomState: 'PLAYING' });
  remote.emit('events', { events: [{ type: 'death' }] });
  remote.emit('left', {});
  remote.emit('error', { message: 'old room' });
  remote.emit('connection', { connected: true });
  assert.equal(local.room, room);
  assert.equal(link.playingLocally, true);
  assert.equal(local.player.cloth, 'violet');
  assert.equal(received.length, 0);
});

test('queued bootstrap from an abandoned solo room cannot enter a restarted match', () => {
  const { host, heard, flush } = handHost();
  host.startSolo('PRACTICE', 'Old');
  host.startSolo('BOT_DUEL', 'New');
  const currentId = host.player.id;
  flush();
  assert.equal(heard.filter(m => m.type === 'joined').length, 1);
  assert.equal(host.playerId, currentId);
  assert.equal(heard.find(m => m.type === 'joined').payload.mode, 'BOT_DUEL');
});

test('local tick delivers detached facts immediately without a queued network-style delay', () => {
  const { host, flush } = handHost();
  host.startSolo('PRACTICE', 'Aden');
  flush();
  host.arenaReady(true);
  flush();
  host.tick(); // no delivery queue flush
  assert.equal(host.latestSnapshot.tick, 1);
  const snapshot = host.latestSnapshot;
  const initial = snapshot.players[0].position.x;
  host.player.position.x += 1;
  assert.equal(snapshot.players[0].position.x, initial, 'the presentation history never aliases live simulation');
  snapshot.players[0].velocity.x = 999;
  assert.notEqual(host.player.velocity.x, 999, 'a consumer cannot edit authority');
});

test('leaving from a synchronous local event suppresses the abandoned room snapshot', () => {
  const { host, flush } = handHost();
  host.startSolo('PRACTICE', 'Aden');
  flush();
  host.arenaReady(true);
  flush();
  host.room.events.push({ type: 'testLeave' });
  host.on('events', () => host.leaveRoom());
  host.tick();
  assert.equal(host.room, null);
  assert.equal(host.latestSnapshot, null);
});

test('a server that is slow to answer is waking; one that never answers is given up on and retried', async () => {
  const remote = fakeRemote({ answers: 'hang' });
  const timers = fakeTimers();
  const link = new GameLink({ remote, local: new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} }), timers });
  const reaching = link.connect();
  assert.equal(link.status, 'connecting');
  await timers.run(2500);
  assert.equal(link.status, 'waking');
  assert.match(linkStatusView('waking').title, /Heralds ride out to rally worthy Spellblades/);
  assert.match(linkStatusView('waking').note, /multiplayer waking/);
  remote.pending.reject(new Error('gave up'));
  assert.equal(await reaching, false);
  assert.equal(link.status, 'offline');
  assert.match(linkStatusView('offline').note, /solo still works/);
  assert.match(linkStatusView('offline').detail, /browser/);
});

test('solo play in the browser is fought in the arena chosen for it (Castleward for anything else)', () => {
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  local.startSolo('BOT_DUEL', 'Aden', 'ruined-keep');
  assert.equal(local.room.worldId, 'ruined-keep');
  local.startSolo('PRACTICE', 'Aden', 'the-moon');
  assert.equal(local.room.worldId, 'castleward');
  local.startSolo('PRACTICE', 'Aden', 'shattered-keep');
  assert.equal(local.room.worldId, 'castleward', 'the old greybox is not an arena');
});

test('the ultimate carried from the Armory, and its key, both work in a match the browser hosts', () => {
  for (const ultimate of ['vortex', 'sunder']) {
    const { host, flush, advance } = handHost();
    // (the Armory's choice arrives before the match, as it does when the game starts)
    host.loadout('fireball', ultimate);
    host.startSolo('PRACTICE', 'Aden');
    flush();
    host.arenaReady(true);
    advance(0.5);
    const me = () => host.latestSnapshot.players.find((player) => player.id === host.playerId);
    assert.equal(me().ultimate, ultimate, 'the one chosen');
    host.practiceReadyUltimate();
    advance(0.1);
    assert.equal(typeof host.ultimate, 'function', 'the key is still a command after the loadout is set');
    host.ultimate();
    advance(0.2);
    assert.equal(me().ultimateState?.id, ultimate, 'it begins');
  }
});
