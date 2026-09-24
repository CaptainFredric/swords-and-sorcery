import { GameSocket } from './network/GameSocket.mjs';
import { HUD } from './ui/HUD.mjs';
import { GameRuntime } from './game/GameRuntime.mjs';
import { MenuController, shouldRouteSocketError } from './menu/MenuController.mjs';
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
const menuErrors = [...document.querySelectorAll('[data-menu-error]')];
const nameFields = [nameInput, ...document.querySelectorAll('[data-name-copy]')];
const pauseMenu = $('#pause-menu');
const startMatchButton = $('#start-match');
let paused = false;
function showMenuError(text) { for (const element of menuErrors) element.textContent = text; }
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
for (const field of nameFields) {
  field.value = nameInput.value;
  field.addEventListener('input', () => { for (const other of nameFields) if (other !== field) other.value = field.value; });
}
if (invitedRoom) roomInput.value = invitedRoom.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
if (invitedRoom && localStorage.getItem('ss-room-code') !== roomInput.value) {
  socket.token = null;
  localStorage.removeItem('ss-session-token');
  localStorage.removeItem('ss-room-code');
}

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
  if (!runtime) {
    runtime = new GameRuntime($('#game-canvas'), socket, hud);
    runtime.onPointer = (locked) => {
      const mode = latestLobby?.mode ?? latestSnapshot?.mode;
      if (mode === 'BOT_DUEL') socket.arenaReady(locked);
      if (locked) { paused = false; pauseMenu.classList.add('hidden'); }
      else if (latestSnapshot?.roomState === 'PLAYING' && mode !== 'PRACTICE') openPause();
    };
  }
  runtime.setPlayerId(socket.playerId);
}

function runMenuAction(result, failureScreen) {
  pendingFailureScreen = failureScreen;
  if (result.ok) {
    showMenuError('');
    return true;
  }
  showMenuError(result.error);
  route(failureScreen);
  if (/name/i.test(result.error)) nameFields.find(field => field.offsetParent !== null)?.focus();
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
    if (message.roomState === 'COUNTDOWN') return 'BOT DUEL STARTING…';
    if (message.roomState === 'WAITING') return 'ENTER THE ARENA WHEN READY';
    return 'PREPARING BOT DUEL…';
  }
  if (message.roomState === 'REMATCH_COUNTDOWN') return 'REMATCH STARTING…';
  if (message.roomState === 'COUNTDOWN') return 'MATCH STARTING…';
  return message.players?.filter(p => p.actorKind === 'human' && p.connected).length >= 2 ? 'WAITING FOR HOST TO START' : 'WAITING FOR ANOTHER PLAYER';
}

function updateLobby(message) {
  latestLobby = message;
  lobbyCode.textContent = message.roomCode;
  lobbyWorld.textContent = worldLabel(message.worldId);
  lobbyMode.textContent = modeLabel(message.mode);
  lobbyState.textContent = lobbyStateCopy(message);
  lobbyPlayers.innerHTML = message.players.map((player) => {
    const status = player.actorKind === 'bot'
      ? 'BOT'
      : player.actorKind === 'dummy'
        ? 'TRAINING DUMMY'
        : message.mode === 'BOT_DUEL'
          ? player.connected ? (player.arenaReady ? 'READY' : 'FOCUS ARENA') : 'RECONNECTING'
          : player.connected ? 'READY' : 'RECONNECTING';
    const rune = player.actorKind === 'bot' ? '◇' : '◆';
    return `<div class="lobby-player"><span class="player-rune">${rune}</span><b>${escapeHtml(player.name)}</b><em>${status}</em></div>`;
  }).join('');
  const multiplayer = message.mode === 'FFA';
  const humans = message.players.filter(p => p.actorKind === 'human' && p.connected).length;
  startMatchButton.classList.toggle('hidden', !multiplayer);
  startMatchButton.disabled = message.roomState !== 'WAITING' || humans < 2 || message.hostId !== socket.playerId;
  startMatchButton.textContent = message.hostId === socket.playerId ? 'START MATCH' : 'WAITING FOR HOST';
  const botDuel = message.mode === 'BOT_DUEL';
  copyLinkButton.classList.toggle('hidden', !(multiplayer || botDuel));
  copyLinkButton.disabled = botDuel && message.roomState === 'COUNTDOWN';
  copyLinkButton.textContent = botDuel
    ? message.roomState === 'COUNTDOWN' ? 'ARENA FOCUSED' : 'START BOT DUEL'
    : 'COPY INVITE LINK';
  lobbyCopy.textContent = multiplayer
    ? 'Share the room code. The host starts when everyone has joined.'
    : botDuel
      ? 'Press Start Bot Duel when ready. A short countdown follows.'
      : 'Solo session.';
}

function updateEnd(snapshot) {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  winnerTitle.textContent = winner?.id === socket.playerId ? 'VICTORY' : `${winner?.name ?? 'A SPELLBLADE'} WINS`;
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  finalBoard.innerHTML = sorted.map((player, index) => `<div class="final-row ${player.id === socket.playerId ? 'you' : ''}"><span>${index + 1}</span><b>${escapeHtml(player.name)}</b><strong>${player.kills} K</strong><em>${player.deaths} D</em><small>${player.parries} parries</small></div>`).join('');

  if (snapshot.mode === 'BOT_DUEL') {
    rematchButton.textContent = 'FIGHT AGAIN';
    rematchCopy.textContent = 'Start another bot duel.';
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
$('#solo-button').addEventListener('click', () => { showMenuError(''); route(SCREEN_IDS.SOLO_MENU); });
$('#private-button').addEventListener('click', () => { showMenuError(''); route(SCREEN_IDS.PRIVATE_MENU); });
$('#how-button').addEventListener('click', () => route(SCREEN_IDS.HOW_TO_PLAY));
$('#solo-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#private-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('[data-close-how]').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#bot-duel').addEventListener('click', () => runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#practice-mode').addEventListener('click', () => runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#create-room').addEventListener('click', () => runMenuAction(menuController.createPrivate(nameInput.value), SCREEN_IDS.PRIVATE_MENU));
$('#join-room').addEventListener('click', () => runMenuAction(menuController.joinPrivate(roomInput.value, nameInput.value), SCREEN_IDS.PRIVATE_MENU));
roomInput.addEventListener('keydown', event => { if (event.key === 'Enter') $('#join-room').click(); });
roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5); });

copyLinkButton.addEventListener('click', async () => {
  if (latestLobby?.mode === 'BOT_DUEL') {
    ensureRuntime();
    runtime.requestPointerLock();
    return;
  }
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', socket.roomCode);
  await copyText(url.toString(), 'Copy invite link');
  copyLinkButton.textContent = 'INVITE LINK COPIED';
  setTimeout(() => { copyLinkButton.textContent = 'COPY INVITE LINK'; }, 1200);
});
$('#copy-code').addEventListener('click', () => copyText(socket.roomCode || '', 'Copy room code'));

async function copyText(text, title) {
  try { await navigator.clipboard.writeText(text); }
  catch { window.prompt(title, text); }
}
function openPause() {
  if (latestSnapshot?.roomState !== 'PLAYING') return;
  paused = true;
  document.exitPointerLock?.();
  pauseMenu.classList.remove('hidden');
  $('#resume-game').focus();
}
$('#resume-game').addEventListener('click', () => { paused = false; pauseMenu.classList.add('hidden'); runtime?.requestPointerLock(); });
$('#pause-leave').addEventListener('click', () => clearSessionAndNavigate());
$('#lobby-leave').addEventListener('click', () => clearSessionAndNavigate());
startMatchButton.addEventListener('click', () => socket.startMatch());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.repeat) return;
  if ([SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.HOW_TO_PLAY].includes(router.current)) {
    route(SCREEN_IDS.MAIN_MENU);
  } else if (router.current === SCREEN_IDS.LOBBY || router.current === SCREEN_IDS.END_SCREEN) {
    clearSessionAndNavigate();
  } else if (latestSnapshot?.roomState === 'PLAYING') {
    if (document.pointerLockElement) document.exitPointerLock();
    else if (paused) { paused = false; pauseMenu.classList.add('hidden'); }
    else openPause();
  }
});

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
  showMenuError('');
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
    const preservePointerLock = snapshot.mode === 'BOT_DUEL'
      && (snapshot.roomState === 'WAITING' || snapshot.roomState === 'COUNTDOWN');
    paused = false; pauseMenu.classList.add('hidden');
    runtime.setPlaying(false, { preservePointerLock });
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
    paused = false; pauseMenu.classList.add('hidden');
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
  showMenuError('Previous arena session expired. Choose a new match.');
  route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);
});

socket.on('error', (message) => {
  const errorText = message.message || 'Could not enter that match.';
  if (!shouldRouteSocketError(socket.roomCode, latestSnapshot)) {
    hud.flashText(errorText.toUpperCase(), 'danger');
    return;
  }
  showMenuError(errorText);
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
  showMenuError('Could not reach the arena server. Retry in a moment.');
  route(SCREEN_IDS.MAIN_MENU);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
