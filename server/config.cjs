const fs=require('node:fs');
const path=require('node:path');
function configuration(env=process.env,overrides={}){
  const production=(overrides.production??(env.NODE_ENV==='production'))===true;
  const origin=overrides.publicOrigin??env.DANMIAO_PUBLIC_ORIGIN??'';
  let publicOrigin='';
  if(origin){const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('DANMIAO_PUBLIC_ORIGIN 必须是完整站点来源，不含路径');publicOrigin=url.origin;}
  if(production&&!publicOrigin.startsWith('https://'))throw new Error('生产环境必须配置 HTTPS 的 DANMIAO_PUBLIC_ORIGIN');
  const secretFile=overrides.setupTokenFile??env.DANMIAO_SETUP_TOKEN_FILE;
  const setupToken=String(overrides.setupToken??(secretFile?fs.readFileSync(secretFile,'utf8').trim():env.DANMIAO_SETUP_TOKEN||''));
  if(setupToken&&setupToken.length<32)throw new Error('初始化口令至少32位');
  const port=Number(overrides.port??env.PORT??8787);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT 配置无效');
  const seedMode=overrides.seedMode??env.DANMIAO_SEED??(production?'empty':'demo');if(!['empty','demo'].includes(seedMode))throw new Error('DANMIAO_SEED 必须是 empty 或 demo');
  if(production&&seedMode!=='empty')throw new Error('生产环境禁止用示例数据初始化');
  const backupHours=Number(env.DANMIAO_BACKUP_INTERVAL_HOURS??(production?24:0)),backupIntervalMs=overrides.backupIntervalMs??backupHours*3600000;
  if(!Number.isFinite(backupIntervalMs)||backupIntervalMs<0||backupIntervalMs>2147483647||backupIntervalMs>0&&backupIntervalMs<60000)throw new Error('备份间隔必须为0或1分钟至24天');
  return {
    ...overrides,
    production,publicOrigin,setupToken,port,seedMode,backupIntervalMs,
    backupDir:path.resolve(overrides.backupDir??env.DANMIAO_BACKUP_DIR??path.join(overrides.dataDir??env.DANMIAO_DATA_DIR??path.join(__dirname,'..','data'),'..','backups')),
    host:overrides.host??env.DANMIAO_HOST??'127.0.0.1',
    trustProxy:overrides.trustProxy??env.DANMIAO_TRUST_PROXY==='1',
    logRequests:overrides.logRequests??production,
    dataDir:path.resolve(overrides.dataDir??env.DANMIAO_DATA_DIR??path.join(__dirname,'..','data')),
    sessionMs:8*3600000,maxUploadBytes:overrides.maxUploadBytes??1024*1024*1024,
    authConcurrency:overrides.authConcurrency??2,authIpLimit:overrides.authIpLimit??30,authAccountLimit:overrides.authAccountLimit??8,authWindowMs:15*60000
  };
}
module.exports={configuration};
