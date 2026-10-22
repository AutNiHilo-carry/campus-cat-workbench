const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('./index.cjs');
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
test('local backend: authentication, transactions, permissions, files and restart persistence',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'danmiao-api-test-'));
 let app=createApp({dataDir:directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let origin='http://127.0.0.1:'+app.server.address().port;
 async function request(actor,url,{method='GET',value,raw,headers={}}={}){
   const response=await fetch(origin+url,{method,headers:{...(actor?.cookie?{Cookie:actor.cookie}:{}),...(actor?.csrf?{'X-CSRF-Token':actor.csrf}:{}),...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw|| (value!==undefined?JSON.stringify(value):undefined)});
   const result=await response.json().catch(()=>null);return{response,status:response.status,result};
 }
 const creds={username:'admin-test',name:'测试管理员',password:'local-test-password-2026'};
 async function login(username,password=creds.password){const r=await request(null,'/api/login',{method:'POST',value:{username,password}});assert.equal(r.status,200,JSON.stringify(r.result));return{cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.result.csrf,user:r.result.user};}
 const setup=await request(null,'/api/setup',{method:'POST',value:creds});assert.equal(setup.status,201);let admin={cookie:setup.response.headers.get('set-cookie').split(';')[0],csrf:setup.result.csrf,user:setup.result.user};
 const get=async actor=>{const r=await request(actor,'/api/state');assert.equal(r.status,200,JSON.stringify(r.result));return r.result;};
 const patch=async(actor,changes)=>request(actor,'/api/state',{method:'PATCH',value:{changes,message:'接口回归测试'}});
 const change=(collection,before,after)=>({collection,id:after.id,before,after});
 const users={admin};
 try{
  await t.test('setup once, login protection, CSRF and static allowlist',async()=>{
   assert.equal((await request(null,'/api/state')).status,401);
   assert.equal((await request(null,'/api/setup',{method:'POST',value:creds})).status,409);
   assert.equal((await request(null,'/api/login',{method:'POST',value:{username:creds.username,password:'incorrect-password'}})).status,401);
   assert.equal((await request({...admin,csrf:'wrong'},'/api/state',{method:'PATCH',value:{changes:[]}})).status,403);
   assert.equal((await request(admin,'/api/state',{method:'PATCH',value:{changes:[]},headers:{Origin:'https://evil.example'}})).status,403);
   assert.equal((await request(null,'/data/workbench.sqlite')).status,404);
   assert.equal((await request(null,'/server/index.cjs')).status,404);
  });
  await t.test('independent roles and server-enforced read visibility',async()=>{
   for(const role of ['member','finance','adoption','viewer']){const r=await request(admin,'/api/users',{method:'POST',value:{username:role+'-test',name:role+'测试',password:creds.password,role}});assert.equal(r.status,201);users[role]=await login(role+'-test');}
   assert.equal((await request(users.member,'/api/users')).status,403);
   const state=await get(users.member);assert.equal(state.state.finance.length,0);assert.equal(state.state.audit.length,0);
   const c=state.state.cats[0];assert.equal((await patch(users.viewer,[change('cats',c,{...c,description:'不能修改'})])).status,403);
  });
  await t.test('atomic changes, same-record conflicts, independent edits, server audit',async()=>{
   const a=await get(admin),first=a.state.cats[0],second=a.state.cats[1];
   assert.equal((await patch(admin,[change('cats',first,{...first,description:'第一次保存'})])).status,200);
   assert.equal((await patch(admin,[change('cats',first,{...first,description:'旧版本覆盖'})])).status,409);
   assert.equal((await patch(admin,[change('cats',second,{...second,description:'独立记录可以同时改'})])).status,200);
   const state=await get(admin);assert.equal(state.state.cats.find(c=>c.id===first.id).description,'第一次保存');assert.equal(state.state.audit[0].actor,creds.name);
   const item=state.state.inventory[0],cat=state.state.cats[0];const bad=await patch(admin,[change('cats',cat,{...cat,description:'不能部分保存'}),change('inventory',item,{...item,qty:item.qty+1})]);assert.equal(bad.status,400);assert.equal((await get(admin)).state.cats.find(c=>c.id===cat.id).description,'第一次保存');
  });
  await t.test('claims require approval, only finance can approve and pay',async()=>{
   const claim={id:'CLAIM-TEST',title:'测试垫付',flow:'个人垫付',status:'待审核',date:today(),owner:'member测试',amountCents:1200};
   assert.equal((await patch(users.member,[change('finance',null,claim)])).status,200);
   const own=(await get(users.member)).state.finance.find(r=>r.id===claim.id);assert.ok(own);assert.equal(own.createdBy,users.member.user.id);
   assert.equal((await patch(users.member,[change('finance',own,{...own,status:'已报销',paidDate:today()})])).status,403);
   let bill=(await get(users.finance)).state.finance.find(r=>r.id===claim.id);
   assert.equal((await patch(users.finance,[change('finance',bill,{...bill,status:'已报销',paidDate:today()})])).status,400);
   assert.equal((await patch(users.finance,[change('finance',bill,{...bill,status:'审核通过',reviewDate:today()})])).status,200);
   bill=(await get(users.finance)).state.finance.find(r=>r.id===claim.id);
   assert.equal((await patch(users.finance,[change('finance',bill,{...bill,status:'已报销',paidDate:today()})])).status,200);
   assert.equal((await get(users.adoption)).state.finance.some(r=>r.id===claim.id),false);
  });
  let image,agreement;
  await t.test('real upload persistence, signature validation and agreement access control',async()=>{
   const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1kAAAAASUVORK5CYII=','base64');
   const uploaded=await request(users.member,'/api/files?kind=image&name=cat.png',{method:'POST',raw:bytes,headers:{'Content-Type':'application/octet-stream'}});assert.equal(uploaded.status,201);image=uploaded.result.file;
   assert.equal((await request(users.member,'/api/files?kind=image&name=fake.png',{method:'POST',raw:Buffer.from('<script>fake</script>'),headers:{'Content-Type':'application/octet-stream'}})).status,415);
   const pdf=Buffer.from('%PDF-1.4\nExample contract\n%%EOF');
   assert.equal((await request(users.member,'/api/files?kind=agreement&name=contract.pdf',{method:'POST',raw:pdf})).status,403);
   const result=await request(users.adoption,'/api/files?kind=agreement&name=contract.pdf',{method:'POST',raw:pdf});assert.equal(result.status,201);agreement=result.result.file;
   let response=await fetch(origin+'/api/files/'+agreement.id,{headers:{Cookie:users.member.cookie}});assert.equal(response.status,403);
   response=await fetch(origin+'/api/files/'+agreement.id,{headers:{Cookie:users.adoption.cookie}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
   const state=await get(admin),cat=state.state.cats[0];assert.equal((await patch(admin,[change('cats',cat,{...cat,photos:[...cat.photos,image]})])).status,200);
   const latest=(await get(admin)).state.cats[0];assert.equal((await patch(admin,[change('cats',latest,{...latest,photos:[agreement]})])).status,400);
  });
  await t.test('order reservations, delivery and linked income stay consistent',async()=>{
   const state=await get(users.member),item=state.state.inventory.find(i=>i.group==='文创'&&i.qty>2);
   const sale={id:'ORDER-TEST',channel:'线上',title:'测试订单',date:today(),delivery:'自提',lines:[{itemId:item.id,name:item.name,unit:item.unit,quantity:1,unitPriceCents:500}],amountCents:500,deliveredDate:'',cancelledAt:''};
   const bill={id:'INCOME-TEST',flow:'收入',title:sale.title,date:today(),status:'待确认',saleId:sale.id,amountCents:500};
   let result=await patch(users.member,[change('sales',null,sale),change('finance',null,bill)]);assert.equal(result.status,200,JSON.stringify(result.result));
   let current=await get(users.member),order=current.state.sales.find(s=>s.id===sale.id),stock=current.state.inventory.find(i=>i.id===item.id);
   const movement={id:'DELIVERY-TEST',itemId:stock.id,itemName:stock.name,type:'自提交付',quantity:1,date:today(),saleId:order.id,beforeQty:stock.qty,afterQty:stock.qty-1};
   assert.equal((await patch(users.member,[change('sales',order,{...order,deliveredDate:today()})])).status,400);
   assert.equal((await patch(users.member,[change('sales',order,{...order,deliveredDate:today()}),change('movements',null,movement)])).status,400);
   assert.equal((await patch(users.member,[change('sales',order,{...order,deliveredDate:today(),cancelledAt:new Date().toISOString()})])).status,400);
   assert.equal((await get(admin)).state.inventory.find(i=>i.id===stock.id).qty,stock.qty);
   assert.equal((await get(admin)).state.sales.find(s=>s.id===order.id).deliveredDate,'');
   result=await patch(users.member,[change('sales',order,{...order,deliveredDate:today()}),change('inventory',stock,{...stock,qty:stock.qty-1,sold:stock.sold+1}),change('movements',null,movement)]);assert.equal(result.status,200,JSON.stringify(result.result));
   const income=(await get(users.finance)).state.finance.find(b=>b.id===bill.id);assert.equal((await patch(users.finance,[change('finance',income,{...income,status:'已入账',paidDate:today()})])).status,200);
   current=await get(admin);assert.equal(current.state.inventory.find(i=>i.id===stock.id).qty,stock.qty-1);
  });
  await t.test('members can edit and cancel orders without seeing or duplicating hidden income',async()=>{
   let state=await get(users.member),item=state.state.inventory.find(i=>i.group==='文创'&&i.qty>3);
   let order={id:'ORDER-HIDDEN',channel:'线上',title:'普通成员订单',date:today(),delivery:'快递',lines:[{itemId:item.id,name:item.name,unit:item.unit,quantity:1,unitPriceCents:500}],amountCents:500,deliveredDate:'',cancelledAt:''};
   assert.equal((await patch(users.member,[change('sales',null,order)])).status,200);
   order=(await get(users.member)).state.sales.find(s=>s.id===order.id);
   const updated={...order,lines:order.lines.map(l=>({...l,unitPriceCents:600})),amountCents:600};
   const duplicate={id:'SHOULD-NOT-DUPLICATE',saleId:order.id,flow:'收入',status:'待确认',date:today(),amountCents:600,title:order.title};
   assert.equal((await patch(users.member,[change('sales',order,updated),change('finance',null,duplicate)])).status,200);
   state=await get(admin);let bills=state.state.finance.filter(b=>b.saleId===order.id);assert.equal(bills.length,1);assert.equal(bills[0].amountCents,600);
   order=(await get(users.member)).state.sales.find(s=>s.id===order.id);
   assert.equal((await patch(users.member,[change('sales',order,{...order,cancelledAt:new Date().toISOString()})])).status,200);
   bills=(await get(admin)).state.finance.filter(b=>b.saleId===order.id);assert.equal(bills[0].status,'已取消');
  });
  await t.test('complete backup restore validates first and preserves account access',async()=>{
   const backup=(await request(admin,'/api/backup')).result;
   let state=await get(admin),cat=state.state.cats[0];assert.equal((await patch(admin,[change('cats',cat,{...cat,description:'备份之后的修改'})])).status,200);
   assert.equal((await request(users.member,'/api/restore',{method:'POST',value:backup})).status,403);
   const invalid=structuredClone(backup);invalid.files=[];assert.equal((await request(admin,'/api/restore',{method:'POST',value:invalid})).status,400);
   assert.equal((await get(admin)).state.cats[0].description,'备份之后的修改');
   const restored=await request(admin,'/api/restore',{method:'POST',value:backup});assert.equal(restored.status,200,JSON.stringify(restored.result));assert.equal((await get(admin)).state.cats[0].description,'第一次保存');
   assert.equal((await request(admin,'/api/users')).status,200);
  });
  await t.test('backup includes binary files and restart retains records, accounts and sessions',async()=>{
   assert.equal((await request(users.member,'/api/backup')).status,403);
   const backup=await request(admin,'/api/backup');assert.equal(backup.status,200);assert.equal(backup.result.format,'danmiao-backup-v1');assert.ok(backup.result.files.find(f=>f.id===image.id).base64);assert.equal(JSON.stringify(backup.result).includes(creds.password),false);
   await app.close();app=createApp({dataDir:directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+app.server.address().port;
   const state=await get(admin);assert.equal(state.state.cats[0].description,'第一次保存');assert.equal(state.state.sales.find(s=>s.id==='ORDER-TEST').deliveredDate,today());
   const response=await fetch(origin+'/api/files/'+image.id,{headers:{Cookie:admin.cookie}});assert.equal(response.status,200);
  });
  await t.test('disabling a user invalidates their existing sessions',async()=>{
   const result=await request(admin,'/api/users/'+users.member.user.id,{method:'PATCH',value:{role:'member',disabled:true}});assert.equal(result.status,200);assert.equal((await request(users.member,'/api/state')).status,401);
   assert.equal((await request(admin,'/api/logout',{method:'POST',value:{}})).status,200);assert.equal((await request(admin,'/api/state')).status,401);
  });
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});
