const crypto=require('node:crypto');
const net=require('node:net');
const {assert}=require('./validation.cjs');
function equalSecret(actual,expected){const a=crypto.createHash('sha256').update(String(actual||'')).digest();const b=crypto.createHash('sha256').update(String(expected||'')).digest();return crypto.timingSafeEqual(a,b);}
class AuthLimiter{
  constructor(config){this.config=config;this.active=0;this.counts=new Map();}
  enter(address,username){
    const now=Date.now();for(const [key,value]of this.counts)if(value.until<=now)this.counts.delete(key);
    assert(this.counts.size<10000,'登录请求过多，请稍后重试',429);
    const keys=[['ip:'+address,this.config.authIpLimit],['account:'+String(username).toLowerCase(),this.config.authAccountLimit]];
    for(const [key,limit]of keys)assert((this.counts.get(key)?.n||0)<limit,'登录尝试过多，请15分钟后重试',429);
    assert(this.active<this.config.authConcurrency,'登录验证繁忙，请稍后重试',429);
    for(const [key]of keys){const value=this.counts.get(key)||{n:0,until:now+this.config.authWindowMs};value.n++;this.counts.set(key,value);}
    this.active++;
    let released=false;return success=>{if(released)return;released=true;this.active--;if(success)this.counts.delete(keys[1][0]);};
  }
}
function clientAddress(req,config){if(config.trustProxy){const candidate=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();if(net.isIP(candidate))return candidate;}return req.socket.remoteAddress||'unknown';}
function originGuard(req,config){
  const host=String(req.headers.host||'');assert(host&&!/[\s/@\\]/.test(host),'请求主机无效',403);
  let actual;try{actual=new URL('http://'+host);}catch{assert(false,'请求主机无效',403);}
  if(config.publicOrigin){assert(actual.host===new URL(config.publicOrigin).host,'请求域名不匹配',403);}else assert(['localhost','127.0.0.1','[::1]'].includes(actual.hostname),'仅允许本机地址访问',403);
  if(req.headers.origin)assert(req.headers.origin===(config.publicOrigin||actual.origin),'不允许跨站请求',403);
  assert(req.headers['sec-fetch-site']!=='cross-site','不允许跨站请求',403);
}
function validateJson(value){
  const stack=[[value,0]];let total=0;
  while(stack.length){const [node,depth]=stack.pop();assert(depth<=40&&++total<=150000,'请求结构过于复杂',413);if(!node||typeof node!=='object')continue;for(const key of Object.keys(node)){assert(!['__proto__','prototype','constructor'].includes(key),'请求包含不允许的字段');stack.push([node[key],depth+1]);}}
}
// File permissions are derived from actual attachment fields, never text that happens to contain an id.
function attachmentIds(state){
  const ids=new Set();const visit=(value,key='')=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const entry of value)visit(entry,key);return;}if(['photos','agreements','avatar','file'].includes(key)&&typeof value.id==='string'&&typeof value.name==='string')ids.add(value.id);for(const [k,entry]of Object.entries(value))visit(entry,k);};visit(state);return ids;
}
module.exports={equalSecret,AuthLimiter,clientAddress,originGuard,validateJson,attachmentIds};
