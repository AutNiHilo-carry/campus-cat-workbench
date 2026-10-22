const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../shared-domain.js'),V=require('./validation.cjs'),{COLLECTIONS}=require('./store.cjs');
const today=D.day(),earlier=D.addDays(today,-10),yesterday=D.addDays(today,-1),user={id:'INTEGRITY-ADMIN',name:'管理员',role:'admin'};
const cat={catId:'C-I',cat:'校验猫'};
function fresh(){return D.normalize({...Object.fromEntries(COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[{id:cat.catId,name:cat.cat,place:'发现点',discoveryPlace:'发现点',health:''},{id:'C-II',name:'另一只猫',place:'另一个地点',discoveryPlace:'另一个地点',health:''}]});}
function commit(s,type,v){return batch(s,[[type,v]]);}
function batch(s,rows){const changes=rows.map(([collection,v])=>{const before=structuredClone(s[collection].find(r=>r.id===v.id)||null);return {collection,id:v.id,before,after:{...before,...v}};});const {next}=V.applyChanges(s,changes,user);V.validateState(next,s,()=>null);return D.normalize(next);}
function foster(id='F-I'){return {...cat,id,status:'寄养中',place:'寄养点',caregiver:'照护人',date:earlier,segments:[{id:'SEG-'+id,place:'寄养点',caregiver:'照护人',startDate:earlier,endDate:''}],situation:'恢复良好'};}
function claim(){return {id:'B-I',title:'检查费用',flow:'个人垫付',amountCents:10000,owner:'经办人',date:earlier,status:'待审核'};}
test('memorial wording migrates old archives and aliases while retaining dates and grayscale category',()=>{
 const s=fresh();Object.assign(s.cats[0],{archiveStatus:'已去喵星',memorialDate:yesterday});D.normalize(s);assert.equal(s.cats[0].archiveStatus,'去了喵星');assert.equal(s.cats[0].memorialDate,yesterday);assert.equal(D.catCategory(s,s.cats[0]),'去了喵星');assert.ok(D.catMatchesTab(s,s.cats[0],'去了喵星'));
});
for(const type of ['foster','rescue'])test(type+' memorial outcome closes the business, synchronizes the archive and corrects without release fallback',()=>{
 let s=commit(fresh(),type,type==='foster'?foster():{...cat,id:'R-I',status:'就医中',hospital:'医院',medicalDate:earlier,date:earlier,issue:'受伤'}),id=s[type][0].id;
 const fields={id,status:'已结束',outcome:'去了喵星',completedDate:yesterday};if(type==='foster')fields.segments=s.foster[0].segments.map(x=>({...x,endDate:yesterday}));s=commit(s,type,fields);
 assert.equal(s[type][0].outcome,'去喵星');assert.equal(s.cats[0].archiveStatus,'去了喵星');assert.equal(s.cats[0].memorialDate,yesterday);assert.ok(s.cats[0].memorialRegisteredAt);assert.notEqual(s.cats[0].place,'放归地点');assert.equal(s.adoption.length,0);assert.equal(D.followup({status:'已领养',adoptDate:earlier,...cat},today,s).due,false);
 s=commit(s,type,{id,outcome:type==='foster'?'已放归':'放归',releasePlace:'实际放归点',releaseDate:yesterday,memorialCorrection:'撤销标记'});assert.notEqual(D.catCategory(s,s.cats[0]),'去了喵星');assert.equal(s.cats[0].memorialDate,undefined);assert.equal(s.cats[0].place,'实际放归点');
});
test('unfinished cats and connected histories cannot be deleted; archive hides completed histories reversibly',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-I',status:'待救助',place:'发现点',issue:'观察',date:earlier});assert.throws(()=>commit(s,'cats',{id:cat.catId,deletedAt:new Date().toISOString()}),/未完成业务/);assert.throws(()=>commit(s,'cats',{id:cat.catId,archivedAt:today}),/未完成业务/);
 s=commit(s,'rescue',{id:'R-I',status:'已结束',outcome:'放归',completedDate:yesterday,releasePlace:'校园',releaseDate:yesterday});assert.throws(()=>commit(s,'cats',{id:cat.catId,deletedAt:today}),/归档隐藏/);
 s=commit(s,'cats',{id:cat.catId,archivedAt:today});assert.equal(D.catMatchesTab(s,s.cats[0],'全部'),false);assert.equal(D.catMatchesTab(s,s.cats[0],'已归档'),true);assert.equal(s.rescue[0].catId,cat.catId);s=commit(s,'cats',{id:cat.catId,archivedAt:''});assert.ok(D.catMatchesTab(s,s.cats[0],'全部'));
 s=commit(fresh(),'rescue',{...cat,id:'R-LINK-I',status:'已结束',outcome:'转寄养',completedDate:yesterday,date:earlier,issue:'观察'});assert.throws(()=>commit(s,'rescue',{id:'R-LINK-I',deletedAt:today}),/后续关联/);
});
test('a second active foster is rejected atomically, including two starts in one request',()=>{
 const s=commit(fresh(),'foster',foster());assert.throws(()=>commit(s,'foster',foster('F-II')),/已有进行中的寄养/);assert.equal(s.foster.length,1);assert.throws(()=>batch(fresh(),[['foster',foster()],['foster',foster('F-II')]]),/已有进行中的寄养/);
});
test('a cat cannot have duplicate active admissions or concurrent different hospitals',()=>{
 let s=commit(fresh(),'sterilization',{...cat,id:'S-I',status:'住院中',hospital:'医院甲',date:earlier,admissionDate:earlier});const revision=structuredClone(s);
 assert.throws(()=>commit(s,'sterilization',{...cat,id:'S-II',status:'住院中',hospital:'医院甲',date:today}),/已有绝育住院记录/);assert.throws(()=>commit(s,'sterilization',{...cat,id:'S-II',status:'住院中',hospital:'医院乙',date:today}),/已有绝育住院记录/);assert.deepEqual(s,revision);
 assert.throws(()=>commit(s,'rescue',{...cat,id:'R-I',status:'就医中',hospital:'医院乙',medicalDate:today,date:today,issue:'受伤'}),/不能同时住在不同医院/);
 s=commit(s,'rescue',{...cat,id:'R-I',status:'就医中',hospital:'医院甲',medicalDate:today,date:today,issue:'检查'});assert.equal(s.rescue[0].hospital,s.sterilization[0].hospital);assert.throws(()=>commit(s,'rescue',{id:'R-I',hospital:'医院乙'}),/不能同时住在不同医院/);
 assert.throws(()=>commit(s,'rescue',{...cat,id:'R-II',status:'就医中',hospital:'医院甲',medicalDate:today,date:today,issue:'重复'}),/已有进行中的救助就医记录/);
 const gone=commit(fresh(),'cats',{id:cat.catId,archiveStatus:'去了喵星',memorialDate:today});for(const type of ['rescue','sterilization'])assert.throws(()=>commit(gone,type,{...cat,id:'NEW-'+type,status:type==='rescue'?'待救助':'待绝育',place:'地点',issue:'检查',date:today}),/不能开启新业务/);
});
test('unpaid association debt allows no handler but settlement records the actual payer',()=>{
 let s=commit(fresh(),'finance',{id:'DEBT-I',title:'欠医院检查费',flow:'协会欠款',status:'待付款',date:earlier,amountCents:10000,creditor:'医院',owner:'',receipt:'',note:''});assert.equal(s.finance[0].owner,'');assert.equal(D.finance(s,today.slice(0,7)).balance,0);
 assert.throws(()=>commit(s,'finance',{id:'DEBT-I',status:'已结清',paidDate:today}),/实际付款经办人/);s=commit(s,'finance',{id:'DEBT-I',status:'已结清',paidDate:today,owner:'实际付款人'});assert.equal(s.finance[0].owner,'实际付款人');assert.equal(D.finance(s,today.slice(0,7)).balance,-10000);
});
test('identity correction requires the whole explicit linkage graph, preserving source history',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-LINK-I',status:'已结束',outcome:'转寄养',completedDate:yesterday,date:earlier,issue:'观察'});const f=s.foster[0];assert.throws(()=>commit(s,'rescue',{id:'R-LINK-I',cat:'另一只猫',catId:'C-II'}),/关联身份更正/);
 const change={cat:'另一只猫',catId:'C-II',identityCorrectionId:'CORRECT-I',identityCorrectionReason:'原识别错误',locationAction:'history'};s=batch(s,[['rescue',{id:'R-LINK-I',...change}],['foster',{id:f.id,...change}]]);assert.equal(s.rescue[0].catId,'C-II');assert.equal(s.foster[0].catId,'C-II');assert.equal(s.foster[0].sourceRescueId,'R-LINK-I');
});
test('posted finance is immutable; linked adjustments affect net balances and cannot over-reverse',()=>{
 let s=commit(fresh(),'finance',{id:'B-I',title:'支出',flow:'协会支出',status:'已入账',amountCents:10000,date:earlier,paidDate:earlier,owner:'经办人'});assert.throws(()=>commit(s,'finance',{id:'B-I',deletedAt:today}),/冲销/);assert.throws(()=>commit(s,'finance',{id:'B-I',amountCents:1}),/不可直接改写|调整记录/);
 s=commit(s,'finance',{id:'B-ADJUST',title:'冲销部分支出',flow:'协会支出',status:'已入账',amountCents:2500,adjustmentSign:-1,adjustmentOf:'B-I',date:yesterday,paidDate:yesterday,note:'原金额录多'});assert.equal(D.finance(s,today.slice(0,7)).balance,-7500);assert.throws(()=>commit(s,'finance',{id:'B-ADJUST2',title:'过度冲销',flow:'协会支出',status:'已入账',amountCents:7501,adjustmentSign:-1,adjustmentOf:'B-I',date:today,paidDate:today,note:'测试'}),/累计冲销/);assert.throws(()=>commit(s,'finance',{id:'B-ADJUST',deletedAt:today}),/冲销/);
});
test('approval binds critical fields; notes preserve approval and edited amounts require another review',()=>{
 let s=commit(fresh(),'finance',claim());s=commit(s,'finance',{id:'B-I',status:'审核通过',reviewDate:yesterday});const approved=structuredClone(s.finance[0]);s=commit(s,'finance',{id:'B-I',note:'补充说明'});assert.equal(s.finance[0].reviewDate,yesterday);assert.equal(s.finance[0].reviewRecordedAt,approved.reviewRecordedAt);s=commit(s,'finance',{id:'B-I',amountCents:20000});assert.equal(s.finance[0].status,'待审核');assert.equal(s.finance[0].reviewHistory[0].snapshot.amountCents,10000);assert.equal(s.finance[0].reviewDate,'');assert.throws(()=>commit(s,'finance',{id:'B-I',status:'已报销',paidDate:today}),/跳过财务审核/);
});
test('actual approval and payment dates remain chronological and registration timestamps are distinct',()=>{
 let s=commit(fresh(),'finance',claim());s=commit(s,'finance',{id:'B-I',status:'审核通过',reviewDate:yesterday});assert.ok(s.finance[0].reviewRecordedAt.startsWith(today));assert.throws(()=>commit(s,'finance',{id:'B-I',status:'已报销',paidDate:earlier}),/不能早于实际审核/);assert.throws(()=>commit(s,'finance',{id:'B-I',reviewDate:earlier}),/实际审核日期已归档/);s=commit(s,'finance',{id:'B-I',status:'已报销',paidDate:today});assert.equal(s.finance[0].paidDate,today);
});
test('memorial date cannot precede real adoption or followup dates',()=>{
 let s=commit(fresh(),'adoption',{...cat,id:'A-I',status:'已领养',applicant:'领养人',adoptDate:earlier,followups:[{id:'FOLLOW-I',date:today,note:'已回访',photos:[]}],agreements:[]});assert.throws(()=>commit(s,'cats',{id:cat.catId,archiveStatus:'去了喵星',memorialDate:yesterday}),/早于已登记/);s=commit(s,'cats',{id:cat.catId,archiveStatus:'去了喵星',memorialDate:today});assert.equal(D.followup(s.adoption[0],today,s).due,false);
});
test('correcting the last actual surgery rolls back only its derived neuter status',()=>{
 let s=commit(fresh(),'sterilization',{...cat,id:'S-I',status:'住院中',hospital:'医院',date:earlier,admissionDate:earlier,surgeryDate:yesterday});assert.equal(s.cats[0].neuterStatus,'已绝育');s=commit(s,'sterilization',{id:'S-I',surgeryDate:'',neuterCorrection:'待确认'});assert.equal(s.cats[0].neuterStatus,'待确认');assert.equal(s.monthly.filter(x=>x.sourceType==='sterilization').length,0);
});
test('deleting a medical source restores the previous location while keeping later manual moves',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-I',status:'就医中',hospital:'医院',medicalDate:earlier,date:earlier,issue:'观察'});assert.equal(s.cats[0].place,'医院');const removed=commit(s,'rescue',{id:'R-I',deletedAt:today});assert.equal(removed.cats[0].place,'发现点');s=commit(s,'cats',{id:cat.catId,place:'人工确认地点'});s=commit(s,'rescue',{id:'R-I',deletedAt:today});assert.equal(s.cats[0].place,'人工确认地点');
});
test('correcting adoption date updates its closed foster segment and rejects later-than-followup dates',()=>{
 let s=commit(fresh(),'foster',foster());s=commit(s,'adoption',{...cat,id:'A-I',status:'已领养',applicant:'领养人',adoptDate:today,followups:[],agreements:[]});s=commit(s,'adoption',{id:'A-I',adoptDate:yesterday});assert.equal(s.foster[0].completedDate,yesterday);assert.equal(s.foster[0].segments.at(-1).endDate,yesterday);s=commit(s,'adoption',{id:'A-I',followups:[{id:'FOLLOW-I',date:yesterday,note:'回访',photos:[]}]});assert.throws(()=>commit(s,'adoption',{id:'A-I',adoptDate:today}),/不能晚于已有回访/);
});
test('a checked cancellation event stays checked across normalization and unrelated changes',()=>{
 const s=fresh(),event=earlier+'T01:00:00Z';s.sales=[{id:'SALE-I',cancelledAt:event}];s.finance=[{id:'B-I',saleId:'SALE-I',flow:'收入',status:'已入账',amountCents:1000,date:earlier,refundReview:true}];D.syncRefundReviews(s);s.finance[0].refundCheckedEvent=event;s.finance[0].refundCheckedDate=today;D.syncRefundReviews(s);D.syncRefundReviews(s);assert.equal(s.finance[0].refundReview,false);s.sales[0].cancelledAt=today+'T02:00:00Z';D.syncRefundReviews(s);assert.equal(s.finance[0].refundReview,true);
});

test('HTTP commands preserve atomic failure and expose synchronized memorial and archived filters',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createApp}=require('./index.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'cat-integrity-http-')),app=createApp({dataDir:directory,seedMode:'empty'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';
 async function req(route,method='GET',value){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});const body=await r.json();return {status:r.status,body,cookie:r.headers.get('set-cookie')};}
 async function save(type,row){const state=(await req('/api/state')).body,before=state.state[type].find(r=>r.id===row.id)||null;return req('/api/commands','PATCH',{changes:[{collection:type,id:row.id,before,after:{...before,...row}}],since:state.revision,day:state.day});}
 try{
  const setup=await req('/api/setup','POST',{username:'integrity-admin',name:'管理员',password:'integrity-test-pass-2026'});assert.equal(setup.status,201);cookie=setup.cookie.split(';')[0];csrf=setup.body.csrf;
  assert.equal((await save('cats',{id:cat.catId,name:cat.cat,place:'发现点',discoveryPlace:'发现点'})).status,200);assert.equal((await save('foster',foster())).status,200);
  const revision=(await req('/api/state')).body.revision;assert.equal((await save('foster',foster('F-II'))).status,400);assert.equal((await req('/api/state')).body.revision,revision);
  assert.equal((await save('foster',{id:'F-I',status:'已结束',outcome:'去了喵星',completedDate:today,segments:foster().segments.map(s=>({...s,endDate:today}))})).status,200);
  const listed=(await req('/api/records/cats?tab='+encodeURIComponent('去了喵星'))).body;assert.equal(listed.total,1);assert.equal(listed.records[0].archiveStatus,'去了喵星');assert.equal(listed.records[0].memorialDate,today);
  assert.equal((await save('cats',{id:cat.catId,archivedAt:new Date().toISOString()})).status,200);assert.equal((await req('/api/records/cats?tab='+encodeURIComponent('已归档'))).body.total,1);assert.equal((await req('/api/records/cats')).body.total,0);
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});
