// Predicted camera movement is ahead of the most recently received authoritative
// snapshot. Compare positions from the SAME simulation time; otherwise constant
// forward motion looks like a physics error and is repeatedly pulled backwards.
// This history is presentation-only: server combat/physics remain authoritative.
export function recordPredictedPose(history, at, position, horizon = 0.75) {
  if (!Number.isFinite(at) || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return history;
  const last = history.at(-1);
  if (last && at < last.at - 0.001) history.length = 0; // server clock epoch reset
  if (history.at(-1)?.at === at) history.pop();
  history.push({ at, position: {x:position.x,y:position.y,z:position.z} });
  while (history.length > 2 && history[1].at < at - horizon) history.shift();
  return history;
}

export function predictedPoseAt(history, at) {
  if (!Number.isFinite(at) || !history.length) return null;
  const first=history[0],last=history.at(-1);
  // Do not extrapolate beyond recorded input: latency and an unobserved Dash
  // would make the apparent error less reliable than the actual host snapshot.
  if (at < first.at - .001) return null;
  // Snapshots can arrive between animation frames. At 60 Hz the newest
  // predicted sample may be ~16 ms BEFORE the packet's simulation timestamp.
  // Without a small extrapolation almost every snapshot falls back to comparing
  // the old server pose to the current camera position again.
  if (at > last.at) {
    const older=history.at(-2);
    const sampleDelta=older ? last.at - older.at : 0;
    const lead=at-last.at;
    if (!older || lead > 0.04 || sampleDelta < 0.001 || sampleDelta > 0.06) return null;
    const ratio=lead/sampleDelta;
    return {
      x:last.position.x+(last.position.x-older.position.x)*ratio,
      y:last.position.y+(last.position.y-older.position.y)*ratio,
      z:last.position.z+(last.position.z-older.position.z)*ratio,
    };
  }
  if (at <= first.at) return {...first.position};
  for(let i=1;i<history.length;i++){
    const b=history[i],a=history[i-1];
    if(at>b.at)continue;
    const t=Math.max(0,Math.min(1,(at-a.at)/Math.max(1e-7,b.at-a.at)));
    return {
      x:a.position.x+(b.position.x-a.position.x)*t,
      y:a.position.y+(b.position.y-a.position.y)*t,
      z:a.position.z+(b.position.z-a.position.z)*t,
    };
  }
  return {...last.position};
}
