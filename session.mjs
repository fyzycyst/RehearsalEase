import {matchSentence} from './core.mjs';
import {calibrateNoise,createQuietDetector} from './quiet.mjs';
import {createTranscriptLedger} from './review.mjs';

/** One explicit rehearsal. Runtime levels and now share an absolute monotonic clock. */
export function createSession({runtime,now=()=>performance.now(),setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout,mode,onChange=()=>{}}) {
 if(!['voice-only','parallel','shared-track'].includes(mode))throw new Error('A verified runtime mode must be injected');
 let active=null,generation=0;
 const emit=s=>onChange({state:s?.state||'preparing',position:s?.position||0,status:s?.status||'Ready to prepare',run:s?.run||null});
 const current=s=>active===s&&s.generation===generation;
 function finish(reason='finished') {
  const s=active;
  if(!s)return Promise.resolve(null);
  if(s.finishPromise)return s.finishPromise;
  if(!['finished','stopped','interrupted'].includes(reason))throw new Error('Unknown finish reason');
  const endpoint=Math.max(s.origin??0,now(),s.latestAt??0);
  s.elapsedMs=s.origin===null?0:endpoint-s.origin;
  s.state='stopping';s.status='Finishing recognition';
  s.cancelCalibration?.();
  if(reason==='interrupted')s.detector?.invalidate();
  const quiet=s.detector?.finish(s.elapsedMs)||[];
  // Invoke stop synchronously: tracks are released before any final-result wait.
  let stop;try{stop=runtime.stop({graceMs:1000});}catch{stop=Promise.resolve({recognitionComplete:false});}
  s.finishPromise=new Promise(resolve=>{
   let done=false,timer;
   const complete=result=>{
    if(done)return;done=true;clearTimeout(timer);
    s.run={script:[...s.script],targetSeconds:s.targetSeconds,elapsedMs:s.elapsedMs,reason,segments:s.ledger.finalized(),quiet,acousticAvailable:s.acousticAvailable,recognitionComplete:result?.recognitionComplete===true,microphoneCleanup:result?.microphoneCleanup?{...result.microphoneCleanup,confirmed:result.microphoneCleanup.confirmed===true}:{confirmed:false}};
    s.state='review';s.status=s.failure||'Practice saved';if(current(s))emit(s);resolve(s.run);
   };
   timer=setTimeout(()=>complete({recognitionComplete:false}),1000);
   Promise.resolve(stop).then(complete,()=>complete({recognitionComplete:false}));
  });
  emit(s);return s.finishPromise;
 }
 async function start({script,targetSeconds}) {
  if(active&&active.state!=='review')throw new Error('Session already active');
  if(!Array.isArray(script)||!script.length||script.some(t=>typeof t!=='string'||!t.trim())||!Number.isFinite(targetSeconds)||targetSeconds<=0)throw new Error('Script and positive target required');
  const s={generation:++generation,script:Object.freeze([...script]),targetSeconds,state:'preparing',status:'Preparing local recognition',position:0,run:null,origin:null,latestAt:null,ledger:createTranscriptLedger(),preOriginKeys:new Set(),acousticAvailable:false,detector:null};active=s;emit(s);
  try {
   const result=await runtime.start({mode,onTranscript:record=>{
    if(!current(s)||s.state==='review')return;
    if(typeof record.sessionId!=='string'||!Number.isInteger(record.index)||record.index<0||typeof record.text!=='string')return;
    const key=JSON.stringify([record.sessionId,record.index]);
    // Transcript has no capture timestamp: remember keys observed before origin,
    // and exclude all their later revisions from both matching and the ledger.
    if(s.origin===null){s.preOriginKeys.add(key);return;}
    if(s.preOriginKeys.has(key)||!(s.state==='rehearsing'||s.state==='stopping'&&record.final===true))return;
    s.ledger.upsert(record);
    if(s.state==='rehearsing'){const position=matchSentence(s.script,s.position,record.text);if(position!==s.position)s.lastMatch=position;s.position=position;emit(s);}
   },onLevel:level=>{
    if(!current(s))return;
    if(s.state==='preparing'&&s.calibrating){if(level.valid&&Number.isFinite(level.rms)&&level.rms>=0)s.samples.push(level.rms);return;}
    if(s.state!=='rehearsing'||!s.detector)return;
    if(Number.isFinite(level.atMs)&&level.atMs>=s.origin)s.latestAt=Math.max(s.latestAt??s.origin,level.atMs);
    s.detector.push({...level,atMs:level.atMs-s.origin,sentenceId:s.lastMatch??null});
   },onInterrupted:message=>{if(current(s)&&['preparing','rehearsing'].includes(s.state)){s.failure=message;void finish('interrupted');}}});
   if(!current(s)||s.state!=='preparing')return;
   if(mode!=='voice-only'&&result?.acousticAvailable){
    s.samples=[];s.calibrating=true;s.status='Please stay quiet for microphone calibration';emit(s);
    await new Promise(resolve=>{const timer=setTimeout(resolve,1000);s.cancelCalibration=()=>{clearTimeout(timer);resolve();};});
    s.calibrating=false;s.cancelCalibration=null;
    if(!current(s)||s.state!=='preparing')return;
    const thresholds=calibrateNoise(s.samples);s.samples=null;
    if(thresholds){s.detector=createQuietDetector(thresholds);s.acousticAvailable=true;}
   }
   s.origin=now();s.state='rehearsing';s.status=s.acousticAvailable?'Listening locally':'Listening locally; quiet analysis unavailable';emit(s);
  }catch(error){if(current(s)&&s.state==='preparing'){s.failure=`Voice unavailable: ${error.message}`;await finish('interrupted');}}
 }
 function setPosition(index){const s=active;if(s?.state==='rehearsing'&&Number.isInteger(index)&&index>=0&&index<s.script.length){s.position=index;s.lastMatch=index;emit(s);}}
 async function reset(){const s=active;if(!s)return;if(s.state!=='review')await finish('stopped');if(active===s){generation++;active=null;emit(null);}}
 return {start,setPosition,finish,reset};
}
