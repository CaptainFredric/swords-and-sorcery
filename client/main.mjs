import { GameSocket } from './network/GameSocket.mjs';
import { HUD } from './ui/HUD.mjs';
import { GameRuntime } from './game/GameRuntime.mjs';
import { preloadSpellbladeAssets, watchSpellbladeLoading } from './game/SpellbladeAssets.mjs';
import { SoundEngine } from './game/sound/SoundEngine.mjs';
import { arenaGateCopy, challengeCopy, countdownSeconds, romanCount } from './menu/challengeCard.mjs';
import { lobbyView, roomRows } from './menu/lobbyView.mjs';
import { seekView } from './menu/seekView.mjs';
import { MenuController, shouldRouteSocketError } from './menu/MenuController.mjs';
import { MenuScene } from './menu/MenuScene.mjs';
import { SCREEN_IDS, ScreenRouter } from './ui/ScreenRouter.mjs';
import { isTouchPrimary } from './game/touchControlsModel.mjs';

const $ = (selector) => document.querySelector(selector);
const menuWorld = $('#menu-world');
const menuSpellblade = $('#menu-spellblade');
const menu = $('#menu');
const soloMenu = $('#solo-menu');
const privateMenu = $('#private-menu');
const roomsMenu = $('#rooms-menu');
const roomList = $('#room-list');
const lobbyVotes = $('#lobby-votes');
const seekBanner = $('#seek-banner');
const seekAnotherButton = $('#seek-another');
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
// one sound engine for the whole page; it unlocks on the first click or key press
const sound = new SoundEngine();
const socket = new GameSocket();
const menuController = new MenuController(socket, localStorage);
const router = new ScreenRouter({
  [SCREEN_IDS.MAIN_MENU]: menu,
  [SCREEN_IDS.SOLO_MENU]: soloMenu,
  [SCREEN_IDS.PRIVATE_MENU]: privateMenu,
  [SCREEN_IDS.ROOMS_MENU]: roomsMenu,
  [SCREEN_IDS.LOBBY]: lobby,
  [SCREEN_IDS.END_SCREEN]: endScreen,
  [SCREEN_IDS.HOW_TO_PLAY]: howPanel,
});

// --- loading: the veil shows real download progress and lifts once the Spellblade stands in the forecourt ---
const loadingVeil = $('#loading-veil');
const loadingFill = $('#loading-fill');
const loadingCopy = $('#loading-copy');
let veilLifted = false;
const stopWatchingLoad = watchSpellbladeLoading((fraction) => {
  loadingFill.style.transform = `scaleX(${Math.max(0.04, fraction).toFixed(3)})`;
  if (fraction >= 1) loadingCopy.textContent = 'Raising the banners…';
});
function liftVeil() {
  if (veilLifted) return;
  veilLifted = true;
  stopWatchingLoad();
  loadingFill.style.transform = 'scaleX(1)';
  loadingVeil.classList.add('done');
  // the establishing shot settles on the Spellblade as the veil lifts
  menuScene?.setShot(router.current ?? SCREEN_IDS.MAIN_MENU, 2.8);
}
// never keep the menu hostage: lift after a while even on a very slow connection
setTimeout(liftVeil, 12000);

// start both character downloads at once; the menu, the first-person arms and opponents then share them
preloadSpellbladeAssets().catch(() => {});

let menuScene = null;
try {
  menuScene = new MenuScene(menuSpellblade, { onReady: () => setTimeout(liftVeil, 250) });
} catch (error) {
  console.warn('Spellblade menu preview unavailable:', error);
  menuSpellblade.classList.add('menu-scene-unavailable');
  liftVeil();
}
if (new URLSearchParams(location.search).has('debug')) globalThis.__ssMenu = menuScene;

let runtime = null;
let touchUi = false;
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
  return [SCREEN_IDS.MAIN_MENU, SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY, SCREEN_IDS.LOBBY].includes(screenId);
}

function route(screenId) {
  const previous = router.current;
  if (screenId === SCREEN_IDS.PLAYING) router.hideAll();
  else router.show(screenId);
  const menuBacked = isMenuBackedScreen(screenId);
  menuWorld.classList.toggle('hidden', !menuBacked);
  menuScene?.setVisible(menuBacked);
  // the camera glides to each screen's shot (the veil's establishing shot is started when it lifts)
  if (menuBacked && veilLifted && previous !== screenId) menuScene?.setShot(screenId);
  // leaving any menu screen for a match in progress opens the gate (a duel's countdown opens it at the start)
  if (screenId === SCREEN_IDS.PLAYING && previous !== null && currentRoomState === 'PLAYING') openArenaGate(latestSnapshot ?? latestLobby ?? {});
  renderSeek();
}

// --- the countdown card: a worthy challenger, and the arena gate that opens onto the match ---
const challengeCard = $('#challenge-card');
const arenaGate = $('#arena-gate');
let countdownTimer = null;
let lastCountdownValue = null;
let gateTimer = null;
let gateOpenedAt = -Infinity;
let currentRoomState = null;

function showChallenge(message) {
  const copy = challengeCopy({ mode: message.mode, players: message.players ?? [], localId: socket.playerId, worldId: message.worldId, scoreToWin: message.scoreToWin });
  $('#challenge-kicker').textContent = copy.kicker;
  $('#challenge-you').textContent = copy.you;
  $('#challenge-foe').textContent = copy.foe;
  $('#challenge-copy').textContent = copy.copy;
  challengeCard.classList.remove('hidden');
  clearInterval(countdownTimer);
  const count = $('#challenge-count');
  const tick = () => {
    const seconds = countdownSeconds(message.countdownEndsAt, socket.serverNow());
    if (seconds === null || seconds === lastCountdownValue) return;
    lastCountdownValue = seconds;
    count.textContent = romanCount(seconds);
    count.classList.remove('tick');
    void count.offsetWidth;
    count.classList.add('tick');
  };
  tick();
  countdownTimer = setInterval(tick, 100);
}

function hideChallenge() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  lastCountdownValue = null;
  challengeCard.classList.add('hidden');
}

function syncChallenge(message) {
  const counting = (message.roomState === 'COUNTDOWN' || message.roomState === 'REMATCH_COUNTDOWN') && message.mode !== 'PRACTICE';
  if (counting && Number.isFinite(message.countdownEndsAt)) showChallenge(message);
  else hideChallenge();
}

// black opens onto the arena with its name
function openArenaGate(info) {
  // once per opening (a countdown ending and the route change can both ask for it)
  if (performance.now() - gateOpenedAt < 1500) return;
  gateOpenedAt = performance.now();
  const copy = arenaGateCopy({ mode: info.mode, worldId: info.worldId, scoreToWin: info.scoreToWin });
  $('#arena-gate-title').textContent = copy.title;
  $('#arena-gate-sub').textContent = copy.sub;
  arenaGate.classList.remove('hidden');
  arenaGate.style.animation = 'none';
  void arenaGate.offsetWidth;
  arenaGate.style.animation = '';
  clearTimeout(gateTimer);
  gateTimer = setTimeout(() => arenaGate.classList.add('hidden'), 1300);
}

// phones and tablets get on-screen controls and touch wording; a touchscreen laptop switches on its first tap
function useTouchUi() {
  if (touchUi) return;
  touchUi = true;
  document.body.classList.add('touch-ui');
  const turnHint = $('.turn-hint');
  if (turnHint) turnHint.textContent = 'DRAG TO TURN · DOUBLE-TAP TO RESET';
  runtime?.enableTouch();
}
if (isTouchPrimary()) useTouchUi();
addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') useTouchUi(); }, { capture: true, passive: true });
$('#rotate-dismiss').addEventListener('click', () => document.body.classList.add('portrait-ok'));

function ensureRuntime() {
  if (!runtime) {
    runtime = new GameRuntime($('#game-canvas'), socket, hud, { sound });
    if (touchUi) runtime.enableTouch();
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

// --- lobby: rendered from the pure lobby view (ready check, auto-start, votes) ---
let myVotes = {};
function renderLobby() {
  const message = latestLobby;
  if (!message) return;
  const view = lobbyView(message, { localId: socket.playerId, serverNow: socket.serverNow(), myVotes });
  lobbyCode.textContent = message.roomCode ?? '----';
  lobbyWorld.textContent = view.world;
  lobbyMode.textContent = view.mode;
  lobbyState.textContent = view.state;
  lobbyPlayers.innerHTML = view.players.map((player) => `<div class="lobby-player${player.you ? ' you' : ''}${player.ready ? ' ready' : ''}"><span class="player-rune">${player.rune}</span><b>${escapeHtml(player.name)}</b><em>${player.status}</em></div>`).join('');
  startMatchButton.classList.toggle('hidden', !view.ready.visible);
  startMatchButton.classList.toggle('pressed', view.ready.pressed);
  startMatchButton.textContent = view.ready.label;
  startMatchButton.disabled = view.ready.disabled;
  copyLinkButton.classList.toggle('hidden', !view.action.visible);
  copyLinkButton.classList.toggle('primary-command', view.action.primary);
  copyLinkButton.disabled = view.action.disabled;
  if (!copyLinkButton.dataset.flash) copyLinkButton.textContent = view.action.label;
  lobbyVotes.innerHTML = view.votes.map((row) => `<div class="vote-row"><span>${row.label}</span>${row.options.map((option) => `<button class="vote-chip${option.chosen ? ' chosen' : ''}${option.mine ? ' mine' : ''}" data-key="${row.key}" data-value="${escapeHtml(String(option.value))}">${escapeHtml(String(option.label))}<b class="tally" data-count="${option.count}" aria-label="${option.count} ${option.count === 1 ? 'vote' : 'votes'}">${option.count}</b></button>`).join('')}</div>`).join('');
  lobbyCopy.textContent = view.footer;
}

function updateLobby(message) {
  if (message.type === 'snapshot') {
    // snapshots carry the room's state and clock; the lobby message carries readiness and votes
    latestLobby = {
      ...(latestLobby ?? {}),
      roomState: message.roomState,
      countdownEndsAt: message.countdownEndsAt,
      mode: message.mode,
      worldId: message.worldId,
      roomCode: message.roomCode,
      scoreToWin: message.scoreToWin,
      players: latestLobby?.roomCode === message.roomCode ? latestLobby.players : message.players,
    };
  } else {
    if (latestLobby?.roomCode !== message.roomCode) myVotes = {};
    latestLobby = message;
  }
  renderLobby();
}
// the auto-start clock ticks without new messages
setInterval(() => { if (router.current === SCREEN_IDS.LOBBY) renderLobby(); }, 500);

lobbyVotes.addEventListener('click', (event) => {
  const chip = event.target.closest?.('.vote-chip');
  if (!chip) return;
  const key = chip.dataset.key;
  const value = key === 'score' ? Number(chip.dataset.value) : chip.dataset.value;
  myVotes = { ...myVotes, [key]: value };
  socket.vote(key, value);
  renderLobby();
});

// --- seeking a duel: the banner in the practice yard ---
let seekStatus = null;
function renderSeek() {
  const view = seekView(seekStatus, socket.serverNow(), latestSnapshot?.mode ?? latestLobby?.mode);
  seekBanner.classList.toggle('hidden', !view.visible || router.current !== null);
  if (!view.visible) return;
  $('#seek-title').textContent = view.title;
  $('#seek-detail').textContent = view.detail;
  $('#seek-bot').classList.toggle('hidden', !view.offerBot);
}
setInterval(renderSeek, 500);
socket.on('seeking', (status) => { seekStatus = status; renderSeek(); });
socket.on('duelFound', () => {
  seekStatus = null;
  renderSeek();
  hud.flashText('A CHALLENGER ANSWERS', 'ready', 1400);
});
$('#seek-cancel').addEventListener('click', () => socket.cancelSeek());
$('#seek-bot').addEventListener('click', () => socket.seekBotDuel());

// --- open rooms: public rooms anyone can walk into ---
let roomsTimer = null;
function openRooms() {
  showMenuError('');
  route(SCREEN_IDS.ROOMS_MENU);
  socket.listRooms();
  clearInterval(roomsTimer);
  roomsTimer = setInterval(() => {
    if (router.current === SCREEN_IDS.ROOMS_MENU) socket.listRooms();
    else clearInterval(roomsTimer);
  }, 3000);
}
socket.on('roomList', ({ rooms }) => {
  const rows = roomRows(rooms);
  roomList.innerHTML = rows.length
    ? rows.map((row) => `<button class="room-row" data-code="${escapeHtml(row.code)}"><b>${escapeHtml(row.world)}</b><span>${row.players}</span><em>${escapeHtml(row.status)}</em><i>FIRST TO ${row.scoreToWin ?? 10}</i></button>`).join('')
    : '<p class="room-empty">No open rooms right now. Raise one and others can walk in.</p>';
});
roomList.addEventListener('click', (event) => {
  const row = event.target.closest?.('.room-row');
  if (row) runMenuAction(menuController.joinPrivate(row.dataset.code, nameInput.value), SCREEN_IDS.ROOMS_MENU);
});

function updateEnd(snapshot) {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  winnerTitle.textContent = winner?.id === socket.playerId ? 'VICTORY' : `${winner?.name ?? 'A SPELLBLADE'} WINS`;
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  finalBoard.innerHTML = sorted.map((player, index) => `<div class="final-row ${player.id === socket.playerId ? 'you' : ''}"><span>${index + 1}</span><b>${escapeHtml(player.name)}</b><strong>${player.kills} K</strong><em>${player.deaths} D</em><small>${player.parries} parries</small></div>`).join('');

  const duel = snapshot.mode === 'DUEL';
  // a forfeit, or a challenger who has since walked off to seek another: nobody is left to rematch
  const alone = duel && (snapshot.finishReason === 'forfeit' || snapshot.players.filter((p) => p.actorKind === 'human').length < 2);
  seekAnotherButton.classList.toggle('hidden', !(duel || seekStatus?.active));
  rematchButton.classList.toggle('hidden', alone);
  if (snapshot.mode === 'BOT_DUEL') {
    rematchButton.textContent = 'FIGHT AGAIN';
    rematchCopy.textContent = seekStatus?.active ? 'Still seeking a challenger: fight on, or head back to the yard.' : 'Start another bot duel.';
  } else if (duel) {
    rematchButton.textContent = 'REMATCH';
    rematchCopy.textContent = alone
      ? 'Your challenger has left the field. Seek another, or return to the menu.'
      : 'Both duellists vote to rematch, or seek another challenger.';
  } else {
    rematchButton.textContent = 'PLAY AGAIN';
    rematchCopy.textContent = 'All remaining players vote to rematch.';
  }
}

function clearSessionAndNavigate(soloMode = null) {
  localStorage.removeItem('ss-session-token');
  localStorage.removeItem('ss-room-code');
  // leaving on purpose frees the slot at once (a duel is forfeited now, not after the reconnect grace)
  socket.leaveRoom();
  socket.close();
  const next = new URL(location.href);
  next.search = '';
  if (soloMode) next.searchParams.set('solo', soloMode);
  location.href = `${next.pathname}${next.search}`;
}

function setPracticeVisible(visible) {
  practiceOverlay.classList.toggle('hidden', !visible);
}

$('#seek-duel').addEventListener('click', () => runMenuAction(menuController.seekDuel(nameInput.value), SCREEN_IDS.MAIN_MENU));
$('#quick-play').addEventListener('click', () => openRooms());
$('#rooms-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#quick-join').addEventListener('click', () => runMenuAction(menuController.quickPlay(nameInput.value), SCREEN_IDS.ROOMS_MENU));
$('#raise-room').addEventListener('click', () => runMenuAction(menuController.createPublic(nameInput.value), SCREEN_IDS.ROOMS_MENU));
seekAnotherButton.addEventListener('click', () => runMenuAction(menuController.seekDuel(nameInput.value), SCREEN_IDS.MAIN_MENU));
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
  copyLinkButton.dataset.flash = '1';
  copyLinkButton.textContent = 'INVITE LINK COPIED';
  setTimeout(() => { delete copyLinkButton.dataset.flash; renderLobby(); }, 1200);
});
$('#copy-code').addEventListener('click', () => copyText(socket.roomCode || '', 'Copy room code'));

async function copyText(text, title) {
  try { await navigator.clipboard.writeText(text); }
  catch { window.prompt(title, text); }
}
function openPause() {
  if (latestSnapshot?.roomState !== 'PLAYING') return;
  paused = true;
  runtime?.releasePointer();
  pauseMenu.classList.remove('hidden');
  $('#resume-game').focus();
}
$('#resume-game').addEventListener('click', () => { paused = false; pauseMenu.classList.add('hidden'); runtime?.requestPointerLock(); });
$('#pause-leave').addEventListener('click', () => clearSessionAndNavigate());
$('#lobby-leave').addEventListener('click', () => clearSessionAndNavigate());
// the ready check: each Spellblade says they are ready (press again to take it back)
startMatchButton.addEventListener('click', () => socket.ready(!startMatchButton.classList.contains('pressed')));
// M: sound on/off (not while typing a name or room code)
document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyM' || event.repeat || event.target?.tagName === 'INPUT') return;
  const muted = sound.toggleMute();
  hud.flashText(muted ? 'SOUND OFF' : 'SOUND ON', 'ready', 900);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.repeat) return;
  if ([SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY].includes(router.current)) {
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
  latestLobby = { ...(latestLobby ?? {}), mode: message.mode, worldId: message.worldId, roomCode: message.roomCode };
  currentRoomState = message.roomState;
  // a seeker moved into a bot duel while already in the arena is ready at once (no second click)
  if (message.mode === 'BOT_DUEL' && runtime?.input?.enabled) socket.arenaReady(true);
  if (message.roomState === 'PLAYING' || message.mode === 'DUEL') {
    // a matchmade duel skips the lobby: the challenger card plays over the arena
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
  syncChallenge(message);
  if (message.roomState !== 'PLAYING' && message.roomState !== 'FINISHED' && message.mode !== 'DUEL') route(SCREEN_IDS.LOBBY);
});

// the gate opens when a countdown gives way to the match (also for duels, which never leave the arena view)
let lastRoomKey = null;
function noteRoomState(snapshot) {
  const key = `${snapshot.roomCode}:${snapshot.roomState}`;
  const [room, state] = (lastRoomKey ?? ':').split(':');
  if (snapshot.roomState === 'PLAYING' && room === snapshot.roomCode && (state === 'COUNTDOWN' || state === 'REMATCH_COUNTDOWN')) openArenaGate(snapshot);
  lastRoomKey = key;
}

socket.on('snapshot', (snapshot) => {
  latestSnapshot = snapshot;
  ensureRuntime();
  noteRoomState(snapshot);
  currentRoomState = snapshot.roomState;
  if (snapshot.roomState === 'WAITING' || snapshot.roomState === 'COUNTDOWN' || snapshot.roomState === 'REMATCH_COUNTDOWN') {
    const duel = snapshot.mode === 'DUEL';
    // keep the arena focused through a bot duel's or a matchmade duel's countdown
    const preservePointerLock = (snapshot.mode === 'BOT_DUEL' || duel)
      && (snapshot.roomState === 'WAITING' || snapshot.roomState === 'COUNTDOWN');
    paused = false; pauseMenu.classList.add('hidden');
    runtime.setPlaying(false, { preservePointerLock });
    hud.hide();
    setPracticeVisible(false);
    updateLobby(snapshot);
    syncChallenge(snapshot);
    route(duel ? SCREEN_IDS.PLAYING : SCREEN_IDS.LOBBY);
  } else if (snapshot.roomState === 'PLAYING') {
    runtime.setPlaying(true);
    hideChallenge();
    route(SCREEN_IDS.PLAYING);
    hud.show();
    setPracticeVisible(snapshot.mode === 'PRACTICE');
  } else if (snapshot.roomState === 'FINISHED') {
    hideChallenge();
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
