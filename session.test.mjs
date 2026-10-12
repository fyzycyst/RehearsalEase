import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from './session.mjs';
function harness(mode='voice-only') {
 let time=10000, callbacks, ready, stopped, calls=0; const timers=new Map();let id=0;const changes=[];
 const runtime={start(c){callbacks=c;return new Promise(r=>ready=r);},stop(){calls++;return new Promise(r=>stopped=r);}};
 const session=createSession({runtime,mode,now:()=>time,setTimeout:(f,ms)=>{timers.set(++id,{f,at:time+ms});return id;},clearTimeout:i=>timers.delete(i),onChange:c=>changes.push(c)});
 return {session,changes,get callbacks(){return callbacks;},get calls(){return calls;},ready:()=>ready({acousticAvailable:mode!=='voice-only'}),stop:()=>stopped({recognitionComplete:true}),advance(ms){time+=ms;for(const [i,t] of [...timers])if(t.at<=time){timers.delete(i);t.f();}},level(rms=0,valid=true){callbacks.onLevel({atMs:time,rms,valid,sentenceId:null});}};
}
const script=['Hello world.','Another complete sentence here.'];
const event=(text,final=true)=>({sessionId:'voice-1',index:0,text,final});
test('readiness excluded; frozen elapsed includes pauses and bounded finals',async()=>{
 const h=harness();const p=h.session.start({script,targetSeconds:120});h.callbacks.onTranscript({...event('preparation'),index:9});h.advance(5000);h.ready();await p;
 h.advance(120000);const f=h.session.finish('finished');assert.equal(h.calls,1);h.callbacks.onTranscript(event('Hello world.'));h.advance(1000);const run=await f;
 assert.equal(run.elapsedMs,120000);assert.equal(run.segments[0].text,'Hello world.');assert.equal(run.recognitionComplete,false);
 h.callbacks.onTranscript(event('too late'));assert.equal(run.segments[0].text,'Hello world.');assert.equal(h.changes.at(-1).position,0);
});
test('script copy, click recovery, matching and duplicated finish/reset',async()=>{
 const h=harness();const mutable=[...script];const p=h.session.start({script:mutable,targetSeconds:120});h.ready();await p;mutable[0]='changed';h.session.setPosition(1);assert.equal(h.changes.at(-1).position,1);
 const f=h.session.finish('stopped');assert.equal(h.session.finish('finished'),f);h.callbacks.onTranscript(event('Hello world.'));h.stop();const run=await f;assert.equal(run.script[0],script[0]);assert.equal(h.changes.at(-1).position,1);await h.session.reset();await h.session.reset();assert.equal(h.calls,1);
});
test('calibration excluded and absolute samples converted once; invalid levels break quiet',async()=>{
 const h=harness('shared-track');const p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(.001);h.callbacks.onTranscript(event('calibration'));h.advance(1000);await p;
 for(let i=0;i<=40;i++){h.level();h.advance(50);}h.level(0,false);h.advance(500);const f=h.session.finish('interrupted');h.stop();const run=await f;
 assert.equal(run.elapsedMs,2550);assert.equal(run.segments.length,0);assert.deepEqual(run.quiet,[{startMs:0,endMs:2000,sentenceId:null,kind:'initial'}]);
});
test('reset during readiness cancels start and rejects stale callbacks',async()=>{
 const h=harness();const p=h.session.start({script,targetSeconds:120});const r=h.session.reset();h.stop();await r;h.ready();await p;h.callbacks.onTranscript(event('late'));assert.equal(h.changes.at(-1).state,'preparing');assert.equal(h.calls,1);
});
test('startup failure returns interrupted zero metrics and cleanup',async()=>{
 const changes=[];let calls=0;const s=createSession({runtime:{start:async()=>{throw Error('denied');},stop:async()=>{calls++;return{};}},mode:'voice-only',onChange:c=>changes.push(c)});
 await s.start({script,targetSeconds:120});assert.equal(calls,1);assert.equal(changes.at(-1).run.elapsedMs,0);assert.equal(changes.at(-1).run.reason,'interrupted');assert.equal(changes.at(-1).run.acousticAvailable,false);
});
test('interruption invalidates pending quiet and stopping levels are ignored',async()=>{
 const h=harness('parallel');const p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(.001);h.advance(1000);await p;h.level();h.advance(100);h.callbacks.onInterrupted('Page hidden');h.advance(5000);h.level();h.stop();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.deepEqual(h.changes.at(-1).run.quiet,[]);
});
test('calibration cancellation ignores finals and late levels',async()=>{
 const h=harness('shared-track');const p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(.001);
 const f=h.session.finish('stopped');h.callbacks.onTranscript(event('not rehearsal'));h.stop();await f;await p;assert.equal(h.changes.at(-1).run.elapsedMs,0);assert.deepEqual(h.changes.at(-1).run.segments,[]);assert.equal(h.changes.at(-1).run.acousticAvailable,false);
});
test('failed calibration disables quiet; old generation cannot contaminate next run',async()=>{
 const h=harness('parallel');let p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(0,false);h.advance(1000);await p;
 const old=h.callbacks;let f=h.session.finish('finished');h.stop();await f;assert.equal(h.changes.at(-1).run.acousticAvailable,false);
 p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(.001);h.advance(1000);await p;old.onTranscript(event('old'));old.onInterrupted('old');h.advance(50);f=h.session.finish('finished');h.stop();const run=await f;assert.deepEqual(run.segments,[]);assert.equal(run.elapsedMs,50);
});
test('valid latest sample sets finish endpoint and interim stopping revisions ignored',async()=>{
 const h=harness('parallel');const p=h.session.start({script,targetSeconds:120});h.ready();await Promise.resolve();await Promise.resolve();h.level(.001);h.advance(1000);await p;
 h.callbacks.onLevel({atMs:11050,rms:0,valid:true});const f=h.session.finish('finished');h.callbacks.onTranscript(event('interim',false));h.stop();const run=await f;assert.equal(run.elapsedMs,50);assert.deepEqual(run.segments,[]);
});

for (const finalState of ['rehearsing','stopping']) {
 test(`preparation result key stays excluded when finalized during ${finalState}`,async()=>{
  const h=harness();const p=h.session.start({script,targetSeconds:120});
  h.callbacks.onTranscript(event('Another complete sentence here.',false));h.ready();await p;
  let f;if(finalState==='stopping')f=h.session.finish('finished');
  h.callbacks.onTranscript(event('Another complete sentence here.'));
  assert.equal(h.changes.at(-1).position,0);
  h.callbacks.onTranscript({...event('Hello world.'),index:1});
  f??=h.session.finish('finished');h.stop();const run=await f;
  assert.deepEqual(run.segments,[{...event('Hello world.'),index:1}]);
 });
}

test('session timeout cannot borrow a late cleanup confirmation',async()=>{const h=harness();const start=h.session.start({script,targetSeconds:60});h.ready();await start;const finish=h.session.finish();h.advance(1000);const run=await finish;assert.equal(run.microphoneCleanup.confirmed,false);h.stop();await Promise.resolve();assert.equal(run.microphoneCleanup.confirmed,false);});
for(const failure of ['throw','reject','missing'])test(`session ${failure} cleanup outcome stays uncertain after a confirmed previous run`,async()=>{
 let count=0;const runtime={start:async()=>({acousticAvailable:false}),stop(){if(++count===1)return {recognitionComplete:true,microphoneCleanup:{confirmed:true}};if(failure==='throw')throw Error('stop failed');if(failure==='reject')return Promise.reject(Error('stop failed'));return {recognitionComplete:true};}};
 const session=createSession({runtime,mode:'shared-track'});await session.start({script,targetSeconds:60});assert.equal((await session.finish()).microphoneCleanup.confirmed,true);await session.start({script,targetSeconds:60});assert.equal((await session.finish()).microphoneCleanup.confirmed,false);
});
