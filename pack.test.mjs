import test from 'node:test';
import assert from 'node:assert/strict';
import {installEnglishPack} from './pack.mjs';
test('official pack install then verifies local availability without listening',async()=>{
 const calls=[];class R{static async install(options){calls.push(['install',options]);return true;}static async available(options){calls.push(['available',options]);return 'available';}static start(){throw Error('Must not listen');}}
 assert.equal(await installEnglishPack(R),'available');
 assert.deepEqual(calls,[['install',{langs:['en-US'],processLocally:true}],['available',{langs:['en-US'],processLocally:true}]]);
});
test('failed install cannot mark voice ready',async()=>{class R{static async install(){return false;}}await assert.rejects(installEnglishPack(R),/installation failed/);});

test('Chromium local install gate receives processLocally true',async()=>{class R{static async install(options){return options.processLocally===true;}static async available(){return 'available';}}assert.equal(await installEnglishPack(R),'available');});
