import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { RECORDED_STINGERS, RecordedStingers } from './recordedStingers.mjs';

function engine({ running = true, musicOn = true } = {}) {
  const played = [];
  return {
    played, running, musicOn,
    ctx: { currentTime: 0, decodeAudioData: async (data) => ({ decoded: data }) },
    playBuffer: (buffer, options) => { played.push({ buffer, options }); return { stop() {} }; },
  };
}

test('the Spells & Chivalry stinger is a recorded take, played over the music on its bus; nothing when music is off', async () => {
  for (const stinger of Object.values(RECORDED_STINGERS)) {
    for (const extension of ['m4a', 'wav']) assert.ok(existsSync(new URL(`../../assets/music/${stinger.file}.${extension}`, import.meta.url)), `${stinger.file}.${extension}`);
  }
  const on = engine();
  const stingers = new RecordedStingers(on, { fetchAudio: async (url) => url });
  await stingers.load();
  stingers.play('spellsChivalry');
  assert.equal(on.played.length, 1);
  assert.equal(on.played[0].options.bus, 'music', 'the music level and its mute apply');
  assert.match(on.played[0].buffer.decoded, /music\/spells-chivalry\.m4a$/);
  const off = engine({ musicOn: false });
  const quiet = new RecordedStingers(off, { fetchAudio: async (url) => url });
  await quiet.load();
  assert.equal(quiet.play('spellsChivalry'), null);
  // the Credits may still play it (heard as a preview)
  assert.ok(quiet.play('spellsChivalry', { preview: true }));
  assert.equal(new RecordedStingers(engine()).play('noSuchStinger'), null);
});
