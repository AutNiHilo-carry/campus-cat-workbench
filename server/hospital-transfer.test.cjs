const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../shared-domain.js'),V=require('./validation.cjs'),{COLLECTIONS}=require('./store.cjs');
const today=D.day(),start=D.addDays(today,-10),surgeryDay=D.addDays(today,-5),transferDay=D.addDays(today,-2),user={id:'HOSP-ADMIN',name:'测试管理员',role:'admin'},cat={catId:'C-HOSP',cat:'转院猫'};
function fresh(){return D.normalize({...Object.fromEntries(COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[{id:cat.catId,name:cat.cat,discoveryPlace:'发现点',place:'发现点',photos:[]}]});}
function commit(s,type,values){const before=structuredClone(s[type].find(r=>r.id===values.id)||null),after={...before,...values};const {next}=V.applyChanges(s,[{collection:type,id:values.id,before,after}],user);V.validateState(next,s,()=>null);return D.normalize(next);}
const surgery=()=>({...cat,id:'S-HOSP',status:'住院中',hospital:'原医院',date:start,admissionDate:start,surgeryDate:surgeryDay,cost:260});
const rescue=()=>({...cat,id:'R-HOSP',status:'就医中',hospital:'原医院',date:start,medicalDate:start,issue:'救助检查'});
const foster=()=>({...cat,id:'F-HOSP',status:'寄养中',place:'寄养点',caregiver:'照护人',date:start,segments:[{id:'SEG-HOSP',place:'寄养点',caregiver:'照护人',startDate:start,endDate:''}]});
const operation=(id,kind='transfer',date=transferDay)=>({id,kind,date});
test('transfer keeps old hospital, cost and surgery facts without duplicate admission or loss of monthly work',()=>{
 let s=commit(fresh(),'sterilization',surgery());s=commit(s,'sterilization',{id:'S-HOSP',hospital:'新医院',hospitalChange:operation('HC-ONE')});
 const r=s.sterilization[0];assert.equal(r.status,'住院中');assert.equal(r.hospital,'新医院');assert.equal(r.hospitalSinceDate,transferDay);assert.equal(r.cost,null);assert.equal(r.surgeryDate,'');assert.equal(r.hospitalHistory.length,1);assert.equal(r.hospitalHistory[0].hospital,'原医院');assert.equal(r.hospitalHistory[0].cost,260);assert.equal(r.hospitalHistory[0].surgeryDate,surgeryDay);assert.equal(s.cats[0].place,'新医院');assert.equal(s.cats[0].neuterStatus,'已绝育');assert.equal(s.monthly.find(w=>w.sourceId===r.id).date,surgeryDay);assert.equal(s.monthly.find(w=>w.sourceId===r.id).result,'原医院');assert.equal(s.sterilization.length,1);
 s=commit(s,'sterilization',{id:'S-HOSP',cost:90,note:'补充新医院费用'});assert.equal(s.sterilization[0].hospitalHistory.length,1);assert.equal(s.sterilization[0].hospitalHistory[0].cost,260);assert.equal(s.sterilization[0].cost,90);
 s=commit(s,'sterilization',{id:'S-HOSP',hospital:'第三家医院',hospitalChange:operation('HC-TWO','transfer',today)});assert.equal(s.sterilization[0].hospitalHistory.length,2);assert.equal(s.sterilization[0].hospitalHistory[1].cost,90);assert.equal(s.cats[0].place,'第三家医院');
});
test('explicit hospital intent is required; a typo changes the name with no transfer history',()=>{
 let s=commit(fresh(),'rescue',rescue());assert.throws(()=>commit(s,'rescue',{id:'R-HOSP',hospital:'正确医院'}),/请确认医院名称修改/);
 s=commit(s,'rescue',{id:'R-HOSP',hospital:'正确医院',hospitalChange:operation('HC-CORRECTION','correction')});assert.equal(s.rescue[0].hospitalHistory,undefined);assert.equal(s.cats[0].place,'正确医院');
 s=commit(s,'cats',{id:cat.catId,place:'后来人工确认的位置'});s=commit(s,'rescue',{id:'R-HOSP',hospital:'最终正确名称',hospitalChange:operation('HC-CORRECTION2','correction')});assert.equal(s.cats[0].place,'后来人工确认的位置');
});
test('parallel rescue and sterilization move and correct their hospital atomically',()=>{
 let s=commit(commit(fresh(),'sterilization',surgery()),'rescue',rescue());s=commit(s,'rescue',{id:'R-HOSP',hospital:'同一新医院',hospitalChange:operation('HC-LINKED')});
 assert.equal(s.rescue[0].hospital,'同一新医院');assert.equal(s.sterilization[0].hospital,'同一新医院');assert.equal(s.rescue[0].hospitalHistory.length,1);assert.equal(s.sterilization[0].hospitalHistory.length,1);assert.equal(s.sterilization[0].hospitalHistory[0].cost,260);assert.equal(s.cats[0].place,'同一新医院');
 s=commit(s,'sterilization',{id:'S-HOSP',hospital:'新医院正确名称',hospitalChange:operation('HC-LINKED-C','correction')});assert.equal(s.rescue[0].hospital,'新医院正确名称');assert.equal(s.sterilization[0].hospitalHistory.length,1);assert.equal(s.cats[0].place,'新医院正确名称');
});
test('future or out-of-order transfers fail without altering either linked source',()=>{
 const s=commit(commit(fresh(),'sterilization',surgery()),'rescue',rescue()),before=structuredClone(s);
 for(const date of [D.addDays(today,1),D.addDays(surgeryDay,-1),''])assert.throws(()=>commit(s,'rescue',{id:'R-HOSP',hospital:'新医院',hospitalChange:operation('HC-BAD','transfer',date)}),/转院日期/);assert.deepEqual(s,before);
});
test('memorial and ended records permit historical name correction but no actual transfer',()=>{
 let s=commit(fresh(),'sterilization',surgery());s=commit(s,'cats',{id:cat.catId,archiveStatus:'去了喵星',memorialDate:today});assert.throws(()=>commit(s,'sterilization',{id:'S-HOSP',hospital:'新医院',hospitalChange:operation('HC-GONE')}),/去了喵星后不能/);
 s=commit(s,'sterilization',{id:'S-HOSP',hospital:'旧医院正确名称',hospitalChange:operation('HC-GONE-C','correction')});assert.equal(s.cats[0].archiveStatus,'去了喵星');assert.equal(s.cats[0].place,'旧医院正确名称');
 let ended=commit(fresh(),'sterilization',{...surgery(),status:'已放归',releaseDate:transferDay,releasePlace:'校园'});assert.throws(()=>commit(ended,'sterilization',{id:'S-HOSP',hospital:'医院乙',hospitalChange:operation('HC-ENDED')}),/仅正在住院/);
});
test('historical hospital snapshots cannot be removed, overwritten or forged through an API update',()=>{
 let s=commit(fresh(),'sterilization',surgery());s=commit(s,'sterilization',{id:'S-HOSP',hospital:'医院乙',hospitalChange:operation('HC-HISTORY')});assert.throws(()=>commit(s,'sterilization',{id:'S-HOSP',hospitalHistory:[]}),/不能直接覆盖或删除/);assert.throws(()=>commit(s,'sterilization',{id:'S-HOSP',hospitalHistory:s.sterilization[0].hospitalHistory.map(h=>({...h,cost:1}))}),/不能直接覆盖或删除/);
 assert.throws(()=>commit(fresh(),'sterilization',{...surgery(),hospitalHistory:[{id:'FAKE-VISIT',hospital:'伪造'}]}),/不能直接填入医院历史/);
});
test('open hospital stays keep the physical location during fostering or adoption and prevent premature release',()=>{
 let s=commit(commit(fresh(),'sterilization',surgery()),'rescue',rescue());s=commit(s,'foster',foster());assert.equal(s.cats[0].place,'原医院');s=commit(s,'adoption',{...cat,id:'A-HOSP',status:'已领养',applicant:'领养人',adoptDate:today,followups:[],agreements:[]});assert.equal(s.cats[0].place,'原医院');assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),true);
 assert.throws(()=>commit(s,'rescue',{id:'R-HOSP',status:'已结束',outcome:'放归',completedDate:today,releaseDate:today,releasePlace:'校园'}),/还有未结束的住院/);
 s=commit(s,'rescue',{id:'R-HOSP',status:'已结束',outcome:'放归',completedDate:today,releaseDate:today,releasePlace:'校园',hospitalDischarge:{id:'DISCHARGE-ONE',confirmed:true}});assert.equal(s.rescue[0].status,'已结束');assert.equal(s.sterilization[0].status,'已放归');assert.equal(s.cats[0].place,'校园');assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),false);
});
test('surgery chronology is enforced for the current hospital and completed neutering prevents a new queue entry',()=>{
 assert.throws(()=>commit(fresh(),'sterilization',{...surgery(),admissionDate:today}),/不能早于本段入院/);
 let s=commit(fresh(),'sterilization',{...surgery(),status:'已放归',releaseDate:transferDay,releasePlace:'校园'});assert.throws(()=>commit(s,'sterilization',{...cat,id:'S-REPEAT',status:'待绝育',place:'校园',date:today}),/已确认绝育/);
 assert.throws(()=>commit(s,'sterilization',{...surgery(),id:'S-HISTORY',status:'已放归',releaseDate:transferDay,releasePlace:'校园'}),/历史补录说明/);s=commit(s,'sterilization',{...surgery(),id:'S-HISTORY',status:'已放归',releaseDate:transferDay,releasePlace:'校园',neuterHistoryReason:'补录以前另一段纸质医院资料'});assert.equal(s.sterilization.length,2);
});
test('completed foster and generated placement dates follow source corrections and reject impossible boundaries',()=>{
 let s=commit(fresh(),'foster',foster());s=commit(s,'foster',{id:'F-HOSP',status:'已结束',outcome:'已放归',completedDate:transferDay,releaseDate:transferDay,releasePlace:'校园',segments:foster().segments.map(h=>({...h,endDate:transferDay}))});s=commit(s,'foster',{id:'F-HOSP',completedDate:today,releaseDate:today});assert.equal(s.foster[0].segments[0].endDate,today);
 let r=commit(fresh(),'rescue',{...rescue(),status:'已结束',outcome:'转寄养',completedDate:transferDay});r=commit(r,'rescue',{id:'R-HOSP',completedDate:today});assert.equal(r.foster[0].date,today);const fid=r.foster[0].id;r=commit(r,'foster',{...foster(),id:fid,date:today,segments:foster().segments.map(h=>({...h,startDate:today}))});assert.throws(()=>commit(r,'rescue',{id:'R-HOSP',completedDate:D.addDays(today,1)}),/不能晚于今天|不能晚于实际寄养/);
});
test('unlinked negative finance is rejected while a normal positive ledger entry is valid',()=>{
 const row={id:'B-HOSP',title:'账目',flow:'收入',status:'已入账',amountCents:10000,date:today,paidDate:today,owner:'经办人'};assert.throws(()=>commit(fresh(),'finance',{...row,adjustmentSign:-1}),/负向账目必须关联/);const s=commit(fresh(),'finance',row);assert.equal(D.finance(s,today.slice(0,7)).balance,10000);
});
test('appearance is optional, bounded and independent from medical issue and profile health',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-APPEAR',status:'待救助',place:'树下',issue:'跛行',appearance:'橘白，尾巴有环纹'});assert.equal(s.rescue[0].appearance,'橘白，尾巴有环纹');assert.equal(s.cats[0].health,undefined);assert.throws(()=>commit(s,'rescue',{id:'R-APPEAR',appearance:'长'.repeat(201)}),/最多200字/);
});
test('HTTP saves initial photos and appearance and transfers linked admissions in one transaction',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createApp}=require('./index.cjs'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'cat-hospital-http-')),app=createApp({dataDir:directory,seedMode:'empty'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';
 async function request(route,method='GET',body,raw=false){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
 async function save(type,values){const state=(await request('/api/state')).body,before=state.state[type].find(r=>r.id===values.id)||null;return request('/api/commands','PATCH',{changes:[{collection:type,id:values.id,before,after:{...before,...values}}],since:state.revision,day:state.day});}
 try{
  const setup=await request('/api/setup','POST',{username:'hospital-admin',name:'管理员',password:'hospital-test-pass-2026'});cookie=setup.cookie.split(';')[0];csrf=setup.body.csrf;
  assert.equal((await save('cats',{id:cat.catId,name:cat.cat,place:'发现点',discoveryPlace:'发现点'})).status,200);
  const uploaded=await request('/api/files?kind=image&name=sighting.png','POST',fs.readFileSync(path.join(__dirname,'../assets/aihe-logo.png')),true);assert.equal(uploaded.status,201);const photo=uploaded.body.file;
  assert.equal((await save('rescue',{...cat,id:'R-HTTP',status:'待救助',place:'树下',issue:'观察',owner:'',appearance:'白猫，尾尖黑色',photos:[photo]})).status,200);
  assert.equal((await save('sterilization',{...cat,id:'S-HTTP',status:'待绝育',place:'树下',owner:'',appearance:'白猫，尾尖黑色',photos:[photo]})).status,200);
  let state=(await request('/api/state')).body.state;assert.equal(state.rescue[0].photos[0].id,photo.id);assert.equal(state.cats[0].photos[0].id,photo.id);
  assert.equal((await save('rescue',{id:'R-HTTP',status:'就医中',hospital:'甲医院',medicalDate:today})).status,200);assert.equal((await save('sterilization',{id:'S-HTTP',status:'住院中',hospital:'甲医院',admissionDate:today,cost:260,surgeryDate:today})).status,200);
  const response=await save('sterilization',{id:'S-HTTP',hospital:'乙医院',hospitalChange:operation('HC-HTTP','transfer',today)});assert.equal(response.status,200);state=(await request('/api/state')).body.state;assert.equal(state.sterilization[0].hospitalHistory[0].cost,260);assert.equal(state.rescue[0].hospital,'乙医院');assert.equal(state.cats[0].place,'乙医院');assert.equal(state.cats[0].neuterStatus,'已绝育');
  const before=JSON.stringify(state);assert.equal((await save('sterilization',{id:'S-HTTP',hospitalHistory:[]})).status,400);assert.equal(JSON.stringify((await request('/api/state')).body.state),before);
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});
