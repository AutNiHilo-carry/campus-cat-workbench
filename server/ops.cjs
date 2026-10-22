const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function snapshot(dataDir,target){
  dataDir=path.resolve(dataDir);target=path.resolve(target);
  if(fs.existsSync(target))throw new Error('备份目标必须是尚不存在的新目录');
  if(target===dataDir||target.startsWith(dataDir+path.sep))throw new Error('备份必须位于数据目录之外');
  const source=path.join(dataDir,'workbench.sqlite');if(!fs.existsSync(source))throw new Error('数据库不存在');
  fs.mkdirSync(target,{recursive:true,mode:0o700});fs.mkdirSync(path.join(target,'uploads'),{mode:0o700});
  const db=new DatabaseSync(source,{readOnly:true});
  try{db.prepare('VACUUM INTO ?').run(path.join(target,'workbench.sqlite'));}finally{db.close();}
  const copy=new DatabaseSync(path.join(target,'workbench.sqlite'));
  try{
    if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('数据库完整性检查失败');
    // A restored server must issue fresh sessions rather than reusing backed-up cookies.
    copy.exec('DELETE FROM sessions');
    for(const file of copy.prepare('SELECT id,size FROM files').all()){
      if(!/^FILE-[a-f0-9-]{36}$/.test(file.id))throw new Error('附件编号无效');
      const bytes=fs.readFileSync(path.join(dataDir,'uploads',file.id));if(bytes.length!==file.size)throw new Error('附件缺失或损坏：'+file.id);
      fs.writeFileSync(path.join(target,'uploads',file.id),bytes,{flag:'wx',mode:0o600});
    }
  }finally{copy.close();}
  const names=['workbench.sqlite',...fs.readdirSync(path.join(target,'uploads')).map(n=>'uploads/'+n)];
  const manifest={format:'danmiao-system-backup-v1',createdAt:new Date().toISOString(),files:Object.fromEntries(names.map(n=>[n,digest(fs.readFileSync(path.join(target,n)))]))};
  fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return target;
}
function restore(source,target){
  source=path.resolve(source);target=path.resolve(target);
  if(fs.existsSync(target))throw new Error('恢复目标必须是尚不存在的新目录，请勿覆盖运行中的数据库');
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
  if(manifest.format!=='danmiao-system-backup-v1'||!manifest.files||!manifest.files['workbench.sqlite'])throw new Error('系统备份格式无效');
  const entries=Object.entries(manifest.files);
  for(const [name,expected]of entries){
    if(name!=='workbench.sqlite'&&!/^uploads\/FILE-[a-f0-9-]{36}$/.test(name))throw new Error('备份路径无效');
    if(digest(fs.readFileSync(path.join(source,name)))!==expected)throw new Error('备份校验失败：'+name);
  }
  const db=new DatabaseSync(path.join(source,'workbench.sqlite'),{readOnly:true});
  try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('数据库完整性校验失败');for(const file of db.prepare('SELECT id,size FROM files').all()){if(!/^FILE-[a-f0-9-]{36}$/.test(file.id)||!manifest.files['uploads/'+file.id]||fs.statSync(path.join(source,'uploads',file.id)).size!==file.size)throw new Error('备份缺少有效附件');}}finally{db.close();}
  fs.mkdirSync(path.join(target,'uploads'),{recursive:true,mode:0o700});
  for(const [name]of entries)fs.copyFileSync(path.join(source,name),path.join(target,name),fs.constants.COPYFILE_EXCL);
  return target;
}
async function recoverAdmin(dataDir,username,passwordFile){
  if(!fs.existsSync(path.join(path.resolve(dataDir),'workbench.sqlite')))throw new Error('数据库不存在');
  if(fs.statSync(passwordFile).size>1024)throw new Error('密码文件过大');
  const {passwordInput,passwordHash,replacePassword}=require('./passwords.cjs');
  const password=fs.readFileSync(passwordFile,'utf8').replace(/\r?\n$/,'');passwordInput(password);
  const {Store}=require('./store.cjs'),store=new Store(dataDir,{seedMode:'empty'});
  try{
    const target=store.db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE AND role='admin' AND disabled=0").get(username);
    if(!target)throw new Error('找不到启用中的管理员账号');
    const hash=await passwordHash(password);
    store.transaction(()=>replacePassword(store.db,target,hash,{id:'local-recovery',name:'本机管理员恢复'},'本机恢复管理员密码'));
  }finally{store.close();}
}
if(require.main===module){
  (async()=>{try{
    const [command,...args]=process.argv.slice(2),option=key=>args[args.indexOf(key)+1];
    if(command==='setup-token'){
      const destination=path.resolve(args[0]||'secrets/setup-token.txt');fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});fs.writeFileSync(destination,crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});console.log('初始化口令已生成：'+destination+'（请本机读取，不要提交到 GitHub）');
    }else if(command==='backup'){
      if(!args.includes('--target')||!option('--target'))throw new Error('请指定 --target 新备份目录');
      console.log('系统备份完成：'+snapshot(process.env.DANMIAO_DATA_DIR||path.join(__dirname,'..','data'),option('--target')));
    }else if(command==='restore'){
      if(!args.includes('--source')||!args.includes('--target')||!option('--source')||!option('--target'))throw new Error('请指定 --source 备份目录 --target 新数据目录');
      console.log('已恢复到新目录：'+restore(option('--source'),option('--target'))+'。停服后切换 DANMIAO_DATA_DIR，再启动服务。');
    }else if(command==='recover-admin'){
      if(!args.includes('--username')||!args.includes('--password-file')||!option('--username')||!option('--password-file'))throw new Error('请指定 --username 管理员用户名 --password-file 本机密码文件');
      await recoverAdmin(process.env.DANMIAO_DATA_DIR||path.join(__dirname,'..','data'),option('--username'),option('--password-file'));
      console.log('管理员密码已恢复，旧会话已撤销。请移除本机密码文件并重新登录。');
    }else throw new Error('用法：node server/ops.cjs setup-token [路径] | backup --target 新目录 | restore --source 备份目录 --target 新数据目录 | recover-admin --username 用户名 --password-file 本机密码文件');
  }catch(e){console.error(e.message);process.exitCode=1;}})();
}
module.exports={snapshot,restore,recoverAdmin};
