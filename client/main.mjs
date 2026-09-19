import { GameSocket } from './network/GameSocket.mjs';
import { HUD } from './ui/HUD.mjs';
import { GameRuntime } from './game/GameRuntime.mjs';

const $ = (selector) => document.querySelector(selector);
const menu = $('#menu');
const lobby = $('#lobby');
const howPanel = $('#how-panel');
const endScreen = $('#end-screen');
const nameInput = $('#player-name');
const roomInput = $('#room-code');
const menuError = $('#menu-error');
const lobbyCode = $('#lobby-code');
const lobbyState = $('#lobby-state');
const lobbyPlayers = $('#lobby-players');
const finalBoard = $('#final-scoreboard');
const winnerTitle = $('#winner-title');
const rematchCopy = $('#rematch-copy');
const hud = new HUD();
const socket = new GameSocket();
let runtime = null;
let latestLobby = null;
let latestSnapshot = null;

nameInput.value = localStorage.getItem('ss-player-name') || '';
const invitedRoom = new URLSearchParams(location.search).get('room');
if (invitedRoom) roomInput.value = invitedRoom.toUpperCase();

function playerName() {
  const name = nameInput.value.trim().slice(0, 18);
  if (!name) { menuError.textContent = 'Enter a name first.'; nameInput.focus(); return null; }
  localStorage.setItem('ss-player-name', name);
  return name;
}

function showOnly(panel) {
  for (const el of [menu, lobby, howPanel, endScreen]) el.classList.add('hidden');
  panel?.classList.remove('hidden');
}

function ensureRuntime() {
  if (!runtime) runtime = new GameRuntime($('#game-canvas'), socket, hud);
  runtime.setPlayerId(socket.playerId);
}

function updateLobby(message) {
  latestLobby = message;
  lobbyCode.textContent = message.roomCode;
  lobbyPlayers.innerHTML = message.players.map((p) => `<div class="lobby-player"><span class="player-rune">◆</span><b>${escapeHtml(p.name)}</b><em>${p.connected ? 'READY' : 'RECONNECTING'}</em></div>`).join('');
  if (message.roomState === 'WAITING') lobbyState.textContent = 'WAITING FOR ANOTHER SPELLBLADE';
  else if (message.roomState === 'COUNTDOWN') lobbyState.textContent = 'THE KEEP IS AWAKENING…';
}

function updateEnd(snapshot) {
  const winner = snapshot.players.find((p) => p.id === snapshot.winnerId);
  winnerTitle.textContent = winner?.id === socket.playerId ? 'VICTORY' : `${winner?.name ?? 'A SPELLBLADE'} WINS`;
  const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  finalBoard.innerHTML = sorted.map((p, i) => `<div class="final-row ${p.id === socket.playerId ? 'you' : ''}"><span>${i + 1}</span><b>${escapeHtml(p.name)}</b><strong>${p.kills} K</strong><em>${p.deaths} D</em><small>${p.parries} parries</small></div>`).join('');
}

$('#how-button').addEventListener('click', () => howPanel.classList.remove('hidden'));
$('[data-close-how]').addEventListener('click', () => howPanel.classList.add('hidden'));
$('#quick-play').addEventListener('click', () => { const name = playerName(); if (name) socket.quickPlay(name); });
$('#create-room').addEventListener('click', () => { const name = playerName(); if (name) socket.createRoom(name); });
$('#join-room').addEventListener('click', () => { const name = playerName(); if (!name) return; const code = roomInput.value.trim(); if (code.length < 5) { menuError.textContent = 'Enter the five-character room code.'; return; } socket.joinRoom(code, name); });
roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5); });
$('#copy-link').addEventListener('click', async () => {
  const url = new URL(location.href); url.searchParams.set('room', socket.roomCode); await navigator.clipboard.writeText(url.toString());
  $('#copy-link').textContent = 'INVITE LINK COPIED'; setTimeout(() => { $('#copy-link').textContent = 'COPY INVITE LINK'; }, 1200);
});
$('#copy-code').addEventListener('click', async () => { await navigator.clipboard.writeText(socket.roomCode || ''); });
$('#rematch').addEventListener('click', () => { socket.rematch(); rematchCopy.textContent = 'Rematch vote cast. Waiting for the others…'; });
$('#leave').addEventListener('click', () => { localStorage.removeItem('ss-session-token'); localStorage.removeItem('ss-room-code'); location.href = location.pathname; });

socket.on('joined', () => {
  menuError.textContent = '';
  ensureRuntime();
  showOnly(lobby);
  hud.hide();
});
socket.on('lobby', updateLobby);
socket.on('snapshot', (snapshot) => {
  latestSnapshot = snapshot;
  ensureRuntime();
  if (snapshot.roomState === 'WAITING' || snapshot.roomState === 'COUNTDOWN' || snapshot.roomState === 'REMATCH_COUNTDOWN') {
    runtime.setPlaying(false); hud.hide(); showOnly(lobby);
    lobbyCode.textContent = snapshot.roomCode;
    lobbyState.textContent = snapshot.roomState === 'WAITING' ? 'WAITING FOR ANOTHER SPELLBLADE' : snapshot.roomState === 'REMATCH_COUNTDOWN' ? 'REMATCH INCOMING…' : 'THE KEEP IS AWAKENING…';
  } else if (snapshot.roomState === 'PLAYING') {
    runtime.setPlaying(true); showOnly(null); hud.show();
  } else if (snapshot.roomState === 'FINISHED') {
    runtime.setPlaying(false); hud.hide(); updateEnd(snapshot); showOnly(endScreen);
  }
});
socket.on('resumeFailed', () => {
  latestLobby = null;
  latestSnapshot = null;
  runtime?.setPlaying(false);
  runtime?.setPlayerId(null);
  hud.hide();
  menuError.textContent = 'Previous arena session expired. Join or create a room.';
  showOnly(menu);
});
socket.on('error', (message) => { menuError.textContent = message.message || 'Could not join that room.'; showOnly(menu); });
socket.on('connection', ({ connected }) => { if (!connected && runtime) hud.flashText('RECONNECTING…', 'danger'); });

try {
  await socket.connect({ resume: true });
  setTimeout(() => {
    if (!socket.playerId) showOnly(menu);
  }, 500);
} catch {
  menuError.textContent = 'Could not reach the arena server. Retry in a moment.';
  showOnly(menu);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}
