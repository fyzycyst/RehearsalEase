import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceRuntime} from './voice-runtime.mjs';
function fixture({available='available',permission,failStart=false,rejectLocal=false}={}) {
 const instances=[],timers=new Map();let serial=0;
 const track={stopCalls:0,readyState:'live',muted:false,stop(){this.stopCalls++;this.readyState='ended';},addEventListener(){},removeEventListener(){}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class Recognition {static async available(options){assert.equal(options.processLocally,true);return available;} constructor(){this.processLocally=false;instances.push(this);if(rejectLocal&&instances.length>1)Object.defineProperty(this,'processLocally',{get:()=>false,set(){}});} start(input){this.input=input;this.starts=1;if(failStart)throw Error('start failed');this.onstart?.();} stop(){this.stops=(this.stops||0)+1;} abort(){this.aborts=(this.aborts||0)+1;}}
 const source={connect(){},disconnect(){this.disconnected=true;}};
 const context={state:'running',createMediaStreamSource:()=>source,createAnalyser:()=>({fftSize:4,getFloatTimeDomainData(a){a.fill(.1);},disconnect(){}}),close(){this.closed=true;return Promise.resolve();}};
 const runtime=createVoiceRuntime({Recognition,mediaDevices:{getUserMedia:()=>permission||Promise.resolve(stream)},createAudioContext:()=>context,now:()=>125,setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 return {runtime,instances,track,stream,context,timers,flush(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}
test('unavailable local pack blocks recognition start',async()=>{const f=fixture({available:'downloadable'});await assert.rejects(f.runtime.start({mode:'voice-only'}),/local|pack/i);assert.ok(f.instances.every(r=>!r.starts));});
test('shared track uses local English recognition and emits normalized records',async()=>{const f=fixture();const transcripts=[],levels=[];assert.deepEqual(await f.runtime.start({mode:'shared-track',onTranscript:r=>transcripts.push(r),onLevel:r=>levels.push(r)}),{acousticAvailable:true});const r=f.instances.at(-1);assert.equal(r.processLocally,true);assert.equal(r.lang,'en-US');assert.equal(r.input,f.track);r.onresult({resultIndex:0,results:[Object.assign([{transcript:' hello '}],{isFinal:true})]});assert.equal(transcripts[0].text,'hello');assert.equal(transcripts[0].final,true);assert.equal(transcripts[0].index,0);f.flush(50);assert.equal(levels[0].sentenceId,null);assert.equal(levels[0].atMs,125);});
test('stop cleans tracks before grace expires and ignores late callbacks',async()=>{const f=fixture();let count=0;await f.runtime.start({mode:'parallel',onTranscript:()=>count++});const r=f.instances.at(-1);const stopping=f.runtime.stop({graceMs:1000});assert.equal(f.track.stopCalls,1);assert.equal(f.context.closed,true);r.onresult({resultIndex:0,results:[Object.assign([{transcript:'last'}],{isFinal:true})]});assert.equal(count,1);f.flush(1000);assert.equal((await stopping).recognitionComplete,false);assert.equal(r.aborts,1);r.onresult?.({resultIndex:0,results:[]});assert.equal(count,1);await f.runtime.stop();assert.equal(f.track.stopCalls,1);});
test('recognition end resolves graceful completion',async()=>{const f=fixture();await f.runtime.start({mode:'voice-only'});const p=f.runtime.stop();f.instances.at(-1).onend();assert.equal((await p).recognitionComplete,true);});
test('startup failure cleans partially acquired resources',async()=>{const f=fixture({failStart:true});await assert.rejects(f.runtime.start({mode:'shared-track'}),/start failed/);assert.equal(f.track.stopCalls,1);assert.equal(f.context.closed,true);});
test('late permission after cancellation stops tracks without recognition start',async()=>{let resolve;const permission=new Promise(r=>resolve=r);const f=fixture({permission});const start=f.runtime.start({mode:'shared-track'});await Promise.resolve();await Promise.resolve();await f.runtime.stop();resolve(f.stream);await assert.rejects(start,/cancel/i);assert.equal(f.track.stopCalls,1);assert.ok(f.instances.every(r=>!r.starts));});
test('absent explicit local API cannot be added by runtime configuration',async()=>{let starts=0;class Legacy {static async available(){return 'available';}start(){starts++;throw Error("Legacy recognition was started");}}const runtime=createVoiceRuntime({Recognition:Legacy});await assert.rejects(runtime.start({mode:'voice-only'}),/cloud fallback disabled/);assert.equal(starts,0);});
test('muted samples are unavailable and recognition errors immediately release capture',async()=>{const f=fixture();const levels=[],interruptions=[];await f.runtime.start({mode:'parallel',onLevel:r=>levels.push(r),onInterrupted:r=>interruptions.push(r)});f.track.muted=true;f.flush(50);assert.equal(levels[0].valid,false);f.instances.at(-1).onerror({error:'audio-capture'});assert.equal(f.track.stopCalls,1);assert.deepEqual(interruptions,['audio-capture']);f.flush(0);});
test('concurrent stop returns the same promise and stops recognition once',async()=>{const f=fixture();await f.runtime.start({mode:'parallel'});const first=f.runtime.stop(),second=f.runtime.stop();assert.equal(first,second);assert.equal(f.instances.at(-1).stops,1);f.instances.at(-1).onend();await first;assert.equal(f.track.stopCalls,1);});
test('voice-only never requests acoustic capture',async()=>{const f=fixture();assert.deepEqual(await f.runtime.start({mode:'voice-only'}),{acousticAvailable:false});assert.equal(f.instances.at(-1).input,undefined);assert.equal(f.context.closed,undefined);const stopping=f.runtime.stop();f.instances.at(-1).onend();await stopping;assert.equal(f.track.stopCalls,0);});
test('recognition error during final grace remains incomplete after end',async()=>{const f=fixture();await f.runtime.start({mode:'parallel'});const stopping=f.runtime.stop();assert.equal(f.track.stopCalls,1);const recognition=f.instances.at(-1);recognition.onerror({error:'audio-capture'});recognition.onend();assert.equal((await stopping).recognitionComplete,false);assert.equal(f.track.stopCalls,1);});
test('throwing interruption consumer cannot bypass runtime cleanup',async()=>{const f=fixture();await f.runtime.start({mode:'parallel',onInterrupted:()=>{throw Error('consumer failed');}});assert.throws(()=>f.instances.at(-1).onerror({error:'audio-capture'}),/consumer failed/);assert.equal(f.track.stopCalls,1);assert.equal(f.context.closed,true);assert.equal(f.instances.at(-1).stops,1);assert.ok([...f.timers.values()].every(timer=>timer.ms!==50));f.flush(0);});

for(const mode of ['voice-only','shared-track','parallel'])test(`rejected local setting on actual ${mode} instance blocks start and releases acquired resources`,async()=>{
 const f=fixture({rejectLocal:true});
 await assert.rejects(f.runtime.start({mode}),/local.*disabled|local.*required/i);
 assert.ok(f.instances.every(r=>!r.starts),'no recognition instance may start');
 assert.equal(f.instances.at(-1).aborts,1);
 assert.equal(f.track.stopCalls,mode==='voice-only'?0:1);
 assert.equal(f.context.closed,mode==='voice-only'?undefined:true);
 assert.equal(f.timers.size,0);
 assert.deepEqual(await f.runtime.stop(),{recognitionComplete:false});
});

test('failed track cleanup continues other tracks and yields uncertain capture outcome',async()=>{
 const f=fixture();const second={readyState:'live',stopCalls:0,stop(){this.stopCalls++;this.readyState='ended';}};
 f.stream.getTracks=()=>[f.track,second];f.track.stop=()=>{f.track.stopCalls++;throw Error('track failed');};
 await f.runtime.start({mode:'shared-track'});const p=f.runtime.stop();f.instances.at(-1).onend();const result=await p;
 assert.equal(result.recognitionComplete,true);assert.equal(result.microphoneCleanup.confirmed,false);assert.equal(second.stopCalls,1);assert.equal(f.context.closed,true);assert.equal(f.timers.size,0);
});
test('live readyState after stop cannot confirm cleanup',async()=>{const f=fixture();f.track.stop=()=>f.track.stopCalls++;await f.runtime.start({mode:'shared-track'});const p=f.runtime.stop();f.instances.at(-1).onend();assert.equal((await p).microphoneCleanup.confirmed,false);});
test('voice-only and pending capture cannot confirm owned microphone shutdown',async()=>{
 const f=fixture();await f.runtime.start({mode:'voice-only'});const p=f.runtime.stop();f.instances.at(-1).onend();assert.equal((await p).microphoneCleanup.confirmed,false);
 let resolve;const pending=fixture({permission:new Promise(r=>resolve=r)});const starting=pending.runtime.start({mode:'shared-track'});await Promise.resolve();await Promise.resolve();assert.equal((await pending.runtime.stop()).microphoneCleanup.confirmed,false);resolve(pending.stream);await assert.rejects(starting);
});
test('throwing disconnect and rejected context close leave cleanup unconfirmed',async()=>{
 const f=fixture();f.context.createMediaStreamSource=()=>({connect(){},disconnect(){throw Error('disconnect failed');}});f.context.close=()=>Promise.reject(Error('close failed'));await f.runtime.start({mode:'shared-track'});const p=f.runtime.stop();await Promise.resolve();f.instances.at(-1).onend();assert.equal((await p).microphoneCleanup.confirmed,false);assert.equal(f.track.stopCalls,1);assert.equal(f.timers.size,0);
});

test('immediate recognition end confirms cleanup once and does not retain prior run confirmation',async()=>{const f=fixture();await f.runtime.start({mode:'shared-track'});f.instances.at(-1).stop=function(){this.stops=(this.stops||0)+1;this.onend();};const result=await f.runtime.stop();assert.equal(result.microphoneCleanup.confirmed,true);assert.equal(result.microphoneCleanup.contextCloseRequested,true);assert.equal(f.track.stopCalls,1);assert.equal(f.timers.size,0);assert.equal((await f.runtime.stop()).microphoneCleanup,undefined);});
test('listener removal failure cannot bypass track release or recognition stop',async()=>{const f=fixture();f.track.removeEventListener=()=>{throw Error('remove failed');};await f.runtime.start({mode:'shared-track'});const p=f.runtime.stop();assert.equal(f.track.stopCalls,1);assert.equal(f.instances.at(-1).stops,1);f.instances.at(-1).onend();assert.equal((await p).microphoneCleanup.confirmed,false);});
