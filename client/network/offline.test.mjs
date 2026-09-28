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

test('with the server there, everything goes to it, and every connection carries the Armory\'s spell', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const link = new GameLink({ remote, local: new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} }), timers });
  const heard = [];
  link.on('connection', (payload) => heard.push(payload));
  assert.equal(await link.connect(), true);
  assert.equal(link.status, 'online');
  assert.deepEqual(heard, [{ connected: true }]);
  link.startSolo('PRACTICE', 'Aden');
  assert.deepEqual(remote.calls.at(-1), ['startSolo', 'PRACTICE', 'Aden']);
  assert.equal(link.playingLocally, false);
  assert.equal(link.playerId, 'remote-player');
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
  assert.deepEqual(remote.calls.at(-1), ['startSolo', 'BOT_DUEL', 'Aden']);
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
