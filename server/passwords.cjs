const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {assert}=require('./validation.cjs');
const scrypt=promisify(crypto.scrypt);
function passwordInput(password){assert(typeof password==='string'&&password.length>=10&&password.length<=128,'密码需为10至128位');}
async function passwordHash(password){passwordInput(password);const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
async function passwordMatches(password,stored){const [salt,digest]=stored.split(':');const actual=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}),expected=Buffer.from(digest,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function replacePassword(db,target,password,actor,action){
 const updated=db.prepare('UPDATE users SET password=? WHERE id=? AND password=? AND disabled=0').run(password,target.id,target.password);
 assert(updated.changes===1,'账号状态已变化，请重新登录后重试',409);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
 db.prepare('INSERT INTO audit(time,user_id,actor,action,changes) VALUES(?,?,?,?,?)').run(new Date().toISOString(),actor.id,actor.name,action+'：'+target.username,'[]');
}
module.exports={passwordInput,passwordHash,passwordMatches,replacePassword};
