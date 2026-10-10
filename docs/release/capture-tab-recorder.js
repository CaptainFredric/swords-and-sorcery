// Local release tool. Capture the selected game tab, including its real DOM HUD.
// The browser chooser must be used to select the game tab. No game inputs or
// simulation state are supplied by this tool, and no microphone is requested.
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local preview only');
  let recorder, stream, timer;
  const button = document.createElement('button');
  button.textContent = 'RECORD THIS GAME TAB';
  button.style.cssText = 'position:fixed;right:16px;top:16px;z-index:10000;padding:14px;background:#e7c47c;color:#241e19;cursor:pointer';
  document.body.append(button);
  const capture = window.__releaseTabCapture = {
    state: 'idle', data: null,
    stop() { if (recorder?.state === 'recording') recorder.stop(); },
    dispose() { this.stop(); button.remove(); },
  };
  button.onclick = async () => {
    try {
      capture.state = 'choosing';
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: 30 },
        audio: true, preferCurrentTab: true,
        selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
      });
      if (stream.getVideoTracks()[0].getSettings().displaySurface !== 'browser') {
        for (const track of stream.getTracks()) track.stop();
        throw new Error('Choose only the game tab');
      }
      const mimeType = ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/webm;codecs=vp8,opus']
        .find(type => MediaRecorder.isTypeSupported(type));
      const chunks = [];
      capture.metadata = { url: location.href, startedAt: new Date().toISOString(),
        video: (({ width, height, frameRate, displaySurface }) => ({ width, height, frameRate, displaySurface }))(
          stream.getVideoTracks()[0].getSettings()), audioTracks: stream.getAudioTracks().length,
        mimeType, revision: window.__releaseCaptureRevision ?? null,
        inputs: 'Native keyboard and browser mouse controls through the ordinary game UI', hud: 'Original DOM HUD in tab capture' };
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(timer);
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          capture.data = reader.result.split(';base64,')[1];
          capture.metadata.bytes = blob.size;
          capture.state = 'ready';
          button.textContent = 'RECORD THIS GAME TAB';
          button.style.display = '';
        };
        reader.readAsDataURL(blob);
      };
      capture.data = null;
      capture.state = 'recording';
      button.style.display = 'none';
      recorder.start(500);
      timer = setTimeout(() => capture.stop(), 60000);
    } catch (error) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      capture.state = 'failed'; capture.error = error.message;
    }
  };
})();
