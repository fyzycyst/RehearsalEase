import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('dependency-free release builds only the named static output',async()=>{
 const pkg=JSON.parse(await readFile(new URL('package.json',import.meta.url),'utf8'));
 const config=JSON.parse(await readFile(new URL('vercel.json',import.meta.url),'utf8'));
 assert.equal(pkg.name,'rehearsalease');assert.equal(pkg.private,true);
 assert.equal(pkg.scripts.test,'node --test *.test.mjs');assert.equal(pkg.scripts.build,'node scripts/prepare-vercel.mjs');
 assert.equal(pkg.dependencies,undefined);assert.equal(pkg.devDependencies,undefined);
 assert.deepEqual(config,{framework:null,buildCommand:'npm run build',outputDirectory:'deploy/rehearsalease-public'});
 assert.match(await readFile(new URL('index.html',import.meta.url),'utf8'),/<title>RehearsalEase — Practice at your own pace<\/title>/);
 assert.match(await readFile(new URL('app.mjs',import.meta.url),'utf8'),/RehearsalEase \/ A LITTLE SPACE TO PRACTICE/);
});
