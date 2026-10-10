// Run only in an owned localhost /?debug preview. Records the real renderer and
// the existing post-compressor mix. It never supplies inputs or edits game state.
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local preview only');
  let recorder, destination, timer, stream;
  window.__releaseCapture = {
    state: 'idle', data: null,
    start(seconds = 8, selector = '#game-canvas canvas') {
      if (recorder?.state === 'recording') throw new Error('Already recording');
      const canvas = document.querySelector(selector);
      const engine = window.__ssSound?.sound;
      if (!canvas || !engine?.running) throw new Error('Renderer and unlocked audio required');
      if (!(seconds > 0 && seconds <= 35)) throw new Error('Use a bounded take');
      destination = engine.ctx.createMediaStreamDestination();
      engine.compressor.connect(destination);
      stream = canvas.captureStream(30);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus']
        .find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000, audioBitsPerSecond: 128000 });
      const chunks = [];
      this.data = null;
      this.state = 'recording';
      this.metadata = { url: location.href, seconds, selector, width: canvas.width, height: canvas.height, mimeType,
        assets: structuredClone(window.__SPELLBLADE_ASSET_STATUS__), startedAt: new Date().toISOString() };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearTimeout(timer);
        engine.compressor.disconnect(destination);
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => { this.data = reader.result.slice(reader.result.indexOf(';base64,') + 8); this.metadata.bytes = blob.size; this.state = 'ready'; };
        reader.readAsDataURL(blob);
      };
      recorder.start(500);
      timer = setTimeout(() => recorder.stop(), seconds * 1000);
      return this.metadata;
    },
    stop() { if (recorder?.state === 'recording') recorder.stop(); },
  };
})();
