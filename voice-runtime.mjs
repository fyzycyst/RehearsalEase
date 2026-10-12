import {localSupport} from './core.mjs';

/** Owns capture for one explicit start. No recording or automatic restart. */
export function createVoiceRuntime({Recognition,mediaDevices,createAudioContext,now=()=>performance.now(),setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout}) {
 let active=null,sequence=0;
 const Configured=Recognition && class extends Recognition {constructor(){super();if('processLocally' in this)this.processLocally=true;this.lang='en-US';}};
 function cleanup(s) {
  if(s.cleaned)return;
  s.cleaned=true;
  const outcome=s.microphoneCleanup={confirmed:false,tracksEnded:false,samplingCancelled:false,contextCloseRequested:false};
  const attempt=fn=>{try{fn();}catch{s.cleanupFailed=true;}};
  attempt(()=>{clearTimeout(s.sampleTimer);s.sampleTimer=null;outcome.samplingCancelled=true;});
  let tracks=[];
  attempt(()=>{tracks=s.stream?.getTracks()||[];});
  for(const track of tracks) {
   attempt(()=>track.removeEventListener?.('ended',s.trackEnded));
   attempt(()=>track.removeEventListener?.('mute',s.trackMuted));
   attempt(()=>track.stop());
  }
  attempt(()=>{outcome.tracksEnded=tracks.length>0&&tracks.every(track=>track.readyState==='ended');});
  attempt(()=>s.source?.disconnect());
  attempt(()=>s.analyser?.disconnect());
  if(s.context)attempt(()=>{const closing=s.context.close();outcome.contextCloseRequested=true;Promise.resolve(closing).catch(()=>{s.cleanupFailed=true;outcome.confirmed=false;});});
  outcome.confirmed=outcome.tracksEnded&&outcome.samplingCancelled&&!s.capturePending&&!s.cleanupFailed;
 }
 function finish(s,complete) {
  if(s.done)return;
  s.done=true;clearTimeout(s.graceTimer);cleanup(s);
  if(!complete)try{s.recognition?.abort();}catch{}
  s.rejectReady?.(new Error('Voice startup cancelled'));
  s.resolveStop?.({recognitionComplete:complete,microphoneCleanup:{...s.microphoneCleanup,confirmed:s.microphoneCleanup?.confirmed===true&&!s.cleanupFailed}});
  if(active===s)active=null;
 }
 function interrupt(s,reason) {
  if(s.done||s.stopping)return;
  void stop({graceMs:0});
  s.onInterrupted?.(reason);
 }
 async function start({mode='voice-only',onTranscript=()=>{},onLevel=()=>{},onInterrupted=()=>{}}={}) {
  if(active)throw new Error('Voice runtime already active');
  if(!['shared-track','parallel','voice-only'].includes(mode))throw new Error('Unknown voice mode');
  const s={id:`voice-${++sequence}`,onInterrupted,cleaned:false,done:false,stopping:false};active=s;
  const check=()=>{if(s.done||s.stopping||active!==s)throw new Error('Voice startup cancelled');};
  try {
   const support=localSupport(Configured);
   if(!support.supported)throw new Error(support.reason);
   const availability=await Configured.available({langs:['en-US'],processLocally:true});check();
   if(availability!=='available')throw new Error('Local English pack unavailable');
   if(mode!=='voice-only') {
    s.capturePending=true;
    const stream=await mediaDevices.getUserMedia({audio:true});s.capturePending=false;
    if(s.done||s.stopping||active!==s){for(const track of stream.getTracks())try{track.stop();}catch{}throw new Error('Voice startup cancelled');}
    s.stream=stream;
    s.context=createAudioContext();
    if(s.context.resume)await s.context.resume();check();
    s.source=s.context.createMediaStreamSource(stream);s.analyser=s.context.createAnalyser();s.analyser.fftSize=2048;s.source.connect(s.analyser);
    s.trackEnded=()=>interrupt(s,'Microphone capture ended');
    s.trackMuted=()=>onLevel({atMs:now(),rms:0,sentenceId:null,valid:false});
    for(const track of stream.getTracks()){track.addEventListener?.('ended',s.trackEnded);track.addEventListener?.('mute',s.trackMuted);}
   }
   check();
   const r=s.recognition=new Configured();
   if(r.processLocally!==true)throw new Error('Local on-device recognition required; cloud fallback disabled');
   r.continuous=true;r.interimResults=true;
   r.onresult=event=>{if(s.done)return;for(let index=event.resultIndex;index<event.results.length;index++){const result=event.results[index];onTranscript({sessionId:s.id,index,text:String(result[0]?.transcript||'').trim(),final:Boolean(result.isFinal)});}};
   r.onerror=event=>{s.recognitionFailed=true;s.rejectReady?.(new Error(event.error||'Recognition error'));interrupt(s,event.error||'Recognition error');};
   r.onend=()=>{if(s.stopping)finish(s,!s.recognitionFailed);else {s.rejectReady?.(new Error('Recognition ended before ready'));interrupt(s,'Recognition ended');}};
   await new Promise((resolve,reject)=>{s.rejectReady=reject;r.onstart=()=>{s.ready=true;s.rejectReady=null;resolve();};try{mode==='shared-track'?r.start(s.stream.getAudioTracks()[0]):r.start();}catch(error){reject(error);}});check();
   if(s.analyser){const samples=new Float32Array(s.analyser.fftSize);const sample=()=>{if(s.done||s.stopping)return;const valid=s.context.state==='running'&&s.stream.getAudioTracks().every(t=>t.readyState==='live'&&!t.muted);let rms=0;if(valid){s.analyser.getFloatTimeDomainData(samples);rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);}onLevel({atMs:now(),rms,sentenceId:null,valid});s.sampleTimer=setTimeout(sample,50);};s.sampleTimer=setTimeout(sample,50);}
   return {acousticAvailable:Boolean(s.analyser)};
  }catch(error){finish(s,false);throw error;}
 }
 function stop({graceMs=1000}={}) {
  const s=active;if(!s)return Promise.resolve({recognitionComplete:false});
  if(s.stopPromise)return s.stopPromise;
  s.stopping=true;cleanup(s);
  s.stopPromise=new Promise(resolve=>s.resolveStop=resolve);
  if(!s.ready){finish(s,false);return s.stopPromise;}
  s.graceTimer=setTimeout(()=>finish(s,false),Math.max(0,Math.min(1000,Number(graceMs)||0)));
  try{s.recognition.stop();}catch{finish(s,false);}
  return s.stopPromise;
 }
 return {start,stop};
}
