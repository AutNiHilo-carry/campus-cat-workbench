// Isolated synthetic rehearsal: never reads or restores the configured live data directory.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('./index.cjs');
const {restore}=require('./ops.cjs');
async function runDrill(){
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'cat-recovery-drill-')),checks=[],started=Date.now();let source,recovered;
 const password='synthetic-drill-password-2026';
 async function start(dataDir){const app=createApp({dataDir,seedMode:'empty',production:false,publicOrigin:'',setupToken:'',logRequests:false,backupIntervalMs:0,backupDir:path.join(parent,'backups')});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return app;}
 async function req(app,actor,url,{method='GET',value,raw}={}){const r=await fetch('http://127.0.0.1:'+app.server.address().port+url,{method,headers:{...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...(value?{'Content-Type':'application/json'}:{})},body:raw??(value?JSON.stringify(value):undefined)});const bytes=Buffer.from(await r.arrayBuffer());let result;try{result=JSON.parse(bytes);}catch{}return{status:r.status,headers:r.headers,value:result,bytes};}
 const actor=r=>({cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.value.csrf});
 async function login(app,role){const r=await req(app,null,'/api/login',{method:'POST',value:{username:'drill-'+role,password}});assert.equal(r.status,200);return actor(r);}
 try{
  source=await start(path.join(parent,'source'));source.backups.log=()=>{};
  const setup=await req(source,null,'/api/setup',{method:'POST',value:{username:'drill-admin',name:'演练管理员',password}});assert.equal(setup.status,201);const admin=actor(setup);
  assert.equal((await req(source,admin,'/api/users',{method:'POST',value:{username:'drill-member',name:'演练成员',password,role:'member'}})).status,201);const member=await login(source,'member');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1kAAAAASUVORK5CYII=','base64'),pdf=Buffer.from('%PDF-1.4\nSynthetic rehearsal\n%%EOF');
  const image=(await req(source,admin,'/api/files?kind=image&name=synthetic.png',{method:'POST',raw:png})).value.file;
  const agreement=(await req(source,admin,'/api/files?kind=agreement&name=synthetic.pdf',{method:'POST',raw:pdf})).value.file;
  const day=require('./validation.cjs').today(),records={cats:{id:'DRILL-CAT',name:'演练猫',photos:[image]},adoption:{id:'DRILL-ADOPT',cat:'演练猫',catId:'DRILL-CAT',status:'无领养人',agreements:[agreement]},finance:{id:'DRILL-BILL',title:'演练账目',flow:'收入',status:'待确认',date:day,amountCents:12345}};
  const change=await req(source,admin,'/api/commands',{method:'PATCH',value:{changes:Object.entries(records).map(([collection,after])=>({collection,id:after.id,before:null,after}))}});assert.equal(change.status,200,JSON.stringify(change.value));
  const before=(await req(source,admin,'/api/state')).value.state,backup=await source.backups.runNow();checks.push('工作线程创建数据库、账号、附件及校验清单备份');
  const recoveryStarted=Date.now(),destination=restore(backup,path.join(parent,'recovered'));recovered=await start(destination);
  assert.equal((await req(recovered,admin,'/api/state')).status,401);assert.equal((await req(recovered,member,'/api/state')).status,401);checks.push('恢复后拒绝备份前的全部会话');
  const recoveredAdmin=await login(recovered,'admin'),recoveredMember=await login(recovered,'member');checks.push('恢复后的管理员与成员均可用原密码重新登录');
  const after=(await req(recovered,recoveredAdmin,'/api/state')).value.state;
  for(const collection of ['cats','adoption','finance'])assert.deepEqual(after[collection],before[collection]);checks.push('猫咪、领养记录、财务记录与备份前逐项一致');
  for(const [file,bytes]of [[image,png],[agreement,pdf]]){const r=await req(recovered,recoveredAdmin,'/api/files/'+file.id);assert.equal(r.status,200);assert.deepEqual(r.bytes,bytes);}checks.push('照片与协议通过 HTTP 下载后字节一致');
  const visible=(await req(recovered,recoveredMember,'/api/state')).value.state;assert.deepEqual(visible.finance,[]);assert.deepEqual(visible.adoption[0].agreements,[]);assert.equal((await req(recovered,recoveredMember,'/api/files/'+agreement.id)).status,403);assert.equal((await req(recovered,recoveredMember,'/api/files/'+image.id)).status,200);checks.push('恢复后协议与财务权限仍生效，普通照片仍可见');
  assert.throws(()=>restore(backup,destination),/新目录/);checks.push('拒绝覆盖已存在的数据目录');
  fs.appendFileSync(path.join(backup,'uploads',image.id),'tampered');const rejected=path.join(parent,'rejected');assert.throws(()=>restore(backup,rejected),/校验失败/);assert.equal(fs.existsSync(rejected),false);checks.push('损坏备份恢复被拒绝，未创建目标目录');
  assert.deepEqual((await req(source,admin,'/api/state')).value.state.cats,before.cats);checks.push('源服务与源业务数据保持可用');
  return{ok:true,completedAt:new Date().toISOString(),durationMs:Date.now()-started,recoveryVerificationMs:Date.now()-recoveryStarted,scope:'独立临时目录与虚构数据，不代表生产容量或真实灾难恢复耗时',checks};
 }finally{await recovered?.close();await source?.close();fs.rmSync(parent,{recursive:true,force:true});}
}
if(require.main===module)runDrill().then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error('恢复演练失败：'+error.message);process.exitCode=1;});
module.exports={runDrill};
