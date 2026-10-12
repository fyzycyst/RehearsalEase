import test from 'node:test';
import assert from 'node:assert/strict';
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.style={setProperty(){}};this.classList={toggle(){}};this.textContent='';}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;} setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,fn){this.listeners[k]=fn;} focus(){document.activeElement=this;} scrollIntoView(options){(this.scrolls??=[]).push(options);}
 querySelector(tag){return walk(this).find(n=>n!==this&&n.tagName===tag)||null;}
}
const walk=n=>[n,...n.children.flatMap(walk)];
globalThis.document={createElement:tag=>new Node(tag),getElementById:()=>null,addEventListener(){},hidden:false};
globalThis.window={addEventListener(){}};
const {mountRehearsal}=await import('./app.mjs');
const find=(root,text)=>walk(root).find(n=>n.tagName==='button'&&n.textContent===text);
const invoke=(root,text)=>find(root,text).listeners.click();
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('cancelled deferred startup releases controls and old settlement cannot clear a later busy operation',async()=>{
 const root=new Node('div');let settle,settleReadiness;let calls=0;
 mountRehearsal(root,{runtime:{start:()=>new Promise(r=>settle=r),stop:()=>Promise.resolve({recognitionComplete:false})},readiness:()=>++calls===1?Promise.resolve('available'):new Promise(r=>settleReadiness=r),install:async()=>'available',simulation:true});
 await invoke(root,'Check local English');const starting=invoke(root,'Start rehearsal');await flush();await invoke(root,'Finish');await invoke(root,'Try again');
 assert.equal(find(root,'Check local English').disabled,false);
 const checking=invoke(root,'Check local English');assert.equal(find(root,'Check local English').disabled,true);
 settle({acousticAvailable:false});await starting;
 assert.equal(find(root,'Check local English').disabled,true,'old start must not release later check');
 settleReadiness('available');await checking;assert.equal(find(root,'Start rehearsal').disabled,false);
});
test('readiness failure is announced and Rehearse entry receives focus',async()=>{
 const root=new Node('div');let fail=true;
 mountRehearsal(root,{runtime:{start:async()=>({acousticAvailable:false}),stop:()=>Promise.resolve({recognitionComplete:true})},readiness:async()=>{if(fail)throw Error('Local API failed');return 'available';},install:async()=>'available'});
 await invoke(root,'Check local English');const local=walk(root).find(n=>n.textContent.includes('Local API failed'));
 assert.equal(local.attributes['aria-live'],'polite');assert.equal(find(root,'Start rehearsal').disabled,true);
 fail=false;await invoke(root,'Check local English');await invoke(root,'Start rehearsal');assert.equal(document.activeElement.textContent,'Take your time');await invoke(root,'Finish');
});

test('active sentence scrolls only when position changes and preserves keyboard focus',async()=>{
 const root=new Node('div');let transcript;
 const {session}=mountRehearsal(root,{runtime:{start:async({onTranscript})=>{transcript=onTranscript;return {acousticAvailable:false};},stop:async()=>({recognitionComplete:true})},readiness:async()=>'available',install:async()=>'available'});
 walk(root).find(n=>n.tagName==='textarea').value='Amber fox walks through woodland. Blue whale swims across ocean. Green finch sings beside meadow. Silver moon shines above mountains.';
 walk(root).find(n=>n.tagName==='textarea').listeners.input();
 await invoke(root,'Check local English');await invoke(root,'Start rehearsal');
 const heading=document.activeElement;
 const lines=walk(root).find(n=>n.attributes['aria-label']==='Rehearsal script').children;
 const initialScrolls=lines.reduce((sum,b)=>sum+(b.scrolls?.length||0),0);
 transcript({sessionId:'scroll',index:0,text:lines[0].textContent,final:false});
 assert.equal(lines.reduce((sum,b)=>sum+(b.scrolls?.length||0),0),initialScrolls,'unchanged initial interim must not scroll');
 transcript({sessionId:'scroll',index:1,text:lines[3].textContent,final:false});
 assert.equal(lines[3].scrolls?.length,1,'voice advancement brings later sentence into view');
 assert.equal(lines[3].attributes['aria-current'],'true');assert.equal(document.activeElement,heading);
 transcript({sessionId:'scroll',index:1,text:lines[3].textContent,final:true});
 assert.equal(lines[3].scrolls.length,1,'final revision at same position must not scroll again');
 lines[1].focus();lines[1].listeners.click();assert.equal(lines[1].scrolls?.length,1,'manual recovery brings sentence into view');assert.equal(document.activeElement,lines[1]);
 lines[1].listeners.click();assert.equal(lines[1].scrolls.length,1);
 await session.finish();await invoke(root,'Try again');await invoke(root,'Start rehearsal');
 const restarted=walk(root).find(n=>n.attributes['aria-label']==='Rehearsal script').children;
 assert.equal(restarted[0].attributes['aria-current'],'true');
 transcript({sessionId:'again',index:0,text:restarted[1].textContent,final:true});assert.equal(restarted[1].scrolls?.length,1,'new run resets scroll position tracking');
 await session.finish();
});

test('rehearsal toolbar contains live status, size and stop controls while other screens retain status',async()=>{
 const root=new Node('div');
 mountRehearsal(root,{runtime:{start:async()=>({acousticAvailable:false}),stop:async()=>({recognitionComplete:true})},readiness:async()=>'available',install:async()=>'available'});
 const toolbar=walk(root).find(n=>n.className==='rehearsal-toolbar');
 assert.ok(toolbar,'persistent rehearsal toolbar exists');
 assert.ok(walk(toolbar).includes(find(root,'Finish')));assert.ok(walk(toolbar).includes(find(root,'Stop microphone')));
 assert.ok(walk(toolbar).some(n=>n.tagName==='input'&&n.type==='range'));
 const localStatus=walk(toolbar).find(n=>n.attributes.role==='status');
 assert.equal(localStatus.attributes['aria-live'],'polite');
 const globalStatus=root.children.find(n=>n.className==='status');assert.equal(globalStatus.hidden,false);
 await invoke(root,'Check local English');await invoke(root,'Start rehearsal');
 assert.equal(globalStatus.hidden,true);assert.equal(localStatus.textContent,'Listening locally; quiet analysis unavailable');
 assert.equal(document.activeElement.textContent,'Take your time');
 await invoke(root,'Finish');assert.equal(globalStatus.hidden,false);assert.equal(globalStatus.textContent,'Practice saved');
 await invoke(root,'Try again');assert.equal(globalStatus.hidden,false);
});

test('primary entry starts local recognition on its acquired shared track and Stop releases it',async()=>{
 const root=new Node('div');const originalLookup=document.getElementById,originalWindow=globalThis.window;
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let startedTrack,recognition,requests=0,stops=0,closes=0;
 const track={readyState:'live',muted:false,stop(){stops++;},addEventListener(){},removeEventListener(){}};
 class Recognition {
  processLocally=false;
  static async available(options){assert.equal(options.processLocally,true);return 'available';}
  start(input){recognition=this;startedTrack=input;this.onstart();}
  stop(){this.onend();} abort(){}
 }
 class AudioContext {
  state='running';
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
  createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(samples){samples.fill(0.002);},disconnect(){}};}
  close(){closes++;}
 }
 document.getElementById=id=>id==='app'?root:null;
 globalThis.window={SpeechRecognition:Recognition,AudioContext,addEventListener(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(options){requests++;assert.deepEqual(options,{audio:true});return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}}});
 try {
  await import('./app.mjs?primary-entry-test');
  assert.equal(requests,0,'mount must not activate capture');
  await invoke(root,'Check local English');assert.equal(requests,0,'readiness must not activate capture');
  const starting=invoke(root,'Start rehearsal');
  for(let i=0;i<20&&!walk(root).some(n=>n.textContent==='Please stay quiet for microphone calibration');i++)await flush();
  assert.equal(requests,1);assert.equal(startedTrack,track,'production entry must supply acquired track');
  assert.equal(recognition.processLocally,true);
  assert.ok(walk(root).some(n=>n.textContent==='Please stay quiet for microphone calibration'));
  await invoke(root,'Stop microphone');await starting;
  assert.equal(stops,1);assert.equal(closes,1);
  assert.ok(walk(root).some(n=>n.textContent==='Quiet interval analysis unavailable. Acoustic input or valid microphone calibration was unavailable for this rehearsal.'));
 } finally {
  document.getElementById=originalLookup;globalThis.window=originalWindow;
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
 }
});

for(const [confirmed,simulation,message] of [[true,false,'Microphone input stopped.'],[false,false,'Microphone shutdown not confirmed. Check Chrome’s microphone indicator.'],[undefined,false,'Microphone shutdown not confirmed. Check Chrome’s microphone indicator.'],[true,true,'Microphone shutdown not confirmed. Check Chrome’s microphone indicator.']])test(`Review microphone confirmation: ${confirmed}, simulation ${simulation}`,async()=>{
 const root=new Node('div');
 const {session}=mountRehearsal(root,{simulation,runtime:{start:async()=>({acousticAvailable:false}),stop:async()=>({recognitionComplete:true,microphoneCleanup:confirmed===undefined?undefined:{confirmed}})},readiness:async()=>'available',install:async()=>'available'});
 await session.start({script:['Hello.'],targetSeconds:60});await session.finish();
 assert.ok(walk(root).some(n=>n.textContent===message));
});
