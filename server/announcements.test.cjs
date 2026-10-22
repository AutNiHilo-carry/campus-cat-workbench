const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('./index.cjs');
const domain=require('../shared-domain.js');
test('announcements: admin publishing, hidden drafts, visible search/counts and withdrawal sync',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-announcements-')),app=createApp({dataDir:dir,seedMode:'empty'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 async function req(actor,url,method='GET',value){const r=await fetch(base+url,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});return{status:r.status,headers:r.headers,value:await r.json()};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 const password='announcement-test-password';
 const change=(before,after)=>({collection:'announcements',id:after.id,before,after});
 const commit=(who,changes)=>req(who,'/api/commands','PATCH',{changes});
 try{
  const admin=actor(await req(null,'/api/setup','POST',{username:'notice-admin',name:'管理员',password}));
  const draft={id:'NOTICE-DRAFT',title:'草稿秘密标题',content:'尚未发布内容',status:'草稿'},published={id:'NOTICE-LIVE',title:'公开通知',content:'测试公告正文',status:'已发布'};
  assert.equal((await commit({...admin,csrf:'wrong'},[change(null,published)])).status,403);
  assert.equal((await commit(admin,[change(null,{...published,content:' '})])).status,400);
  assert.equal((await commit(admin,[change(null,draft),change(null,published)])).status,200);
  const saved=(await req(admin,'/api/records/announcements/'+published.id)).value.record;
  for(const role of ['finance','adoption','member','viewer']){
   assert.equal((await req(admin,'/api/users','POST',{username:'notice-'+role,name:role,role,password})).status,201);
   const who=actor(await req(null,'/api/login','POST',{username:'notice-'+role,password}));
   assert.equal((await req(who,'/api/records/announcements')).value.total,1);
   assert.equal((await req(who,'/api/records/announcements/'+draft.id)).status,404);
   assert.equal((await req(who,'/api/records/announcements?q='+encodeURIComponent('秘密标题'))).value.total,0);
   assert.equal((await req(who,'/api/state')).value.state.announcements.length,1);
   assert.equal((await commit(who,[change(null,{...published,id:'NOTICE-'+role})])).status,403);
   assert.equal((await commit(who,[change(saved,{...saved,content:'无权修改'})])).status,403);
   assert.equal((await commit(who,[change(saved,{...saved,deletedAt:new Date().toISOString()})])).status,403);
   const feed=(await req(who,'/api/changes?since=0&day='+domain.day())).value;
   assert.deepEqual(feed.changes.filter(c=>c.collection==='announcements').map(c=>c.id),[published.id]);
   if(role==='member'){
    const since=app.store.revision();assert.equal((await commit(admin,[change(saved,{...saved,status:'已撤下'})])).status,200);
    const withdrawal=(await req(who,'/api/changes?since='+since+'&day='+domain.day())).value;
    assert.equal(withdrawal.changes.find(c=>c.id===published.id).record,null);assert.deepEqual(withdrawal.orders.announcements,[]);
    const withdrawn=(await req(admin,'/api/records/announcements/'+published.id)).value.record;
    assert.equal((await commit(admin,[change(withdrawn,{...withdrawn,status:'已发布'})])).status,200);
   }
  }
  assert.equal((await req(null,'/api/records/announcements')).status,401);
  const old=(await req(admin,'/api/backup')).value;delete old.state.events;delete old.state.sponsors;delete old.state.announcements;
  assert.equal((await req(admin,'/api/restore','POST',old)).status,200);assert.equal((await req(admin,'/api/records/announcements')).value.total,0);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
