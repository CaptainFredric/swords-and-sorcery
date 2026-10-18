// What the lobby banner shows for a room: the state line, who is in it, the Ready button, the invite or bot-duel
// action and the arena/score votes. Pure (lobby message in, view data out) so every rule can be tested.

export const WORLD_NAMES = Object.freeze({
  castleward: 'Castleward',
  'ruined-keep': 'The Ruined Keep',
  'shattered-keep': 'The Shattered Keep',
  'bastion-breach': 'Bastion Breach',
  'blackbell-foundry': 'Blackbell Foundry',
});


export function worldLabel(worldId) {
  return (WORLD_NAMES[worldId] ?? String(worldId || 'Unknown')).toUpperCase();
}

export function modeLabel(mode) {
  if (mode === 'BOT_DUEL') return 'BOT DUEL';
  if (mode === 'PRACTICE') return 'PRACTICE YARD';
  if (mode === 'DUEL') return 'DUEL';
  if (mode === 'BREAKTHROUGH') return 'BREAKTHROUGH · 3V3';
  return 'FREE-FOR-ALL';
}

function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function connectedHumans(message) {
  return (message.players ?? []).filter((p) => p.actorKind === 'human' && p.connected);
}

export function lobbyStateText(message, serverNow = 0) {
  if (message.mode === 'BREAKTHROUGH') {
    if (message.roomState === 'COUNTDOWN') return 'SIEGE STARTING…';
    if (message.roomState === 'REMATCH_COUNTDOWN') return 'NEXT ROUND STARTING…';
    return 'RALLYING SPELLBLADES · 3V3';
  }
  if (message.mode === 'BOT_DUEL') {
    if (message.roomState === 'COUNTDOWN') return 'BOT DUEL STARTING…';
    if (message.roomState === 'WAITING') return 'ENTER THE ARENA WHEN READY';
    return 'PREPARING BOT DUEL…';
  }
  if (message.mode === 'DUEL') {
    if (message.roomState === 'COUNTDOWN') return 'A WORTHY CHALLENGER APPROACHES';
    if (message.roomState === 'REMATCH_COUNTDOWN') return 'THE REMATCH BEGINS…';
    return 'WAITING FOR YOUR CHALLENGER';
  }
  if (message.roomState === 'REMATCH_COUNTDOWN') return 'REMATCH STARTING…';
  if (message.roomState === 'COUNTDOWN') return 'MATCH STARTING…';
  const humans = connectedHumans(message);
  if (humans.length < 2) return 'WAITING FOR ANOTHER SPELLBLADE';
  if (Number.isFinite(message.autoStartAt)) {
    return `BEGINS IN ${clock(message.autoStartAt - serverNow)} · OR WHEN ALL ARE READY`;
  }
  return 'WAITING FOR EVERYONE TO BE READY';
}

function playerStatus(message, player) {
  if (message.mode === 'BREAKTHROUGH') {
    const side = player.team === 'DEFENDERS' ? 'DEFENDERS' : 'ATTACKERS';
    if (player.actorKind === 'bot') return `${side} · BOT`;
    if (!player.connected) return `${side} · RECONNECTING`;
    return player.lobbyReady ? `${side} · READY` : side;
  }
  if (player.actorKind === 'bot') return 'BOT';
  if (player.actorKind === 'dummy') return 'TRAINING DUMMY';
  if (!player.connected) return 'RECONNECTING';
  if (message.mode === 'BOT_DUEL') return player.arenaReady ? 'READY' : 'FOCUS ARENA';
  if (message.mode === 'FFA') return player.lobbyReady ? 'READY' : 'NOT READY';
  return 'IN THE ROOM';
}

/**
 * @param {object} message   a lobby (or snapshot) message
 * @param {{localId?:string, serverNow?:number, myVotes?:object}} context
 */
export function lobbyView(message, { localId = null, serverNow = 0, myVotes = {} } = {}) {
  const ffa = message.mode === 'FFA';
  const botDuel = message.mode === 'BOT_DUEL';
  const breakthrough = message.mode === 'BREAKTHROUGH';
  const waiting = message.roomState === 'WAITING';
  const me = (message.players ?? []).find((p) => p.id === localId);
  const players = (message.players ?? []).map((player) => ({
    name: player.name,
    ...(breakthrough ? { team: player.team ?? null } : {}),
    rune: player.actorKind === 'bot' || player.actorKind === 'dummy' ? '◇' : '◆',
    status: playerStatus(message, player),
    ready: Boolean(player.lobbyReady || (botDuel && player.arenaReady) || (breakthrough && player.actorKind === 'bot')),
    you: player.id === localId,
  }));

  const ready = {
    visible: ffa || (breakthrough && waiting),
    pressed: Boolean(me?.lobbyReady),
    label: breakthrough
      ? (me?.lobbyReady ? 'READY · WAITING FOR ALLIES' : 'START SIEGE · READY')
      : (me?.lobbyReady ? 'READY · WAITING FOR OTHERS' : 'I AM READY'),
    disabled: !waiting,
  };

  let action = { visible: false, label: '', primary: false, disabled: false };
  if ((ffa || breakthrough) && message.isPrivate !== false) action = { visible: true, label: 'COPY INVITE LINK', primary: false, disabled: false };
  if (botDuel) {
    const counting = message.roomState === 'COUNTDOWN';
    action = { visible: true, label: counting ? 'ARENA FOCUSED' : 'START BOT DUEL', primary: true, disabled: counting };
  }

  const votes = ffa && message.votes && waiting
    ? [
      {
        key: 'world',
        label: 'ARENA',
        options: Object.entries(message.votes.world?.counts ?? {}).map(([value, count]) => ({
          value, label: WORLD_NAMES[value] ?? value, count, chosen: message.votes.world.chosen === value, mine: myVotes.world === value,
        })),
      },
      {
        key: 'score',
        label: 'FIRST TO',
        options: Object.entries(message.votes.score?.counts ?? {}).map(([value, count]) => ({
          value: Number(value), label: value, count, chosen: Number(message.votes.score.chosen) === Number(value), mine: Number(myVotes.score) === Number(value),
        })),
      },
    ]
    : [];

  let footer = 'Solo session.';
  if (ffa) footer = message.isPrivate === false
    ? 'A public room: anyone can walk in, even mid-match.'
    : 'Share the room code. The match starts when everyone is ready.';
  if (botDuel) footer = 'Press Start Bot Duel when ready. A short countdown follows.';
  if (breakthrough) {
    const mySide = me?.team === 'DEFENDERS' ? 'Defenders (Hold the Outer Gate)' : 'Attackers (Capture the Outer Gate)';
    footer = `Your side: ${mySide}. Empty 3v3 slots are filled by bots; friends joining by code replace bots.`;
  }
  if (message.mode === 'DUEL') footer = 'A matchmade duel. First to five.';

  return {
    world: worldLabel(message.worldId),
    mode: modeLabel(message.mode),
    state: lobbyStateText(message, serverNow),
    players,
    ready,
    action,
    votes,
    footer,
  };
}

/** Rows for the open rooms list. */
export function roomRows(rooms = []) {
  return rooms.map((room) => {
    let status = 'GATHERING';
    if (room.state === 'COUNTDOWN' || room.state === 'REMATCH_COUNTDOWN') status = 'STARTING';
    if (room.state === 'PLAYING') status = Number.isFinite(room.secondsLeft) ? `FIGHTING · ${clock(room.secondsLeft)} LEFT` : 'FIGHTING';
    return {
      code: room.code,
      world: WORLD_NAMES[room.worldId] ?? room.worldId,
      players: `${room.players}/${room.capacity ?? 8}`,
      status,
      scoreToWin: room.scoreToWin,
    };
  });
}
