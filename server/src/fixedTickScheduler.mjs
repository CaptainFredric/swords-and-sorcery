// Keep authoritative physics at fixed 30 Hz without pretending a late timer ran on time.
// Catch up a bounded number of steps; publish one state snapshot after the batch.
// A long stall cannot be simulated in full without amplifying overload, so we
// deliberately discard excess wall-clock debt and expose it in diagnostics.
export function createFixedTickScheduler({ step, rate = 30, maxCatchupSteps = 3, measure = () => performance.now() }) {
  const period = 1 / rate;
  let nextAt = null;
  const counters = { steps: 0, catchupSteps: 0, skippedSteps: 0, slowSteps: 0, lastStepMs: 0, peakStepMs: 0 };
  return {
    run(nowSec) {
      if (!Number.isFinite(nowSec)) return 0;
      if (nextAt === null) nextAt = nowSec;
      const overdue = Math.max(0, Math.floor((nowSec - nextAt) / period + 1e-7));
      if (overdue >= maxCatchupSteps) {
        const skipped = overdue - (maxCatchupSteps - 1);
        counters.skippedSteps += skipped;
        nextAt += skipped * period;
      }
      const due = Math.min(maxCatchupSteps, Math.max(0, Math.floor((nowSec - nextAt) / period + 1e-7) + 1));
      for (let i = 0; i < due; i++) {
        const before = measure();
        step(nextAt, i === due - 1);
        const elapsed = Math.max(0, measure() - before);
        counters.lastStepMs = elapsed;
        counters.peakStepMs = Math.max(counters.peakStepMs, elapsed);
        if (elapsed > period * 1000) counters.slowSteps++;
        counters.steps++;
        if (i > 0) counters.catchupSteps++;
        nextAt += period;
      }
      return due;
    },
    stats() { return { ...counters, pendingMs: 0 }; },
  };
}
