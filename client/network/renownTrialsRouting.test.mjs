import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLink } from './GameLink.mjs';

function host(available) {
  const handlers = new Map();
  const calls = [];
  const remote = {
    calls, ws:null, roomCode:null,
    on(type,callback) { handlers.set(type,callback); },
    connect() {
      calls.push(['connect']);
      return available ? Promise.resolve() : Promise.reject(new Error('offline'));
    },
    close(options) { calls.push(['close',options]); },
    leaveRoom() { calls.push(['leaveRoom']); },
    startSolo(...args) { calls.push(['startSolo', ...args]); },
  };
  const local = {
    calls: [],
    on() {},
    leaveRoom() { this.calls.push(['leaveRoom']); },
    startSolo(...args) { this.calls.push(['startSolo', ...args]); },
  };
  const timers = { setTimeout() { return 1; }, clearTimeout() {} };
  return { link: new GameLink({remote,local,timers}), remote, local };
}
test('permanent Renown Trials route to a server, not a client-authoritative wallet', async () => {
  const {link,remote,local} = host(true);
  await link.startSolo('RENOWN_TRIALS','Knight','castleward','champion');
  assert.equal(link.playingLocally, false);
  assert.equal(remote.calls.filter(x => x[0]==='startSolo').length, 1);
  assert.equal(remote.calls.find(x=>x[0]==='startSolo')[1],'RENOWN_TRIALS');
  assert.equal(local.calls.length, 0);
});
test('offline Renown Trials run remains playable but cannot grant account Renown', async () => {
  const {link,remote,local} = host(false);
  const notices=[];
  link.on('notice', message=>notices.push(message.text));
  await link.startSolo('RENOWN_TRIALS','Knight','ruined-keep');
  assert.equal(link.playingLocally,true);
  assert.equal(remote.calls.some(x=>x[0]==='startSolo'),false);
  assert.deepEqual(local.calls[0].slice(0,4), ['startSolo','RENOWN_TRIALS','Knight','ruined-keep']);
  assert.equal(local.calls[0][5],false);
  assert.match(notices.join(' '),/unavailable/);
});
test('other Solo modes continue launching locally without waking multiplayer', () => {
  const {link,remote,local}=host(true);
  link.startSolo('PRACTICE','Knight','castleward');
  assert.equal(link.playingLocally,true);
  assert.equal(remote.calls.some(x=>x[0]==='connect'),false);
  assert.equal(local.calls[0][1],'PRACTICE');
});
