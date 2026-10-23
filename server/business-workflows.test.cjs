const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../shared-domain.js'),V=require('./validation.cjs'),{COLLECTIONS}=require('./store.cjs');
const date=D.day(),user={id:'BUSINESS-ADMIN',name:'测试管理员',role:'admin'};
function fresh(){return D.normalize({...Object.fromEntries(COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[{id:'C-RULE',name:'业务猫',place:'初始地点',discoveryPlace:'初始地点',health:''}]});}
function commit(state,collection,values,files=()=>null){const before=structuredClone(state[collection].find(r=>r.id===values.id)||null),after={...before,...values};const {next}=V.applyChanges(state,[{collection,id:values.id,before,after}],user);V.validateState(next,state,files);return D.normalize(next);}
const cat={catId:'C-RULE',cat:'业务猫'};
function foster(){return {...cat,id:'F-RULE',status:'寄养中',place:'寄养点',caregiver:'照护人',date,segments:[{id:'SEG-RULE',place:'寄养点',caregiver:'照护人',startDate:date,endDate:''}],situation:'寄养观察'};}
test('preoperative hospital stays do not claim surgery; completion synchronizes neutering and work',()=>{
 let s=fresh();s=commit(s,'sterilization',{...cat,id:'S-RULE',status:'住院中',hospital:'医院',date,cost:null});assert.equal(s.monthly.length,0);assert.notEqual(s.cats[0].neuterStatus,'已绝育');assert.equal(s.cats[0].place,'医院');
 s=commit(s,'sterilization',{id:'S-RULE',surgeryDate:date,cost:0});assert.equal(s.cats[0].neuterStatus,'已绝育');assert.equal(s.monthly.filter(r=>r.sourceType==='sterilization').length,1);assert.equal(s.sterilization[0].cost,0);
 for(const cost of [-1,1.001,'12',1000001])assert.throws(()=>commit(s,'sterilization',{id:'S-RULE',cost}),/费用/);
 assert.equal(s.sterilization[0].cost,0);
});
test('adoption closes fostering atomically and returning requires a preserved handoff',()=>{
 let s=commit(fresh(),'foster',foster());s=commit(s,'adoption',{...cat,id:'A-RULE',status:'已领养',applicant:'领养人',adoptDate:date,agreements:[],followups:[{id:'FOLLOW-RULE',date,note:'原回访',photos:[]}]});
 assert.equal(s.foster[0].status,'已结束');assert.equal(s.foster[0].segments[0].endDate,date);assert.equal(s.foster[0].outcome,'已领养');
 assert.throws(()=>commit(s,'adoption',{id:'A-RULE',status:'已退养',returnDate:date}),/退养时需/);
 s=commit(s,'adoption',{id:'A-RULE',status:'已退养',returnDate:date,returnDisposition:'寄养中',returnPlace:'新寄养点',returnCaregiver:'新照护人'});
 assert.equal(s.adoption.find(a=>a.id==='A-RULE').followups[0].note,'原回访');assert.equal(s.adoption.filter(a=>a.sourceAdoptionId==='A-RULE').length,1);assert.equal(s.foster.filter(f=>f.sourceAdoptionId==='A-RULE').length,1);assert.equal(s.cats[0].place,'新寄养点');
 s=commit(s,'adoption',{id:'A-RULE',note:'补充说明'});assert.equal(s.foster.filter(f=>f.sourceAdoptionId==='A-RULE').length,1);
});
test('foster outcome corrections cancel only empty generated adoptions and preserve real archives',()=>{
 let s=commit(fresh(),'foster',foster());s=commit(s,'foster',{id:'F-RULE',status:'已结束',outcome:'已领养',completedDate:date,segments:s.foster[0].segments.map(seg=>({...seg,endDate:date}))});
 const auto=s.adoption[0];assert.equal(auto.status,'已领养');
 const corrected=commit(s,'foster',{id:'F-RULE',outcome:'已放归',releasePlace:'放归点',releaseDate:date});assert.ok(corrected.adoption[0].deletedAt);assert.equal(s.adoption[0].deletedAt,undefined);assert.throws(()=>commit(corrected,'adoption',{id:auto.id,deletedAt:''}),/原寄养结果已更正/);
 s=commit(s,'adoption',{id:auto.id,applicant:'已确认领养人'});assert.throws(()=>commit(s,'adoption',{id:auto.id,applicant:'不应覆盖的新人'}),/更换领养人/);assert.throws(()=>commit(s,'foster',{id:'F-RULE',outcome:'已放归',releasePlace:'放归点',releaseDate:date}),/关联领养已有/);assert.equal(s.foster[0].outcome,'已领养');
});
test('memorial profiles require a date, block new workflows, and permit historical entries',()=>{
 let s=fresh();assert.throws(()=>commit(s,'cats',{id:'C-RULE',archiveStatus:'去了喵星'}),/去喵星日期/);
 s=commit(s,'cats',{id:'C-RULE',archiveStatus:'去了喵星',memorialDate:date});
 for(const [collection,record]of [['rescue',{status:'待救助',place:'地点',issue:'观察'}],['sterilization',{status:'待绝育',place:'地点',cost:0}],['adoption',{status:'已领养',adoptDate:date}],['foster',foster()]])assert.throws(()=>commit(s,collection,{...cat,...record,id:'NEW-'+collection}),/去了喵星/);
 s=commit(s,'rescue',{...cat,id:'HISTORY-RULE',status:'已结束',outcome:'放归',place:'旧目击点',issue:'历史补录',completedDate:date,releasePlace:'历史放归点',releaseDate:date});assert.equal(s.cats[0].place,'初始地点');
});
test('ended dates and foster segment history are checked on corrections as well as creation',()=>{
 let s=commit(fresh(),'foster',foster());assert.throws(()=>commit(s,'foster',{id:'F-RULE',segments:[{...s.foster[0].segments[0],startDate:'2099-01-01'}]}),/寄养分段/);
 s=commit(s,'foster',{id:'F-RULE',status:'已结束',outcome:'已放归',completedDate:date,releaseDate:date,releasePlace:'放归点',segments:[{...s.foster[0].segments[0],endDate:date}]});assert.throws(()=>commit(s,'foster',{id:'F-RULE',completedDate:'2000-01-01'}),/结束日期/);
});
test('profile-only adoption/fostering is classified without inventing association records',()=>{
 let s=commit(fresh(),'cats',{id:'C-RULE',archiveStatus:'寄养中',profileOnly:true});assert.equal(D.catMatchesTab(s,s.cats[0],'寄养中'),true);assert.equal(s.foster.length,0);
 s=commit(s,'cats',{id:'C-RULE',archiveStatus:'已领养',profileOnly:true});assert.equal(D.catCategory(s,s.cats[0]),'已领养');assert.equal(s.adoption.length,0);
});
test('historical location corrections do not replay old moves',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-LOCATION-HISTORY',place:'发现点',issue:'观察',status:'就医中',hospital:'旧医院',medicalDate:date});
 s=commit(s,'foster',foster());assert.equal(s.cats[0].place,'旧医院');s=commit(s,'cats',{id:'C-RULE',place:'寄养点'});
 s=commit(s,'rescue',{id:'R-LOCATION-HISTORY',hospital:'更正后的旧医院',locationAction:'history'});assert.equal(s.cats[0].place,'寄养点');
 s=commit(s,'rescue',{id:'R-LOCATION-HISTORY',hospital:'实际新医院',locationAction:'move'});assert.equal(s.cats[0].place,'实际新医院');
});
test('correcting a rescue result cancels only an unused automatic placement',()=>{
 let s=commit(fresh(),'rescue',{...cat,id:'R-LINK',status:'已结束',place:'发现点',issue:'观察',outcome:'转寄养',completedDate:date});const fid=s.foster[0].id;
 const corrected=commit(s,'rescue',{id:'R-LINK',outcome:'放归',releasePlace:'实际放归点',releaseDate:date});assert.ok(corrected.foster[0].deletedAt);assert.throws(()=>commit(corrected,'foster',{id:fid,deletedAt:''}),/原救助结果已更正/);
 s=commit(s,'foster',{id:fid,...foster(),id:fid});assert.throws(()=>commit(s,'rescue',{id:'R-LINK',outcome:'放归',releasePlace:'实际放归点',releaseDate:date}),/已有入住经历/);
});

test('pending sterilization sighting photos sync once to the correct cat album and preserve independent deletions',()=>{
 let s=commit(fresh(),'sterilization',{...cat,id:'S-PHOTO',status:'待绝育',place:'图书馆北侧',date,photos:[{id:'P-SIGHT',name:'sighting.png',type:'image/png'}]},id=>id==='P-SIGHT'?{kind:'image'}:null);
 assert.equal(s.cats[0].photos.length,1);assert.equal(s.cats[0].photos[0].sourceId,'S-PHOTO');assert.match(s.cats[0].photos[0].note,/目击照片.*图书馆北侧/);
 s=D.normalize(s);assert.equal(s.cats[0].photos.length,1);
 const photo=s.cats[0].photos[0];s.cats[0].photos=[];s.cats[0].deletedFiles=[{key:'photos',file:photo}];s=D.normalize(s);assert.equal(s.cats[0].photos.length,0);assert.equal(s.sterilization[0].photos.length,1);
 s.cats[0].deletedFiles=[];s=D.normalize(s);s=commit(s,'sterilization',{id:'S-PHOTO',status:'住院中',hospital:'医院',photos:[]},id=>id==='P-SIGHT'?{kind:'image'}:null);assert.equal(s.cats[0].photos.length,1);
});

test('hospital archive filter follows medical records and excludes memorial cats',()=>{
 let s=fresh();assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),false);
 s=commit(s,'rescue',{...cat,id:'R-HOSP-TAB',status:'就医中',hospital:'医院',issue:'观察',date});assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),true);
 s=commit(s,'rescue',{id:'R-HOSP-TAB',status:'已结束',outcome:'放归',releasePlace:'校园',completedDate:date});assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),false);
 s=commit(s,'sterilization',{...cat,id:'S-HOSP-TAB',status:'住院中',hospital:'医院',date});assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),true);
 s=commit(s,'cats',{id:'C-RULE',archiveStatus:'去了喵星',memorialDate:date});assert.equal(D.catMatchesTab(s,s.cats[0],'住院中'),false);
});

test('loan and return movements must match one immutable loan identity, quantity and source',()=>{
 const initial=fresh();initial.inventory=[{id:'I-LOAN',name:'诱捕笼',group:'日常',kind:'可借用器材',unit:'个',place:'库房',qty:2,reserved:0}];
 const borrowed=structuredClone(initial);borrowed.inventory[0].qty=1;borrowed.loans=[{id:'L-PAIR',itemId:'I-LOAN',itemName:'诱捕笼',quantity:1,borrower:'测试成员',date,movementId:'M-OUT',returnedDate:''}];borrowed.movements=[{id:'M-OUT',loanId:'L-PAIR',type:'借出',itemId:'I-LOAN',quantity:1,date}];
 assert.doesNotThrow(()=>V.validateState(borrowed,initial,()=>null));
 const unlinked=structuredClone(borrowed);unlinked.movements[0].loanId='不存在';assert.throws(()=>V.validateState(unlinked,initial,()=>null),/有效借还单号/);
 const returned=structuredClone(borrowed);returned.inventory[0].qty=2;Object.assign(returned.loans[0],{returnedDate:date,returnItemId:'I-LOAN'});returned.movements.push({id:'M-IN',loanId:'L-PAIR',type:'归还',itemId:'I-LOAN',quantity:1,date});assert.doesNotThrow(()=>V.validateState(returned,borrowed,()=>null));
 const wrong=structuredClone(returned);wrong.movements[1].quantity=2;wrong.inventory[0].qty=3;assert.throws(()=>V.validateState(wrong,borrowed,()=>null),/数量与借还单不一致/);
 const wrongItem=structuredClone(returned);wrongItem.inventory[0].qty=1;wrongItem.inventory.push({...initial.inventory[0],id:'I-WRONG',name:'其他器材',qty:1});wrongItem.loans[0].returnItemId='I-WRONG';wrongItem.movements[1].itemId='I-WRONG';assert.throws(()=>V.validateState(wrongItem,borrowed,()=>null),/器材与借出来源不一致/);
 const duplicate=structuredClone(returned);duplicate.movements.push({...returned.movements[1],id:'M-IN-AGAIN'});duplicate.inventory[0].qty=3;assert.throws(()=>V.validateState(duplicate,returned,()=>null),/已归还/);
});
