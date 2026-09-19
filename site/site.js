const playButton = document.querySelector('#play-button');
const playNote = document.querySelector('#play-note');
const liveUrl = String(window.SWORDS_SORCERY_PLAY_URL || '').trim();

if (playButton && liveUrl) {
  playButton.href = liveUrl;
  playButton.textContent = 'PLAY LIVE BUILD';
  playButton.classList.remove('disabled');
  playButton.removeAttribute('aria-disabled');
  playButton.rel = 'noopener';
  if (playNote) playNote.textContent = 'The live multiplayer server is online. Open the build, enter a name, and join or create a room.';
}
