const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,COLLECTIONS}=require('./store.cjs');
const {createApp}=require('./index.cjs');
const {listRecords}=require('./queries.cjs');
const domain=require('../shared-domain.js');
test('incremental storage preserves untouched rows, ordering, deleted records and rollback',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-incremental-test-')),store=new Store(directory,{seedMode:'empty'});
 try{
  const state=store.load();state.cats=Array.from({length:137},(_,i)=>({id:'CAT-'+i,name:'猫'+i,photos:[]}));store.transaction(()=>store.save(state,1));assert.equal(store.lastWriteCount,137);
  const before=store.db.prepare("SELECT rowid,body FROM records WHERE id='CAT-100'").get();state.cats[0].description='单条更新';store.transaction(()=>store.save(state,2));assert.equal(store.lastWriteCount,1);assert.deepEqual(store.db.prepare("SELECT rowid,body FROM records WHERE id='CAT-100'").get(),before);
  state.cats.unshift({id:'CAT-NEW',name:'新猫',photos:[]});store.transaction(()=>store.save(state,3));assert.equal(store.lastWriteCount,1);assert.equal(store.load().cats[0].id,'CAT-NEW');
  state.cats=state.cats.filter(c=>c.id!=='CAT-100');store.transaction(()=>store.save(state,4));assert.equal(store.lastWriteCount,1);assert.equal(store.changesSince(3).find(c=>c.id==='CAT-100').record,null);
  assert.throws(()=>store.transaction(()=>{state.cats[0].name='应回滚';store.save(state,5);throw new Error('rollback');}),/rollback/);assert.equal(store.revision(),4);assert.equal(store.load().cats[0].name,'新猫');assert.equal(store.changesSince(4).length,0);store.transaction(()=>store.save(store.load(),2005));assert.equal(store.changesSince(4),null);
 }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('SQL lists: stable pages, literal search, filters, grouped stock, follow-ups and privacy',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-list-test-')),store=new Store(directory,{seedMode:'empty'}),admin={id:'admin',role:'admin'};
 const list=(c,p={},u=admin)=>listRecords(store,c,new URLSearchParams(p),u);
 try{
  const state=store.load();state.cats=Array.from({length:137},(_,i)=>({id:'CAT-'+i,name:'猫'+i,description:i===42?'100%_特别猫':'',photos:[]}));
  state.inventory=Array.from({length:17},(_,i)=>({id:'ITEM-'+i,name:'物资'+Math.floor(i/2),group:'日常',variant:'',kind:'消耗品',unit:'袋',place:'地点'+i,qty:1}));
  state.adoption=[{id:'ADOPT-PENDING',cat:'猫0',status:'无领养人',agreements:[{id:'private-contract',name:'协议'}]},{id:'ADOPT-INTENT',cat:'猫1',status:'有意向领养人',agreements:[]},{id:'ADOPT-VISIT',cat:'猫2',status:'已领养',adoptDate:domain.day(),agreements:[]},{id:'ADOPT-DONE',cat:'猫3',status:'已领养',adoptDate:domain.day(),lastFollowup:domain.day(),followupState:'已完成',agreements:[]}];
  state.finance=[{id:'BILL-PRIVATE',flow:'收入',status:'待确认',date:domain.day(),amountCents:100},{id:'BILL-OWN',flow:'个人垫付',status:'待审核',createdBy:'member',date:domain.day(),amountCents:100}];
  store.transaction(()=>store.save(state,1));
  const first=list('cats',{pageSize:9}),second=list('cats',{page:2,pageSize:9});assert.equal(first.total,137);assert.equal(first.records.length,9);assert.equal(second.records[0].id,'CAT-9');assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,18);const all=Array.from({length:16},(_,i)=>list('cats',{page:i+1,pageSize:9}).records).flat();assert.equal(all.length,137);assert.equal(new Set(all.map(r=>r.id)).size,137);
  const last=list('cats',{page:999,pageSize:9});assert.equal(last.page,16);assert.equal(last.records.length,2);assert.equal(list('cats',{pageSize:9,target:'CAT-100'}).page,12);
  assert.equal(list('cats',{q:'100%_'}).records[0].id,'CAT-42');assert.equal(list('cats',{q:"' OR 1=1 --"}).total,0);assert.throws(()=>list('cats',{pageSize:101}));
  const stock=list('inventory',{group:'日常',grouped:1,pageSize:6});assert.equal(stock.total,9);assert.equal(stock.recordTotal,17);assert.equal(stock.records.length,12);assert.equal(list('inventory',{group:'日常',grouped:1,pageSize:6,page:2}).records.length,5);
  assert.equal(list('adoption',{tab:'推进中',intent:'有意向领养人'}).records[0].id,'ADOPT-INTENT');assert.equal(list('adoption',{tab:'已领养',followup:'待回访'}).records[0].id,'ADOPT-VISIT');assert.equal(list('adoption',{tab:'已领养',followup:'已回访'}).records[0].id,'ADOPT-DONE');
  const member={id:'member',role:'member'};assert.equal(list('finance',{},member).total,1);assert.equal(list('finance',{q:'BILL-PRIVATE'},member).total,0);assert.deepEqual(list('adoption',{},member).records[0].agreements,[]);
 }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('record API and incremental sync: permissions, conflicts, derived records and replay',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-command-test-')),app=createApp({dataDir:directory,seedMode:'empty'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 async function req(route,{method='GET',value,actor,headers={}}={}){const r=await fetch(origin+route,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{}),...headers},body:value?JSON.stringify(value):undefined});return{status:r.status,headers:r.headers,value:await r.json()};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 try{
  const admin=actor(await req('/api/setup',{method:'POST',value:{username:'api-admin',name:'管理员',password:'test-password-2026'}}));
  await req('/api/users',{method:'POST',actor:admin,value:{username:'api-member',name:'成员',password:'test-password-2026',role:'member'}});const member=actor(await req('/api/login',{method:'POST',value:{username:'api-member',password:'test-password-2026'}}));
  let state=(await req('/api/state',{actor:admin})).value;
  const body={record:{id:'CAT-API',name:'接口猫',photos:[]},since:state.revision,day:state.day};
  let result=await req('/api/records/cats/CAT-API',{method:'POST',actor:admin,value:body,headers:{'Idempotency-Key':'record-create-command-0001'}});assert.equal(result.status,200);assert.equal(result.value.state,undefined);assert.equal(result.value.changes[0].record.name,'接口猫');assert.equal(result.value.changes[0].prior,undefined);
  const replay=await req('/api/records/cats/CAT-API',{method:'POST',actor:admin,value:body,headers:{'Idempotency-Key':'record-create-command-0001'}});assert.equal(replay.value.revision,result.value.revision);
  const unsafeId='BAD-"-ID';assert.equal((await req('/api/records/cats/'+encodeURIComponent(unsafeId),{method:'POST',actor:admin,value:{record:{id:unsafeId,name:'坏编号',photos:[]}}})).status,400);
  const cat=(await req('/api/records/cats/CAT-API',{actor:admin})).value.record;
  const changed=await req('/api/records/cats/CAT-API',{method:'PATCH',actor:admin,value:{before:cat,record:{...cat,description:'增量同步'},since:result.value.revision,day:state.day}});assert.equal(changed.status,200);assert.equal(app.store.lastWriteCount,1);
  assert.equal((await req('/api/records/cats/CAT-API',{method:'PATCH',actor:admin,value:{before:cat,record:{...cat,description:'旧覆盖'}}})).status,409);
  const feed=await req('/api/changes?since='+state.revision+'&day='+state.day,{actor:member});assert.equal(feed.value.changes[0].record.description,'增量同步');assert.deepEqual(feed.value.audit,[]);
  assert.equal((await req('/api/changes?since=0&day=2000-01-01',{actor:admin})).value.resetRequired,true);
  state=(await req('/api/state',{actor:admin})).value;
  const privateBill={id:'PRIVATE-FINANCE',flow:'收入',status:'待确认',date:domain.day(),amountCents:100};
  assert.equal((await req('/api/commands',{method:'PATCH',actor:admin,value:{changes:[{collection:'finance',id:privateBill.id,before:null,after:privateBill}],since:state.revision,day:state.day}})).status,200);
  const hidden=await req('/api/changes?since='+state.revision+'&day='+state.day,{actor:member});assert.deepEqual(hidden.value.changes,[]);assert.deepEqual(hidden.value.orders.finance,[]);assert.equal((await req('/api/records/finance/PRIVATE-FINANCE',{actor:member})).status,404);
  assert.equal((await req('/api/records/cats?pageSize=1',{actor:member})).value.records.length,1);
  state=(await req('/api/state',{actor:admin})).value;const rescue={id:'RESCUE-DERIVED',cat:'',status:'已结束',place:'测试地点',issue:'测试情况',outcome:'转寄养',date:domain.day(),completedDate:domain.day()};const linked=await req('/api/commands',{method:'PATCH',actor:admin,value:{changes:[{collection:'rescue',id:rescue.id,before:null,after:rescue}],since:state.revision,day:state.day}});assert.equal(linked.status,200);for(const collection of ['rescue','foster','monthly'])assert.ok(linked.value.changes.some(c=>c.collection===collection));
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('backend engine does not load UI or use a VM; shared rules are deterministic',()=>{
 const source=fs.readFileSync(path.join(__dirname,'engine.cjs'),'utf8');assert.doesNotMatch(source,/node:vm|workspace\.js|workbench-ui|document|localStorage/);
 const blank=()=>Object.fromEntries(COLLECTIONS.map(c=>[c,[]]));const a=blank();a.schemaVersion=4;a.rescue=[{id:'R-SHARED',status:'就医中',date:domain.day(),medicalDate:domain.day(),cat:'',place:'测试地点',issue:'就医'}];
 const left=domain.normalize(structuredClone(a)),right=domain.normalize(structuredClone(a));assert.deepEqual(left,right);assert.equal(left.monthly[0].id,'AUTO-W-rescue-R-SHARED');
});
