import test from 'node:test';
import assert from 'node:assert/strict';
import {calibrateNoise, createQuietDetector} from './quiet.mjs';
const make = () => createQuietDetector({enter:0.005,exit:0.01,minQuietMs:2000,maxGapMs:150});
const level = (d, atMs, rms=0, sentenceId=null, valid=true) => d.push({atMs,rms,sentenceId,valid});
function span(d,start,end,rms=0,id=null) { for(let t=start;t<end;t+=100) level(d,t,rms,id); level(d,end,rms,id); }
test('calibration uses median valid nonnegative samples and floors',()=>{
 assert.equal(calibrateNoise([]),null); assert.equal(calibrateNoise([NaN,-1,Infinity]),null);
 assert.deepEqual(calibrateNoise([0,0,0]),{enter:0.005,exit:0.01});
 assert.deepEqual(calibrateNoise([0.01,0.02,0.03,NaN]),{enter:0.03,exit:0.04});
 assert.deepEqual(calibrateNoise([0.01,0.03]),{enter:0.03,exit:0.04});
});
test('exact 2000ms boundary and finish are idempotent',()=>{
 const d=make(); span(d,0,900,0.02); span(d,1000,3000,0,4);
 assert.deepEqual(d.finish(3000),[{startMs:1000,endMs:3000,sentenceId:4,kind:'trailing'}]);
 assert.equal(d.finish(3000)[0].endMs-d.finish(3000)[0].startMs,2000);
 assert.deepEqual(d.finish(9999),d.finish(3000));
});
test('1999ms quiet is omitted',()=>{const d=make();span(d,0,1999);assert.deepEqual(d.finish(1999),[]);});
test('hysteresis holds quiet through values between thresholds',()=>{
 const d=make();level(d,0,0.02);level(d,100,0);span(d,200,2100,0.007);level(d,2200,0.02);
 assert.deepEqual(d.finish(2200),[{startMs:100,endMs:2200,sentenceId:null,kind:'between'}]);
});
test('initial quiet and quiet between observed activity use acoustic classification',()=>{
 const d=make();span(d,0,2000);level(d,2100,0.02);level(d,2200,0);span(d,2300,4200);level(d,4300,0.02);
 assert.deepEqual(d.finish(4300).map(q=>q.kind),['initial','between']);
 const all=make();span(all,0,2000);assert.equal(all.finish(2000)[0].kind,'initial');
});
test('invalid and muted samples discard short pending intervals',()=>{
 for(const rms of [0,NaN]) {const d=make();span(d,0,1000);level(d,1100,rms,null,false);span(d,1200,2500);assert.deepEqual(d.finish(2500),[]);}
});
test('sampling gaps greater than 150ms never extend quiet',()=>{
 const d=make();span(d,0,1000);span(d,1200,2500);assert.deepEqual(d.finish(2500),[]);
 const exact=make();span(exact,0,1000);span(exact,1150,2050);assert.equal(exact.finish(2050).length,1);
});
test('invalidation keeps observed qualified intervals without unavailable time',()=>{
 const d=make();span(d,0,2000);d.invalidate();span(d,4000,6000);
 assert.deepEqual(d.finish(6000).map(q=>[q.startMs,q.endMs]),[[0,2000],[4000,6000]]);
});
test('finish beyond a sampling gap does not fabricate trailing silence',()=>{
 const d=make();span(d,0,1900);assert.deepEqual(d.finish(3000),[]);
});
test('identical levels produce identical intervals regardless of transcript callback delays',()=>{
 function run(callbackTimes) {const d=make();span(d,0,2100);for(const _ of callbackTimes) {/* Transcript callbacks deliberately have no acoustic input. */}level(d,2200,0.02);return d.finish(2200);}
 assert.deepEqual(run([50,100]),run([1900,5000]));
});
test('returned interval metadata cannot mutate detector results and pushes after finish are ignored',()=>{
 const d=make();span(d,0,2000);const result=d.finish(2000);result[0].endMs=9999;level(d,2100,0.02);d.invalidate();assert.equal(d.finish(3000)[0].endMs,2000);
});
test('stale and duplicate timestamps cannot create overlapping quiet after invalidation',()=>{
 const d=make();span(d,0,2000);level(d,1000);span(d,0,2000);
 assert.deepEqual(d.finish(2000),[{startMs:0,endMs:2000,sentenceId:null,kind:'initial'}]);
 const explicit=make();span(explicit,0,2000);explicit.invalidate();span(explicit,0,2000);span(explicit,2100,4100);
 assert.deepEqual(explicit.finish(4100).map(q=>[q.startMs,q.endMs]),[[0,2000],[2100,4100]]);
});
test('muted timestamps establish a watermark without bridging unavailable input',()=>{
 const d=make();span(d,0,1000);level(d,2000,0,null,false);span(d,1100,2000);span(d,2100,4000);
 assert.deepEqual(d.finish(4000),[]);
});
