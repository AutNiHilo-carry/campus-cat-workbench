const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('./store.cjs');
const {Backups}=require('./backups.cjs');
const {restore}=require('./ops.cjs');
const {createApp}=require('./index.cjs');
test('background worker creates a verifiable backup without keeping sessions',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-backup-worker-')),dataDir=path.join(parent,'data'),backupDir=path.join(parent,'backups'),store=new Store(dataDir,{seedMode:'empty'}),logs=[];
 const backups=new Backups({dataDir,backupDir,backupIntervalMs:0},entry=>logs.push(JSON.parse(entry)));
 try{
  store.db.prepare('INSERT INTO users(id,username,name,role,password,created_at) VALUES(?,?,?,?,?,?)').run('ADMIN','admin','管理员','admin','test-hash','2026-10-22');
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('test-session','ADMIN','csrf',Date.now()+3600000);
  const running=backups.runNow();assert.equal(backups.runNow(),running);const target=await running;assert.ok(fs.existsSync(path.join(target,'manifest.json')));assert.equal(backups.status().running,false);assert.ok(backups.status().lastSuccess);assert.equal(logs[0].event,'backup_success');
  const recovered=restore(target,path.join(parent,'recovered')),copy=new Store(recovered,{seedMode:'empty'});
  try{assert.equal(copy.db.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(copy.db.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{copy.close();}
  await backups.stop();assert.equal(store.db.prepare('SELECT count(*) n FROM sessions').get().n,1);await assert.rejects(backups.runNow(),/停止/);
 }finally{await backups.stop();store.close();fs.rmSync(parent,{recursive:true,force:true});}
});
test('backup failures are observable and scheduling shuts down cleanly',async()=>{
 const logs=[],backups=new Backups({dataDir:'.',backupDir:'.',backupIntervalMs:60000},message=>logs.push(JSON.parse(message)),async()=>{throw new Error('test-storage-unavailable');});
 try{await assert.rejects(backups.runNow(),/unavailable/);assert.ok(backups.status().lastFailure);assert.equal(backups.status().lastSuccess,null);assert.equal(backups.status().enabled,true);assert.equal(logs[0].event,'backup_failure');}finally{await backups.stop();}
});
test('system backup API requires administrator and CSRF and reports successful worker completion',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-backup-api-')),app=createApp({dataDir:path.join(parent,'data'),backupDir:path.join(parent,'backups'),seedMode:'empty'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.server.address().port;
 async function req(route,{actor,method='GET',value}={}){const r=await fetch(origin+route,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});return{status:r.status,headers:r.headers,value:await r.json()};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 try{
  const admin=actor(await req('/api/setup',{method:'POST',value:{username:'backup-admin',name:'管理员',password:'backup-api-password-2026'}}));
  await req('/api/users',{actor:admin,method:'POST',value:{username:'backup-member',name:'成员',password:'backup-api-password-2026',role:'member'}});
  const member=actor(await req('/api/login',{method:'POST',value:{username:'backup-member',password:'backup-api-password-2026'}}));
  assert.equal((await req('/api/backup-status',{actor:member})).status,403);assert.equal((await req('/api/system-backup',{actor:member,method:'POST',value:{}})).status,403);
  assert.equal((await req('/api/system-backup',{actor:{...admin,csrf:'bad'},method:'POST',value:{}})).status,403);
  const result=await req('/api/system-backup',{actor:admin,method:'POST',value:{}});assert.equal(result.status,200);assert.ok(result.value.lastSuccess);assert.equal(fs.readdirSync(path.join(parent,'backups')).length,1);assert.equal(result.value.target,undefined);
 }finally{await app.close();fs.rmSync(parent,{recursive:true,force:true});}
});
