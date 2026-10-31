import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLink, linkStatusView } from './GameLink.mjs';
import { GameSocket } from './GameSocket.mjs';
import { LocalHost } from './LocalHost.mjs';
import { createGameServer } from '../../server/src/server.mjs';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, val) => store.set(String(key), String(val)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
}
if (!globalThis.localStorage) {
  globalThis.localStorage = createMemoryStorage();
}

function fakeRemote({ answers = true } = {}) {
  const handlers = new Map();
  const remote = {
    calls: [],
    answers,
    pending: null,
    ws: null,
    token: null,
    roomCode: null,
    profileReady: true,
    playerId: 'remote-player',
    on: (type, handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    emit: (type, payload) => {
      for (const handler of handlers.get(type) ?? []) handler(payload);
      for (const handler of handlers.get('*') ?? []) handler({ type, payload });
    },
    connect({ resume = true, timeoutMs = 0 } = {}) {
      remote.calls.push(['connect', { resume, timeoutMs }]);
      if (remote.answers === 'hang') {
        return new Promise((resolve, reject) => { remote.pending = { resolve, reject }; });
      }
      return remote.answers ? Promise.resolve() : Promise.reject(new Error('connection failed'));
    },
    serverNow: () => 10,
    close: ({ clearSession = false } = {}) => {
      remote.calls.push(['close', { clearSession }]);
      if (clearSession) {
        remote.roomCode = null;
        remote.token = null;
      }
    },
    leaveRoom: () => {
      remote.calls.push(['leaveRoom']);
      remote.roomCode = null;
    },
  };
  for (const method of ['startSolo', 'seekDuel', 'cancelSeek', 'loadout', 'input', 'quickPlay',
    'createRoom', 'createSharedPracticeRoom', 'createBreakthroughRoom', 'joinRoom', 'listRooms', 'createPublicRoom']) {
    remote[method] = (...args) => remote.calls.push([method, ...args]);
  }
  return remote;
}

function fakeTimers() {
  const timers = [];
  let nextId = 1;
  return {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (id) => {
      const index = timers.findIndex(t => t.id === id);
      if (index !== -1) timers[index].fn = null;
    },
    activeCount: () => timers.filter(t => t.fn !== null).length,
    run: async (ms) => {
      for (const timer of timers.splice(0)) {
        if (timer.fn && timer.ms <= ms) await timer.fn();
        else if (timer.fn) timers.push(timer);
      }
    },
  };
}

test('Scenario 1: Open main menu: zero remote connection attempts', () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} });
  const link = new GameLink({ remote, local });

  assert.equal(link.status, 'dormant');
  assert.equal(linkStatusView(link.status).tone, 'dormant');
  assert.equal(linkStatusView(link.status).title, '');
  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 0);
});

test('Scenario 2: Enter Solo Practice: zero remote connection attempts', () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local });

  link.startSolo('PRACTICE', 'Aden', 'castleward');
  assert.equal(link.playingLocally, true);
  assert.equal(link.status, 'dormant');
  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 0);
});

test('Scenario 3: Play Bot Duel and Inspection: zero remote connection attempts', () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local });

  link.startSolo('BOT_DUEL', 'Aden', 'castleward', 'KNIGHT');
  assert.equal(link.playingLocally, true);
  assert.equal(link.status, 'dormant');
  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 0);

  link.startInspectionPractice('Aden', 'castleward');
  assert.equal(link.playingLocally, true);
  assert.equal(link.status, 'dormant');
  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 0);
});

test('Scenario 4: Remain in local gameplay for several minutes: zero background retries or heartbeats', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });

  link.startSolo('PRACTICE', 'Aden');
  assert.equal(link.playingLocally, true);

  // Advance simulated clock for 10 minutes (600,000 ms)
  await timers.run(600000);

  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 0);
  assert.equal(remote.calls.filter(c => c[0] === 'ping').length, 0);
  assert.equal(link.status, 'dormant');
});

test('Scenario 5: Click Quick Play: exactly one connection and intended action', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });

  assert.equal(link.status, 'dormant');
  await link.quickPlay('Aden');

  assert.equal(link.status, 'online');
  const connects = remote.calls.filter(c => c[0] === 'connect');
  const quickPlays = remote.calls.filter(c => c[0] === 'quickPlay');
  assert.equal(connects.length, 1);
  assert.equal(quickPlays.length, 1);
  assert.equal(quickPlays[0][1], 'Aden');
});

test('Scenario 6: Host Shared Practice alone: valid online room with invitation code', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const { port } = server.address();

  try {
    const socket = new GameSocket();
    const origUrl = globalThis.location;
    globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` };

    const joinedPromise = new Promise((resolve) => socket.on('joined', resolve));
    await socket.connect({ resume: false });
    socket.createSharedPracticeRoom('HostHero', 'castleward');

    const joined = await joinedPromise;
    assert.equal(joined.mode, 'PRACTICE');
    assert.equal(joined.sharedPractice, true);
    assert.match(joined.roomCode, /^[A-Z2-9]{5}$/);
    assert.equal(socket.roomCode, joined.roomCode);

    globalThis.location = origUrl;
    socket.close({ clearSession: true });
  } finally {
    await server.stop();
  }
});

test('Scenario 7: Second browser joins: synchronized server-authoritative room', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const { port } = server.address();

  try {
    const origUrl = globalThis.location;
    globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` };

    const host = new GameSocket();
    const guest = new GameSocket();

    const hostJoined = new Promise((resolve) => host.on('joined', resolve));
    await host.connect({ resume: false });
    host.createSharedPracticeRoom('HostHero', 'castleward');
    const { roomCode } = await hostJoined;

    const guestJoined = new Promise((resolve) => guest.on('joined', resolve));
    await guest.connect({ resume: false });
    guest.joinRoom(roomCode, 'GuestHero');
    await guestJoined;

    // Wait for snapshot containing both players
    const snapshotPromise = new Promise((resolve) => {
      host.on('snapshot', (s) => {
        const humans = s.players.filter(p => p.actorKind === 'human');
        if (humans.length >= 2) resolve(s);
      });
    });
    server.tick();
    const snapshot = await snapshotPromise;
    assert.equal(snapshot.sharedPractice, true);
    assert.equal(snapshot.roomCode, roomCode);
    const names = snapshot.players.filter(p => p.actorKind === 'human').map(p => p.name);
    assert.ok(names.includes('HostHero'));
    assert.ok(names.includes('GuestHero'));

    globalThis.location = origUrl;
    host.close({ clearSession: true });
    guest.close({ clearSession: true });
  } finally {
    await server.stop();
  }
});

test('Scenario 8: Second player disconnects: host retains control', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const { port } = server.address();

  try {
    const origUrl = globalThis.location;
    globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` };

    const host = new GameSocket();
    const guest = new GameSocket();

    const hostJoined = new Promise((resolve) => host.on('joined', resolve));
    await host.connect({ resume: false });
    host.createSharedPracticeRoom('HostHero', 'castleward');
    const { roomCode, playerId: hostId } = await hostJoined;

    const guestJoined = new Promise((resolve) => guest.on('joined', resolve));
    await guest.connect({ resume: false });
    guest.joinRoom(roomCode, 'GuestHero');
    await guestJoined;

    // Disconnect guest
    guest.leaveRoom();
    guest.close({ clearSession: true });

    // Wait for server to receive and process leave
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.tick();

    // Verify host remains in control
    const room = server.roomManager.findByCode(roomCode);
    assert.ok(room);
    assert.equal(room.sharedPracticeHostId, hostId);
    assert.equal(room.humanActorCount(), 1);

    globalThis.location = origUrl;
    host.close({ clearSession: true });
  } finally {
    await server.stop();
  }
});

test('Scenario 9: Host returns to Solo: network connection closes and does not reopen', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });

  await link.createSharedPracticeRoom('HostHero', 'castleward');
  assert.equal(link.status, 'online');
  remote.roomCode = 'ABC23';

  // Host returns to solo
  link.startSolo('PRACTICE', 'HostHero');
  assert.equal(link.playingLocally, true);
  assert.equal(link.status, 'dormant');
  assert.equal(remote.calls.filter(c => c[0] === 'close').length, 1);

  // Time passes in solo play
  await timers.run(300000);
  assert.equal(remote.calls.filter(c => c[0] === 'connect').length, 1, 'no extra connection was made');
});

test('Scenario 10: Lose network during a real multiplayer match: normal recovery remains available', async () => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' });
  await server.start();
  const { port } = server.address();

  try {
    const origUrl = globalThis.location;
    globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` };

    const socket = new GameSocket();
    const joined = new Promise((resolve) => socket.on('joined', resolve));
    await socket.connect({ resume: false });
    socket.createSharedPracticeRoom('Hero', 'castleward');
    await joined;

    assert.ok(socket.roomCode);
    assert.ok(socket.token);

    // Simulate unexpected network loss by closing the underlying WebSocket directly
    // without calling socket.close() (so intentionalClose remains false)
    const disconnected = new Promise((resolve) => socket.on('connection', (e) => {
      if (!e.connected) resolve();
    }));
    socket.ws.close();
    await disconnected;

    // Verify that reconnectTimer is scheduled because socket was in an active match
    assert.ok(socket.reconnectTimer !== null);

    // Clean up
    socket.close({ clearSession: true });
    globalThis.location = origUrl;
  } finally {
    await server.stop();
  }
});

test('Scenario 11: Change Armory loadout offline, then join multiplayer: correct loadout synchronizes', async () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local });

  // Change loadout while offline/dormant
  link.loadout('gale', 'vortex', ['gale', 'steel', 'frostfire'], { biBye: 'cold' });
  assert.equal(local.spell, 'gale');
  assert.equal(local.ultimateId, 'vortex');

  // Then join multiplayer
  await link.quickPlay('Hero');
  assert.equal(link.status, 'online');

  const loadoutCalls = remote.calls.filter(c => c[0] === 'loadout');
  assert.ok(loadoutCalls.length >= 1);
  const lastLoadout = loadoutCalls.at(-1);
  assert.equal(lastLoadout[1], 'gale');
  assert.equal(lastLoadout[2], 'vortex');
  assert.deepEqual(lastLoadout[3], ['gale', 'steel', 'frostfire']);
});

test('Scenario 12: Open an invitation link: the room code and joining flow remain correct', async () => {
  const remote = fakeRemote();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local });

  const rawInvite = 'abc-23!';
  const normalized = rawInvite.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
  assert.equal(normalized, 'ABC23');

  // Joining with the code connects on demand and joins room
  await link.joinRoom(normalized, 'GuestHero');
  assert.equal(link.status, 'online');

  const joinCalls = remote.calls.filter(c => c[0] === 'joinRoom');
  assert.equal(joinCalls.length, 1);
  assert.equal(joinCalls[0][1], 'ABC23');
  assert.equal(joinCalls[0][2], 'GuestHero');
});

test('Scenario 13: Cancel connection during Render cold start: no delayed room creation', async () => {
  const remote = fakeRemote({ answers: 'hang' });
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });

  // Click Quick Play while server is cold
  const quickPromise = link.quickPlay('Aden');
  assert.equal(link.status, 'connecting');

  // User decides to cancel by entering solo practice instead
  link.startSolo('PRACTICE', 'Aden');
  assert.equal(link.playingLocally, true);
  assert.equal(link.status, 'dormant');

  // Server eventually wakes up later
  remote.pending.resolve();
  await quickPromise;

  // Verify that quickPlay was cancelled and never dispatched
  const quickPlays = remote.calls.filter(c => c[0] === 'quickPlay');
  assert.equal(quickPlays.length, 0);
});

test('Scenario 14: Repeat online actions rapidly: no duplicate WebSockets or room commands', async () => {
  const remote = fakeRemote();
  const timers = fakeTimers();
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: (fn) => fn() });
  const link = new GameLink({ remote, local, timers });

  // Rapidly click Quick Play 4 times
  const p1 = link.quickPlay('Aden');
  const p2 = link.quickPlay('Aden');
  const p3 = link.quickPlay('Aden');
  const p4 = link.quickPlay('Aden');

  await Promise.all([p1, p2, p3, p4]);

  const connects = remote.calls.filter(c => c[0] === 'connect');
  const quickPlays = remote.calls.filter(c => c[0] === 'quickPlay');

  assert.equal(connects.length, 1, 'exactly one connection was attempted');
  assert.equal(quickPlays.length, 1, 'exactly one room command was sent');
});
