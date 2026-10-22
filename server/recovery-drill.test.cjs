const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runDrill}=require('./recovery-drill.cjs');
test('isolated recovery rehearsal verifies live HTTP login, business data, binaries, permissions and corruption rejection',async()=>{const report=await runDrill();assert.equal(report.ok,true);assert.equal(report.checks.length,9);});
