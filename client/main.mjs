import { ChallengesController } from './menu/ChallengesController.mjs';
import { normalizePreparedSpells, replacePreparedSpell } from '../shared/src/preparedSpells.mjs';
import { SPELLS } from '../shared/src/spells.mjs';
import { ULTIMATES } from '../shared/src/ultimates.mjs';
import { RenownController } from './menu/RenownController.mjs';
import { GameLink, LINK_RESTORED, linkStatusView } from './network/GameLink.mjs';
import { HUD } from './ui/HUD.mjs';
import { GameRuntime } from './game/GameRuntime.mjs';
import { preloadSpellbladeAssets, watchSpellbladeLoading } from './game/SpellbladeAssets.mjs';
import { SoundEngine } from './game/sound/SoundEngine.mjs';
import { Ambience } from './game/sound/Ambience.mjs';
import { MusicPlayer } from './game/sound/music/MusicPlayer.mjs';
import { fightPieceFor } from './game/sound/music/score.mjs';
import { VoiceBank } from './game/sound/VoiceBank.mjs';
import { linesFor } from './game/sound/voiceLines.mjs';
import { gateRecipe, uiClankRecipe, warDrumRecipe } from './game/sound/atmosphereRecipes.mjs';
import { unsheatheRecipe } from './game/sound/soundRecipes.mjs';
import { arenaGateCopy, challengeCopy, countdownSeconds, romanCount } from './menu/challengeCard.mjs';
import { lobbyView, roomRows } from './menu/lobbyView.mjs';
import { armoryView, preparedArmoryView } from './menu/armoryView.mjs';
import { createArmorySelection } from './menu/armorySelection.mjs';
import { loadArmoryCues, playArmorySound } from './menu/armorySound.mjs';
import { seekView } from './menu/seekView.mjs';
import { MenuController, shouldRouteSocketError } from './menu/MenuController.mjs';
import { MenuScene } from './menu/MenuScene.mjs';
import { SCREEN_IDS, ScreenRouter } from './ui/ScreenRouter.mjs';
import { isTouchPrimary } from './game/touchControlsModel.mjs';
import { registry } from './settings/settingsRegistry.mjs';
import { SettingsStore } from './settings/SettingsStore.mjs';
import { CreditsPanel } from './ui/CreditsPanel.mjs';
import { SettingsPanel } from './settings/SettingsPanel.mjs';
import { inputOptions, soundLevels, turnOptions, viewOptions } from './settings/applySettings.mjs';
import { screenTurn } from './ui/screenTurn.mjs';
import { guardPullToRefresh } from './ui/pullGuard.mjs';

const $ = (selector) => document.querySelector(selector);
const menuWorld = $('#menu-world');
const menuSpellblade = $('#menu-spellblade');
const menu = $('#menu');
const soloMenu = $('#solo-menu');
const armoryMenu = $('#armory-menu');
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
// one sound engine for the whole page; it unlocks on the first click or key press. Around it: the wind and bell of
// the courtyard, the music, and the Spellblade's voice.
const sound = new SoundEngine();
const armoryFeedback = createArmorySelection({
  play: (id) => playArmorySound(sound, id),
  preview: (id) => menuScene?.previewArmory(id),
  restore: () => menuScene?.showSpell(router.current === SCREEN_IDS.ARMORY ? settings.get('loadout.spell') : null),
});
// the player's settings, saved in this browser (see settings/settingsRegistry.mjs for what exists and how to add more)
const settings = new SettingsStore({ registry });
sound.setLevels(soundLevels(settings));
// a phone app that holds its screen upright: the game can lie sideways on it (Settings › Display › Screen)
screenTurn?.configure(turnOptions(settings));
const ambience = new Ambience(sound);
const music = new MusicPlayer(sound);
const voice = new VoiceBank(sound);
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.__ssSound = { sound, ambience, music, voice };
  globalThis.__ssSettings = { settings, registry, screenTurn };
  import('./game/sound/soundDemo.mjs').then((demo) => { globalThis.__ssSoundDemo = demo; });
}
// the game server when it answers, the browser itself when it does not (see GameLink)
const socket = new GameLink();
// (local inspection only: /?debug exposes the link, so a match can be hosted here in the browser and looked into)
if (new URLSearchParams(location.search).has('debug')) globalThis.__ssLink = socket;
const menuController = new MenuController(socket, localStorage);
const router = new ScreenRouter({
  [SCREEN_IDS.MAIN_MENU]: menu,
  [SCREEN_IDS.SOLO_MENU]: soloMenu,
  [SCREEN_IDS.PRIVATE_MENU]: privateMenu,
  [SCREEN_IDS.ROOMS_MENU]: roomsMenu,
  [SCREEN_IDS.LOBBY]: lobby,
  [SCREEN_IDS.END_SCREEN]: endScreen,
  [SCREEN_IDS.HOW_TO_PLAY]: howPanel,
  [SCREEN_IDS.ARMORY]: armoryMenu,
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
let renown = null;
try {
  menuScene = new MenuScene(menuSpellblade, { onReady: () => setTimeout(liftVeil, 250), sound, voice, banner: $('#menu .banner-panel') });
  menuScene.setTourAllowed(tourAllowed());
} catch (error) {
  console.warn('Spellblade menu preview unavailable:', error);
  menuSpellblade.classList.add('menu-scene-unavailable');
  liftVeil();
}
if (new URLSearchParams(location.search).has('debug')) globalThis.__ssMenu = menuScene;
menuScene?.setPixelRatioCap(viewOptions(settings).pixelRatioCap);

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
  return [SCREEN_IDS.MAIN_MENU, SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY, SCREEN_IDS.LOBBY, SCREEN_IDS.ARMORY].includes(screenId);
}

// the Spellblade's round behind the front door: for capable settings, and not for anyone who asked for less motion
function tourAllowed() {
  return viewOptions(settings).pixelRatioCap > 1.1 && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function route(screenId) {
  armoryFeedback.cancel();
  renown?.route(screenId);
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
  syncSoundscape();
  // in the Armory he holds the chosen spell up in his palm (and its cards' sounds are made ready for the first press)
  menuScene?.showSpell(screenId === SCREEN_IDS.ARMORY ? settings.get('loadout.spell') : null);
  if (screenId === SCREEN_IDS.ARMORY) loadArmoryCues(sound);
  // on the front door he is out on his round; every other screen finds him at his place
  menuScene?.setTouring(screenId === SCREEN_IDS.MAIN_MENU);
  $('.turn-hint')?.classList.toggle('hidden', screenId === SCREEN_IDS.MAIN_MENU && tourAllowed());
}

// what you hear follows where you are: the courtyard and the hall theme in the menus, the battle theme in a match
// (hotter as the fighting gets closer), silence for the stingers of a challenge and a match's end
function syncSoundscape() {
  const screen = router.current;
  const inArena = screen === null;
  if (!challengeCard.classList.contains('hidden')) {
    music.play(null);
    ambience.setScene(inArena ? 'arena' : 'menu');
  } else if (inArena) {
    ambience.setScene('arena');
    const fighting = latestSnapshot?.roomState === 'PLAYING';
    music.play(fighting ? fightPieceFor(latestSnapshot) : null);
    if (fighting && runtime) music.setIntensity(runtime.musicHeat({ cap: latestSnapshot.mode === 'PRACTICE' ? 1 : 2 }));
  } else if (screen === SCREEN_IDS.END_SCREEN) {
    ambience.setScene('arena');
    music.play(null);
  } else if (isMenuBackedScreen(screen)) {
    ambience.setScene('menu');
    music.play('hall');
  }
}
setInterval(syncSoundscape, 500);

// --- the countdown card: a worthy challenger, and the arena gate that opens onto the match ---
const challengeCard = $('#challenge-card');
const arenaGate = $('#arena-gate');
let countdownTimer = null;
let lastCountdownValue = null;
let gateTimer = null;
let gateOpenedAt = -Infinity;
let currentRoomState = null;

function showChallenge(message) {
  const appearing = challengeCard.classList.contains('hidden');
  const copy = challengeCopy({ mode: message.mode, players: message.players ?? [], localId: socket.playerId, worldId: message.worldId, scoreToWin: message.scoreToWin });
  $('#challenge-kicker').textContent = copy.kicker;
  $('#challenge-you').textContent = copy.you;
  $('#challenge-foe').textContent = copy.foe;
  $('#challenge-copy').textContent = copy.copy;
  challengeCard.classList.remove('hidden');
  // a worthy challenger: the drum, the low choir and the horn (the menu music gives way to it)
  if (appearing) {
    syncSoundscape();
    music.stinger('challenge');
  }
  clearInterval(countdownTimer);
  const count = $('#challenge-count');
  const tick = () => {
    const seconds = countdownSeconds(message.countdownEndsAt, socket.serverNow());
    if (seconds === null || seconds === lastCountdownValue) return;
    // each numeral lands on the war drum, heavier as the gate nears (the first is the stinger's own drum)
    if (lastCountdownValue !== null && seconds > 0) sound.play(warDrumRecipe(Math.random, { weight: 0.5 + (3 - Math.min(3, seconds)) * 0.25 }), { gain: 0.8 });
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
  sound.play(warDrumRecipe(Math.random, { weight: 1.3 }), { gain: 0.9 });
  sound.play(gateRecipe(), { gain: 0.85 });
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
  guardPullToRefresh();
  const turnHint = $('.turn-hint');
  if (turnHint) turnHint.textContent = 'DRAG TO TURN · DOUBLE-TAP TO RESET';
  runtime?.enableTouch();
}
if (isTouchPrimary()) useTouchUi();
addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') useTouchUi(); }, { capture: true, passive: true });
$('#rotate-dismiss').addEventListener('click', () => document.body.classList.add('portrait-ok'));

function ensureRuntime() {
  if (!runtime) {
    runtime = new GameRuntime($('#game-canvas'), socket, hud, { sound, voice });
    if (new URLSearchParams(location.search).has('debug')) globalThis.__ssRuntime = runtime;
    runtime.configure({ view: viewOptions(settings), input: inputOptions(settings) });
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

// the end of a match: a stinger for the winner or the fallen (once per match), and the victor's shout
let endHeardFor = null;
function soundTheEnd(snapshot) {
  const key = `${snapshot.roomCode}:${snapshot.matchStartedAt}`;
  if (endHeardFor === key) return;
  endHeardFor = key;
  const won = snapshot.winnerId === socket.playerId;
  music.stinger(won ? 'victory' : 'defeat');
  // the defeat made official: now and then, that he never thought this day would come; if not, the protest that he
  // is a knight (unless he just said so as he fell). A win is the stinger's (MIGHT MAKES... KNIGHT! is for force)
  if (won) return;
  for (const say of linesFor(socket.playerId, ['matchLost'])) {
    if (voice.say(say.line, { speaker: say.speaker, gain: 0.85, delay: say.delay, chanceScale: say.chanceScale, close: true })) break;
  }
}

function updateEnd(snapshot) {
  soundTheEnd(snapshot);
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
// the Spellblade answers a choice on the front door: a salute before going it alone, his blade raised high when
// calling for others, the blade presented on the way to the Armory
const MENU_REACTIONS = { 'solo-button': 'salute', 'seek-duel': 'rally', 'quick-play': 'rally', 'private-button': 'rally', 'armory-button': 'present', 'how-button': 'look' };
for (const [id, reaction] of Object.entries(MENU_REACTIONS)) $(`#${id}`)?.addEventListener('click', () => menuScene?.react(reaction));
$('#solo-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#private-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('[data-close-how]').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
// the solo arena: a chip each, the chosen one lit
const soloArena = $('#solo-arena');
function showSoloArena() {
  const chosen = menuController.soloArena();
  for (const chip of soloArena.querySelectorAll('[data-arena]')) {
    const on = chip.dataset.arena === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
}
soloArena.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-arena]');
  if (!chip) return;
  menuController.chooseSoloArena(chip.dataset.arena);
  showSoloArena();
});
showSoloArena();
// the Bot Duel's rival: how well it plays (the same knight, better or worse at the game)
const soloRival = $('#solo-rival');
const RIVAL_NOTES = Object.freeze({
  squire: 'Slow to react, and makes mistakes.',
  knight: 'A steady rival.',
  champion: 'Times its guard, punishes openings, leads its spells.',
  spellblade: 'The Spellblade as he fights at his best. No extra health, no cheating.',
});
function showSoloRival() {
  const chosen = menuController.botSkill();
  for (const chip of soloRival.querySelectorAll('[data-skill]')) {
    const on = chip.dataset.skill === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
  $('#solo-rival-note').textContent = RIVAL_NOTES[chosen] ?? '';
}
soloRival.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-skill]');
  if (!chip) return;
  menuController.chooseBotSkill(chip.dataset.skill);
  showSoloRival();
});
showSoloRival();
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
// --- settings: every change reaches what it belongs to, at once ---
function applySettings() {
  sound.setLevels(soundLevels(settings));
  if (sound.levels.muted || sound.levels.effects === 0 || sound.levels.master === 0) {
    armoryFeedback.cancel();
    menuScene?.showSpell(router.current === SCREEN_IDS.ARMORY && renown?.section === 'kit' ? settings.get('loadout.spell') : null);
  }
  const view = viewOptions(settings);
  menuScene?.setPixelRatioCap(view.pixelRatioCap);
  menuScene?.setTourAllowed(tourAllowed());
  if (router.current === SCREEN_IDS.MAIN_MENU) menuScene?.setTouring(true);
  runtime?.configure({ view, input: inputOptions(settings) });
  screenTurn?.configure(turnOptions(settings));
  renderSoundToggles();
}
const settingsPanel = new SettingsPanel({
  root: $('#settings'),
  store: settings,
  registry,
  device: () => (touchUi ? 'touch' : 'desktop'),
});
settings.onChange((change) => {
  applySettings();
  if (change.id === 'loadout.ultimate') {
    armoryFeedback.cancel();
    if (router.current === SCREEN_IDS.ARMORY && renown?.section === 'kit') menuScene?.showSpell(settings.get('loadout.spell'));
    socket.loadout(settings.get('loadout.spell'), change.value, settings.get('loadout.preparedSpells'));
    renderArmory();
  }
  if (change.id === 'loadout.spell') {
    armoryFeedback.cancel();
    const prepared = normalizePreparedSpells(change.value, settings.get('loadout.preparedSpells'));
    if (JSON.stringify(prepared) !== JSON.stringify(settings.get('loadout.preparedSpells'))) settings.set('loadout.preparedSpells', prepared);
    socket.loadout(change.value, settings.get('loadout.ultimate'), prepared);
    renderArmory();
    if (router.current === SCREEN_IDS.ARMORY) menuScene?.showSpell(change.value);
  }
  if (change.id === 'loadout.preparedSpells') {
    socket.loadout(settings.get('loadout.spell'), settings.get('loadout.ultimate'), change.value);
    renderArmory();
  }
  // choosing to lie sideways (a tap, so motion access can be asked for): say which way to turn the phone
  if (change.id === 'display.orientation' && change.value === 'sideways') {
    screenTurn?.listenToMotion();
    showTurnToast();
  }
});
for (const button of document.querySelectorAll('[data-open-settings]')) {
  button.addEventListener('click', () => settingsPanel.open(button.dataset.openSettings || undefined));
}
// the credits and the voice library, from a quiet button in the settings' footer (over the settings; Done returns)
const creditsPanel = new CreditsPanel({ root: $('#credits'), voice });
// (answered at the document: a tap anywhere on the button, whatever the settings panel has redrawn round it)
document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-open-credits]')) creditsPanel.open();
});

renown = new RenownController({ socket, scene: () => menuScene, spell: () => settings.get('loadout.spell') });
const challenges = new ChallengesController({ link: socket, getProfile: () => renown.profile, root: $('#armory-challenges'), rewardRoot: $('#challenges-reward') });
$('#end-armory').addEventListener('click', () => {
  const showArmory = () => {
    runtime?.setPlaying(false);
    latestSnapshot = null;
    latestLobby = null;
    currentRoomState = null;
    renderArmory();
    route(SCREEN_IDS.ARMORY);
  };
  if (socket.playingLocally || socket.status !== 'online') {
    socket.leaveRoom();
    showArmory();
  } else {
    const unsubscribe = socket.on('left', () => { unsubscribe(); showArmory(); });
    socket.leaveRoom();
  }
});

// --- the Armory: the Spellblade's kit (for now the blade, and the spell carried into a fight) ---
function renderArmory() {
  const focusSpell = document.activeElement?.dataset?.spell;
  const focusUltimate = document.activeElement?.dataset?.ultimate;
  const view = armoryView(settings.get('loadout.spell'), settings.get('loadout.ultimate'));
  $('#armory-equipped').textContent = `${({ fireball: 'Fireball', frostfire: 'Frostfire', gale: 'Gale', steel: 'Steel' })[settings.get('loadout.spell')]} · ${ULTIMATES[settings.get('loadout.ultimate')]?.short ?? 'Sunder'}`;
  $('#armory-blade-name').textContent = view.blade.name;
  $('#armory-blade-facts').textContent = view.blade.facts;
  $('#armory-spells').innerHTML = view.spells.map((spell) => `<button type="button" class="spell-card${spell.equipped ? ' equipped' : ''}" role="radio" aria-checked="${spell.equipped}" data-spell="${spell.id}">
    <span class="spell-mark">${spell.mark}</span><span class="spell-name">${escapeHtml(spell.name)}</span>${spell.equipped ? '<i>EQUIPPED</i>' : ''}
    <small>${escapeHtml(spell.line)}</small><em>${escapeHtml(spell.facts)}</em></button>`).join('');
  $('#armory-ultimates').innerHTML = view.ultimates.map((u) => `<button type="button" class="spell-card ultimate-card${u.equipped ? ' equipped' : ''}" role="radio" aria-checked="${u.equipped}" data-ultimate="${u.id}">
    <span class="spell-mark">${u.mark}</span><span class="spell-name">${escapeHtml(u.name)}</span>${u.equipped ? '<i>EQUIPPED</i>' : ''}
    <small>${escapeHtml(u.line)}</small><em>${escapeHtml(u.facts)}</em></button>`).join('');
  renderPreparedArmory();
  if (focusSpell) document.querySelector(`[data-spell="${focusSpell}"]`)?.focus({ preventScroll: true });
  if (focusUltimate) document.querySelector(`[data-ultimate="${focusUltimate}"]`)?.focus({ preventScroll: true });
}
function renderPreparedArmory() {
  const root = $('#armory-prepared');
  const chivalry = settings.get('loadout.ultimate') === 'chivalry';
  root.classList.toggle('hidden', !chivalry);
  if (!chivalry) return;
  const starting = settings.get('loadout.spell');
  const prepared = normalizePreparedSpells(starting, settings.get('loadout.preparedSpells'));
  // the three slots as the Armory's own cards: the key, the spell's mark and name; the starting spell fixed (★), the
  // others changed one way or the other
  const change = (slot, to, way, label) => to ? `<button type="button" class="prepared-turn" data-prepared-slot="${slot.slot}" data-prepared-to="${to}" data-way="${way}" aria-label="Slot ${slot.key}: ${label} ${escapeHtml(SPELLS[to].label)}">${way === 'previous' ? '‹' : '›'}</button>` : '';
  root.innerHTML = '<p class="armory-slot">PREPARED SPELLS</p><p class="panel-copy">During Chivalry, tap Q to cast. Hold Q briefly to choose, then press 1, 2 or 3 (Q can be let go first). The starting spell is marked ★.</p>'
    + '<div class="prepared-slots">' + preparedArmoryView(starting, prepared).map((slot) => `<div class="prepared-slot spell-card${slot.starting ? ' equipped' : ''}" data-spell="${slot.id}">
      <kbd>${slot.key}</kbd><span class="spell-mark">${slot.mark}</span><span class="spell-name">${escapeHtml(slot.name)}</span>
      ${slot.starting ? '<i>★ STARTING</i>' : `<span class="prepared-turns">${change(slot, slot.previous, 'previous', 'change to')}${change(slot, slot.next, 'next', 'change to')}</span>`}</div>`).join('') + '</div>';
}
$('#armory-prepared').addEventListener('click', event => {
  const button = event.target.closest('[data-prepared-to]');
  if (!button) return;
  const slot = Number(button.dataset.preparedSlot);
  const to = button.dataset.preparedTo;
  // (a deliberate press: the spell is heard and shown, as any Armory card is; the starting spell stays equipped)
  armoryFeedback.select(to, to, () => {});
  settings.set('loadout.preparedSpells', replacePreparedSpell(settings.get('loadout.spell'), settings.get('loadout.preparedSpells'), slot, to));
  document.querySelector(`[data-prepared-slot="${slot}"][data-way="${button.dataset.way}"]`)?.focus({ preventScroll: true });
});
renderArmory();
$('#armory-ultimates').addEventListener('click', (event) => {
  const card = event.target.closest('[data-ultimate]');
  if (card) armoryFeedback.select(card.dataset.ultimate, settings.get('loadout.ultimate'), (id) => settings.set('loadout.ultimate', id));
});
$('#armory-button').addEventListener('click', () => {
  renderArmory();
  route(SCREEN_IDS.ARMORY);
});
for (const id of ['armory-kit-tab', 'armory-heraldry-tab', 'armory-challenges-tab']) $('#'+id).addEventListener('click', () => {
  armoryFeedback.cancel();
  menuScene?.showSpell(id === 'armory-kit-tab' ? settings.get('loadout.spell') : null);
});
$('#armory-back').addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
$('#armory-spells').addEventListener('click', (event) => {
  const card = event.target.closest('[data-spell]');
  if (card) armoryFeedback.select(card.dataset.spell, settings.get('loadout.spell'), (id) => settings.set('loadout.spell', id));
});

// the sound and music switches (M and N unless rebound; the same switches sit in the arena menu for touch screens)
function renderSoundToggles() {
  const muted = settings.get('audio.muted');
  const musicOff = settings.get('audio.musicMuted');
  for (const button of document.querySelectorAll('[data-toggle-sound]')) {
    button.textContent = muted ? 'SOUND · OFF' : 'SOUND · ON';
    button.setAttribute('aria-pressed', String(!muted));
  }
  for (const button of document.querySelectorAll('[data-toggle-music]')) {
    button.textContent = musicOff ? 'MUSIC · OFF' : 'MUSIC · ON';
    button.setAttribute('aria-pressed', String(!musicOff));
    button.disabled = muted;
  }
}
renderSoundToggles();
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.target?.tagName === 'INPUT') return;
  const action = settings.actionFor(event.code);
  if (action === 'toggleSound') hud.flashText(settings.toggle('audio.muted') ? 'SOUND OFF' : 'SOUND ON', 'ready', 900);
  if (action === 'toggleMusic') hud.flashText(settings.toggle('audio.musicMuted') ? 'MUSIC OFF' : 'MUSIC ON', 'ready', 900);
});
for (const button of document.querySelectorAll('[data-toggle-sound]')) button.addEventListener('click', () => settings.toggle('audio.muted'));
for (const button of document.querySelectorAll('[data-toggle-music]')) button.addEventListener('click', () => settings.toggle('audio.musicMuted'));

// --- lying sideways on a phone app that will not turn ---
const turnToast = $('#turn-toast');
let turnToastTimer = null;
function showTurnToast() {
  if (!screenTurn?.turned) return;
  turnToast.classList.remove('hidden');
  clearTimeout(turnToastTimer);
  turnToastTimer = setTimeout(() => turnToast.classList.add('hidden'), 8000);
}
// the side the phone was turned to (by its motion sensors, or the flip) is remembered like any setting
screenTurn?.onChange(({ side }) => {
  if (settings.get('display.turnSide') !== side) settings.set('display.turnSide', side);
});
$('#rotate-sideways').addEventListener('click', () => {
  // the game lies down at once; if the app turns for real after all, it stands back up
  settings.set('display.orientation', 'sideways');
  screenTurn?.goSideways().then((how) => { if (how === 'locked') settings.set('display.orientation', 'auto'); });
});
$('#turn-flip').addEventListener('click', () => {
  screenTurn?.flip();
  screenTurn?.listenToMotion();
  showTurnToast();
});
for (const button of document.querySelectorAll('[data-turn-flip]')) {
  button.addEventListener('click', () => {
    screenTurn?.flip();
    screenTurn?.listenToMotion();
  });
}
// Armory item cards own their identity cue; opening the Armory stays silent.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled || button.closest('.touch-controls')
    || button.matches('[data-spell], [data-ultimate], #armory-button')) return;
  const back = button.classList.contains('back-button') || /leave|cancel|back/.test(button.id);
  const variant = back ? 'back' : button.classList.contains('primary-command') ? 'confirm' : 'press';
  sound.play(uiClankRecipe(Math.random, { variant }), { bus: 'ui' });
}, { capture: true });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.repeat) return;
  if (creditsPanel.isOpen) {
    creditsPanel.close();
    return;
  }
  if (settingsPanel.isOpen) {
    settingsPanel.close();
    return;
  }
  if ([SCREEN_IDS.SOLO_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY, SCREEN_IDS.ARMORY].includes(router.current)) {
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
$('#practice-sorcery').addEventListener('click', () => socket.practiceSpawnDummy('SORCERY'));
$('#practice-melee').addEventListener('click', () => socket.practiceSpawnDummy('MELEE'));
$('#practice-runner').addEventListener('click', () => socket.practiceSpawnDummy('RUNNER'));
$('#practice-ultimate-knight').addEventListener('click', () => socket.practiceSpawnDummy('ULTIMATE_KNIGHT'));
$('#practice-remove').addEventListener('click', () => socket.practiceRemoveDummy());
// the yard earns no prowess: this readies the ultimate to try
$('#practice-ultimate').addEventListener('click', () => socket.practiceReadyUltimate());
$('#practice-leave').addEventListener('click', () => clearSessionAndNavigate());

// into a fight: the blade comes out of its scabbard (once per room: not again on a reconnect to the same one)
let drawnFor = null;
socket.on('joined', (message) => {
  showMenuError('');
  ensureRuntime();
  if (drawnFor !== message.roomCode) {
    drawnFor = message.roomCode;
    sound.play(unsheatheRecipe(), { gain: 0.95 });
  }
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

// --- the multiplayer server's state, on the front door: online play waits for it, solo play never does ---
const linkStatus = $('#link-status');
const ONLINE_COMMANDS = ['#quick-play', '#private-button'];
const seekDuelCopy = $('#seek-duel small');
const SEEK_COPY = seekDuelCopy?.textContent ?? '';
function renderLinkStatus(status) {
  const view = linkStatusView(status);
  linkStatus.classList.toggle('hidden', !view.title);
  linkStatus.classList.toggle('offline', view.tone === 'offline');
  linkStatus.querySelector('.link-title').textContent = view.title;
  linkStatus.querySelector('.link-note').textContent = view.note;
  linkStatus.title = view.detail;
  for (const selector of ONLINE_COMMANDS) $(selector)?.classList.toggle('needs-server', !view.online);
  if (seekDuelCopy) seekDuelCopy.textContent = view.online ? SEEK_COPY : 'Fight a Reanimated Armor instead (bot)';
}
// the herald's banner, when the server answers after keeping everyone waiting
const heraldToast = $('#herald-toast');
let heraldTimer = null;
function announceChallengers() {
  heraldToast.querySelector('b').textContent = LINK_RESTORED.title;
  heraldToast.querySelector('small').textContent = LINK_RESTORED.note;
  heraldToast.classList.remove('hidden', 'leaving');
  // the challenger's call: drum, choir and the horn's D-A-D
  music.stinger('challenge', { gain: 0.75 });
  clearTimeout(heraldTimer);
  heraldTimer = setTimeout(() => {
    heraldToast.classList.add('leaving');
    heraldTimer = setTimeout(() => heraldToast.classList.add('hidden'), 500);
  }, 5200);
}
socket.on('status', ({ status, was }) => {
  renderLinkStatus(status);
  if (status !== 'online' || !(was === 'offline' || was === 'waking')) return;
  // back mid-match: nobody is pulled out, the word comes over the fight; the next choice simply goes online
  if (runtime && router.current === null) hud.flashText(LINK_RESTORED.title, 'ready', 2400);
  else announceChallengers();
});
socket.on('notice', ({ text }) => hud.flashText(text.toUpperCase(), 'danger', 2600));
renderLinkStatus(socket.status);
$('#link-retry').addEventListener('click', () => socket.retryNow());
for (const selector of ONLINE_COMMANDS) {
  // these need other people, and so the server: held back (before their own handlers) until it answers
  $(selector)?.addEventListener('click', (event) => {
    if (socket.status === 'online') return;
    event.stopImmediatePropagation();
    showMenuError('That needs the multiplayer server. Solo play works now.');
  }, { capture: true });
}

socket.on('connection', ({ connected }) => {
  // every connection carries the Armory's spell (the server keeps it for the rooms this connection joins)
  if (connected) socket.loadout(settings.get('loadout.spell'), settings.get('loadout.ultimate'), settings.get('loadout.preparedSpells'));
  if (!connected && runtime) hud.flashText('RECONNECTING…', 'danger');
});

route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);

// reach for the server (resuming a session if there was one); solo play is open whether or not it answers, and a
// solo mode asked for in the address starts as soon as it is clear the server is there, napping or gone
const hadSession = Boolean(socket.token);
const reached = await Promise.race([
  socket.connect(),
  new Promise((resolve) => {
    const off = socket.on('status', ({ status }) => {
      if (status === 'connecting') return;
      off();
      resolve(status === 'online');
    });
  }),
]);
if (!(reached && hadSession) && autoSolo === 'BOT_DUEL' && nameInput.value) {
  runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU);
} else if (!(reached && hadSession) && autoSolo === 'PRACTICE' && nameInput.value) {
  runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU);
} else if (reached && hadSession) {
  setTimeout(() => {
    if (!socket.playerId) route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);
  }, 500);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
