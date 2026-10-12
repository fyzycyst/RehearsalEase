import {prepareScript,parseTarget} from './script.mjs';
import {createSession} from './session.mjs';
import {summarizeRun} from './review.mjs';
import {localSupport} from './core.mjs';
import {installEnglishPack} from './pack.mjs';
import {sentences} from './sample.mjs';
import {createVoiceRuntime} from './voice-runtime.mjs';

/** Shared UI seam: injected adapters are explicit; the primary entry always uses live local voice. */
export function mountRehearsal(root,{runtime,readiness,install,mode='voice-only',simulation=false,now}={}) {
 const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const button=(text,handler)=>{const n=el('button',text);n.type='button';n.addEventListener('click',handler);return n;};
 const field=(label,input)=>{const n=el('label',undefined,'field');n.append(el('span',label),input);return n;};
 const input=(type,value)=>{const n=el('input');n.type=type;n.value=value;return n;};
 const header=el('header');header.append(el('p','RehearsalEase / A LITTLE SPACE TO PRACTICE','eyebrow'),el('h1','Practice at your own pace'));
 root.append(header);
 if(simulation)root.append(el('aside','SIMULATION — synthetic input only. No microphone, real recognition, or live acoustic verification.','simulation'));
 const status=el('p','Ready to prepare','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
 const prepare=el('section'),rehearse=el('section'),review=el('section');root.append(prepare,rehearse,review);
 const show=screen=>{for(const s of [prepare,rehearse,review])s.hidden=s!==screen;status.hidden=screen===rehearse;};
 prepare.append(el('h2','Make room for your words'),el('p','Use desktop Chrome with on-device English. Paste your script and choose a target. Check local English; if needed, explicitly Download English pack, then Start rehearsal. Everything stays in this session.','intro'));
 const raw=el('textarea');raw.rows=9;raw.value=sentences.join('\n\n');raw.spellcheck=false;
 prepare.append(field('Your script · plain text or Markdown',raw));
 const controls=el('div',undefined,'controls'),minutes=input('text','2'),seconds=input('text','00');
 for(const n of [minutes,seconds]){n.inputMode='numeric';n.size=3;}
 controls.append(field('Target minutes',minutes),field('Target seconds',seconds));
 const size=input('range','34');size.min='24';size.max='56';const rehearsalSize=input('range','34');rehearsalSize.min='24';rehearsalSize.max='56';
 controls.append(field('Text size',size),button('Use sample',()=>{raw.value=sentences.join('\n\n');validate();}));prepare.append(controls);
 const validation=el('p',undefined,'validation');validation.setAttribute('role','alert');prepare.append(validation);
 prepare.append(el('h3','Spoken text preview'));const preview=el('div',undefined,'preview');prepare.append(preview);
 const local=el('p','Local English readiness has not been checked.');local.setAttribute('role','status');local.setAttribute('aria-live','polite');local.setAttribute('aria-atomic','true');prepare.append(local);
 let operation=0,ready=false,busy=false,screen='prepare',active=false,prepared,run=null,buttons=[],displayedPosition=null;
 const readinessButton=button('Check local English',()=>check(false));const installButton=button('Download English pack',()=>check(true));
 const startButton=button('Start rehearsal',async()=>{
  if(startButton.disabled)return;
  const token=++operation;busy=true;run=null;validate();active=true;screen='rehearse';show(rehearse);renderScript(prepared.sentences);finishButton.disabled=false;stopButton.disabled=false;readinessButton.disabled=true;installButton.disabled=true;rehearsalHeading.focus();
  try{await session.start({script:prepared.sentences,targetSeconds:parseTarget(minutes.value,seconds.value)});}finally{if(token===operation){busy=false;validate();}}
 });
 const actions=el('div',undefined,'controls');actions.append(readinessButton,installButton,startButton);startButton.className='primary';prepare.append(actions,el('p',simulation?'Synthetic rehearsal only; no microphone or live acoustic verification.':mode==='voice-only'?'Start asks Chrome for microphone access. On-device English only; no cloud fallback. Quiet analysis is unavailable in voice-only mode.':'Start asks Chrome for microphone access. On-device English only; no cloud fallback. Stay quiet for one second of microphone calibration before rehearsing.','note'));
 async function check(download){
  if(active||busy||screen!=='prepare')return;busy=true;ready=false;validate();local.textContent=download?'Downloading local English; microphone remains stopped…':'Checking local English; microphone remains stopped…';
  try{const state=await(download?install():readiness());ready=state==='available';local.textContent=ready?'Local English is ready. Start when you are ready.':`Local English: ${state}. Rehearsal is blocked until available.`;}
  catch(error){local.textContent=`Local English unavailable: ${error.message}. No cloud fallback.`;}finally{busy=false;validate();}
 }
 function validate(){prepared=prepareScript(raw.value);preview.textContent=prepared.text||'Your spoken text will appear here.';const target=parseTarget(minutes.value,seconds.value);validation.textContent=!prepared.sentences.length?'Add a script to begin.':target===null?'Enter a positive target: whole minutes and seconds from 0 to 59.':'';startButton.disabled=busy||!ready||!prepared.sentences.length||target===null;readinessButton.disabled=busy||active;installButton.disabled=busy||active;}
 for(const n of [raw,minutes,seconds])n.addEventListener('input',validate);
 const rehearsalHeading=el('h2','Take your time');rehearsalHeading.tabIndex=-1;rehearse.append(rehearsalHeading,el('p','Read the highlighted sentence. Click any sentence to find your place.','intro'));
 const rehearsalToolbar=el('div',undefined,'rehearsal-toolbar');
 const rehearsalStatus=el('p','Ready to prepare','status');rehearsalStatus.setAttribute('role','status');rehearsalStatus.setAttribute('aria-live','polite');
 const rehearsalControls=el('div',undefined,'controls');const finishButton=button('Finish',()=>session.finish('finished')),stopButton=button('Stop microphone',()=>session.finish('stopped'));finishButton.className='primary';rehearsalControls.append(field('Text size',rehearsalSize),finishButton,stopButton);rehearsalToolbar.append(rehearsalStatus,rehearsalControls);rehearse.append(rehearsalToolbar);
 const script=el('div',undefined,'script');script.setAttribute('aria-label','Rehearsal script');rehearse.append(script);
 function applySize(value){size.value=value;rehearsalSize.value=value;script.style.setProperty('--script-size',`${value}px`);preview.style.fontSize=`${value}px`;}
 size.addEventListener('input',()=>applySize(size.value));rehearsalSize.addEventListener('input',()=>applySize(rehearsalSize.value));
 function renderScript(lines){displayedPosition=null;script.replaceChildren();buttons=lines.map((line,i)=>{const b=button(line,()=>session.setPosition(i));script.append(b);return b;});}
 function renderReview(result){
  const summary=summarizeRun(result);review.replaceChildren(el('h2',summary.heading),el('p',summary.message,'intro'));
  review.append(el('p',!simulation&&result.microphoneCleanup?.confirmed===true?'Microphone input stopped.':'Microphone shutdown not confirmed. Check Chrome’s microphone indicator.'));
  const cards=el('div',undefined,'cards');const duration=s=>`${s.toFixed(1)} sec`;
  for(const [label,value] of [['Actual time',duration(summary.actualSeconds)],['Target',duration(summary.targetSeconds)],['Difference',`${summary.deltaSeconds>=0?'+':''}${duration(summary.deltaSeconds)}`],['Approx. recognized pace',summary.paceWpm===null?'Unavailable':`${Math.round(summary.paceWpm)} words/min`]]){const card=el('div',undefined,'card');card.append(el('p',label),el('strong',value));cards.append(card);}review.append(cards,el('h3','Quiet intervals'));
  if(!result.acousticAvailable)review.append(el('p','Quiet interval analysis unavailable. Acoustic input or valid microphone calibration was unavailable for this rehearsal.'));
  else if(!summary.quiet.length)review.append(el('p','No measured quiet intervals of at least two seconds.'));
  else {const list=el('ul');for(const q of summary.quiet){const location=q.sentenceId===null?'location unknown':`near “${result.script[q.sentenceId]}”`;list.append(el('li',`${duration((q.endMs-q.startMs)/1000)} · ${q.kind} quiet · approximately ${location}`));}review.append(list);}
  const notes=el('ul',undefined,'notes');for(const note of summary.notes)notes.append(el('li',note));review.append(notes);
  const nav=el('div',undefined,'controls');const back=async(edit)=>{await session.reset();operation++;busy=false;active=false;screen='prepare';show(prepare);validate();status.textContent='Ready for another practice. Choose Start when you are ready.';if(edit)raw.focus();else startButton.focus();};nav.append(button('Try again',()=>back(false)),button('Edit script',()=>back(true)));review.append(nav);
 }
 const session=createSession({runtime,mode,...(now?{now}:{}),onChange:s=>{
  status.textContent=s.status;rehearsalStatus.textContent=s.status;
  if(s.state==='review'){operation++;busy=false;active=false;run=s.run;screen='review';renderReview(run);show(review);review.querySelector('h2').tabIndex=-1;review.querySelector('h2').focus();}
  else if(s.state==='stopping'){finishButton.disabled=true;stopButton.disabled=true;}
  else if(s.state==='rehearsing'){buttons.forEach((b,i)=>{b.classList.toggle('active',i===s.position);b.setAttribute('aria-current',i===s.position?'true':'false');});if(s.position!==displayedPosition){buttons[s.position]?.scrollIntoView({behavior:'smooth',block:'center'});displayedPosition=s.position;}}
 }});
 const interrupt=()=>{if(active)void session.finish('interrupted');};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});window.addEventListener('pagehide',interrupt);
 show(prepare);applySize('34');validate();
 return {session,getRun:()=>run};
}
const primary=document.getElementById('app');
if(primary){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const runtime=createVoiceRuntime({Recognition,mediaDevices:navigator.mediaDevices,createAudioContext:()=>new (window.AudioContext||window.webkitAudioContext)()});
 mountRehearsal(primary,{runtime,mode:'shared-track',readiness:async()=>{const support=localSupport(Recognition);if(!support.supported)throw new Error(support.reason);return Recognition.available({langs:['en-US'],processLocally:true});},install:()=>installEnglishPack(Recognition)});
}
