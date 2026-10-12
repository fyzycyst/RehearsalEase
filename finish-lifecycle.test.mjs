import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceRuntime} from './voice-runtime.mjs';
import {createSession} from './session.mjs';

function fixture({throwStop=false}={}) {
 let time=0,id=0,recognition,sampleReads=0,closeRequests=0;
 const timers=new Map(),changes=[],order=[];
 const track={readyState:'live',muted:false,stopCalls:0,stop(){this.stopCalls++;this.readyState='ended';order.push('track.stop');},addEventListener(){},removeEventListener(){}};
 const secondTrack={...track,stopCalls:0};
 const stream={getTracks:()=>[track,secondTrack],getAudioTracks:()=>[track]};
 const context={state:'running',close(){closeRequests++;order.push('context.close');return new Promise(()=>{});},createMediaStreamSource:()=>({connect(){},disconnect(){}}),createAnalyser:()=>({fftSize:4,disconnect(){},getFloatTimeDomainData(samples){sampleReads++;samples.fill(.001);}})};
 class Recognition {
  static async available(){return 'available';}
  constructor(){this.processLocally=false;recognition=this;}
  start(input){assert.equal(input,track);this.onstart();}
  stop(){order.push('recognition.stop');if(throwStop)throw Error('stop failed');}
  abort(){order.push('recognition.abort');}
 }
 const clock={now:()=>time,setTimeout(fn,ms){const timer=++id;timers.set(timer,{fn,at:time+ms,ms});return timer;},clearTimeout(timer){timers.delete(timer);}};
 const runtime=createVoiceRuntime({...clock,Recognition,mediaDevices:{getUserMedia:async()=>stream},createAudioContext:()=>context});
 const session=createSession({...clock,runtime,mode:'shared-track',onChange:s=>changes.push(s)});
 async function advance(ms){const endpoint=time+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=endpoint).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await Promise.resolve();}time=endpoint;await Promise.resolve();}
 async function start(){const p=session.start({script:['Hello world.'],targetSeconds:60});for(let i=0;i<12;i++)await Promise.resolve();await advance(1000);await p;assert.equal(changes.at(-1).state,'rehearsing');await advance(250);}
 const result=text=>recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});
 return {session,changes,order,track,secondTrack,timers,start,advance,result,get recognition(){return recognition;},get sampleReads(){return sampleReads;},get closeRequests(){return closeRequests;}};
}
for(const outcome of ['normal','timeout','error','throw'])test(`shared-track Finish lifecycle: ${outcome}`,async()=>{
 const f=fixture({throwStop:outcome==='throw'});await f.start();
 const reads=f.sampleReads;const finishing=f.session.finish('finished');
 assert.equal(f.track.stopCalls,1,'owned capture is stopped synchronously');
 assert.equal(f.closeRequests,1,'close is requested even when its promise never settles');
 assert.deepEqual(f.order.slice(0,3),['track.stop','track.stop','context.close']);
 assert.ok([...f.timers.values()].every(t=>t.ms!==50),'sampling timer is cancelled');
 if(outcome!=='throw')assert.equal(f.changes.at(-1).state,'stopping');
 if(outcome==='normal'){f.result('Hello world.');await f.advance(120);f.recognition.onend();}
 if(outcome==='error'){f.recognition.onerror({error:'audio-capture'});f.recognition.onend();}
 if(outcome==='timeout'){await f.advance(999);assert.equal(f.changes.at(-1).state,'stopping');await f.advance(1);}
 const run=await finishing;
 assert.equal(f.changes.at(-1).state,'review');
 assert.equal(run.elapsedMs,250,'finalization time does not inflate rehearsal duration');
 assert.equal(run.recognitionComplete,outcome==='normal');
 assert.equal(run.microphoneCleanup.confirmed,true);
 assert.equal(f.secondTrack.stopCalls,1);
 if(outcome==='normal')assert.equal(run.segments[0].text,'Hello world.');
 assert.equal(f.order.includes('recognition.abort'),outcome!=='normal');
 assert.equal(f.sampleReads,reads);
 const snapshot=JSON.stringify(run),changeCount=f.changes.length;
 f.result('Late mutation');f.recognition.onerror({error:'late'});f.recognition.onend();await f.advance(2000);
 assert.equal(JSON.stringify(run),snapshot);assert.equal(f.changes.length,changeCount);assert.equal(f.track.stopCalls,1);assert.equal(f.closeRequests,1);assert.equal(f.sampleReads,reads);assert.equal(f.timers.size,0);
 assert.equal(f.session.finish(),finishing);
});
