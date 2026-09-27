import test from 'node:test';
import assert from 'node:assert/strict';
import { lobbyStateText, lobbyView, modeLabel, worldLabel } from './lobbyView.mjs';
import { seekView } from './seekView.mjs';

const human = (id, extra = {}) => ({ id, name: id.toUpperCase(), actorKind: 'human', connected: true, ...extra });

test('a free-for-all lobby has no host gate: it waits for a second Spellblade, then counts toward its own start', () => {
  const alone = { mode: 'FFA', roomState: 'WAITING', players: [human('a')] };
  assert.equal(lobbyStateText(alone, 0), 'WAITING FOR ANOTHER SPELLBLADE');
  const two = { mode: 'FFA', roomState: 'WAITING', autoStartAt: 18, players: [human('a'), human('b')] };
  assert.equal(lobbyStateText(two, 10.2), 'BEGINS IN 0:08 · OR WHEN ALL ARE READY');
  assert.doesNotMatch(lobbyStateText(two, 10), /HOST/);
});

test('each Spellblade marks themselves ready; the button says where they stand', () => {
  const message = { mode: 'FFA', roomState: 'WAITING', isPrivate: true, players: [human('a', { lobbyReady: true }), human('b')] };
  const view = lobbyView(message, { localId: 'a' });
  assert.equal(view.ready.visible, true);
  assert.equal(view.ready.pressed, true);
  assert.deepEqual(view.players.map((p) => p.status), ['READY', 'NOT READY']);
  assert.equal(view.players[0].you, true);
  assert.equal(view.action.label, 'COPY INVITE LINK');
  const publicView = lobbyView({ ...message, isPrivate: false }, { localId: 'b' });
  assert.equal(publicView.action.visible, false, 'public rooms need no invite link');
  assert.equal(publicView.ready.pressed, false);
});

test('votes show counts, the choice that would apply and my own pick', () => {
  const message = {
    mode: 'FFA', roomState: 'WAITING', players: [human('a'), human('b')],
    votes: { world: { counts: { castleward: 1, 'shattered-keep': 1 }, chosen: 'castleward' }, score: { counts: { 5: 2, 10: 0, 15: 0 }, chosen: 5 } },
  };
  const view = lobbyView(message, { localId: 'a', myVotes: { world: 'shattered-keep', score: 5 } });
  const [world, score] = view.votes;
  assert.equal(world.label, 'ARENA');
  assert.deepEqual(world.options.map((o) => [o.label, o.count, o.chosen, o.mine]), [['Castleward', 1, true, false], ['The Shattered Keep', 1, false, true]]);
  assert.deepEqual(score.options.map((o) => [o.value, o.chosen]), [[5, true], [10, false], [15, false]]);
  assert.deepEqual(lobbyView({ ...message, roomState: 'PLAYING' }).votes, [], 'no voting mid-match');
});

test('duels and bot duels keep their own wording and actions', () => {
  const duel = lobbyView({ mode: 'DUEL', roomState: 'COUNTDOWN', players: [human('a'), human('b')] }, { localId: 'a' });
  assert.equal(duel.state, 'A WORTHY CHALLENGER APPROACHES');
  assert.equal(duel.ready.visible, false);
  assert.equal(duel.mode, 'DUEL');
  const bot = lobbyView({ mode: 'BOT_DUEL', roomState: 'WAITING', players: [human('a'), { id: 'bot', name: 'Rival', actorKind: 'bot', connected: false }] }, { localId: 'a' });
  assert.deepEqual([bot.action.label, bot.action.primary], ['START BOT DUEL', true]);
  assert.equal(bot.players[1].status, 'BOT');
  assert.equal(modeLabel('PRACTICE'), 'PRACTICE YARD');
  assert.equal(worldLabel('shattered-keep'), 'THE SHATTERED KEEP');
});

test('the seeking banner counts the wait, the other seekers and offers a bot once the server does', () => {
  assert.equal(seekView(null, 0).visible, false);
  assert.equal(seekView({ active: false }, 0).visible, false);
  const view = seekView({ active: true, since: 100, others: 0, botOffer: false }, 114.6);
  assert.equal(view.title, 'SEEKING A WORTHY CHALLENGER · 0:14');
  assert.equal(view.detail, 'No one else is seeking yet');
  assert.equal(view.offerBot, false);
  assert.equal(seekView({ active: true, since: 0, others: 2, botOffer: true }, 31).detail, '2 others seeking');
  assert.equal(seekView({ active: true, since: 0, others: 1, botOffer: true }, 31).offerBot, true);
  assert.equal(seekView({ active: true, since: 0, others: 1, botOffer: true }, 31, 'BOT_DUEL').offerBot, false, 'not while already fighting the bot');
});

test('open rooms read as where they are, how full, and what is happening', async () => {
  const { roomRows } = await import('./lobbyView.mjs');
  const rows = roomRows([
    { code: 'ABCD2', worldId: 'castleward', state: 'WAITING', players: 1, capacity: 8, scoreToWin: 10 },
    { code: 'EFGH3', worldId: 'shattered-keep', state: 'PLAYING', players: 5, capacity: 8, scoreToWin: 15, secondsLeft: 192 },
  ]);
  assert.deepEqual(rows.map((row) => [row.world, row.players, row.status]), [
    ['Castleward', '1/8', 'GATHERING'],
    ['The Shattered Keep', '5/8', 'FIGHTING · 3:12 LEFT'],
  ]);
});
