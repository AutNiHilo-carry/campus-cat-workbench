const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('./store.cjs');
const {createApp}=require('./index.cjs');
const domain=require('../shared-domain.js');
test('v3 database upgrades to events/sponsors without losing existing records',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-outreach-migration-'));let store=new Store(dir,{seedMode:'empty'});
 try{
  const state=store.load();state.cats=[{id:'OLD-CAT',name:'旧档案',photos:[]}];store.transaction(()=>store.save(state,1));
  store.db.prepare("DELETE FROM meta WHERE key IN ('order:events','order:sponsors')").run();store.db.exec('PRAGMA user_version=3');store.close();store=new Store(dir,{seedMode:'empty'});
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,5);assert.equal(store.load().cats[0].name,'旧档案');assert.deepEqual(store.load().events,[]);assert.deepEqual(store.load().sponsors,[]);
  store.db.prepare("DELETE FROM meta WHERE key='order:announcements'").run();store.db.exec('PRAGMA user_version=4');store.close();store=new Store(dir,{seedMode:'empty'});assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,5);assert.equal(store.load().cats[0].name,'旧档案');assert.deepEqual(store.load().announcements,[]);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('outreach API: future schedules, roles, filtering, links, backup, restore and restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-outreach-api-'));let app=createApp({dataDir:dir,seedMode:'empty'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));let origin='http://127.0.0.1:'+app.server.address().port;
 async function req(actor,url,method='GET',value){const r=await fetch(origin+url,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});return{status:r.status,headers:r.headers,value:await r.json()};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 const change=(collection,before,after)=>({collection,id:after.id,before,after});
 const commit=(who,changes)=>req(who,'/api/commands','PATCH',{changes});
 const password='outreach-test-password-2026';let admin,member,viewer,fullBackup;
 try{
  admin=actor(await req(null,'/api/setup','POST',{username:'outreach-admin',name:'管理员',password}));
  for(const role of ['member','viewer']){assert.equal((await req(admin,'/api/users','POST',{username:'outreach-'+role,name:role,role,password})).status,201);const logged=actor(await req(null,'/api/login','POST',{username:'outreach-'+role,password}));if(role==='member')member=logged;else viewer=logged;}
  const oldBackup=(await req(admin,'/api/backup')).value;delete oldBackup.state.events;delete oldBackup.state.sponsors;
  const event={id:'EVENT-TEST',title:'校园宣传活动',date:domain.addDays(domain.day(),3),place:'校内测试地点',owner:'测试负责人',staffing:'签到：测试甲\n摄影：测试乙',status:'筹备中'};
  const sponsor={id:'SPONSOR-TEST',title:'活动物资支持',organization:'测试合作方',owner:'测试对接人',supportType:'物资',supportContent:'示例猫粮 2 袋',eventId:event.id,status:'待落实'};
  await t.test('validation rejects invalid dates, missing staff lead and broken links atomically',async()=>{
   assert.equal((await commit(member,[change('events',null,{...event,date:'2026-02-30'})])).status,400);
   assert.equal((await commit(member,[change('events',null,{...event,owner:''})])).status,400);
   assert.equal((await commit(member,[change('events',null,event),change('sponsors',null,{...sponsor,eventId:'MISSING'})])).status,400);
   assert.equal((await req(admin,'/api/records/events')).value.total,0);
   assert.equal((await commit(member,[change('events',null,{...event,status:'已完成',completedDate:domain.day(),result:'不能提前完成'})])).status,400);
  });
  await t.test('members can save linked records; viewers and invalid CSRF cannot',async()=>{
   assert.equal((await commit(viewer,[change('events',null,event)])).status,403);
   assert.equal((await commit({...member,csrf:'wrong'},[change('events',null,event)])).status,403);
   assert.equal((await commit(member,[change('events',null,event),change('sponsors',null,sponsor)])).status,200);
   const state=(await req(member,'/api/state')).value;assert.equal(state.state.events[0].staffing,event.staffing);assert.equal(state.state.sponsors[0].eventId,event.id);
   assert.equal(state.state.finance.length,0);assert.equal(state.state.inventory.length,0);
   const feed=(await req(member,'/api/changes?since=0&day='+domain.day())).value;assert.ok(feed.changes.some(c=>c.collection==='events'));assert.ok(feed.changes.some(c=>c.collection==='sponsors'));
   const prior=(await req(member,'/api/records/sponsors/'+sponsor.id)).value.record;
   assert.equal((await commit(member,[change('sponsors',prior,{...prior,status:'已落实'})])).status,400);
   assert.equal((await commit(member,[change('sponsors',prior,{...prior,status:'已落实',receivedDate:domain.day()})])).status,200);
   assert.equal((await req(viewer,'/api/records/sponsors?tab='+encodeURIComponent('已落实'))).value.total,1);
  });
  await t.test('upcoming status, search and stable pagination apply before counts',async()=>{
   const rows=Array.from({length:23},(_,i)=>({...event,id:'EVENT-PAGE-'+i,title:'分页活动'+i,date:domain.addDays(domain.day(),i+4)}));
   rows.push({...event,id:'EVENT-CANCELLED',status:'已取消'});
   assert.equal((await commit(member,rows.map(r=>change('events',null,r)))).status,200);
   const first=(await req(viewer,'/api/records/events?tab='+encodeURIComponent('即将开展')+'&pageSize=10')).value;
   const second=(await req(viewer,'/api/records/events?tab='+encodeURIComponent('即将开展')+'&pageSize=10&page=2')).value;
   assert.equal(first.total,24);assert.equal(second.records.length,10);assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,20);
   assert.equal((await req(viewer,'/api/records/events?q='+encodeURIComponent('分页活动22'))).value.records[0].id,'EVENT-PAGE-22');
   assert.equal((await req(viewer,'/api/records/sponsors?eventId='+event.id)).value.total,1);
   const before=(await req(member,'/api/records/events/'+event.id)).value.record;
   assert.equal((await commit(member,[change('events',before,{...before,deletedAt:new Date().toISOString()})])).status,200);
   assert.equal((await req(viewer,'/api/records/events?tab='+encodeURIComponent('即将开展'))).value.total,23);
   assert.equal((await req(member,'/api/records/sponsors/'+sponsor.id)).value.record.eventId,event.id);
   const removed=(await req(member,'/api/records/events/'+event.id)).value.record;assert.equal((await commit(member,[change('events',removed,{...removed,deletedAt:''})])).status,200);
  });
  await t.test('new backups retain both modules; legacy backups restore with empty new modules',async()=>{
   fullBackup=(await req(admin,'/api/backup')).value;assert.equal(fullBackup.state.events.length,25);assert.equal(fullBackup.state.sponsors.length,1);
   assert.equal((await req(admin,'/api/restore','POST',oldBackup)).status,200);assert.equal((await req(admin,'/api/records/events')).value.total,0);
   assert.equal((await req(admin,'/api/restore','POST',fullBackup)).status,200);
  });
  await app.close();app=createApp({dataDir:dir,seedMode:'empty'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+app.server.address().port;
  assert.equal((await req(admin,'/api/records/events')).value.total,25);assert.equal((await req(member,'/api/records/sponsors')).value.total,1);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
