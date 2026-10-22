const path=require('node:path');
const crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
function runWorker(dataDir,target){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'backup-worker.cjs'),{workerData:{dataDir,target}});let result;
  worker.on('message',value=>{result=value;});worker.on('error',reject);
  worker.on('exit',code=>{if(code!==0||!result?.ok)reject(new Error(result?.error||'备份进程意外退出'));else resolve(target);});
 });
}
class Backups{
 constructor({dataDir,backupDir,backupIntervalMs},log=console.log,runner=runWorker){
  Object.assign(this,{dataDir,backupDir,interval:backupIntervalMs,log,runner,stopped:false,running:null,lastSuccess:null,lastFailure:null});this.schedule();
 }
 schedule(){if(this.stopped||!this.interval)return;this.timer=setTimeout(()=>{this.runNow().catch(()=>{}).finally(()=>this.schedule());},this.interval);this.timer.unref();}
 runNow(){
  if(this.stopped)return Promise.reject(new Error('备份服务已停止'));
  if(this.running)return this.running;
  const target=path.join(this.backupDir,'backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID());
  this.running=Promise.resolve().then(()=>this.runner(this.dataDir,target)).then(()=>{this.lastSuccess=new Date().toISOString();this.log(JSON.stringify({event:'backup_success',time:this.lastSuccess}));return target;},error=>{this.lastFailure=new Date().toISOString();this.log(JSON.stringify({event:'backup_failure',time:this.lastFailure,error:error.message}));throw error;}).finally(()=>{this.running=null;});
  return this.running;
 }
 status(){return{enabled:this.interval>0,running:!!this.running,lastSuccess:this.lastSuccess,lastFailure:this.lastFailure};}
 async stop(){this.stopped=true;clearTimeout(this.timer);await this.running?.catch(()=>{});}
}
module.exports={Backups,runWorker};
