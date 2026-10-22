const {parentPort,workerData}=require('node:worker_threads');
const {snapshot}=require('./ops.cjs');
try{snapshot(workerData.dataDir,workerData.target);parentPort.postMessage({ok:true});}
catch(error){parentPort.postMessage({ok:false,error:error.message});}
