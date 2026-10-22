const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('./store.cjs');
const V=require('./validation.cjs');
test('foster situation persists independently without changing handoff history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-foster-facts-'));let store=new Store(dir,{seedMode:'empty'});
 try{
  const state=store.load(),next=structuredClone(state);
  next.foster=[{id:'F-FACTS',status:'待安置',cat:'',place:'',caregiver:'',situation:'观察进食\n等待寄养',segments:[]}];
  V.validateState(next,state,[]);store.transaction(()=>store.save(next,1));
  store.close();store=new Store(dir,{seedMode:'empty'});
  assert.equal(store.load().foster[0].situation,'观察进食\n等待寄养');assert.deepEqual(store.load().foster[0].segments,[]);
  const invalid=structuredClone(next);invalid.foster[0].situation='x'.repeat(1001);
  assert.throws(()=>V.validateState(invalid,next,[]),/寄养情况最多1000字/);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('server business changes synchronize location and current foster situation',()=>{
 const domain=require('../shared-domain.js');
 let state=domain.normalize({...Object.fromEntries(require('./store.cjs').COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[{id:'LOCATION-CAT',name:'位置测试猫',place:'原地点',health:''}]});
 const user={id:'MEMBER-LOCATION',name:'测试成员',role:'member'};
 function save(collection,row){const before=structuredClone(state[collection].find(r=>r.id===row.id)||null),after={...before,...row};state=V.applyChanges(state,[{collection,id:after.id,before,after}],user).next;V.validateState(state,state,[]);}
 const cat={catId:'LOCATION-CAT',cat:'位置测试猫'};
 save('rescue',{...cat,id:'R-LOCATION',status:'就医中',place:'发现地点',issue:'发现情况',hospital:'第一医院',medicalDate:domain.day()});assert.equal(state.cats[0].place,'第一医院');
 save('foster',{...cat,id:'F-LOCATION',status:'寄养中',place:'寄养新地点',caregiver:'测试照护人',date:domain.day(),situation:'新的寄养情况',segments:[{place:'寄养新地点',caregiver:'测试照护人',startDate:domain.day(),endDate:'',note:'旧救助备注'}]});assert.equal(state.cats[0].place,'寄养新地点');
 save('rescue',{id:'R-LOCATION',issue:'只改发现情况'});assert.equal(state.cats[0].place,'寄养新地点');
 save('cats',{id:'LOCATION-CAT',place:'人工新地点',health:'独立健康情况'});
 save('foster',{id:'F-LOCATION',situation:'只改寄养情况'});assert.equal(state.cats[0].place,'人工新地点');assert.equal(state.foster[0].segments[0].situation,'只改寄养情况');assert.equal(state.cats[0].health,'独立健康情况');
 save('rescue',{id:'R-LOCATION',hospital:'第二医院'});assert.equal(state.cats[0].place,'第二医院');
 const renamed={...state.rescue[0],cat:'新猫名'};domain.syncBusinessChange(state,'rescue',state.rescue[0],renamed);assert.equal(state.cats[0].place,'第二医院');
});
test('discovery place defaults once and cannot be overwritten through the API',()=>{
 const domain=require('../shared-domain.js');
 const state=domain.normalize({...Object.fromEntries(require('./store.cjs').COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[]});
 const user={id:'MEMBER-DISCOVERY',name:'测试成员',role:'member'},cat={id:'C-DISCOVERY',name:'发现地点猫',discoveryPlace:'初始花园'};
 const first=V.applyChanges(state,[{collection:'cats',id:cat.id,before:null,after:cat}],user).next;assert.equal(first.cats[0].place,'初始花园');
 assert.throws(()=>V.applyChanges(first,[{collection:'cats',id:cat.id,before:first.cats[0],after:{...first.cats[0],discoveryPlace:'其他地点'}}],user),/发现地点首次登记后固定/);
 const moved=V.applyChanges(first,[{collection:'cats',id:cat.id,before:first.cats[0],after:{...first.cats[0],place:'当前医院'}}],user).next;assert.equal(moved.cats[0].discoveryPlace,'初始花园');
 const snapshot=structuredClone(moved);domain.normalize(moved);assert.equal(moved.cats[0].discoveryPlace,snapshot.cats[0].discoveryPlace);
});
test('API uses sighting defaults and release locations without changing discovery place',()=>{
 const D=require('../shared-domain.js');let state=D.normalize({...Object.fromEntries(require('./store.cjs').COLLECTIONS.map(c=>[c,[]])),audit:[],activities:[],schemaVersion:4,cats:[{id:'C-SIGHT',name:'目击猫',place:'当前医院',discoveryPlace:'初始地点'}]});const user={id:'M-SIGHT',name:'测试',role:'member'};
 function save(collection,values){const before=structuredClone(state[collection].find(r=>r.id===values.id)||null),after={...before,...values},result=V.applyChanges(state,[{collection,id:after.id,before,after}],user).next;V.validateState(result,state,()=>null);state=D.normalize(result);}
 save('rescue',{id:'R-SIGHT',catId:'C-SIGHT',cat:'目击猫',status:'待救助',issue:'观察'});assert.equal(state.rescue[0].place,'初始地点');assert.equal(state.cats[0].place,'初始地点');
 save('rescue',{id:'R-SIGHT',place:'最新目击点'});save('sterilization',{id:'S-SIGHT',catId:'C-SIGHT',cat:'目击猫',status:'待绝育',cost:0});assert.equal(state.sterilization[0].place,'最新目击点');
 save('rescue',{id:'R-SIGHT',status:'就医中',hospital:'实际医院',medicalDate:D.day()});assert.equal(state.cats[0].place,'实际医院');
 assert.throws(()=>save('rescue',{id:'R-SIGHT',status:'已结束',outcome:'放归',completedDate:D.day()}),/放归/);
 save('rescue',{id:'R-SIGHT',status:'已结束',outcome:'放归',completedDate:D.day(),releasePlace:'实际放归点'});assert.equal(state.cats[0].place,'实际放归点');assert.equal(state.cats[0].discoveryPlace,'初始地点');
});
