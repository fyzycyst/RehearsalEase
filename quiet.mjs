/** Initial thresholds for transient, valid RMS calibration samples. */
export function calibrateNoise(rmsSamples) {
  const samples = rmsSamples.filter(value => Number.isFinite(value) && value >= 0).sort((a,b) => a-b);
  if (!samples.length) return null;
  const middle = Math.floor(samples.length / 2);
  const median = samples.length % 2 ? samples[middle] : (samples[middle-1]+samples[middle])/2;
  return {enter: Math.max(0.005, 1.5*median), exit: Math.max(0.01, 2*median)};
}

/** Retains interval metadata only; inputs use milliseconds relative to rehearsal start. */
export function createQuietDetector({enter, exit, minQuietMs=2000, maxGapMs=150}) {
  let lastAt = null;
  let highWaterAt = null;
  let pending = null;
  let activityObserved = false;
  let finished = false;
  const intervals = [];
  const snapshot = () => intervals.map(interval => ({...interval}));
  function close(endMs) {
    if (pending && endMs-pending.startMs >= minQuietMs) intervals.push({...pending,endMs});
    pending = null;
  }
  function invalidate() {
    if (finished) return;
    if (lastAt !== null) close(lastAt);
    lastAt = null;
  }
  function push(level) {
    if (finished) return;
    const {atMs,rms,sentenceId,valid} = level;
    if (!Number.isFinite(atMs) || atMs < 0) {
      invalidate();
      return;
    }
    // Preserve chronology even when continuity has been invalidated.
    if (highWaterAt !== null && atMs <= highWaterAt) { invalidate(); return; }
    highWaterAt = atMs;
    if (!valid || !Number.isFinite(rms) || rms < 0) { invalidate(); return; }
    if (lastAt !== null && atMs-lastAt > maxGapMs) invalidate();
    if (rms > exit) {
      close(atMs);
      activityObserved = true;
      for (const interval of intervals) if (interval.kind === 'trailing') interval.kind = 'between';
    } else if (!pending && rms <= enter) {
      pending = {startMs:atMs,sentenceId:sentenceId ?? null,kind:activityObserved ? 'trailing' : 'initial'};
    }
    lastAt = atMs;
  }
  function finish(endMs) {
    if (!finished) {
      // A bounded final sampling step may close quiet at Finish; larger gaps are unavailable.
      if (lastAt !== null) {
        const continuousEnd = Number.isFinite(endMs) && endMs >= lastAt && endMs-lastAt <= maxGapMs;
        close(continuousEnd ? endMs : lastAt);
      }
      finished = true;
    }
    return snapshot();
  }
  return {push,finish,invalidate};
}
