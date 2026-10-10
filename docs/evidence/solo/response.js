// Additional input latency probe, after the encounter probe has finished.
// Uses real keyboard listeners, observes the renderer's camera and host snapshots.
globalThis.runSoloResponseProbe = async (duration = 20) => {
  const runtime = __ssRuntime, link = __ssLink, input = runtime.input;
  link.practiceRemoveDummy(); link.practiceResetPlayer();
  input.releaseInputs(); input.enabled = true; input.yaw = 0; input.pitch = 0;
  await new Promise(r => setTimeout(r, 1000));
  const started = performance.now();
  const samples = [];
  let pending, done = false, next = started + 217, down = false, raf;
  const originalInput = link.input;
  link.input = function(packet) {
    if (pending && pending.seq === undefined && packet.forward === (down ? 1 : 0)) { pending.seq = packet.seq; pending.sendWait = performance.now() - pending.at; }
    return originalInput.call(this, packet);
  };
  const off = link.on('snapshot', snapshot => {
    const me = snapshot.players.find(p => p.id === link.playerId);
    if (pending?.seq !== undefined && me?.lastInputSeq >= pending.seq && pending.ack === undefined) pending.ack = performance.now() - pending.at;
  });
  const frame = at => {
    if (done) return;
    input.enabled = true;
    if (pending && down && pending.visible === undefined && Math.abs(runtime.camera.position.z - pending.cameraZ) > .001) pending.visible = at - pending.at;
    if (at >= next) {
      if (pending) samples.push(pending);
      down = !down;
      pending = { at: performance.now(), down, cameraZ: runtime.camera.position.z };
      document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code:'KeyW',key:'w',bubbles:true}));
      next = at + 733;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  await new Promise(r => setTimeout(r, duration * 1000));
  done = true; cancelAnimationFrame(raf); off(); link.input = originalInput;
  input.releaseInputs();
  globalThis.__soloResponse = { host: link.hosting, duration, samples };
  return __soloResponse;
};
