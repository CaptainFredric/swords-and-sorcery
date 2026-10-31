import { stableLobbyMarkup, lobbyControls, arenaOptions } from './menu/lobbyControls.mjs';
import { TutorialSession } from './tutorial/TutorialSession.mjs';
import { TutorialView } from './tutorial/TutorialView.mjs';
import { TutorialProgress } from './tutorial/TutorialProgress.mjs';
import { TutorialOpening } from './tutorial/TutorialOpening.mjs';
import { TutorialVoice } from './tutorial/tutorialVoice.mjs';
import { TutorialLookGuide } from './tutorial/TutorialLookGuide.mjs';
import { TutorialEquipment } from './tutorial/TutorialEquipment.mjs';
import { tutorialTranscript } from './tutorial/tutorialTranscript.mjs';
import { tutorialVoiceOptions } from './tutorial/tutorialRecordings.mjs';
import { TUTORIAL_BEATS } from './tutorial/tutorialScript.mjs';
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
import { fightPieceFor, PIECES } from './game/sound/music/score.mjs';
import { VoiceBank } from './game/sound/VoiceBank.mjs';
import { linesFor } from './game/sound/voiceLines.mjs';
import { recordMatchResult } from './game/sound/matchStreak.mjs';
import { captionPlan } from './ui/voiceLibrary.mjs';
import { MenuCaption } from './menu/menuCaption.mjs';
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
import { MenuPresentation, PRESENTATION } from './menu/menuPresentation.mjs';
import { HeraldPanel } from './ui/HeraldPanel.mjs';
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
const breakthroughMenu = $('#breakthrough-menu');
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
// what he says of a lost match, written out on the defeat screen itself (the arena's HUD, and its subtitle, are put away
// as the screen comes up): beat by beat as he says it, never a word before it is said (Settings: Subtitles)
const endCaption = new MenuCaption(endScreen, { place: 'end-caption' });

// --- the front door's two forms (menuPresentation.mjs): the banner up, or drawn aside so the yard has the screen ---
// (only ever a way of showing the same front door: the Spellblade's round goes on exactly as it was either way)
const nowSec = () => performance.now() / 1000;
const yardWatch = $('[data-yard-watch]');
const yardObserve = $('[data-yard-observe]');
const yardShow = $('[data-yard-show]');
const yardInscription = $('[data-yard-inscription]');
const menuBanner = $('#menu .banner-panel');
const heraldTab = $('#menu .herald-tab');
const lessMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
// a device with only a finger to point with: the banner never yields on its own there (no reliable way to tell a
// player watching from a phone set down), only when asked
const fingerOnly = () => Boolean(globalThis.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches);
let heraldPanel = null;
let inscribedAt = -Infinity;
let stillTimer = null;
const presentation = new MenuPresentation({ now: nowSec(), onChange: (state, previous, cause) => presentYard(state, previous, cause) });

function presentYard(state, previous, cause) {
  const observing = state !== PRESENTATION.COMMAND;
  menu.classList.toggle('withdrawn', observing);
  menuWorld.classList.toggle('observing', observing);
  document.body.classList.toggle('observing', observing);
  // (the banner drawn aside can be neither reached nor read by anything: not a click, not Tab, not a screen reader)
  menuBanner.inert = observing;
  heraldTab.inert = observing;
  $('#armory-button').inert = observing;
  if (observing) heraldPanel?.close({ restore: false });
  yardWatch.hidden = observing;
  yardObserve.hidden = !observing;
  menuScene?.setPresentation(observing, { immediate: cause === 'reset' });
  // the pointer: out of the picture at once when the yard was yielded to; when asked for, once it has been still
  clearTimeout(stillTimer);
  document.body.classList.toggle('yard-still', state === PRESENTATION.OBSERVE_IDLE);
  if (state === PRESENTATION.OBSERVE_MANUAL) settleCursor();
  // a breath of an inscription over the opened yard (not every time it is opened in quick succession)
  yardInscription.classList.remove('show');
  if (observing && nowSec() - inscribedAt > 60 && !lessMotion()) {
    inscribedAt = nowSec();
    void yardInscription.offsetWidth;
    yardInscription.classList.add('show');
  }
  // the hand that pressed one control finds the one that took its place
  if (cause === 'manual') (observing ? yardShow : yardWatch).focus({ preventScroll: true });
}

// WATCH THE YARD says truthfully what there is to watch: his round, or (when it does not run) him at his place, and why
function noteYard() {
  const note = $('#watch-yard-note');
  if (!note) return;
  note.textContent = tourAllowed() ? 'Draw the banner aside' : lessMotion() ? 'His round rests for reduced motion' : 'His round runs on Balanced or Sharp';
}

function settleCursor() {
  clearTimeout(stillTimer);
  document.body.classList.remove('yard-still');
  if (presentation.state === PRESENTATION.OBSERVE_MANUAL) stillTimer = setTimeout(() => document.body.classList.add('yard-still'), 2500);
}

// what the player does, as the presentation counts it: a real movement, a press, a key, the wheel; the page seen again.
// Woken from the yard by a press or a key, that press or key does nothing else (never the button under the pointer)
let pointerAt = null;
let swallowClick = false;
function yardActivity(event, kind) {
  let moved = 0;
  if (kind === 'pointer') {
    const point = { x: event.clientX, y: event.clientY };
    moved = pointerAt ? Math.hypot(point.x - pointerAt.x, point.y - pointerAt.y) : 0;
    pointerAt = point;
  }
  const { swallow } = presentation.activity(nowSec(), { kind, moved });
  if (swallow) {
    event.preventDefault();
    event.stopPropagation();
    if (kind !== 'key') {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 700);
    }
  }
  if (kind === 'pointer' && presentation.state === PRESENTATION.OBSERVE_MANUAL) settleCursor();
}
addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') yardActivity(event, 'pointer'); }, { capture: true, passive: true });
addEventListener('pointerdown', (event) => yardActivity(event, event.pointerType === 'touch' ? 'touch' : 'press'), { capture: true });
addEventListener('keydown', (event) => yardActivity(event, 'key'), { capture: true });
addEventListener('wheel', (event) => yardActivity(event, 'wheel'), { capture: true, passive: true });
addEventListener('click', (event) => {
  if (!swallowClick) return;
  swallowClick = false;
  event.preventDefault();
  event.stopPropagation();
}, { capture: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) presentation.activity(nowSec(), { kind: 'visible' }); });
yardWatch.addEventListener('click', () => presentation.observe());
yardShow.addEventListener('click', () => presentation.showMenu(nowSec()));

// whether the banner may yield to the yard on its own just now: the front door up and its round running, nothing open
// or being typed into or navigated by keyboard, nothing waiting on the player, the page seen, a pointer to wake it with
function yardMayIdle() {
  if (!veilLifted || router.current !== SCREEN_IDS.MAIN_MENU || document.hidden) return false;
  if (!menuScene?.touring || touchUi || fingerOnly() || lessMotion()) return false;
  if (settingsPanel.isOpen || creditsPanel.isOpen || heraldPanel?.isOpen) return false;
  if (seekStatus?.active || !challengeCard.classList.contains('hidden') || !arenaGate.classList.contains('hidden')) return false;
  if (menuErrors.some((element) => element.textContent.trim())) return false;
  const focused = document.activeElement;
  if (focused && focused !== document.body) {
    if (focused.matches('input, textarea, select, [contenteditable="true"]')) return false;
    if (focused.matches(':focus-visible')) return false;
  }
  return true;
}
setInterval(() => presentation.tick(nowSec(), yardMayIdle()), 1000);
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

const menuOptions = $('#menu-options');
const menuMore = $('#menu-more');
function updateMenuScrollCue() {
  menuMore.hidden = menuOptions.clientHeight === 0 || menuOptions.scrollHeight - menuOptions.clientHeight - menuOptions.scrollTop < 12;
}
menuOptions.addEventListener('scroll', updateMenuScrollCue, { passive: true });
const menuScrollObserver = new ResizeObserver(updateMenuScrollCue);
for (const element of [menuOptions, $('#menu .game-brand'), $('#menu .command-rail')]) menuScrollObserver.observe(element);
menuMore.addEventListener('click', () => menuOptions.scrollBy({
  top: menuOptions.clientHeight * 0.65,
  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
}));

const hud = new HUD();
// one sound engine for the whole page; it unlocks on the first click or key press. Around it: the wind and bell of
// the courtyard, the music, and the Spellblade's voice.
const sound = new SoundEngine();
const armoryFeedback = createArmorySelection({
  // (an ultimate performed on the model brings its own sounds, in time with it, in place of the card's cue)
  play: (id) => (menuScene?.performs(id) ? null : playArmorySound(sound, id)),
  preview: (id) => menuScene?.previewArmory(id),
  restore: () => menuScene?.showSpell(router.current === SCREEN_IDS.ARMORY ? settings.get('loadout.spell') : null),
});
// the player's settings, saved in this browser (see settings/settingsRegistry.mjs for what exists and how to add more)
// (a phone or tablet starts on its own defaults: Balanced quality)
const settings = new SettingsStore({ registry, device: isTouchPrimary() ? 'touch' : 'desktop' });
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
  [SCREEN_IDS.BREAKTHROUGH_MENU]: breakthroughMenu,
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
const tutorialProgress = new TutorialProgress();
const tutorialOffer = $('#tutorial-onboarding');
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
  offerTutorial();
}
// never keep the menu hostage: lift after a while even on a very slow connection
setTimeout(liftVeil, 12000);

// start both character downloads at once; the menu, the first-person arms and opponents then share them
preloadSpellbladeAssets().catch(() => {});

let menuScene = null;
let renown = null;
try {
  menuScene = new MenuScene(menuSpellblade, { onReady: () => setTimeout(liftVeil, 250), sound, voice, banner: $('#menu .banner-panel'), armoryPanel: $('#armory-menu .banner-panel') });
  menuScene.setTourAllowed(tourAllowed());
} catch (error) {
  console.warn('Spellblade menu preview unavailable:', error);
  menuSpellblade.classList.add('menu-scene-unavailable');
  liftVeil();
}
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.__ssMenu = menuScene;
  globalThis.__ssYard = presentation;
}
menuScene?.setPixelRatioCap(viewOptions(settings).pixelRatioCap);
menuScene?.setParticleDensity(viewOptions(settings).particles);
menuScene?.setSubtitles(viewOptions(settings).subtitles);
endCaption.setEnabled(viewOptions(settings).subtitles);

let runtime = null;
let tutorialSession = null;
// (what the Spellblade has out: both arms come in with the lesson's lines; out everywhere else)
const tutorialEquipment = new TutorialEquipment({ session: () => tutorialSession });
const tutorialLookGuide = new TutorialLookGuide({ session: () => tutorialSession,
  rival: () => tutorialSession?.host.room.players.get(tutorialSession.rivalId), player: () => tutorialSession?.host.player });
// Tutorial 1's recorded voices: the list of takes and the first line's take are fetched and decoded as soon as the
// sound is up (at the menu, long before the tutorial's world is being built: the opening never waits on them); the
// rest decode when the tutorial starts, and stay decoded
let tutorialVoice = null;
let touchUi = false;
const FIRST_TUTORIAL_TAKE = TUTORIAL_BEATS.find(beat => beat.recordingKey)?.recordingKey;
sound.onReady(() => {
  tutorialVoice ??= new TutorialVoice({ engine: sound, context: () => ({ touch: touchUi }) });
  tutorialVoice.warm(FIRST_TUTORIAL_TAKE).catch(() => {});
});
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
  return [SCREEN_IDS.MAIN_MENU, SCREEN_IDS.SOLO_MENU, SCREEN_IDS.BREAKTHROUGH_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY, SCREEN_IDS.LOBBY, SCREEN_IDS.ARMORY].includes(screenId);
}

// the Spellblade's round behind the front door: for capable settings, and not for anyone who asked for less motion
function tourAllowed() {
  return viewOptions(settings).pixelRatioCap > 1.1 && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function route(screenId) {
  armoryFeedback.cancel();
  renown?.route(screenId);
  const previous = router.current;
  // every screen change finds the front door with its banner up (back from a match too), the Herald folded away
  presentation.reset(nowSec());
  heraldPanel?.close({ restore: false });
  if (screenId === SCREEN_IDS.PLAYING) router.hideAll();
  else router.show(screenId);
  const menuBacked = isMenuBackedScreen(screenId);
  menuWorld.classList.toggle('hidden', !menuBacked);
  menuScene?.setVisible(menuBacked);
  // on the front door he is out on his round; every other screen finds him at his place
  menuScene?.setTouring(screenId === SCREEN_IDS.MAIN_MENU);
  menuScene?.setBreakthroughPresentation(screenId === SCREEN_IDS.BREAKTHROUGH_MENU, { immediate: previous !== screenId });
  if (menuBacked && previous !== screenId) {
    menuScene?.resetCanonicalHeroState({ immediate: true });
  }
  // the camera glides to each screen's shot (the veil's establishing shot is started when it lifts)
  if (menuBacked && veilLifted && previous !== screenId) menuScene?.setShot(screenId);
  // leaving any menu screen for a match in progress opens the gate (a duel's countdown opens it at the start)
  if (screenId === SCREEN_IDS.PLAYING && previous !== null && currentRoomState === 'PLAYING') openArenaGate(latestSnapshot ?? latestLobby ?? {});
  renderSeek();
  syncSoundscape();
  // in the Armory he holds the chosen spell up in his palm (and its cards' sounds are made ready for the first press)
  menuScene?.showSpell(screenId === SCREEN_IDS.ARMORY ? settings.get('loadout.spell') : null);
  if (screenId === SCREEN_IDS.ARMORY) loadArmoryCues(sound);
  $('.turn-hint')?.classList.toggle('hidden', screenId === SCREEN_IDS.MAIN_MENU && tourAllowed());
  noteYard();
  if (screenId === SCREEN_IDS.MAIN_MENU) requestAnimationFrame(updateMenuScrollCue);
}

// what you hear follows where you are: the courtyard and the hall theme in the menus, the battle theme in a match
// (hotter as the fighting gets closer), silence for the stingers of a challenge and a match's end
function syncSoundscape() {
  const screen = router.current;
  const inArena = screen === null;
  const soundtrack = settings.get('audio.soundtrack');
  const overridePiece = (soundtrack && soundtrack !== 'adaptive' && PIECES[soundtrack]) ? soundtrack : null;

  if (!challengeCard.classList.contains('hidden')) {
    music.play(null);
    ambience.setScene(inArena ? 'arena' : 'menu');
  } else if (inArena) {
    ambience.setScene('arena');
    const fighting = latestSnapshot?.roomState === 'PLAYING';
    const piece = fighting ? (overridePiece ?? fightPieceFor(latestSnapshot)) : (overridePiece ?? null);
    music.play(piece);
    if ((fighting || overridePiece) && runtime) {
      music.setIntensity(runtime.musicHeat({ cap: latestSnapshot?.mode === 'PRACTICE' ? 1 : 2 }));
    }
  } else if (screen === SCREEN_IDS.END_SCREEN) {
    ambience.setScene('arena');
    music.play(null);
  } else if (isMenuBackedScreen(screen)) {
    ambience.setScene('menu');
    music.play(overridePiece ?? 'hall');
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
  const copy = challengeCopy({ mode: message.mode, players: message.players ?? [], localId: socket.playerId, worldId: message.worldId, scoreToWin: message.scoreToWin, teamSize: message.teamSize ?? 3 });
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
function openArenaGate(info, force = false) {
  // once per opening (a countdown ending and the route change can both ask for it)
  if (!force && performance.now() - gateOpenedAt < 1500) return;
  gateOpenedAt = performance.now();
  if (tutorialSession) tutorialOpening.begin();
  const myTeam = (info.players ?? latestSnapshot?.players ?? latestLobby?.players ?? []).find((p) => p.id === socket.playerId)?.team ?? null;
  const copy = tutorialSession ? { title: 'GREENER PASTURES', sub: 'TUTORIAL 1' }
    : arenaGateCopy({ mode: info.mode, worldId: info.worldId, scoreToWin: info.scoreToWin, team: myTeam, teamSize: info.teamSize ?? 3 });
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
  tutorialTouchControls();
}
// (the touch controls may be made after the tutorial's first word: whatever it has not taught yet is absent from the start)
function tutorialTouchControls() {
  if (tutorialSession?.director.state === 'running') revealTutorialControls(tutorialSession.taught);
}
if (isTouchPrimary()) useTouchUi();
addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') useTouchUi(); }, { capture: true, passive: true });
$('#rotate-dismiss').addEventListener('click', () => document.body.classList.add('portrait-ok'));

function ensureRuntime() {
  if (!runtime) {
    runtime = new GameRuntime($('#game-canvas'), socket, hud, { sound, voice: tutorialSession ? null : voice, music });
    if (new URLSearchParams(location.search).has('debug')) globalThis.__ssRuntime = runtime;
    runtime.configure({ view: viewOptions(settings), input: inputOptions(settings) });
    runtime.getTutorialSession = () => tutorialSession;
    if (tutorialSession) {
      runtime.input.allowAction = (action, notify = true) => {
        if (tutorialSession?.director.state === 'running' && runtime?.weapon) {
          if (action === 'attack' && runtime.weapon.equipment.sword === 'away') return false;
          if (action === 'spell' && runtime.weapon.equipment.hand === 'away') return false;
        }
        return tutorialSession?.allows(action, notify) ?? true;
      };
      runtime.weapon.setEquipment({ sword: false, hand: false });
    }
    // (a tutorial line may turn the Spellblade's head toward something: "Oh dear..." toward Rival running off)
    runtime.viewGuide = (dt, input) => tutorialLookGuide.step(dt, input);
    runtime.weapon.guide = (dt, weapon) => {
      const prevSword = weapon.equipment.sword, prevHand = weapon.equipment.hand;
      tutorialEquipment.step(dt, weapon);
      if (tutorialSession?.director.state === 'running' &&
          (prevSword !== weapon.equipment.sword || prevHand !== weapon.equipment.hand)) {
        revealTutorialControls(tutorialSession.taught);
      }
    };
    const baseOnEquip = runtime.weapon.onEquip;
    runtime.weapon.onEquip = (what, options) => {
      baseOnEquip?.(what, options);
      if (tutorialSession?.director.state === 'running') {
        revealTutorialControls(tutorialSession.taught);
      }
    };
    if (touchUi) { runtime.enableTouch(); tutorialTouchControls(); }
    runtime.onPointer = (locked) => {
      const mode = latestLobby?.mode ?? latestSnapshot?.mode;
      if (mode === 'BOT_DUEL') socket.arenaReady(locked);
      if (locked) { paused = false; pauseMenu.classList.add('hidden'); }
    };
  }
  runtime.setPlayerId(socket.inspectionActorId??socket.playerId);
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
  stableLobbyMarkup(lobbyPlayers, view.players.map((player) => `<div class="lobby-player${player.you ? ' you' : ''}${player.ready ? ' ready' : ''}"><span class="player-rune">${player.rune}</span><b>${escapeHtml(player.name)}</b><em>${player.status}</em></div>`).join(''));
  startMatchButton.classList.toggle('hidden', !view.ready.visible);
  startMatchButton.classList.toggle('pressed', view.ready.pressed);
  startMatchButton.textContent = view.ready.label;
  startMatchButton.disabled = view.ready.disabled;
  const switchTeamBtn = $('#switch-team');
  if (switchTeamBtn) {
    const canSwitch = message.mode === 'BREAKTHROUGH' && message.roomState === 'WAITING';
    switchTeamBtn.classList.toggle('hidden', !canSwitch);
    const meInLobby = (message.players ?? []).find((p) => p.id === socket.playerId);
    switchTeamBtn.textContent = meInLobby?.team === 'DEFENDERS' ? 'SWITCH TO ATTACKERS' : 'SWITCH TO DEFENDERS';
  }
  copyLinkButton.classList.toggle('hidden', !view.action.visible);
  copyLinkButton.classList.toggle('primary-command', view.action.primary);
  copyLinkButton.disabled = view.action.disabled;
  if (!copyLinkButton.dataset.flash) copyLinkButton.textContent = view.action.label;
  stableLobbyMarkup(lobbyVotes, (message.isPrivate === true ? [] : view.votes).map((row) => `<div class="vote-row"><span>${row.label}</span>${row.options.map((option) => `<button class="vote-chip${option.chosen ? ' chosen' : ''}${option.mine ? ' mine' : ''}" data-key="${row.key}" data-value="${escapeHtml(String(option.value))}">${escapeHtml(String(option.label))}<b class="tally" data-count="${option.count}" aria-label="${option.count} ${option.count === 1 ? 'vote' : 'votes'}">${option.count}</b></button>`).join('')}</div>`).join(''));
  stableLobbyMarkup($('#lobby-settings'), lobbyControls(message, socket.playerId));
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
  const value = key === 'world' ? chip.dataset.value : Number(chip.dataset.value);
  myVotes = { ...myVotes, [key]: value };
  socket.vote(key, value);
  renderLobby();
});

$('#lobby-settings').addEventListener('change', event => {
  if (event.target.name !== 'mode') return;
  const form=event.target.form,team=event.target.value==='BREAKTHROUGH';
  form.elements.worldId.innerHTML=arenaOptions(event.target.value,null);
  form.querySelector('[data-score-field]').hidden=team;
  form.querySelector('[data-team-field]').hidden=!team;
});
$('#lobby-settings').addEventListener('submit', event => {
  event.preventDefault();
  const form=event.target;
  $('#lobby-error').textContent='';
  if(form.classList.contains('lobby-swap')) {
    socket.send({type:'swapPlayers',firstId:form.elements.firstId.value,secondId:form.elements.secondId.value});
    return;
  }
  const minutes=Number(form.elements.minutes.value),score=Number(form.elements.scoreToWin.value);
  const mode=form.elements.mode?.value??latestLobby.mode;
  if(!form.elements.minutes.value||!Number.isFinite(minutes)||minutes<1||minutes>30 || (mode==='FFA'&&(!Number.isInteger(score)||score<1||score>100))) {
    $('#lobby-error').textContent='Choose 1 to 100 kills and a match time from 1 to 30 minutes.';
    return;
  }
  if(latestLobby.isPrivate===true)socket.send({type:'configureRoom',settings:{mode,worldId:form.elements.worldId.value,matchSeconds:Math.round(minutes*60),...(mode==='FFA'?{scoreToWin:score}:{teamSize:Number(form.elements.teamSize.value)})}});
  else {
    myVotes.score=score;myVotes.time=Math.round(minutes*60);
    socket.vote('score',myVotes.score);socket.vote('time',myVotes.time);
    renderLobby();
  }
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
  const me = snapshot.players?.find((p) => p.id === socket.playerId);
  const won = snapshot.winnerTeam
    ? Boolean(me?.team && snapshot.winnerTeam === me.team)
    : snapshot.winnerId === socket.playerId;
  recordMatchResult({
    winnerId: won ? socket.playerId : snapshot.winnerId,
    players: snapshot.players,
    isScored: snapshot.mode !== 'PRACTICE' && !snapshot.tutorial,
  });
  music.stinger(won ? 'victory' : 'defeat');
  // the defeat made official: now and then, that he never thought this day would come; if not, the protest that he
  // is a knight (unless he just said so as he fell). A win is the stinger's (MIGHT MAKES... KNIGHT! is for force)
  if (won) return;
  for (const say of linesFor(socket.playerId, ['matchLost'])) {
    const said = voice.say(say.line, { speaker: say.speaker, gain: 0.85, delay: say.delay, chanceScale: say.chanceScale, close: true });
    if (!said) continue;
    const plan = captionPlan(say.line, { beats: said.beats });
    if (plan) endCaption.show({ text: plan.text, delay: said.delay + plan.after, seconds: Math.max(0.5, said.seconds - plan.after), cues: plan.cues });
    break;
  }
}

function updateEnd(snapshot) {
  soundTheEnd(snapshot);
  if (snapshot.mode === 'BREAKTHROUGH') {
    const me = snapshot.players.find((player) => player.id === socket.playerId);
    const won = Boolean(me?.team && snapshot.winnerTeam === me.team);
    winnerTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
    const heldObj = snapshot.objective?.name ?? 'the stronghold';
    const outcomeSummary = snapshot.winnerTeam === 'ATTACKERS'
      ? `ATTACKERS TRIUMPH · ${heldObj.toUpperCase()} HAS FALLEN`
      : `DEFENDERS STAND FAST · HELD ${heldObj.toUpperCase()}`;
    const roleSummary = me?.team === 'DEFENDERS' ? 'You fought for the Defenders' : 'You fought for the Attackers';
    const sorted = [...snapshot.players].sort((a, b) => (a.team === me?.team ? -1 : 1) - (b.team === me?.team ? -1 : 1) || b.kills - a.kills || a.deaths - b.deaths);
    finalBoard.innerHTML = `<div class="bt-end-summary"><strong>${escapeHtml(outcomeSummary)}</strong><small>${escapeHtml(roleSummary)}</small></div>`
      + sorted.map((player) => {
        const sideTag = player.team === 'DEFENDERS' ? 'DEF' : 'ATT';
        return `<div class="final-row ${player.id === socket.playerId ? 'you' : ''}"><span class="bt-side-tag ${player.team === 'DEFENDERS' ? 'def' : 'att'}">${sideTag}</span><b>${escapeHtml(player.name)}</b><strong>${player.kills} K</strong><em>${player.deaths} D</em><small>${player.parries} parries</small></div>`;
      }).join('');
    seekAnotherButton.classList.add('hidden');
    rematchButton.classList.remove('hidden');
    rematchButton.textContent = 'PLAY AGAIN';
    const humanCount = snapshot.players.filter((p) => p.actorKind === 'human').length;
    const battlefieldName = snapshot.worldId === 'outerworks' ? 'The Outerworks'
      : snapshot.worldId === 'blackbell-foundry' ? 'Blackbell Foundry' : 'Bastion Breach';
    rematchCopy.textContent = humanCount <= 1
      ? `Fight another round of Breakthrough at ${battlefieldName}.`
      : 'All remaining players vote to rematch in this room.';
    return;
  }
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  winnerTitle.textContent = winner?.id === socket.playerId ? 'VICTORY' : `${winner?.name ?? 'A SPELLBLADE'} WINS`;
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  finalBoard.innerHTML = sorted.map((player, index) => `<div class="final-row ${player.id === socket.playerId ? 'you' : ''}"><span>${index + 1}</span><b>${escapeHtml(player.name)}</b><strong>${player.kills} K</strong><em>${player.deaths} D</em><small>${player.parries} parries</small></div>`).join('');

  const duel = snapshot.mode === 'DUEL';
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

// Back to the front door, in place. The match is left (on purpose: its slot is freed at once, a duel forfeited now,
// not after the reconnect grace) and put away: the arena and its renderer, its listeners, its sounds and voices, its
// screens and overlays. Everything the page has loaded (the menu, its knight, the models, every sound and voice) stays
// loaded: no loading screen, no reload. then: what comes next, if anything (FIGHT AGAIN: another Bot Duel at once).
// (Whatever the old room still sends on its way out is ignored: leftRoom.)
let leftRoom = null;
function returnToMenu({ then = null } = {}) {
  localStorage.removeItem('ss-session-token');
  localStorage.removeItem('ss-room-code');
  leftRoom = socket.roomCode ?? latestSnapshot?.roomCode ?? latestLobby?.roomCode ?? null;
  socket.leaveRoom();
  putAwayMatch();
  route(SCREEN_IDS.MAIN_MENU);
  then?.();
}

function putAwayMatch() {
  const endingTutorial = tutorialSession;
  tutorialSession = null;
  tutorialOpening.stop();
  tutorialVoice?.stop();
  endingTutorial?.stop();
  tutorialView.hide();
  revealTutorialControls(null);
  paused = false;
  pauseMenu.classList.add('hidden');
  hideChallenge();
  clearTimeout(gateTimer);
  arenaGate.classList.add('hidden');
  hud.hide();
  setPracticeVisible(false);
  // (what anyone was saying stops: its caption with it)
  for (const speaker of [...(voice.playing?.keys?.() ?? [])]) voice.cut(speaker, 0.08);
  if (runtime) {
    runtime.setPlaying(false);
    runtime.dispose();
    runtime = null;
  }
  latestSnapshot = null;
  latestLobby = null;
  currentRoomState = null;
  lastRoomKey = null;
  seekStatus = null;
  drawnFor = null;
  renderSeek();
}

// a message from the room just left, still on its way: nothing of it is shown
function fromLeftRoom(message) {
  return leftRoom !== null && message?.roomCode === leftRoom;
}

function setPracticeVisible(visible) {
  if (tutorialSession) visible = false;
  practiceOverlay.classList.toggle('hidden', !visible);
  updateInspectionControls();
}

$('#seek-duel').addEventListener('click', () => runMenuAction(menuController.seekDuel(nameInput.value), SCREEN_IDS.MAIN_MENU));
$('#breakthrough-button')?.addEventListener('click', () => { showMenuError(''); route(SCREEN_IDS.BREAKTHROUGH_MENU); });
$('#breakthrough-back')?.addEventListener('click', () => route(SCREEN_IDS.MAIN_MENU));
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
const MENU_REACTIONS = { 'solo-button': 'salute', 'breakthrough-button': 'rally', 'seek-duel': 'rally', 'quick-play': 'rally', 'private-button': 'rally', 'armory-button': 'present', 'how-button': 'look' };
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

// --- Breakthrough setup controls -------------------------------------------------------------------------------
const breakthroughSize = $('#breakthrough-size');
function showBreakthroughSize() {
  if (!breakthroughSize) return;
  const chosen = menuController.breakthroughSize();
  for (const chip of breakthroughSize.querySelectorAll('[data-size]')) {
    const on = Number(chip.dataset.size) === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
}
breakthroughSize?.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-size]');
  if (!chip) return;
  menuController.chooseBreakthroughSize(Number(chip.dataset.size));
  showBreakthroughSize();
});
showBreakthroughSize();

const breakthroughArena = $('#breakthrough-arena');
const breakthroughSubtitle = $('#breakthrough-scenario-subtitle');
const breakthroughCopy = $('#breakthrough-panel-copy');
function showBreakthroughArena() {
  if (!breakthroughArena) return;
  const chosen = menuController.breakthroughArena();
  for (const chip of breakthroughArena.querySelectorAll('[data-arena]')) {
    const on = chip.dataset.arena === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
  if (breakthroughSubtitle) {
    breakthroughSubtitle.textContent = chosen === 'outerworks' ? 'THE OUTERWORKS'
      : chosen === 'blackbell-foundry' ? 'BLACKBELL FOUNDRY' : 'BASTION BREACH';
  }
  if (breakthroughCopy) {
    breakthroughCopy.textContent = chosen === 'outerworks'
      ? 'Advance through the Forward Redoubt and Barbican Gate. Attackers can operate the Bi-Bye-llista along the wide siege approach; infantry can flank through the Western Sally Trench.'
      : chosen === 'blackbell-foundry'
        ? 'A brutal clash across a medieval industrial foundry. Contest the Chain Winch yard, breach the blast portal, and assault the monumental Great Bell.'
        : 'Attackers have one So-Fist-ication ram on the approach. Break the reinforced timber barricade to open a direct assault lane, then capture the Outer Gate to enter the stronghold. Defenders can destroy the ram.';
  }
}
breakthroughArena?.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-arena]');
  if (!chip) return;
  menuController.chooseBreakthroughArena(chip.dataset.arena);
  showBreakthroughArena();
});
showBreakthroughArena();

const breakthroughTeam = $('#breakthrough-team');

function showBreakthroughTeam() {
  if (!breakthroughTeam) return;
  const chosen = menuController.breakthroughTeam();
  for (const chip of breakthroughTeam.querySelectorAll('[data-team]')) {
    const on = chip.dataset.team === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
}
breakthroughTeam?.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-team]');
  if (!chip) return;
  menuController.chooseBreakthroughTeam(chip.dataset.team);
  showBreakthroughTeam();
});
showBreakthroughTeam();

const breakthroughRival = $('#breakthrough-rival');
function showBreakthroughRival() {
  if (!breakthroughRival) return;
  const chosen = menuController.breakthroughSkill();
  for (const chip of breakthroughRival.querySelectorAll('[data-skill]')) {
    const on = chip.dataset.skill === chosen;
    chip.classList.toggle('mine', on);
    chip.setAttribute('aria-checked', String(on));
  }
  const noteEl = $('#breakthrough-rival-note');
  if (noteEl) noteEl.textContent = RIVAL_NOTES[chosen] ?? '';
}
breakthroughRival?.addEventListener('click', (event) => {
  const chip = event.target.closest?.('[data-skill]');
  if (!chip) return;
  menuController.chooseBreakthroughSkill(chip.dataset.skill);
  showBreakthroughRival();
});
showBreakthroughRival();
function offerTutorial() {
  if (!tutorialProgress.shouldOfferFirstRun({params:new URLSearchParams(location.search)})) return;
  tutorialOffer.hidden = false;
  $('[data-tutorial-begin]').focus();
}
function closeTutorialOffer() { tutorialOffer.hidden = true; }
$('[data-tutorial-onboarding-skip]').addEventListener('click', () => {
  tutorialProgress.recordSkipped(); closeTutorialOffer(); $('#solo-button')?.focus();
});
$('[data-tutorial-begin]').addEventListener('click', () => {
  closeTutorialOffer();
  if (!nameInput.value.trim()) nameFields.forEach(field=>{field.value='Spellblade';});
  startTutorial();
});
// The transcript: the asides heard (an aside is listed once it has been), the take being heard again, and the lesson
// paused while it is open (time stopped, the line being said stopped, and said again from its start on closing)
const tutorialHeardAsides = new Set();
let transcriptTake = null;
function stopTranscriptTake() { transcriptTake?.stop?.(0.05); transcriptTake = null; }
async function playTranscriptTake(line) {
  stopTranscriptTake();
  if (!tutorialVoice || !line.recordingKey || !sound.running || sound.muted) return;
  const buffer = await tutorialVoice.buffer(line.recordingKey);
  if (!buffer || !tutorialView.transcriptShown) return;
  stopTranscriptTake();
  transcriptTake = sound.playBuffer(buffer, tutorialVoiceOptions(line.speaker));
}
function pauseTutorialForTranscript(open) {
  if (!tutorialSession) return;
  if (open) {
    runtime?.input.releaseInputs();
    socket.local.setPaused(true);
    tutorialVoice?.stop();
  } else {
    stopTranscriptTake();
    socket.local.setPaused(false);
    tutorialVoice?.sync(tutorialSession.director);
  }
}
function restartTutorialFrom(chapter = null) {
  runtime?.input.releaseInputs(); tutorialVoice?.stop(); stopTranscriptTake(); tutorialHeardAsides.clear();
  socket.local.setPaused?.(false);
  tutorialEquipment.reset();
  if (!tutorialSession) return;
  if (!chapter || chapter === tutorialSession.route[0].chapter) {
    runtime?.weapon.setEquipment({ sword: false, hand: false });
    tutorialOpening.begin(); tutorialSession.restart();
    openArenaGate(latestSnapshot ?? {}, true);
  } else tutorialSession.beginChapter(chapter);
  if (runtime) {
    runtime.input.yaw = tutorialSession.host.player.yaw; runtime.input.pitch = 0;
    revealTutorialControls(tutorialSession.taught);
  }
}
const tutorialView = new TutorialView($('#tutorial-lesson'), {
  context: () => ({touch:touchUi,bindings:settings.allBindings()}),
  onBack: () => tutorialSession?.director.back(),
  canGoBack: () => (tutorialSession?.director.previousLine() ?? null) !== null,
  transcript: () => tutorialSession ? tutorialTranscript(tutorialSession.director, { touch: touchUi }, tutorialHeardAsides) : [],
  onTranscript: open => pauseTutorialForTranscript(open),
  onPlayLine: line => playTranscriptTake(line),
  onBeginChapter: chapter => restartTutorialFrom(chapter),
  onContinue: () => {
    const director = tutorialSession?.director;
    if (director?.completeDialogue(director.cue) && director.current?.kind === 'prompt') runtime?.input.requestPointerLock();
  },
  onOptionalContinue: () => tutorialSession?.director.completeOptionalDialogue(tutorialSession.director.optionalCue),
  onRestart: () => restartTutorialFrom(),
  onSkip: () => { tutorialProgress.recordSkipped(); runtime?.input.releaseInputs(); tutorialSession?.director.skip(); runtime?.input.releaseFocus(); },
  onPractice: () => returnToMenu({then:() => runMenuAction(menuController.practice(nameInput.value),SCREEN_IDS.SOLO_MENU)}),
  onLeave: () => returnToMenu({then:() => route(SCREEN_IDS.SOLO_MENU)}),
});
const tutorialOpening = new TutorialOpening({
  hold: () => tutorialView.holdOpening(),
  ready: async () => {
    const first = tutorialSession?.director.beats.find(beat => beat.recordingKey);
    tutorialOpening.cueId = first?.id;
    if (!first || !sound.running || sound.muted || !tutorialVoice || !tutorialSession) return true;
    await tutorialVoice.load();
    return Boolean(await tutorialVoice.buffer(first.recordingKey));
  },
  reveal: () => {
    if (!tutorialSession?.active) return;
    tutorialView.revealOpening();
    if (tutorialOpening.audioReady) tutorialVoice.sync(tutorialSession.director);
    else voiceFirstLineLate(tutorialSession);
  },
});
// (the opening gave up waiting on the first line's take: it still voices that line when it arrives, if the line is
// still the one showing; otherwise the line would stay silent for good)
function voiceFirstLineLate(session) {
  const cue = session.director.cue;
  if (!cue || cue.id !== tutorialOpening.cueId || !tutorialVoice) return;
  tutorialVoice.buffer(tutorialVoice.keyFor(cue)).then(buffer => {
    if (!buffer || tutorialSession !== session || tutorialOpening.waiting || session.director.cue?.id !== cue.id) return;
    tutorialOpening.audioReady = true;
    tutorialVoice.sync(session.director);
  });
}
const TUTORIAL_TOUCH_ACTIONS = new Set(['attack','guard','spell','dash','jump','sprint','crouch','ultimate','gauntlet','prepared']);
// taught: the actions taught so far, or null for everything (the tutorial over or left). In Tutorial 1 an ability not
// taught yet is not on the screen at all, touch buttons and desktop tiles alike: it arrives, in the place it will keep,
// when it is taught.
function revealTutorialControls(taught) {
  const absent = (element, action) => {
    let gone = taught !== null && !taught.includes(action);
    if (!gone && runtime?.weapon && tutorialSession?.director.state === 'running') {
      if (action === 'attack' && runtime.weapon.equipment.sword === 'away') gone = true;
      if (action === 'spell' && runtime.weapon.equipment.hand === 'away') gone = true;
    }
    element.classList.toggle('tutorial-absent', gone);
    if (gone) element.setAttribute('aria-hidden', 'true'); else element.removeAttribute('aria-hidden');
  };
  for (const button of document.querySelectorAll('.touch-btn[data-action]')) {
    if (TUTORIAL_TOUCH_ACTIONS.has(button.dataset.action)) absent(button, button.dataset.action);
  }
  const tutorialMenu = document.querySelector('.touch-btn[data-action="pause"]');
  tutorialMenu?.classList.toggle('tutorial-absent', taught !== null);
  const stick = document.querySelector('.touch-stick');
  stick?.classList.toggle('tutorial-absent', taught !== null && !taught.includes('move'));
  for (const [action, tile] of [['spell', hud.spell], ['dash', hud.dash], ['ultimate', hud.ultimate]]) if (tile) absent(tile, action);
}
function startTutorial() {
  showMenuError('');
  let name = nameInput.value.trim().slice(0, 18);
  if (!name) {
    name = 'Spellblade';
    nameFields.forEach((field) => { field.value = name; });
  }
  localStorage.setItem('ss-player-name', name);
  tutorialEquipment.reset();
  runtime?.weapon.setEquipment({ sword: false, hand: false });
  socket.startTutorial(name);
  tutorialVoice ??= new TutorialVoice({ engine: sound, context: () => ({ touch: touchUi }) });
  tutorialSession = new TutorialSession(socket.local, {
    onChange: progress => {
      if (progress.optional) tutorialHeardAsides.add(progress.optional.id);
      tutorialView.show(progress);
      if (!tutorialOpening.waiting && (tutorialOpening.audioReady || progress.current?.id !== tutorialOpening.cueId)) tutorialVoice.sync(tutorialSession?.director);
      const permissions=progress.permissions ?? progress.current?.permissions ?? progress.segment?.permissions ?? [];
      const taught=progress.taught ?? permissions;
      // A control not yet taught is not there at all, on any screen: it arrives (in the place it will keep) when taught.
      revealTutorialControls(progress.state==='running' ? taught : null);
      if (progress.state === 'complete') tutorialProgress.recordCompleted();
      if(progress.state !== 'running') runtime?.input.releaseFocus();
    },
    onBlocked: action => tutorialView.denied(action),
    onResumeMovement: () => runtime?.input.resumeHeldMovement(),
    // (an aside is fitted to the room the story has, by its recordings' real lengths)
    lineSeconds: cue => tutorialVoice?.seconds(cue) ?? null,
    onRestore: player => { if(runtime) {runtime.input.releaseInputs(); runtime.input.yaw=player.yaw;runtime.input.pitch=0;} },
  });
  if (new URLSearchParams(location.search).has('debug')) { globalThis.__ssTutorial = tutorialSession; globalThis.__ssTutorialVoice = tutorialVoice; }
  // (no one speaks over the arena gate's title and drum: the first take waits for it to lift; the takes decode
  // behind it, in the route's order)
  tutorialOpening.begin();
  tutorialSession.start();
  tutorialVoice.preload([...tutorialSession.director.beats, ...Object.values(tutorialSession.director.branches).flat()]);
}
$('#tutorial-mode').addEventListener('click',startTutorial);
$('#breakthrough-play-bots')?.addEventListener('click', () => runMenuAction(menuController.breakthrough(nameInput.value, {
  team: menuController.breakthroughTeam(),
  botSkill: menuController.breakthroughSkill(),
  teamSize: menuController.breakthroughSize(),
  worldId: menuController.breakthroughArena(),
}), SCREEN_IDS.BREAKTHROUGH_MENU));
$('#breakthrough-create-private')?.addEventListener('click', () => runMenuAction(menuController.createBreakthroughPrivate(nameInput.value, {
  team: menuController.breakthroughTeam(),
  botSkill: menuController.breakthroughSkill(),
  teamSize: menuController.breakthroughSize(),
  worldId: menuController.breakthroughArena(),
}), SCREEN_IDS.BREAKTHROUGH_MENU));
function startBotDuel() {
  if (!runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU)) return;
  // Use this deliberate click to focus the arena. Joined/readiness still owns the countdown.
  // If the browser refuses Pointer Lock, the existing Start Bot Duel button remains a fallback.
  ensureRuntime();
  runtime.requestPointerLock();
}
$('#bot-duel').addEventListener('click', startBotDuel);
$('#inspection-mode').addEventListener('click', () => runMenuAction(menuController.inspectionPractice(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#practice-mode').addEventListener('click', () => runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU));
$('#create-breakthrough-room')?.addEventListener('click', () => runMenuAction(menuController.createBreakthroughPrivate(nameInput.value), SCREEN_IDS.PRIVATE_MENU));
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
$('#pause-leave').addEventListener('click', () => returnToMenu());
$('#lobby-leave').addEventListener('click', () => returnToMenu());
// the ready check: each Spellblade says they are ready (press again to take it back)
startMatchButton.addEventListener('click', () => socket.ready(!startMatchButton.classList.contains('pressed')));
$('#switch-team')?.addEventListener('click', () => socket.switchTeam());
// --- settings: every change reaches what it belongs to, at once ---
function applySettings() {
  sound.setLevels(soundLevels(settings));
  if (sound.levels.muted || sound.levels.effects === 0 || sound.levels.master === 0) {
    armoryFeedback.cancel();
    menuScene?.showSpell(router.current === SCREEN_IDS.ARMORY && renown?.section === 'kit' ? settings.get('loadout.spell') : null);
  }
  const view = viewOptions(settings);
  menuScene?.setPixelRatioCap(view.pixelRatioCap);
  menuScene?.setParticleDensity(view.particles);
  menuScene?.setSubtitles(view.subtitles);
  endCaption.setEnabled(view.subtitles);
  menuScene?.setTourAllowed(tourAllowed());
  if (router.current === SCREEN_IDS.MAIN_MENU) menuScene?.setTouring(true);
  noteYard();
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
  if (change.id === 'audio.soundtrack') {
    syncSoundscape();
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
heraldPanel = new HeraldPanel({ root: $('#herald'), openers: [...document.querySelectorAll('[data-open-herald]')] });
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
  $('#armory-equipped').textContent = `${({ fireball: 'Fireball', coreflagration: 'Coreflagration', frostfire: 'Frostfire', gale: 'Gale', steel: 'Steel' })[settings.get('loadout.spell')] ?? SPELLS[settings.get('loadout.spell')]?.label} · ${ULTIMATES[settings.get('loadout.ultimate')]?.short ?? 'Sunder'}`;
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
  root.innerHTML = '<p class="armory-slot">PREPARED SPELLS</p><p class="panel-copy">During Chivalry, tap Q to cast. Hold Q briefly, then press 1, 2 or 3 to choose and cast (Q can be let go first). During startup, choosing only preselects. The starting spell is marked ★.</p>'
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
  const subtitles = settings.get('audio.subtitles');
  for (const button of document.querySelectorAll('[data-toggle-subtitles]')) {
    button.textContent = subtitles ? 'SUBTITLES · ON' : 'SUBTITLES · OFF';
    button.setAttribute('aria-pressed', String(Boolean(subtitles)));
  }
}
renderSoundToggles();
const SOUNDTRACK_CHOICES = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'battle', label: 'Steel at the Gate' },
  { value: 'march', label: 'The Keep Holds' },
  { value: 'vigil', label: "Sunderer's Vigil" },
  { value: 'hall', label: 'Castleward Hall' },
];

function cycleSoundtrackSetting() {
  const current = settings.get('audio.soundtrack') || 'adaptive';
  const idx = Math.max(0, SOUNDTRACK_CHOICES.findIndex((c) => c.value === current));
  const next = SOUNDTRACK_CHOICES[(idx + 1) % SOUNDTRACK_CHOICES.length];
  settings.set('audio.soundtrack', next.value);
  hud.flashText(`TRACK: ${next.label.toUpperCase()}`, 'ready', 1000);
  syncSoundscape();
}

document.addEventListener('keydown', (event) => {
  if (event.repeat || event.target?.tagName === 'INPUT') return;
  const action = settings.actionFor(event.code);
  if (action === 'toggleSound') hud.flashText(settings.toggle('audio.muted') ? 'SOUND OFF' : 'SOUND ON', 'ready', 900);
  if (action === 'toggleMusic') hud.flashText(settings.toggle('audio.musicMuted') ? 'MUSIC OFF' : 'MUSIC ON', 'ready', 900);
  if (action === 'cycleSoundtrack') cycleSoundtrackSetting();
});
for (const button of document.querySelectorAll('[data-toggle-sound]')) button.addEventListener('click', () => settings.toggle('audio.muted'));
for (const button of document.querySelectorAll('[data-toggle-music]')) button.addEventListener('click', () => settings.toggle('audio.musicMuted'));
for (const button of document.querySelectorAll('[data-toggle-subtitles]')) button.addEventListener('click', () => settings.toggle('audio.subtitles'));

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
  if (heraldPanel?.isOpen) {
    heraldPanel.close();
    return;
  }
  // watching the yard: Escape brings the banner back (and goes no further)
  if (router.current === SCREEN_IDS.MAIN_MENU && presentation.observing) {
    presentation.showMenu(nowSec());
    return;
  }
  if ([SCREEN_IDS.SOLO_MENU, SCREEN_IDS.BREAKTHROUGH_MENU, SCREEN_IDS.PRIVATE_MENU, SCREEN_IDS.ROOMS_MENU, SCREEN_IDS.HOW_TO_PLAY, SCREEN_IDS.ARMORY].includes(router.current)) {
    route(SCREEN_IDS.MAIN_MENU);
  } else if (router.current === SCREEN_IDS.LOBBY || router.current === SCREEN_IDS.END_SCREEN) {
    returnToMenu();
  } else if (latestSnapshot?.roomState === 'PLAYING') {
    if (document.pointerLockElement) document.exitPointerLock();
    else if (paused) { paused = false; pauseMenu.classList.add('hidden'); }
    else openPause();
  }
});

rematchButton.addEventListener('click', () => {
  if (latestSnapshot?.mode === 'BOT_DUEL') {
    // another Bot Duel straight away (the same rival), without a reload
    returnToMenu({ then: startBotDuel });
    return;
  }
  socket.rematch();
  rematchCopy.textContent = 'Rematch vote cast. Waiting for the others…';
});
$('#leave').addEventListener('click', () => returnToMenu());

let preparingSiege=false;
function updateInspectionControls() {
  const machineChoice=$('#practice-hostile-machine')?.value;
  const hostile=latestSnapshot?.players?.find(p=>p.practiceSiegeOperator?.machine===machineChoice);
  const hostileStatus=$('#practice-hostile-status');
  if(hostileStatus){
    const role=hostile?.name??'No hostile operator';
    const alive=hostile?.health>0;
    hostileStatus.textContent=hostile
      ? `${role} · ${hostile.practiceSiegeOperator.difficulty.toUpperCase()} · ${alive?'ACTIVE':'DEFEATED'}`
      : 'No hostile operator summoned.';
  }
  const ram=$('#practice-siege-type').value==='so-fist-ication';
  const flight=$('#practice-siege-type').value==='fight-and-flight';
  const machine=Boolean(flight?latestSnapshot?.fightFlight:ram?latestSnapshot?.soFistication:latestSnapshot?.bibyeBallista);
  const name=flight?'FIGHT-AND-FLIGHT':ram?'SO-FIST-ICATION':'BI-BYE-LLISTA';
  $('[data-siege-title]').textContent=name;
  $('[data-siege-classification]').hidden=!(ram||flight);
  $('[data-siege-classification]').textContent=flight?'Wearable Flying Siege Apparatus':ram?'Mechanical Battering Ram':'';
  $('[data-siege-description]').hidden=false;
  $('[data-siege-description]').textContent=flight?'A sword-bladed rotor above you, a repeating crossbow beside you, and an excellent opportunity to reconsider the laws of gravity. Mount nearby; hold JUMP to climb, CROUCH to descend, and use VIEW to change cameras. Land before dismounting.':ram?'This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more. The sword is mightier than the pen, but siege engineers have devised a more sophisticated form of persuasion: an armored fist, delivered at a speed that cannot be ignored.':'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.';
  $('[data-siege-final]').textContent=flight?'Your sword has taken to the skies.':ram?'Will not leave a scratch.':"The first shot lowers the target's defense.";
  for(const action of ['build','rebuild','dismantle'])$('#practice-'+action+'-bibye').textContent=preparingSiege&&action!=='dismantle'?'PREPARING CARRIAGE…':action.toUpperCase()+(action==='build'?' A ':' ')+name;
  $('#practice-build-bibye').hidden=machine;
  $('#practice-rebuild-bibye').hidden=!machine;
  $('#practice-dismantle-bibye').hidden=!machine;
  const available = socket.inspectionAvailable && latestSnapshot?.mode === 'PRACTICE';
  // Redundant inspection controls in the practice panel are hidden to prevent confusion with Inspection Yard
  for (const node of document.querySelectorAll('.inspection-control')) node.classList.add('hidden');
  $('#practice-freeze').textContent = socket.inspectionFrozen ? 'RESUME · P' : 'FREEZE · P';
  $('#practice-step').disabled = !socket.inspectionFrozen || socket.inspectionFramesPlaying;
  $('#practice-play-frames').disabled = false;
  $('#practice-play-frames').textContent = socket.inspectionFramesPlaying ? 'STOP FRAMES' : 'PLAY FRAMES';
  $('#inspection-status').textContent = socket.inspectionFramesPlaying ? 'Playing frames · 5 ticks/s · ⅙ speed' : socket.inspectionFrozen ? 'Frozen · one step advances 1/30 second' : 'Live · P freezes the scene';
  
  const title = $('#practice-tools-title');
  if (title) title.textContent = available ? 'COMBATANTS & SPAWNING' : 'PRACTICE YARD';
  const roleHint = $('#practice-role-hint');
  if (roleHint) roleHint.classList.toggle('hidden', !available);
  const panelToggle = $('#practice-panel-toggle');
  if (panelToggle) panelToggle.classList.toggle('hidden', !available);

  practiceOverlay.classList.toggle('inspection-frozen', socket.inspectionFrozen);
  for (const button of practiceOverlay.querySelectorAll('button')) {
    if (button.matches('#practice-freeze, #practice-step, #practice-play-frames, #practice-leave, [data-open-settings], #practice-panel-toggle')) continue;
    // In Inspection Mode, staging dummies and siege machines is permitted while frozen
    if (available) {
      button.disabled = Boolean(preparingSiege && button.id.endsWith('-bibye'));
    } else {
      button.disabled = socket.inspectionFrozen || (preparingSiege&&button.id.endsWith('-bibye'));
    }
  }
  // Restore per-operator state *after* the generic Practice button policy.
  const occupied=machineChoice==='bi-bye-llista'?Boolean(latestSnapshot?.bibyeBallista):
    machineChoice==='so-fist-ication'?Boolean(latestSnapshot?.soFistication):
    Boolean(latestSnapshot?.fightFlight);
  const frozen=socket.inspectionFrozen&&!socket.inspectionAvailable;
  $('#practice-hostile-spawn').disabled=Boolean(hostile||occupied||frozen);
  $('#practice-hostile-reset').disabled=Boolean(!hostile||frozen);
  $('#practice-hostile-remove').disabled=Boolean(!hostile||frozen);
  if(hostileStatus&&!hostile&&occupied)hostileStatus.textContent='Machine already present. Dismantle it before summoning.';
  practiceOverlay.querySelector('.practice-tools-unlocked-hint').textContent = socket.inspectionFrozen ? 'P OR RESUME TO CONTINUE' : 'CLICK ARENA TO RESUME';
  practiceOverlay.querySelector('.practice-tools-locked-hint').textContent = available ? 'P TO FREEZE · ESC FOR TOOLS' : 'ESC FOR TOOLS';
  const pointerHint = $('#pointer-hint');
  if (pointerHint) {
    if (available) pointerHint.classList.add('hidden');
    pointerHint.textContent = socket.inspectionFrozen ? 'SCENE FROZEN · P TO RESUME' : 'CLICK TO ENTER THE ARENA';
  }
}

$('#practice-panel-toggle')?.addEventListener('click', () => {
  const content = $('#practice-panel-content');
  const toggleBtn = $('#practice-panel-toggle');
  if (!content || !toggleBtn) return;
  const isHidden = content.classList.toggle('hidden');
  toggleBtn.textContent = isHidden ? '+ EXPAND' : '− MINIMIZE';
  toggleBtn.setAttribute('aria-expanded', String(!isHidden));
});

function toggleInspectionFreeze() {
  if (!socket.inspectionAvailable || latestSnapshot?.roomState !== 'PLAYING') return;
  const frozen = !socket.inspectionFrozen;
  // Freeze before releasing focus so a frozen Guard or sword pose remains intact.
  if (!socket.setInspectionFrozen(frozen)) return;
  runtime.syncInspection();
  runtime.input.releaseInputs();
  updateInspectionControls();
}
$('#practice-freeze').addEventListener('click', toggleInspectionFreeze);
$('#practice-step').addEventListener('click', () => socket.stepInspection());
$('#practice-play-frames').addEventListener('click', () => socket.playInspectionFrames(!socket.inspectionFramesPlaying));
document.addEventListener('keydown', event => {
  if (event.code !== 'KeyP' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
  if (!socket.inspectionAvailable || !runtime?.playing || router.current !== null) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toggleInspectionFreeze();
}, { capture: true });
socket.on('inspectionState', updateInspectionControls);

$('#practice-siege-type').addEventListener('change',updateInspectionControls);
$('#practice-hostile-machine')?.addEventListener('change',updateInspectionControls);
for(const action of ['spawn','reset','remove'])$('#practice-hostile-'+action)?.addEventListener('click',()=>{
  if(latestSnapshot?.mode!=='PRACTICE')return;
  const machine=$('#practice-hostile-machine').value,difficulty=$('#practice-hostile-difficulty').value;
  socket.send({type:'practiceSiegeOpponent',action,machine,difficulty});
});
for(const action of ['build','rebuild','dismantle'])$('#practice-'+action+'-bibye').addEventListener('click',async()=>{
  if(preparingSiege)return;const machine=$('#practice-siege-type').value,room=latestSnapshot?.roomCode;
  if((machine==='so-fist-ication'||machine==='fight-and-flight')&&action!=='dismantle'){
    preparingSiege=true;updateInspectionControls();$('#practice-siege-type').disabled=true;$('#practice-siege-status').hidden=false;$('#practice-siege-status').textContent='Preparing carriage…';
    const loaded=machine==='fight-and-flight'?await runtime.flightRenderer?.load():await runtime.world?.soFistication?.load(true);
    preparingSiege=false;$('#practice-siege-type').disabled=false;updateInspectionControls();
    if(latestSnapshot?.roomCode!==room||latestSnapshot?.mode!=='PRACTICE')return;
    $('#practice-siege-status').hidden=Boolean(loaded);
    if(!loaded){$('#practice-siege-status').textContent='The carriage could not load. Try Build again.';return;}
  }
  socket.send({type:'practiceSiege',action,machine});
});
$('#practice-reset').addEventListener('click', () => socket.practiceResetPlayer());
$('#practice-passive').addEventListener('click', () => socket.practiceSpawnDummy('PASSIVE'));
$('#practice-guarding').addEventListener('click', () => socket.practiceSpawnDummy('GUARDING'));
$('#practice-fight').addEventListener('click', () => socket.practiceSpawnDummy('FIGHTS_BACK'));
$('#practice-sorcery').addEventListener('click', () => socket.practiceSpawnDummy('SORCERY'));
$('#practice-melee').addEventListener('click', () => socket.practiceSpawnDummy('MELEE'));
$('#practice-runner').addEventListener('click', () => socket.practiceSpawnDummy('RUNNER'));
$('#practice-ultimate-knight').addEventListener('click', () => socket.practiceSpawnDummy('ULTIMATE_KNIGHT'));
$('#practice-st-perry')?.addEventListener('click', () => socket.practiceSpawnDummy('ST_PERRY'));
$('#practice-canonization')?.addEventListener('click', () => socket.practiceSpawnDummy('CANONIZATION'));
$('#practice-remove').addEventListener('click', () => socket.practiceRemoveDummy());
// the yard earns no prowess: this readies the ultimate to try
$('#practice-ultimate').addEventListener('click', () => socket.practiceReadyUltimate());
$('#practice-leave').addEventListener('click', () => returnToMenu());

const perryDialogue = $('#perry-dialogue');
const perryDialogueText = $('#perry-dialogue-text');
const perryDialogueClose = $('#perry-dialogue-close');
const perryDialogueForm = $('#perry-dialogue-form');
const perryDialogueInput = $('#perry-dialogue-input');
const perryCanonizeBtn = $('#perry-canonize-btn');
const perryCanonizePrompt = $('#perry-canonization-prompt');
const practiceCanonizationBtn = $('#practice-canonization');
const perryDialogueOptions = $('#perry-dialogue-options');
const perryDialogueCard = document.querySelector('.perry-dialogue-card');
const perryDialogueHud = $('#hud');

// While Perry's card is open on touch, its HUD layer must sit above the
// full-screen movement/aim surface; restore the normal order when it closes.
function setPerryDialogueVisible(visible) {
  perryDialogue?.classList.toggle('hidden', !visible);
  perryDialogueHud?.classList.toggle('perry-dialogue-active', visible);
}

if (perryDialogueCard) {
  for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend']) {
    perryDialogueCard.addEventListener(ev, (e) => e.stopPropagation());
  }
}

perryDialogueClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  setPerryDialogueVisible(false);
  socket.practicePerryDismiss();
});

perryDialogueForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const val = perryDialogueInput?.value?.trim();
  if (val) {
    socket.practicePerryAnswer(val);
    if (perryDialogueInput) perryDialogueInput.value = '';
  }
});

perryCanonizeBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  socket.practiceSpawnDummy('CANONIZATION');
});

function updateStPerryUI(snapshot) {
  if (snapshot?.mode !== 'PRACTICE') {
    setPerryDialogueVisible(false);
    practiceCanonizationBtn?.classList.add('hidden');
    return;
  }
  const dummy = snapshot.players?.find((p) => p.actorKind === 'dummy');
  const isPerry = dummy?.practiceMode === 'ST_PERRY';
  const isCanonized = dummy?.practiceMode === 'CANONIZATION';
  const perryData = dummy?.stPerry;
  const myId = window.__ssRuntime?.localAuth?.id || socket?.playerId;

  const localPlayer = snapshot.players?.find((p) => p.id === myId) || window.__ssRuntime?.localAuth;
  const isOperatingSiege = Boolean(localPlayer?.operatingRamId || localPlayer?.operatingBallistaId || localPlayer?.operatingFightFlightId);
  const isInCombat = Boolean(
    localPlayer?.attackActive ||
    dummy?.attackActive ||
    (perryData?.playerHits ?? 0) > 0 ||
    (dummy?.health ?? 100) < 100
  );
  let isNearPerry = true;
  if (localPlayer?.position && dummy?.position) {
    const distSq = (localPlayer.position.x - dummy.position.x) ** 2 + (localPlayer.position.z - dummy.position.z) ** 2;
    if (distSq > 144) isNearPerry = false; // > 12m
  }

  const shouldShowDialogue = isPerry &&
    perryData?.dialogue &&
    !perryData.dialogue.dismissed &&
    !isOperatingSiege &&
    !isInCombat &&
    isNearPerry;

  setPerryDialogueVisible(Boolean(shouldShowDialogue));

  if (shouldShowDialogue) {
    if (perryDialogueText && perryData.dialogue.lastLine) {
      perryDialogueText.textContent = `"${perryData.dialogue.lastLine}"`;
    }

    const choices = perryData.dialogue.choices;
    if (perryDialogueOptions && Array.isArray(choices) && choices.length > 0) {
      const serialized = choices.join('|||');
      if (perryDialogueOptions.dataset.rendered !== serialized) {
        perryDialogueOptions.dataset.rendered = serialized;
        perryDialogueOptions.innerHTML = '';
        for (const choice of choices) {
          const btn = document.createElement('button');
          btn.className = 'perry-option-btn';
          btn.type = 'button';
          btn.textContent = `"${choice}"`;
          btn.dataset.answer = choice;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.disabled) return;
            for (const b of perryDialogueOptions.querySelectorAll('.perry-option-btn')) {
              b.disabled = true;
            }
            setTimeout(() => {
              for (const b of perryDialogueOptions.querySelectorAll('.perry-option-btn')) {
                b.disabled = false;
              }
            }, 350);
            socket.practicePerryAnswer(choice);
          });
          perryDialogueOptions.appendChild(btn);
        }
      }
    }

    const isSolved = Boolean(perryData.dialogue.solved);
    if (perryDialogueOptions) {
      perryDialogueOptions.hidden = isSolved;
      perryDialogueOptions.classList.toggle('hidden', isSolved);
    }
    if (perryDialogueForm) {
      perryDialogueForm.hidden = isSolved;
      perryDialogueForm.classList.toggle('hidden', isSolved);
    }
  }

  const unlocked = Boolean(
    perryData?.unlockedPlayers
      ? (myId && perryData.unlockedPlayers.includes(myId))
      : perryData?.unlocked
  );
  if (practiceCanonizationBtn) {
    practiceCanonizationBtn.classList.toggle('hidden', !unlocked);
  }
  if (perryCanonizePrompt) {
    perryCanonizePrompt.classList.toggle('hidden', !unlocked);
  }
}

// into a fight: the blade comes out of its scabbard (once per room: not again on a reconnect to the same one)
let drawnFor = null;
socket.on('joined', (message) => {
  if (fromLeftRoom(message)) return;
  leftRoom = null;
  showMenuError('');
  ensureRuntime();
  if (drawnFor !== message.roomCode) {
    drawnFor = message.roomCode;
    if (!tutorialSession && message.mode !== 'TUTORIAL') sound.play(unsheatheRecipe(), { gain: 0.95 });
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
  if (fromLeftRoom(message)) return;
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
  if(snapshot.roomCode===latestSnapshot?.roomCode&&((snapshot.bibyeRevision??0)<(latestSnapshot?.bibyeRevision??0)||(snapshot.soFistRevision??0)<(latestSnapshot?.soFistRevision??0)))return;
  if (fromLeftRoom(snapshot) || (leftRoom !== null && !socket.roomCode)) return;
  latestSnapshot = snapshot;
  if (new URLSearchParams(location.search).has('debug')) globalThis.__ssSnapshot = snapshot;
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
    updateStPerryUI(snapshot);
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

socket.on('events', ({ events }) => {
  if (!events || !Array.isArray(events)) return;
  const myId = window.__ssRuntime?.localAuth?.id || socket?.playerId;
  for (const ev of events) {
    if (ev.type === 'stPerryDialogue') {
      if (!ev.playerId || ev.playerId === myId) {
        hud.subtitle({ text: ev.text, name: ev.speaker ?? 'St. Perry the Prodigious', seconds: 3.5 });
      }
    } else if (ev.type === 'stPerryUnlocked') {
      if (!ev.playerId || ev.playerId === myId) {
        hud.addFeed(ev.message ?? 'CANONIZATION UNLOCKED!', 'sword');
      }
    } else if (ev.type === 'stPerryPlainUnlocked') {
      if (!ev.playerId || ev.playerId === myId) {
        hud.addFeed(ev.message ?? 'PRESTIGE HERALD EARNED: ST. PERRY THE PLAIN!', 'shield');
      }
    } else if (ev.type === 'spellbladeLine') {
      if (!ev.playerId || ev.playerId === myId) {
        hud.subtitle({ text: ev.text, name: ev.speaker ?? 'Spellblade', seconds: 4.5 });
      }
    }
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
  if (router.current === SCREEN_IDS.LOBBY && socket.roomCode) { $('#lobby-error').textContent=errorText; return; }
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
const linkMark = $('[data-link-mark]');
const LINK_MARK = Object.freeze({ online: 'Multiplayer online', waking: 'Multiplayer waking', offline: 'Multiplayer offline', connecting: 'Reaching multiplayer' });
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
  // (and the server's state in a word at the banner's foot: what the link really is, nothing more)
  linkMark.dataset.tone = view.tone;
  linkMark.querySelector('[data-link-mark-label]').textContent = LINK_MARK[view.tone] ?? LINK_MARK.connecting;
  linkMark.title = LINK_MARK[view.tone] ?? LINK_MARK.connecting;
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
async function connectInitialSession() {
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
  if (!(reached && hadSession) && autoSolo === 'BREAKTHROUGH' && nameInput.value) {
    runMenuAction(menuController.breakthrough(nameInput.value), SCREEN_IDS.SOLO_MENU);
  } else if (!(reached && hadSession) && autoSolo === 'BOT_DUEL' && nameInput.value) {
    runMenuAction(menuController.botDuel(nameInput.value), SCREEN_IDS.SOLO_MENU);
  } else if (!(reached && hadSession) && autoSolo === 'PRACTICE' && nameInput.value) {
    runMenuAction(menuController.practice(nameInput.value), SCREEN_IDS.SOLO_MENU);
  } else if (reached && hadSession) {
    setTimeout(() => {
      if (!socket.playerId) route(invitedRoom ? SCREEN_IDS.PRIVATE_MENU : SCREEN_IDS.MAIN_MENU);
    }, 500);
  }
}
void connectInitialSession();

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
