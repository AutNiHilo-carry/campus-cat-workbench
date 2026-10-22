const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('./index.cjs');
const {recoverAdmin}=require('./ops.cjs');
test('account recovery and role × endpoint × operation permissions',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cat-account-matrix-'));
 const app=createApp({dataDir:directory,seedMode:'empty',authIpLimit:200});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.server.address().port,password='matrix-old-password-2026',nextPassword='matrix-new-password-2026',actors={};
 async function req(actor,route,method='GET',value,raw){const r=await fetch(origin+route,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{})},body:raw??(value?JSON.stringify(value):undefined)});return{status:r.status,headers:r.headers,value:await r.json()};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf,user:r.value.user});
 const login=async(role,p=password)=>{const r=await req(null,'/api/login','POST',{username:'matrix-'+role,password:p});assert.equal(r.status,200,JSON.stringify(r.value));return actor(r);};
 const patch=(who,collection,before,after)=>req(who,'/api/commands','PATCH',{changes:[{collection,id:after.id,before,after}]});
 try{
  actors.admin=actor(await req(null,'/api/setup','POST',{username:'matrix-admin',name:'管理员',password}));
  for(const role of ['finance','adoption','member','viewer']){assert.equal((await req(actors.admin,'/api/users','POST',{username:'matrix-'+role,name:role,role,password})).status,201);actors[role]=await login(role);}
  const checks=[
   ['/api/state','GET',undefined,200],['/api/records/cats','GET',undefined,200],
   ['/api/users','GET',undefined,403],['/api/backup-status','GET',undefined,403],['/api/backup','GET',undefined,403],
   ['/api/system-backup','POST',{},403],['/api/restore','POST',{},403],
   ['/api/users','POST',{},403],['/api/users/'+actors.member.user.id+'/password','POST',{},403]
  ];
  await t.test('anonymous requests cannot reach any protected operation',async()=>{for(const [url,method,body]of checks)assert.equal((await req(null,url,method,body)).status,401,url);assert.equal((await req(null,'/api/password','POST',{})).status,401);});
  for(const role of ['finance','adoption','member','viewer'])await t.test(role+' endpoint and write matrix',async()=>{
   const who=actors[role];for(const [url,method,body,status]of checks)assert.equal((await req(who,url,method,body)).status,status,role+' '+method+' '+url);
   const cat={id:'CAT-'+role,name:role+'猫',photos:[]};assert.equal((await patch(who,'cats',null,cat)).status,role==='viewer'?403:200);
   const claim={id:'CLAIM-'+role,title:'本人报销',date:new Date().toISOString().slice(0,10),flow:'个人垫付',status:'待审核',amountCents:100};assert.equal((await patch(who,'finance',null,claim)).status,role==='viewer'?403:200);
   const state=(await req(who,'/api/state')).value.state;
   assert.equal(state.audit.length,0);
   if(role!=='finance')assert.ok(state.finance.every(b=>b.flow==='个人垫付'&&b.createdBy===who.user.id));
   const own=state.finance.find(b=>b.id===claim.id);if(own)assert.equal((await patch(who,'finance',own,{...own,status:'审核通过'})).status,role==='finance'?200:403);
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1kAAAAASUVORK5CYII=','base64');
   assert.equal((await req(who,'/api/files?kind=image&name=cat.png','POST',undefined,png)).status,role==='viewer'?403:201);
   assert.equal((await req(who,'/api/files?kind=agreement&name=contract.pdf','POST',undefined,Buffer.from('%PDF-1.4\n%%EOF'))).status,role==='adoption'?201:403);
   assert.equal((await req({...who,csrf:'bad'},'/api/password','POST',{currentPassword:password,newPassword:nextPassword})).status,403);
  });
  await t.test('all roles can change their own password; every old session is invalidated',async()=>{
   for(const role of Object.keys(actors)){
    const who=actors[role],other=await login(role);
    assert.equal((await req(who,'/api/password','POST',{currentPassword:'incorrect-password',newPassword:nextPassword})).status,403);
    assert.equal((await req(who,'/api/password','POST',{currentPassword:password,newPassword:'short'})).status,400);
    assert.equal((await req(who,'/api/password','POST',{currentPassword:password,newPassword:password})).status,400);
    assert.equal((await req(who,'/api/password','POST',{currentPassword:password,newPassword:nextPassword})).status,200);
    for(const stale of [who,other])assert.equal((await req(stale,'/api/state')).status,401);
    assert.equal((await req(null,'/api/login','POST',{username:who.user.username,password})).status,401);
    actors[role]=await login(role,nextPassword);
   }
  });
  await t.test('administrator reset requires reauthentication and revokes target sessions only',async()=>{
   const admin=actors.admin,url='/api/users/'+actors.member.user.id+'/password',body={currentPassword:nextPassword,newPassword:'admin-reset-password-2026'};
   assert.equal((await req({...admin,csrf:'bad'},url,'POST',body)).status,403);
   assert.equal((await req(admin,url,'POST',{...body,currentPassword:'incorrect-password'})).status,403);
   assert.equal((await req(admin,url,'POST',body)).status,200);
   assert.equal((await req(actors.member,'/api/state')).status,401);
   assert.equal((await req(null,'/api/login','POST',{username:'matrix-member',password:nextPassword})).status,401);
   actors.member=await login('member',body.newPassword);
   assert.equal((await req(admin,'/api/state')).status,200);
   const audits=app.store.db.prepare('SELECT * FROM audit').all(),serialized=JSON.stringify(audits);
   assert.ok(audits.some(a=>a.action==='管理员重置密码：matrix-member'));
   for(const secret of [password,nextPassword,body.newPassword])assert.equal(serialized.includes(secret),false);
  });
  await t.test('disabled targets cannot be reset or use a surviving cookie',async()=>{
   const id=actors.viewer.user.id;assert.equal((await req(actors.admin,'/api/users/'+id,'PATCH',{role:'viewer',disabled:true})).status,200);
   assert.equal((await req(actors.viewer,'/api/state')).status,401);
   assert.equal((await req(actors.admin,'/api/users/'+id+'/password','POST',{currentPassword:nextPassword,newPassword:'disabled-reset-password'})).status,404);
  });
 }finally{await app.close();}
 try{
  await t.test('local administrator recovery works after shutdown without an existing login',async()=>{
   const passwordFile=path.join(directory,'recovery-secret.txt'),recoveredPassword='local-recovered-password-2026';fs.writeFileSync(passwordFile,recoveredPassword+'\n');
   await assert.rejects(recoverAdmin(directory,'matrix-member',passwordFile),/管理员/);
   await recoverAdmin(directory,'matrix-admin',passwordFile);fs.unlinkSync(passwordFile);
   const recovered=createApp({dataDir:directory,seedMode:'empty'});
   await new Promise(resolve=>recovered.server.listen(0,'127.0.0.1',resolve));
   try{
    const base='http://127.0.0.1:'+recovered.server.address().port;
    assert.equal((await fetch(base+'/api/state',{headers:{Cookie:actors.admin.cookie}})).status,401);
    const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'matrix-admin',password:recoveredPassword})});assert.equal(r.status,200);
    assert.ok(recovered.store.db.prepare("SELECT id FROM audit WHERE action='本机恢复管理员密码：matrix-admin'").get());
   }finally{await recovered.close();}
  });
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
