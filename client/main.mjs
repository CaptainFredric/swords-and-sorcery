import { GameSocket } from './network/GameSocket.mjs';
import { HUD } from './ui/HUD.mjs';
import { GameRuntime } from './game/GameRuntime.mjs';
import { MenuController } from './menu/MenuController.mjs';
import { MenuScene } from './menu/MenuScene.mjs';
import { SCREEN_IDS, ScreenRouter } from './ui/ScreenRouter.mjs';

const $ = (selector) => document.querySelector(selector);
const menuWorld = $('#menu-world');
const menuSpellblade = $('#menu-spellblade');
const menu = $('#menu');
const soloMenu = $('#solo-menu');
const privateMenu = $('#private-menu');
const lobby = $('#lobby');
const howPanel = $('#how-panel');
const endScreen = $('#end-screen');
const practiceOverlay = $('#practice-overlay');
const nameInput = $('#player-name');
const roomInput = $('#room-code');
const menuError = $('#menu-error');
const lobbyCode = $('#lobby-code');
const lobbyState = $('#lobby-state');
const lobbyPlayers = $('#lobby-players');
const lobbyWorld = $('#lobby-world');
const lobbyMode = $('#lobby-mode');
const lobbyCopy = $('#lobby-copy');
const copyLinkButton = $('#copy-link');
const finalBoard = $('#final-scoreboard');
const winnerTitle = $('#winner-title');
const rematchButton = $('#rematch');
const rematchCopy = $('#rematch-copy');

const hud = new HUD();
const socket = new GameSocket();
const menuController = new MenuController(socket, localStorage);
const router = new ScreenRouter({
  [SCREEN_IDS.MAIN_MENU]: menu,
  [SCREEN_IDS.SOLO_MENU]: soloMenu,
  [SCREEN_IDS.PRIVATE_MENU]: privateMenu,
  [SCREEN_IDS.LOBBY]: lobby,
  [SCREEN_IDS.END_SCREEN]: endScreen,
  [SCREEN_IDS.HOW_TO_PLAY]: howPanel,
});

let menuScene = null;
try {
  menuScene = new MenuScene(menuSpellblade);
} catch (error) {
  console.warn('Spellblade menu preview unavailable:', error);
  menuSpellblade.classList.add('menu-scene-unavailable');
}

let runtime = null;
let latestLobby = null;
let latestSnapshot = null;
let pendingFailureScreen = SCREEN_IDS.MAIN_MENU;

const params = new URLSearchParams(location.search);
const invitedRoom = params.get('room');
const autoSolo = params.get('solo');
nameInput.value = menuController.savedName();
if (invitedRoom) roomInput.value = invitedRoom.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);

function isMenuBackedScreen(screenId) {
  return [SCREEN_IDS.MAIN_MENU, SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.HOW_TO_PLAY].includes(screenId);
}

function route(screenId) {
  if (screenId === SCREEN_IDS.PLAYING) router.hideAll();
  else router.show(screenId);
  const menuBacked = isMenuBackedScreen(screenId);
  menuWorld.classList.toggle('hidden', !menuBacked);
  menuScene?.setVisible(menuBacked);
}

function ensureRuntime() {
  if (!runtime) runtime = new GameRuntime($('#game-canvas'), socket, hud);
  runtime.setPlayerId(socket.playerId);
}

function runMenuAction(result, failureScreen) {
  pendingFailureScreen = failureScreen;
  if (result.ok) {
    menuError.textContent = '';
    return true;
  }
  menuError.textContent = result.error;
  route(failureScreen);
  if (/name/i.test(result.error)) nameInput.focus();
  return false;
}

function worldLabel(worldId) {
  return worldId === 'castleward' ? 'CASTLEWARD' : worldId === 'shattered-keep' ? 'SHATTERED KEEP' : String(worldId || 'UNKNOWN').toUpperCase();
}

function modeLabel(mode) {
  if (mode === 'BOT_DUEL') return 'BOT DUEL';
  if (mode === 'PRACTICE') return 'PRACTICE YARD';
  return 'FREE-FOR-ALL';
}

function lobbyStateCopy(message) {
  if (message.mode === 'BOT_DUEL') {
    if (message.roomState === 'COUNTDOWN') return 'RIVAL SPELLBLADE ENTERING THE YARD…';
    return 'PREPARING YOUR RIVAL…';
  }
  if (message.roomState === 'REMATCH_COUNTDOWN') return 'REMATCH INCOMING…';
  if (message.roomState === 'COUNTDOWN') return 'THE GATES ARE OPENING…';
  return 'WAITING FOR ANOTHER SPELLBLADE';
}

function updateLobby(message) {
  latestLobby = message;
  lobbyCode.textContent = message.roomCode;
  lobbyWorld.textContent = worldLabel(message.worldId);
  lobbyMode.textContent = modeLabel(message.mode);
  lobbyState.textContent = lobbyStateCopy(message);
  lobbyPlayers.innerHTML = message.players.map((player) => {
    const status = player.actorKind === 'bot'
      ? 'RIVAL'
      : player.actorKind === 'dummy'
        ? 'TRAINING DUMMY'
        : player.connected ? 'READY' : 'RECONNECTING';
    const rune = player.actorKind === 'bot' ? '◇' : '◆';
    return `<div class="lobby-player"><span class="player-rune">${rune}</span><b>${escapeHtml(player.name)}</b><em>${status}</em></div>`;
  }).join('');
  const multiplayer = message.mode === 'FFA';
  copyLinkButton.classList.toggle('hidden', !multiplayer);
  lobbyCopy.textContent = multiplayer
    ? 'Two players are enough. New players can join an active match.'
    : 'This room is private to your solo session.';
}

function updateEnd(snapshot) {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  winnerTitle.textContent = winner?.id === socket.playerId ? 'VICTORY' : `${winner?.name ?? 'A SPELLBLADE'} WINS`;
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  finalBoard.innerHTML = sorted.map((player, index) => `<div class="final-row ${player.id === socket.playerId ? 'you' : ''}"><span>${index + 1}</span><b>${escapeHtml(player.name)}</b><strong>${player.kills} K</strong><em>${player.deaths} D</em><small>${player.parries} parries</small></div>`).join('');

  if (snapshot.mode === 'BOT_DUEL') {
    rematchButton.textContent = 'FIGHT AGAIN';
    rematchCopy.textContent = 'Start a fresh duel with a new Rival Spellblade.';
  } else {
    rematchButton.textContent = 'PLAY AGAIN';
    rematchCopy.textContent = 'All remaining players vote to rematch.';
  }
}

function clearSessionAndNavigate(soloMode = null) {
  localStorage.removeItem('ss-session-token');
  localStorage.removeItem('ss-room-code');
  socket.close();
  const next = new URL(location.href);
  next.search = '';
  if (soloMode) next.searchParams.set('solo', soloMode);
  location.href = `${next.pathname}${next.search}`;
}

function setPracticeVisible(visible) {
  practiceOverlay.classList.toggle('hidden', !visible);
}

$('#quick-play').addEventListener('click', () => runMenuAction(menuController.quickPlay(nameInput.value), SCREEN_IDS.MAIN_MENU));
$('#solo-button').addEventListener('click', () => { menuError.textContent = ''; route(SCREEN_IDS.SOLO_MENU); });
$('#private-button').addEventListener('click', () => { menuError.textContent = ''; route(SCREEN_IDS.PRIVATE_MENU); });
$('#how-button').addEventListener('click', () => route(SCREEN_IDS.HOW_TO_PLAY));
$('#solo-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#private-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('[data-close-how]').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#bot-duel').addEventListener('click', () => runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#practice-mode').addEventListener('click', () => runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#create-room').addEventListener('click', () => runMenuAction(menuController.createPrivate(nameInput.value), SCREEN_IDS.PRIVATE_MENU));
$('#join-room').addEventListener('click', () => runMenuAction(menuController.joinPrivate(roomInput.value, nameInput.value), SCREEN_IDS.PRIVATE_MENU));
roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5); });

copyLinkButton.addEventListener('click', async () => {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', socket.roomCode);
  await navigator.clipboard.writeText(url.toString());
  copyLinkButton.textContent = 'INVITE LINK COPIED';
  setTimeout(() => { copyLinkButton.textContent = 'COPY INVITE LINK'; }, 1200);
});
$('#copy-code').addEventListener('click', async () => { await navigator.clipboard.writeText(socket.roomCode || ''); });

rematchButton.addEventListener('click', () => {
  if (latestSnapshot?.mode === 'BOT_DUEL') {
    clearSessionAndNavigate('BOT_DUEL');
    return;
  }
  socket.rematch();
  rematchCopy.textContent = 'Rematch vote cast. Waiting for the others…';
});
$('#leave').addEventListener('click', () => clearSessionAndNavigate());

$('#practice-reset').addEventListener('click', () => socket.practiceResetPlayer());
$('#practice-passive').addEventListener('click', () => socket.practiceSpawnDummy('PASSIVE'));
$('#practice-guarding').addEventListener('click', () => socket.practiceSpawnDummy('GUARDING'));
$('#practice-fight').addEventListener('click', () => socket.practiceSpawnDummy('FIGHTS_BACK'));
$('#practice-remove').addEventListener('click', () => socket.practiceRemoveDummy());
$('#practice-leave').addEventListener('click', () => clearSessionAndNavigate());

socket.on('joined', (message) => {
  menuError.textContent = '';
  ensureRuntime();
  if (message.roomState === 'PLAYING') {
    route(SCREEN_IDS.PLAYING);
    hud.hide();
  } else {
    updateLobby({ ...message, players: latestLobby?.players ?? [] });
    route(SCREEN_IDS.LOBBY);
    hud.hide();
  }
});

socket.on('lobby', (message) => {
  updateLobby(message);
  if (message.roomState !== 'PLAYING' && message.roomState !== 'FINISHED') route(SCREEN_IDS.LOBBY);
});

socket.on('snapshot', (snapshot) => {
  latestSnapshot = snapshot;
  ensureRuntime();
  if (snapshot.roomState === 'WAITING' || snapshot.roomState === 'COUNTDOWN' || snapshot.roomState === 'REMATCH_COUNTDOWN') {
    runtime.setPlaying(false);
    hud.hide();
    setPracticeVisible(false);
    updateLobby(snapshot);
    route(SCREEN_IDS.LOBBY);
  } else if (snapshot.roomState === 'PLAYING') {
    runtime.setPlaying(true);
    route(SCREEN_IDS.PLAYING);
    hud.show();
    setPracticeVisible(snapshot.mode === 'PRACTICE');
  } else if (snapshot.roomState === 'FINISHED') {
    runtime.setPlaying(false);
    hud.hide();
    setPracticeVisible(false);
    updateEnd(snapshot);
    route(SCREEN_IDS.END_SCREEN);
  }
});

socket.on('resumeFailed', () => {
  latestLobby = null;
  latestSnapshot = null;
  runtime?.setPlaying(false);
  runtime?.setPlayerId(null);
  hud.hide();
  setPracticeVisible(false);
  menuError.textContent = 'Previous arena session expired. Choose a new match.';
  route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);
});

socket.on('error', (message) => {
  menuError.textContent = message.message || 'Could not enter that match.';
  hud.hide();
  setPracticeVisible(false);
  route(pendingFailureScreen);
});

socket.on('connection', ({ connected }) => {
  if (!connected && runtime) hud.flashText('RECONNECTING…', 'danger');
});

route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);

try {
  const hadSession = Boolean(socket.token);
  await socket.connect({ resume: true });

  if (!hadSession && autoSolo === 'BOT_DUEL' && nameInput.value) {
    runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU);
  } else if (!hadSession && autoSolo === 'PRACTICE' && nameInput.value) {
    runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU);
  } else if (hadSession) {
    setTimeout(() => {
      if (!socket.playerId) route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);
    }, 500);
  }
} catch {
  menuError.textContent = 'Could not reach the arena server. Retry in a moment.';
  route(SCREEN_IDS.MAIN_MENU);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
