// Paste into DevTools on a matching Castleward client opened with ?debug.
// Browser-only test harness: synthetic input uses the production InputController.
// Call __soloProbe.series('remote', 3) or .series('local', 3), then .results.
// Select the remote endpoint before running; keep the tab visible and viewport fixed.
(() => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const percentile = (a, q) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : null;
  const summary = a => ({ n: a.length, median: percentile(a, .5), p95: percentile(a, .95), max: a.length ? Math.max(...a) : null });
  const probe = { results: [], running: false, phase: 'ready' };
  globalThis.__soloProbe = probe;
  probe.series = async (host, count = 3, duration = 60) => {
    probe.running = true;
    try {
      for (let run = 1; run <= count; run++) {
        const link = __ssLink;
        link.leaveRoom();
        await wait(300);
        // Explicit hosting is only for comparison, never a user-facing routing override.
        link.hosting = host;
        link.active.startSolo('PRACTICE', 'Responsiveness', 'castleward', 'KNIGHT');
        for (let i = 0; i < 200 && !(globalThis.__ssRuntime?.playing && link.latestSnapshot?.roomState === 'PLAYING'); i++) await wait(100);
        const runtime = __ssRuntime;
        if (!runtime?.playing) throw new Error('Arena did not start');
        link.practiceSpawnDummy('FIGHTS_BACK');
        await wait(3000); // warm assets, pose buffers, shader and audio setup
        const input = runtime.input;
        const started = performance.now();
        const arrays = { frames: [], render: [], snapshot: [], correction: [], tick: [], simulation: [], clone: [], inputAck: [], actionAck: [], delivery: [] };
        const counts = {};
        const inputs = new Map();
        const pending = new Map();
        const restore = [];
        const wrap = (object, key, fn) => { const old = object[key]; object[key] = fn(old); restore.push(() => { object[key] = old; }); };
        wrap(runtime.renderer, 'render', old => function(...args) { const at = performance.now(); const v = old.apply(this, args); arrays.render.push(performance.now() - at); return v; });
        wrap(runtime, 'onSnapshot', old => function(snapshot) {
          const at = performance.now();
          const auth = snapshot.players.find(p => p.id === link.playerId);
          if (auth && this.localState) arrays.correction.push(Math.hypot(auth.position.x - this.localState.position.x, auth.position.y - this.localState.position.y, auth.position.z - this.localState.position.z));
          if (auth && inputs.has(auth.lastInputSeq)) { arrays.inputAck.push(at - inputs.get(auth.lastInputSeq)); inputs.delete(auth.lastInputSeq); }
          if (host === 'local') arrays.delivery.push(at - snapshot.serverTime * 1000);
          const v = old.call(this, snapshot); arrays.snapshot.push(performance.now() - at); return v;
        });
        wrap(link, 'input', old => function(packet) { inputs.set(packet.seq, performance.now()); return old.call(this, packet); });
        for (const [method, event] of [['attack','swordSwing'], ['guard','guardStart'], ['cast','spellGather'], ['dash','dash']]) {
          wrap(link, method, old => function(...args) { if (args[0] !== false && !pending.has(event)) pending.set(event, performance.now()); return old.apply(this, args); });
        }
        let lastTick;
        if (host === 'local') {
          wrap(link.local, 'tick', old => function(...args) { const at = performance.now(); if (lastTick !== undefined) arrays.tick.push(at-lastTick); lastTick=at; const v=old.apply(this,args); arrays.simulation.push(performance.now()-at); return v; });
          wrap(globalThis, 'structuredClone', old => function(...args) { const at=performance.now(); const v=old(...args); arrays.clone.push(performance.now()-at); return v; });
        }
        let lastSnapshot;
        const offSnapshot = link.on('snapshot', () => { const at=performance.now(); if (host==='remote' && lastSnapshot !== undefined) arrays.tick.push(at-lastSnapshot); lastSnapshot=at; });
        const offEvents = link.on('events', ({events}) => { for (const event of events) { counts[event.type] = (counts[event.type] ?? 0)+1; if ((event.playerId === link.playerId || event.attackerId === link.playerId) && pending.has(event.type)) { arrays.actionAck.push(performance.now()-pending.get(event.type)); pending.delete(event.type); } } });
        const longTasks = [];
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({at:e.startTime-started, duration:e.duration}))));
        observer.observe({type:'longtask'});
        let lastFrame;
        let finished=false, raf;
        let lastCast=-9, lastDash=-9, lastReset=-9;
        const frame = at => {
          if (finished) return;
          if (lastFrame !== undefined) arrays.frames.push(at-lastFrame);
          lastFrame=at;
          const t=(at-started)/1000;
          const me=runtime.localAuth;
          const foe=runtime.latestSnapshot?.players.find(p=>p.id!==link.playerId && p.alive);
          input.enabled=true;
          input.keys.clear();
          if (me?.alive && foe) {
            const dx=foe.position.x-me.position.x, dz=foe.position.z-me.position.z;
            const distance=Math.hypot(dx,dz);
            input.yaw=Math.atan2(-dx,-dz); input.pitch=0;
            if (distance>2.1) input.keys.add('KeyW');
            if (distance<1.25) input.keys.add('KeyS');
            if (t%12<3) input.keys.add('ShiftLeft');
            if (t%12>9) input.keys.add('KeyC');
            if (t%8<2) input.keys.add('KeyD');
            input.setGuard(t%6<1.4);
            input.setAttack(t%6>1.6 && t%6<4.3);
            if (t-lastCast>6) { lastCast=t; input.cast(); }
            if (t-lastDash>8) { lastDash=t; input.dash(); }
            if (t%15<.2) input.keys.add('Space');
          }
          if (!me?.alive && t-lastReset>3) { lastReset=t; link.practiceResetPlayer(); }
          probe.phase=`${host} ${run}/${count} ${t.toFixed(1)}s`;
          raf=requestAnimationFrame(frame);
        };
        raf=requestAnimationFrame(frame);
        await wait(duration*1000);
        finished=true; cancelAnimationFrame(raf);
        input.releaseInputs();
        observer.disconnect(); offSnapshot(); offEvents();
        for (const undo of restore.reverse()) undo();
        probe.results.push({host, run, duration, viewport:[innerWidth,innerHeight], dpr:devicePixelRatio, visible:document.visibilityState, settings:__ssSettings.settings.export?.() ?? __ssSettings.settings.values, metrics:Object.fromEntries(Object.entries(arrays).map(([k,v])=>[k,summary(v)])), longTasks, framesOver33:arrays.frames.filter(t=>t>33.4).length, framesOver50:arrays.frames.filter(t=>t>50).length, counts, renderInfo:{calls:runtime.renderer.info.render.calls,triangles:runtime.renderer.info.render.triangles}, raw:arrays});
      }
    } finally { probe.running=false; probe.phase='done'; }
    return probe.results;
  };
})();
