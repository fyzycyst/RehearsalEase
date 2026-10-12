import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranscriptLedger, summarizeRun} from './review.mjs';

const segment = (text, index = 0, final = true, sessionId = 'run') => ({sessionId, index, text, final});
const run = (overrides = {}) => ({script:['A much longer script must never supply spoken words.'], targetSeconds:90, elapsedMs:120000, reason:'finished', segments:[], quiet:[], acousticAvailable:true, recognitionComplete:true, ...overrides});

test('interim revisions do not contribute finalized words', () => {
  const ledger = createTranscriptLedger();
  ledger.upsert(segment('one two three', 0, false));
  ledger.upsert(segment('one two', 0, false));
  assert.deepEqual(ledger.finalized(), []);
  assert.equal(summarizeRun(run({segments:[segment('one two',0,false)]})).paceWpm, null);
});
test('duplicate result delivery replaces the same session and index', () => {
  const ledger = createTranscriptLedger();
  ledger.upsert(segment('one two')); ledger.upsert(segment('one two'));
  assert.equal(ledger.finalized().length, 1);
  assert.equal(summarizeRun(run({segments:ledger.finalized()})).paceWpm, 1);
});
test('real repeated speech and separate recognition sessions count', () => {
  const ledger = createTranscriptLedger();
  ledger.upsert(segment('one two')); ledger.upsert(segment('one two', 1)); ledger.upsert(segment('one two',0,true,'other'));
  assert.equal(summarizeRun(run({segments:ledger.finalized()})).paceWpm, 3);
});
test('final corrections replace earlier words in ledger and summary', () => {
  const ledger = createTranscriptLedger();
  ledger.upsert(segment('one two three four')); ledger.upsert(segment('one two'));
  assert.equal(summarizeRun(run({segments:ledger.finalized()})).paceWpm, 1);
  assert.equal(summarizeRun(run({segments:[segment('one two three four'),segment('one two')]})).paceWpm, 1);
});
test('four final English words over two minutes gives two WPM and signed target difference', () => {
  const summary = summarizeRun(run({segments:[segment("We're ready, let's go!")]}));
  assert.equal(summary.paceWpm, 2);
  assert.equal(summary.actualSeconds, 120); assert.equal(summary.targetSeconds, 90); assert.equal(summary.deltaSeconds, 30);
  assert.equal(summarizeRun(run({elapsedMs:60000})).deltaSeconds, -30);
});
test('missing words and zero or negative elapsed time leave pace unavailable', () => {
  for (const overrides of [{}, {segments:[segment('...')]}, {elapsedMs:0,segments:[segment('hello')]}, {elapsedMs:-1,segments:[segment('hello')]}]) {
    assert.equal(summarizeRun(run(overrides)).paceWpm, null);
  }
});
test('quiet intervals including unknown positions are retained with neutral explanatory notes', () => {
  const quiet = [{startMs:0,endMs:2500,sentenceId:null,kind:'initial'}];
  const summary = summarizeRun(run({quiet}));
  assert.deepEqual(summary.quiet, quiet);
  assert.ok(summary.notes.some(note => /quiet.*acoustic|acoustic.*quiet/i.test(note)));
  assert.ok(summary.notes.some(note => /location.*approximate|position.*approximate/i.test(note)));
  assert.equal('score' in summary, false);
});
test('finished and interrupted or stopped sessions use approved welcoming copy', () => {
  for (const reason of ['finished','interrupted','stopped']) {
    const summary = summarizeRun(run({reason}));
    assert.equal(summary.heading,'Thanks for practicing.');
    assert.equal(summary.message,reason === 'finished' ? 'You completed a rehearsal' : 'Your practice so far is saved for this session.');
  }
});
test('interrupted acoustic and incomplete recognition data are explained', () => {
  const summary = summarizeRun(run({reason:'interrupted',acousticAvailable:false,recognitionComplete:false}));
  assert.ok(summary.notes.some(note => /interrupt/i.test(note)));
  assert.ok(summary.notes.some(note => /recognition.*incomplete/i.test(note)));
  assert.ok(summary.notes.some(note => /quiet.*unavailable/i.test(note)));
  assert.ok(summary.notes.some(note => /pace.*approximate.*pauses/i.test(note)));
});
test('ledger snapshots and summaries do not allow caller mutation to alter stored records', () => {
  const ledger = createTranscriptLedger(); const input = segment('one two'); ledger.upsert(input); input.text='changed';
  const snapshot=ledger.finalized(); snapshot[0].text='changed again';
  assert.equal(ledger.finalized()[0].text,'one two');
});
