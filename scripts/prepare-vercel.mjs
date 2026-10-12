import {copyFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
const source=fileURLToPath(new URL('../',import.meta.url));
export const runtimeFiles=Object.freeze(['app.mjs','core.mjs','index.html','pack.mjs','quiet.mjs','review.mjs','script.mjs','session.mjs','styles.css','voice-runtime.mjs']);
// Public content is authored here, never read from the local rehearsal sample.
export const publicSentences=Object.freeze([
 'Welcome to a little space to practice.',
 'Take a breath and read the highlighted sentence at your own pace.',
 'Leave a little space between ideas so each thought has room to land.',
 'If you lose your place, choose a sentence and continue from there.',
 'When you are ready, finish your rehearsal and review the timing.'
]);
export async function prepareVercel(destination=resolve(source,'deploy/rehearsalease-public')) {
 const out=resolve(destination);
 const temporary=relative(resolve(tmpdir()),out);
 const disposable=/^rehearsalease-bundle-[^/]+\/public$/.test(temporary);
 if(out!==resolve(source,'deploy/rehearsalease-public')&&!disposable)throw new Error('Use the dedicated public output or a disposable bundle-test folder');
 await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
 for(const file of runtimeFiles)await copyFile(resolve(source,file),resolve(out,file));
 await writeFile(resolve(out,'sample.mjs'),`// Generic public rehearsal sample.\nexport const sentences = ${JSON.stringify(publicSentences,null,2)};\n`);
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(await prepareVercel());
