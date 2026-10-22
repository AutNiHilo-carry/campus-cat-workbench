const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {Store,COLLECTIONS}=require('./store.cjs');
const {engine,root}=require('./engine.cjs');
const V=require('./validation.cjs');
const {configuration}=require('./config.cjs');
const S=require('./security.cjs');
const {listRecords,visibleRecord}=require('./queries.cjs');
const {Backups}=require('./backups.cjs');
const scrypt=promisify(crypto.scrypt);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const publicFiles=new Set(['shared-domain.js','backend-client.js','backend.css','login.html','index.html','seed.js','management-data.js','workbench-model.js','workbench-ui.js','stories.js','workspace.js','style.css','management.css','workbench.css','stories.css','mobile.css','vendor/pinyin-pro-3.29.5.js','assets/aihe-logo.png','assets/default-cat-avatars-v4.png']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
async function passwordMatches(password,stored){const [salt,digest]=stored.split(':');const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});const expected=Buffer.from(digest,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function userInput(value){V.assert(value&&typeof value.username==='string'&&/^[a-zA-Z0-9_.-]{3,40}$/.test(value.username),'用户名需为3至40位字母、数字、下划线或连字符');V.assert(typeof value.name==='string'&&value.name.trim().length>=1&&value.name.length<=40,'请填写显示名称（40字以内）');V.assert(typeof value.password==='string'&&value.password.length>=10&&value.password.length<=128,'密码需为10至128位');}
async function body(req,limit=5*1024*1024){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)V.fail('请求内容超过限制',413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function jsonBody(req,limit){V.assert((req.headers['content-type']||'').split(';')[0]==='application/json','请使用 JSON 请求',415);try{const value=JSON.parse((await body(req,limit)).toString('utf8'));S.validateJson(value);V.assert(value&&typeof value==='object'&&!Array.isArray(value),'请提交 JSON 对象');return value;}catch(e){if(e.status)throw e;V.fail('JSON 格式有误');}}
function send(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));}
function fileType(buffer,name,kind){
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
  const webp=buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
  if(png)return'image/png';if(jpeg)return'image/jpeg';if(webp)return'image/webp';
  if(kind==='agreement'){
    if(buffer.toString('ascii',0,5)==='%PDF-')return'application/pdf';
    if(/\.docx$/i.test(name)&&buffer[0]===80&&buffer[1]===75)return'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if(/\.doc$/i.test(name)&&buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))return'application/msword';
  }
  V.fail(kind==='image'?'仅支持有效 JPG、PNG、WebP 图片':'仅支持图片、PDF、Word 协议文件',415);
}
function createApp(options={}){
 const config=configuration(process.env,options);
 const store=new Store(config.dataDir,{seedMode:config.seedMode}),db=store.db,limiter=new S.AuthLimiter(config);
 if(config.production&&!config.setupToken&&!db.prepare('SELECT id FROM users LIMIT 1').get()){store.close();throw new Error('首次生产启动必须配置 DANMIAO_SETUP_TOKEN_FILE 或 DANMIAO_SETUP_TOKEN');}
 const backups=new Backups(config);
 const cookieFlags='; HttpOnly; SameSite=Strict; Path=/'+(config.publicOrigin.startsWith('https://')?'; Secure':'');
 let cached=null;
 function uploadTotal(){return Number(db.prepare('SELECT coalesce(sum(size),0) AS n FROM files').get().n);}
 const userCount=()=>Number(db.prepare('SELECT count(*) AS n FROM users').get().n);
 function session(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)danmiao_session=([a-f0-9]{64})(?:;|$)/);if(!match)return null;return db.prepare('SELECT s.*,u.username,u.name,u.role,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND disabled=0').get(hash(match[1]),Date.now());}
 function sessionPayload(s){return{user:{id:s.user_id,username:s.username,name:s.name,role:s.role},csrf:s.csrf};}
 function signIn(res,user){db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex'),expires=Date.now()+8*3600000;db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),user.id,csrf,expires);res.setHeader('Set-Cookie',`danmiao_session=${token}${cookieFlags}; Max-Age=28800`);return{user:V.publicUser(user),csrf};}
 function stateResponse(user){const revision=store.revision(),day=V.today();if(!cached||cached.revision!==revision||cached.day!==day){const state=store.load(),months=[...new Set([day.slice(0,7),...state.finance.map(b=>b.date?.slice(0,7)).filter(Boolean)])],runtime=engine(state);cached={revision,day,state:runtime.state,summaries:Object.fromEntries(months.map(m=>[m,runtime.summary(m)]))};}return{revision,day,state:V.project(cached.state,user),summaries:cached.summaries};}
 function changesResponse(user,since,day){
   const revision=store.revision();if(since===revision&&day===V.today())return{unchanged:true,revision,day};
   const changes=store.changesSince(since);if(!changes||day!==V.today())return{resetRequired:true,revision,day:V.today()};
   const response=stateResponse(user);
   return{revision,day:response.day,changes:changes.filter(c=>visibleRecord(c.collection,c.record,user)||visibleRecord(c.collection,c.prior,user)).map(c=>({collection:c.collection,id:c.id,record:visibleRecord(c.collection,c.record,user)})),summaries:response.summaries,audit:response.state.audit,dismissed:response.state.dismissed,orders:Object.fromEntries([...new Set(changes.map(c=>c.collection))].map(c=>[c,response.state[c].map(r=>r.id)]))};
 }
 const server=http.createServer(async(req,res)=>{
   const requestId=crypto.randomUUID(),started=Date.now();res.setHeader('X-Request-Id',requestId);
   if(config.logRequests)res.on('finish',()=>console.log(JSON.stringify({requestId,method:req.method,path:String(req.url).split('?')[0],status:res.statusCode,durationMs:Date.now()-started})));
   if(config.production)res.setHeader('Strict-Transport-Security','max-age=31536000');
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
   try{
     if(req.url==='/api/health'&&req.method==='GET'){db.prepare('SELECT 1').get();return send(res,200,{ok:true,version:3});}
     S.originGuard(req,config);const url=new URL(req.url,`http://${req.headers.host}`),route=url.pathname,method=req.method;
     if(route==='/api/session'&&method==='GET'){const s=session(req);return send(res,200,{setupRequired:userCount()===0,setupTokenRequired:Boolean(config.setupToken),...(s?sessionPayload(s):{user:null})});}
     if((route==='/api/setup'||route==='/api/login')&&method==='POST'){
       const value=await jsonBody(req);userInput({...value,name:route==='/api/login'?'登录':value.name});
       const release=limiter.enter(S.clientAddress(req,config),value.username);let success=false;
       try{
       if(route==='/api/setup'){
         V.assert(userCount()===0,'管理员已创建，请登录',409);V.assert(!config.setupToken||S.equalSecret(value.setupToken,config.setupToken),'初始化口令错误',403);const password=await passwordHash(value.password);V.assert(userCount()===0,'管理员已创建，请登录',409);
         const user={id:crypto.randomUUID(),username:value.username,name:value.name.trim(),role:'admin',password,created_at:new Date().toISOString()};db.prepare('INSERT INTO users(id,username,name,role,password,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.username,user.name,user.role,password,user.created_at);success=true;return send(res,201,signIn(res,user));
       }
       const user=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(value.username);
       const matches=await passwordMatches(value.password,user?.password||'00000000000000000000000000000000:'+ '00'.repeat(64));
       V.assert(user&&!user.disabled&&matches,'用户名或密码错误',401);
       success=true;return send(res,200,signIn(res,user));
       }finally{release(success);}
     }
     if(route.startsWith('/api/')){
       const s=session(req);V.assert(s,'请先登录',401);const user={id:s.user_id,username:s.username,name:s.name,role:s.role};
       if(!['GET','HEAD'].includes(method))V.assert(req.headers['x-csrf-token']===s.csrf,'登录校验已失效，请刷新页面',403);
       if(route==='/api/system-backup'&&method==='POST'){V.assert(user.role==='admin','仅管理员可创建系统备份',403);await backups.runNow();return send(res,200,{ok:true,...backups.status()});}
       if(route==='/api/backup-status'&&method==='GET'){V.assert(user.role==='admin','仅管理员可查看备份状态',403);return send(res,200,backups.status());}
       if(route==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);return send(res,200,{ok:true},{'Set-Cookie':'danmiao_session='+cookieFlags+'; Max-Age=0'});}
       if(route==='/api/users'){
         V.assert(user.role==='admin','仅管理员可管理账号',403);
         if(method==='GET')return send(res,200,{users:db.prepare('SELECT * FROM users ORDER BY created_at').all().map(V.publicUser),roles:V.roles});
         if(method==='POST'){const v=await jsonBody(req);userInput(v);V.assert(V.roles.includes(v.role),'无效角色');V.assert(!db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(v.username),'用户名已存在',409);const password=await passwordHash(v.password),id=crypto.randomUUID();db.prepare('INSERT INTO users(id,username,name,role,password,created_at) VALUES(?,?,?,?,?,?)').run(id,v.username,v.name.trim(),v.role,password,new Date().toISOString());return send(res,201,{user:{id,username:v.username,name:v.name,role:v.role,disabled:false}});}
       }
       const userMatch=route.match(/^\/api\/users\/([a-f0-9-]+)$/);
       if(userMatch&&method==='PATCH'){
         V.assert(user.role==='admin','仅管理员可管理账号',403);const v=await jsonBody(req),target=db.prepare('SELECT * FROM users WHERE id=?').get(userMatch[1]);V.assert(target,'账号不存在',404);V.assert(typeof v.disabled==='boolean'&&V.roles.includes(v.role),'无效账号配置');V.assert(target.id!==user.id,'不能停用或修改当前管理员的角色');V.assert(target.role!=='admin'||v.role==='admin'&&!v.disabled||db.prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0 AND id<>?").get(target.id).n>0,'至少保留一名管理员');db.prepare('UPDATE users SET role=?,disabled=? WHERE id=?').run(v.role,Number(v.disabled),target.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);return send(res,200,{ok:true});
       }
       if(route==='/api/state'&&method==='GET'){if(url.searchParams.get('since')===String(store.revision())&&url.searchParams.get('day')===V.today())return send(res,200,{unchanged:true,revision:store.revision(),day:V.today()});return send(res,200,stateResponse(user));}
       if(route==='/api/changes'&&method==='GET')return send(res,200,changesResponse(user,Number(url.searchParams.get('since')),url.searchParams.get('day')));
       const writeRecord=route.match(/^\/api\/records\/([a-z]+)\/([^/]+)$/);
       if((route==='/api/state'||route==='/api/commands')&&method==='PATCH'||writeRecord&&['PATCH','POST'].includes(method)){
         let v=await jsonBody(req);if(writeRecord){const collection=writeRecord[1],id=decodeURIComponent(writeRecord[2]);V.assert(COLLECTIONS.includes(collection),'未知模块',404);if(method==='POST')V.assert(v.before==null,'新建记录不能包含旧版本');else V.assert(v.before&&typeof v.before==='object','修改记录必须提交旧版本用于冲突校验');v={...v,changes:[{collection,id,before:v.before||null,after:v.record}]};}
         const key=req.headers['idempotency-key'];if(key)V.assert(typeof key==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(key),'幂等请求编号无效');const digest=hash(JSON.stringify(v));const result=store.transaction(()=>{
           if(key){const prior=db.prepare('SELECT * FROM commands WHERE user_id=? AND key=?').get(user.id,key);if(prior){V.assert(prior.request_hash===digest,'请求编号已用于其他修改',409);return store.revision();}}
           const old=store.load(),{next,accepted}=V.applyChanges(old,v.changes,user);
           const visibleFiles=S.attachmentIds(V.project(old,user));for(const id of S.attachmentIds(V.project(next,user))){const f=db.prepare('SELECT * FROM files WHERE id=?').get(id);if(f&&!visibleFiles.has(id))V.assert(user.role==='admin'||f.owner_id===user.id||visibleFiles.has(id),'不能引用其他账号尚未公开的附件',403);}
           V.validateState(next,old,id=>db.prepare('SELECT * FROM files WHERE id=?').get(id));
           const synced=engine(next).state,revision=store.revision()+1;store.save(synced,revision);
           db.prepare('INSERT INTO audit(time,user_id,actor,action,changes) VALUES(?,?,?,?,?)').run(new Date().toISOString(),user.id,user.name,String(v.message||'更新记录').slice(0,200),JSON.stringify(accepted.map(c=>({collection:c.collection,id:c.id,before:c.before,after:c.after}))));if(key)db.prepare('INSERT INTO commands VALUES(?,?,?,?,?)').run(user.id,key,digest,revision,Date.now());return revision;
         });return send(res,200,route==='/api/state'?{...stateResponse(user),revision:result}:changesResponse(user,Number(v.since),v.day));
       }
       const recordMatch=route.match(/^\/api\/records\/([a-z]+)(?:\/([^/]+))?$/);
       if(recordMatch&&method==='GET'){const c=recordMatch[1];V.assert(COLLECTIONS.includes(c),'未知模块',404);if(recordMatch[2]){const raw=db.prepare('SELECT body FROM records WHERE collection=? AND id=?').get(c,decodeURIComponent(recordMatch[2]));const row=raw?visibleRecord(c,JSON.parse(raw.body),user):null;V.assert(row,'记录不存在或不可访问',404);return send(res,200,{record:row});}return send(res,200,listRecords(store,c,url.searchParams,user));}
       if(route==='/api/files'&&method==='POST'){
         V.assert(user.role!=='viewer','只读账号不能上传',403);const kind=url.searchParams.get('kind')||'image',name=url.searchParams.get('name')||'';V.assert(['image','agreement'].includes(kind)&&name.length>0&&name.length<=200&&!/[\x00-\x1f]/.test(name),'文件名或类别无效');if(kind==='agreement')V.assert(V.agreementAccess(user),'协议仅限管理员及领养负责人上传',403);
         const buffer=await body(req,kind==='image'?5*1024*1024:20*1024*1024);V.assert(buffer.length>0,'文件为空');V.assert(uploadTotal()+buffer.length<=config.maxUploadBytes,'附件存储空间不足，请联系管理员',507);const type=fileType(buffer,name,kind),id='FILE-'+crypto.randomUUID();fs.writeFileSync(path.join(store.directory,'uploads',id),buffer,{flag:'wx'});try{db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?)').run(id,path.basename(name),type,kind,buffer.length,user.id,new Date().toISOString());}catch(e){fs.unlinkSync(path.join(store.directory,'uploads',id));throw e;}return send(res,201,{file:{id,name:path.basename(name),type}});
       }
       const fileMatch=route.match(/^\/api\/files\/(FILE-[a-f0-9-]+)$/);
       if(fileMatch&&method==='GET'){
         const file=db.prepare('SELECT * FROM files WHERE id=?').get(fileMatch[1]);V.assert(file,'文件不存在',404);if(file.kind==='agreement')V.assert(V.agreementAccess(user),'没有协议访问权限',403);
         const visible=S.attachmentIds(V.project(store.load(),user));V.assert(user.role==='admin'||file.owner_id===user.id||visible.has(file.id),'文件不存在或不可访问',404);
         const source=path.join(store.directory,'uploads',file.id);V.assert(fs.existsSync(source)&&fs.statSync(source).size===file.size,'附件文件缺失或损坏，请联系管理员恢复备份',404);
         res.writeHead(200,{'Content-Type':file.mime,'Content-Length':file.size,'Content-Disposition':`${file.mime.startsWith('image/')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`});const stream=fs.createReadStream(source);stream.on('error',()=>res.destroy());return stream.pipe(res);
       }
       if(route==='/api/backup'&&method==='GET'){
         V.assert(user.role==='admin','仅管理员可导出完整备份',403);const assets=db.prepare('SELECT * FROM files').all().map(file=>({...file,base64:fs.readFileSync(path.join(store.directory,'uploads',file.id)).toString('base64')}));return send(res,200,{format:'danmiao-backup-v1',exportedAt:new Date().toISOString(),revision:store.revision(),state:store.load(),files:assets},{'Content-Disposition':`attachment; filename="danmiao-backup-${V.today()}.json"`});
       }
       if(route==='/api/restore'&&method==='POST'){
         V.assert(user.role==='admin','仅管理员可恢复备份',403);const value=await jsonBody(req,150*1024*1024);
         V.assert(value.format==='danmiao-backup-v1'&&value.state&&Array.isArray(value.files)&&value.files.length<=20000,'备份文件格式不正确');
         const registry=new Map(),buffers=new Map();let total=0;
         for(const f of value.files){
           V.assert(/^FILE-[a-f0-9-]{36}$/.test(f.id||'')&&!registry.has(f.id)&&['image','agreement'].includes(f.kind)&&typeof f.name==='string'&&f.name.length<=200&&typeof f.base64==='string','备份附件信息无效');
           const bytes=Buffer.from(f.base64,'base64');total+=bytes.length;V.assert(bytes.length>0&&bytes.length<=(f.kind==='image'?5:20)*1024*1024&&total<=110*1024*1024,'备份附件超过本地版大小限制');
           const type=fileType(bytes,f.name,f.kind);registry.set(f.id,{...f,mime:type,size:bytes.length});buffers.set(f.id,bytes);
           const existing=db.prepare('SELECT id FROM files WHERE id=?').get(f.id);if(existing)V.assert(hash(fs.readFileSync(path.join(store.directory,'uploads',f.id)))===hash(bytes),'备份中的附件编号与现有文件冲突',409);
         }
         V.assert(uploadTotal()+[...registry.values()].filter(f=>!db.prepare('SELECT id FROM files WHERE id=?').get(f.id)).reduce((n,f)=>n+f.size,0)<=config.maxUploadBytes,'附件存储空间不足',507);
         for(const c of COLLECTIONS){V.assert(Array.isArray(value.state[c]),'备份缺少业务模块：'+c);for(const row of value.state[c]){V.assert(row&&typeof row==='object'&&!Array.isArray(row),'备份记录格式有误');if(!row.createdBy||!db.prepare('SELECT id FROM users WHERE id=?').get(row.createdBy))row.createdBy=user.id;}}
         V.validateState(value.state,value.state,id=>registry.get(id));const restored=engine(value.state).state,created=[];
         try{store.transaction(()=>{for(const [id,f]of registry){const destination=path.join(store.directory,'uploads',id);if(!fs.existsSync(destination)){fs.writeFileSync(destination,buffers.get(id),{flag:'wx'});created.push(destination);}db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,path.basename(f.name),f.mime,f.kind,f.size,user.id,new Date().toISOString());}store.save(restored,store.revision()+1);cached=null;db.prepare('INSERT INTO audit(time,user_id,actor,action,changes) VALUES(?,?,?,?,?)').run(new Date().toISOString(),user.id,user.name,'恢复完整备份','[]');});}catch(e){for(const file of created)fs.unlinkSync(file);throw e;}
         return send(res,200,{ok:true,...stateResponse(user)});
       }
       V.fail('接口不存在',404);
     }
     let name=route==='/'?'login.html':decodeURIComponent(route.slice(1));
     if(name==='app-shell'){V.assert(session(req),'请先登录',401);name='index.html';}
     V.assert(publicFiles.has(name),'文件不存在',404);const buffer=fs.readFileSync(path.join(root,name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});res.end(buffer);
   }catch(e){if(res.headersSent){res.destroy();return;}if(!e.status)console.error(JSON.stringify({requestId,error:e.message}));if(e.status===429)res.setHeader('Retry-After','60');send(res,e.status||500,{error:e.status?e.message:'服务处理失败，请重试',requestId});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 return {server,store,config,backups,close:async()=>{await backups.stop();await new Promise(resolve=>{server.close(()=>{store.close();resolve();});server.closeIdleConnections();});}};
}
if(require.main===module){const app=createApp(),{port,host,publicOrigin}=app.config;app.server.on('error',error=>{console.error('服务启动失败：'+error.message);app.store.close();process.exitCode=1;});app.server.listen(port,host,()=>console.log(`大学猫协一站通：${publicOrigin||'http://'+host+':'+port}\n数据目录：${app.store.directory}`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));}
module.exports={createApp};
