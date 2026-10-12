import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const expected=['app.mjs','core.mjs','index.html','pack.mjs','quiet.mjs','review.mjs','sample.mjs','script.mjs','session.mjs','styles.css'];
expected.push('voice-runtime.mjs');expected.sort();
test('public bundle has exact boundary, source equality, closed imports and clean deterministic rebuild',async()=>{
 const {prepareVercel}=await import('./scripts/prepare-vercel.mjs');
 const temporary=await mkdtemp(join(tmpdir(),'rehearsalease-bundle-'));
 try {
  const out=join(temporary,'public');await prepareVercel(out);
  assert.deepEqual((await readdir(out)).sort(),expected);
  const first={};
  for(const file of expected){
   const body=await readFile(join(out,file),'utf8');first[file]=body;
   if(file!=='sample.mjs')assert.equal(body,await readFile(new URL(file,import.meta.url),'utf8'));
   assert.doesNotMatch(body,/download-diagnostics|runtime-check|ui-check|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|(?:sk|ghp|vercel)_[A-Za-z0-9]{20}/);
   for(const match of body.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    assert.match(match[1],/^\.\/[a-z-]+\.mjs$/);assert.ok(expected.includes(match[1].slice(2)));
   }
  }
  assert.match(first['app.mjs'],/Use desktop Chrome with on-device English/);
  assert.match(first['app.mjs'],/Check local English; if needed, explicitly Download English pack, then Start rehearsal/);
  for(const match of first['index.html'].matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(expected.includes(match[1]));
  assert.notEqual(first['sample.mjs'],await readFile(new URL('sample.mjs',import.meta.url),'utf8'));
  const {sentences}=await import(pathToFileURL(join(out,'sample.mjs')));assert.ok(sentences.length>=3);assert.ok(sentences.every(s=>typeof s==='string'));
  await mkdir(join(out,'.hidden'));await writeFile(join(out,'.hidden','credential'),'private');await writeFile(join(out,'diagnostics.json'),'private');
  await prepareVercel(out);assert.deepEqual((await readdir(out)).sort(),expected);
  for(const file of expected)assert.equal(await readFile(join(out,file),'utf8'),first[file]);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
