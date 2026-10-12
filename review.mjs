/** Latest recognition delivery wins for each recognition session/result index. */
export function createTranscriptLedger() {
  const records = new Map();
  return {
    upsert(record) {
      // Tuple encoding keeps session IDs containing punctuation unambiguous.
      records.set(JSON.stringify([record.sessionId, record.index]), {...record});
    },
    finalized() {
      return [...records.values()].filter(record => record.final === true).map(record => ({...record}));
    }
  };
}

// Contractions count as one English word; punctuation never supplies words.
const countWords = text => (text.match(/[a-z0-9]+(?:['’][a-z0-9]+)*/gi) || []).length;

/** Descriptive metrics use finalized recognized speech and total elapsed time. */
export function summarizeRun(run) {
  const ledger = createTranscriptLedger();
  for (const record of run.segments) ledger.upsert(record);
  const recognizedWords = ledger.finalized().reduce((sum, record) => sum + countWords(record.text), 0);
  const actualSeconds = Math.max(0, run.elapsedMs) / 1000;
  const notes = [
    'Recognized pace is approximate and includes pauses.',
    'Quiet intervals reflect measured acoustic quiet; noise and soft speech can affect detection.',
    'Script locations are approximate; unknown positions remain unknown.'
  ];
  if (!recognizedWords) notes.push('Recognized pace is unavailable because no usable finalized words were recognized.');
  if (!run.recognitionComplete) notes.push('Recognition data is incomplete; some spoken words may be missing.');
  if (!run.acousticAvailable) notes.push('Quiet interval analysis is unavailable for unobserved acoustic input.');
  if (run.reason === 'interrupted') notes.push('Practice was interrupted; unobserved time is not reported as quiet.');
  return {
    actualSeconds,
    targetSeconds: run.targetSeconds,
    deltaSeconds: actualSeconds - run.targetSeconds,
    paceWpm: recognizedWords > 0 && run.elapsedMs > 0 ? recognizedWords / (run.elapsedMs / 60000) : null,
    quiet: run.quiet.map(interval => ({...interval})),
    heading: 'Thanks for practicing.',
    message: run.reason === 'finished' ? 'You completed a rehearsal' : 'Your practice so far is saved for this session.',
    notes
  };
}
