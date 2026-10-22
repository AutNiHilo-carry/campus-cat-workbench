const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {configuration}=require('./config.cjs');
const {createApp}=require('./index.cjs');
const {snapshot,restore}=require('./ops.cjs');
const {AuthLimiter}=require('./security.cjs');
test('production configuration fails closed',()=>{
 assert.throws(()=>configuration({}, {production:true}),/HTTPS/);
 assert.throws(()=>configuration({}, {production:true,publicOrigin:'https://cats.example.test',seedMode:'demo'}),/示例/);
 assert.throws(()=>configuration({}, {setupToken:'short'}),/32/);
 assert.throws(()=>configuration({}, {publicOrigin:'https://cats.example.test/subpath'}),/路径/);
});
test('authentication is bounded by account, address and concurrent hash work',()=>{
 const limiter=new AuthLimiter({authIpLimit:2,authAccountLimit:2,authConcurrency:1,authWindowMs:900000});
 const release=limiter.enter('ip1','account1');assert.throws(()=>limiter.enter('ip2','account2'),e=>e.status===429);release(false);
 limiter.enter('ip1','account1')(false);assert.throws(()=>limiter.enter('ip2','account1'),e=>e.status===429);
 assert.throws(()=>limiter.enter('ip1','different'),e=>e.status===429);assert.equal(limiter.active,0);
});
test('production API: bootstrap, origin, idempotency, attachments and system backup',async t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-production-test-')),directory=path.join(parent,'data'),token='test-initialization-token-32-characters-long';
 const app=createApp({dataDir:directory,production:true,publicOrigin:'https://cats.example.test',setupToken:token,logRequests:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 async function request(route,{actor,method='GET',value,raw,headers={}}={}){
  const bytes=raw??(value!==undefined?JSON.stringify(value):undefined);
  return new Promise((resolve,reject)=>{const req=require('node:http').request(origin+route,{method,headers:{Host:'cats.example.test',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let result=null;try{result=JSON.parse(Buffer.concat(chunks));}catch{}resolve({response:{headers:{get:name=>Array.isArray(res.headers[name])?res.headers[name].join(','):res.headers[name]}},status:res.statusCode,result});});});req.on('error',reject);req.end(bytes);});
 }
 const creds={username:'prod-admin',name:'测试管理员',password:'production-test-only-2026'};let admin,member,image;
 try{
  await t.test('setup token required, secure cookie, no demo records and domain guard',async()=>{
   const session=await request('/api/session');assert.equal(session.result.setupTokenRequired,true);assert.equal(JSON.stringify(session.result).includes(token),false);
   assert.equal((await request('/api/setup',{method:'POST',value:creds})).status,403);
   const result=await request('/api/setup',{method:'POST',value:{...creds,setupToken:token}});assert.equal(result.status,201);assert.match(result.response.headers.get('set-cookie'),/; Secure/);
   admin={cookie:result.response.headers.get('set-cookie').split(';')[0],csrf:result.result.csrf};
   assert.equal((await request('/api/state',{actor:admin})).result.state.cats.length,0);
   assert.equal((await request('/api/session',{headers:{Host:'evil.example'}})).status,403);
   assert.equal((await request('/api/session',{headers:{Origin:'https://evil.example'}})).status,403);
   assert.equal((await fetch(origin+'/api/health')).status,200);
   assert.equal((await request('/.env')).status,404);
  });
  const patch=(changes,headers={})=>request('/api/state',{actor:admin,method:'PATCH',value:{changes},headers});
  await t.test('replay is idempotent and malformed changes are rejected atomically',async()=>{
   const changes=[{collection:'cats',id:'CAT-PROD',before:null,after:{id:'CAT-PROD',name:'测试猫',photos:[]}}],headers={'Idempotency-Key':'test-command-unique-0001'};
   const first=await patch(changes,headers);assert.equal(first.status,200,JSON.stringify(first.result));
   const replay=await patch(changes,headers);assert.equal(replay.status,200);assert.equal(replay.result.revision,first.result.revision);assert.equal(replay.result.state.audit.length,first.result.state.audit.length);
   assert.equal((await patch([],headers)).status,409);
   assert.equal((await patch([null])).status,400);
   const cat=first.result.state.cats[0];assert.equal((await patch([{collection:'cats',id:cat.id,before:cat,after:{...cat,photos:{}}}])).status,400);
   const unsafe=await request('/api/state',{actor:admin,method:'PATCH',raw:'{"changes":[],"__proto__":{"admin":true}}',headers:{'Content-Type':'application/json'}});assert.equal(unsafe.status,400);
   const unchanged=await request('/api/state?since='+first.result.revision+'&day='+first.result.day,{actor:admin});assert.equal(unchanged.result.unchanged,true);assert.equal(unchanged.result.state,undefined);
  });
  await t.test('private unattached uploads cannot be accessed or attached by another member',async()=>{
   assert.equal((await request('/api/users',{actor:admin,method:'POST',value:{username:'prod-member',name:'成员',password:creds.password,role:'member'}})).status,201);
   const login=await request('/api/login',{method:'POST',value:{username:'prod-member',password:creds.password}});member={cookie:login.response.headers.get('set-cookie').split(';')[0],csrf:login.result.csrf};
   const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1kAAAAASUVORK5CYII=','base64');
   const upload=await request('/api/files?kind=image&name=test.png',{actor:admin,method:'POST',raw:bytes});assert.equal(upload.status,201);image=upload.result.file;
   assert.equal((await request('/api/files/'+image.id,{actor:member})).status,404);
   let cat=(await request('/api/state',{actor:admin})).result.state.cats[0];
   const change={collection:'cats',id:cat.id,before:cat,after:{...cat,photos:[image]}};
   assert.equal((await request('/api/state',{actor:member,method:'PATCH',value:{changes:[change]}})).status,403);
   assert.equal((await patch([{...change,after:{...cat,description:image.id}}])).status,200);
   assert.equal((await request('/api/files/'+image.id,{actor:member})).status,404);
   cat=(await request('/api/state',{actor:admin})).result.state.cats[0];assert.equal((await patch([{collection:'cats',id:cat.id,before:cat,after:{...cat,photos:[image]}}])).status,200);
   assert.equal((await request('/api/files/'+image.id,{actor:member})).status,200);
  });
  await t.test('full system backup includes accounts and attachments; restore into a fresh directory',async()=>{
   const backup=snapshot(directory,path.join(parent,'backup')),destination=restore(backup,path.join(parent,'recovered'));
   assert.throws(()=>restore(backup,destination),/新目录/);
   const restored=createApp({dataDir:destination,seedMode:'empty'});
   try{assert.equal(restored.store.db.prepare('SELECT count(*) n FROM users').get().n,2);assert.equal(restored.store.db.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.ok(fs.existsSync(path.join(destination,'uploads',image.id)));assert.equal(restored.store.load().cats[0].name,'测试猫');}finally{await restored.close();}
   fs.appendFileSync(path.join(backup,'uploads',image.id),'corruption');assert.throws(()=>restore(backup,path.join(parent,'corrupt-restore')),/校验失败/);assert.equal(fs.existsSync(path.join(parent,'corrupt-restore')),false);
  });
  await t.test('missing binary fails safely and leaves the service running',async()=>{
   fs.unlinkSync(path.join(directory,'uploads',image.id));assert.equal((await request('/api/files/'+image.id,{actor:admin})).status,404);assert.equal((await request('/api/health')).status,200);
  });
 }finally{await app.close();fs.rmSync(parent,{recursive:true,force:true});}
});
