const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('./store.cjs');
const V=require('./validation.cjs');
test('foster situation persists independently without changing handoff history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-foster-facts-'));let store=new Store(dir,{seedMode:'empty'});
 try{
  const state=store.load(),next=structuredClone(state);
  next.foster=[{id:'F-FACTS',status:'待安置',cat:'',place:'',caregiver:'',situation:'观察进食\n等待寄养',segments:[]}];
  V.validateState(next,state,[]);store.transaction(()=>store.save(next,1));
  store.close();store=new Store(dir,{seedMode:'empty'});
  assert.equal(store.load().foster[0].situation,'观察进食\n等待寄养');assert.deepEqual(store.load().foster[0].segments,[]);
  const invalid=structuredClone(next);invalid.foster[0].situation='x'.repeat(1001);
  assert.throws(()=>V.validateState(invalid,next,[]),/寄养情况最多1000字/);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
