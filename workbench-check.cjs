const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),handlers={},storage=new Map();
function el(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},classList:{add(){},remove(){}},addEventListener(){},showModal(){},close(){}});return elements.get(key)}
const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(n,fn){(handlers[n]||=[]).push(fn)}},window:{addEventListener(){}},location:{hash:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},structuredClone,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console});
const run=code=>vm.runInContext(code,context),eq=(code,value)=>assert.equal(run(code),value,code),call=(name,...args)=>run(name+'('+args.map(v=>JSON.stringify(v)).join(',')+')');
for(const file of ['shared-domain.js','vendor/pinyin-pro-3.29.5.js','seed.js','management-data.js','workbench-model.js','workbench-ui.js','stories.js','outreach.js','workspace.js'])run(fs.readFileSync(__dirname+'/'+file,'utf8'),{filename:file});
const day=run('today');
const view=t=>run(`query='';location.hash='#${t}';render()`);
eq('data.schemaVersion',4);eq("wbStatuses.sterilization.join(',')",'待绝育,住院中,已放归');eq("(document.querySelector('#nav').innerHTML.match(/class=\"nav-item/g)||[]).length",6);
assert.doesNotMatch(el('#main').innerHTML,/SMALL ACTIONS|每一份小小的行动/);
// Existing data is migrated without losing records, and migrations are idempotent.
run('const copy=structuredClone(data);wbSync(wbMigrate(migrateData(copy)));wbSync(wbMigrate(migrateData(copy)))');eq('copy.cats.length',6);eq('copy.inventory.filter(i=>i.id===\'C001\').length',1);
// Anonymous rescue and automatic one-time fostering linkage.
const rescue={cat:'',place:'图书馆北门',issue:'新发现猫咪受伤',owner:'',status:'待救助'};
assert.equal(call('wbBusinessSave','rescue',rescue),true);run('const rescueId=data.rescue[0].id');eq("find('rescue',rescueId).owner",'');
assert.equal(call('wbBusinessSave','rescue',{...rescue,status:'已结束',outcome:'转寄养',completedDate:day},run('rescueId')),true);
run('wbSync(data);wbSync(data)');eq('data.foster.filter(f=>f.sourceRescueId===rescueId).length',1);eq("data.foster.find(f=>f.sourceRescueId===rescueId).status",'待安置');
// One cat can keep multiple foster segments, including a waiting period between homes.
run('const fosterId=data.foster.find(f=>f.sourceRescueId===rescueId).id');
const foster={cat:'测试猫',status:'寄养中',place:'一号寄养点',caregiver:'陈同学',date:day,owner:'',note:'第一段交接'};
assert.equal(call('wbBusinessSave','foster',foster,run('fosterId')),true);eq("find('foster',fosterId).segments.length",1);
assert.equal(call('wbBusinessSave','foster',{...foster,status:'待安置'},run('fosterId')),true);eq("find('foster',fosterId).segments[0].endDate",day);eq("find('foster',fosterId).place",'');
assert.equal(call('wbBusinessSave','foster',{...foster,place:'二号寄养点',caregiver:'周同学'},run('fosterId')),true);eq("find('foster',fosterId).segments.length",2);
assert.equal(call('wbBusinessSave','foster',{...foster,place:'二号寄养点',status:'已结束',outcome:'已领养',completedDate:day},run('fosterId')),true);eq('data.adoption.filter(a=>a.sourceFosterId===fosterId).length',1);
run('const adoptId=data.adoption.find(a=>a.sourceFosterId===fosterId).id');
assert.equal(call('wbBusinessSave','adoption',{cat:'测试猫',applicant:'测试领养人',status:'已退养',returnDate:day,returnDisposition:'待安置',returnPlace:'退养交接点',adoptDate:day,earlyInterval:7,regularInterval:30,owner:''},run('adoptId')),true);
eq("data.adoption.filter(a=>a.cat==='测试猫'&&a.status==='无领养人').length",1);eq('data.foster.filter(f=>f.sourceAdoptionId===adoptId).length',1);eq("find('adoption',adoptId).status",'已退养');
// Independent sterilization state lists, release-month filter, operation-date work archive.
const surgery={cat:'绝育测试猫',capturer:'',status:'住院中',hospital:'测试医院',surgeryDate:'2026-09-12',cost:'123.45'};
assert.equal(call('wbBusinessSave','sterilization',surgery),true);run('const surgeryId=data.sterilization[0].id');
eq("data.monthly.find(w=>w.sourceType==='sterilization'&&w.sourceId===surgeryId).date",'2026-09-12');
view('sterilization');run("wbBusinessTab.sterilization='住院中';month='2026-10'");eq('wbBusinessRows().some(r=>r.id===surgeryId)',true);
assert.equal(call('wbBusinessSave','sterilization',{...surgery,status:'已放归',releaseDate:'2026-10-10',releasePlace:'原抓捕点'},run('surgeryId')),true);
run("wbBusinessTab.sterilization='已放归';month='2026-09'");eq('wbBusinessRows().some(r=>r.id===surgeryId)',false);run("month='2026-10'");eq('wbBusinessRows().some(r=>r.id===surgeryId)',true);
// Follow-up: weekly during the first calendar month, monthly afterwards, completion resets base.
const adoption={status:'已领养',adoptDate:'2026-09-01',earlyInterval:7,regularInterval:30,lastFollowup:''};
eq('wbFollowup('+JSON.stringify(adoption)+',"2026-09-07").due',false);eq('wbFollowup('+JSON.stringify(adoption)+',"2026-09-08").due',true);
eq('wbFollowup('+JSON.stringify({...adoption,lastFollowup:'2026-09-08'})+').next','2026-09-15');
eq('wbFollowup('+JSON.stringify({...adoption,lastFollowup:'2026-10-02'})+').next','2026-11-01');
eq('wbFollowup('+JSON.stringify({...adoption,status:'已退养'})+').due',false);
eq("wbAddMonth('2026-01-31')",'2026-02-28');
// Multi-item online orders reserve immediately but change physical stock only at whole-order delivery.
const sale={channel:'线上',title:'快递测试',date:day,delivery:'快递',owner:'',lines:[{itemId:'C001',quantity:2,unitPrice:'6.00'},{itemId:'C002',quantity:1,unitPrice:'25.00'}]};
const qty1=run("find('inventory','C001').qty"),qty2=run("find('inventory','C002').qty");
assert.equal(call('wbSaleSave',sale),true);run('const saleId=data.sales[0].id');eq("find('inventory','C001').qty",qty1);eq("wbReservations(data,'C001').shipping",2);eq("wbAvailable(data,'C001')",qty1-12);
eq('data.finance.find(b=>b.saleId===saleId).status','待确认');eq('data.finance.find(b=>b.saleId===saleId).amountCents',3700);
run('const beforeSummary=wbFinance(data,today.slice(0,7)).income');eq('wbFinance(data,today.slice(0,7)).income',run('beforeSummary'));
assert.equal(call('wbDeliver',run('saleId'),day),true);eq("find('inventory','C001').qty",qty1-2);eq("find('inventory','C002').qty",qty2-1);eq("wbReservations(data,'C001').total",0);
assert.equal(call('wbDeliver',run('saleId'),day),false);eq("find('inventory','C001').qty",qty1-2);
run('const saleBill=data.finance.find(b=>b.saleId===saleId).id');assert.equal(call('wbConfirmIncome',run('saleBill')),true);eq('wbFinance(data,today.slice(0,7)).income',run('beforeSummary')+3700);
assert.equal(call('wbConfirmIncome',run('saleBill')),false);assert.equal(call('wbCancelSale',run('saleId')),false);
// Pickup uses its own reservation bucket and cancellation releases it without restoring unsent stock.
assert.equal(call('wbSaleSave',{...sale,title:'自提测试',delivery:'自提'}),true);run('const pickupId=data.sales[0].id');eq("wbReservations(data,'C001').pickup",2);
assert.equal(call('wbCancelSale',run('pickupId')),true);eq("wbReservations(data,'C001').pickup",0);eq("find('inventory','C001').qty",qty1-2);eq('data.finance.find(b=>b.saleId===pickupId).status','已取消');
// Cancellation of confirmed income keeps cash unchanged and flags manual review.
assert.equal(call('wbSaleSave',{...sale,title:'确认后取消'}),true);run('const cancelId=data.sales[0].id;const cancelBill=data.finance.find(b=>b.saleId===cancelId).id');assert.equal(call('wbConfirmIncome',run('cancelBill')),true);run('const incomeBeforeCancel=wbFinance(data,today.slice(0,7)).income');assert.equal(call('wbCancelSale',run('cancelId')),true);eq('wbFinance(data,today.slice(0,7)).income',run('incomeBeforeCancel'));eq("find('finance',cancelBill).refundReview",true);
// Atomic multi-line validation: a bad second line cannot reserve or change the first item.
run('const saleCount=data.sales.length');assert.equal(call('wbSaleSave',{...sale,lines:[sale.lines[0],{itemId:'C002',quantity:999999,unitPrice:'25.00'}]}),false);eq('data.sales.length',run('saleCount'));
// Offline events use per-SKU quantities and an independently entered actual total.
const offline={channel:'线下',title:'测试义卖',date:day,owner:'',total:'17.35',lines:[{itemId:'C001',quantity:1},{itemId:'C003',quantity:1}]};
assert.equal(call('wbSaleSave',offline),true);run('const offlineId=data.sales[0].id');eq('data.sales[0].amountCents',1735);eq("find('inventory','C001').qty",qty1-3);eq('data.finance.find(b=>b.saleId===offlineId).status','待确认');
run('wbSync(data);wbSync(data)');eq("data.monthly.filter(w=>w.sourceType==='sales'&&w.sourceId==='ONLINE-'+today.slice(0,7)).length",1);eq("data.monthly.filter(w=>w.sourceType==='sales'&&w.sourceId===offlineId).length",1);
eq('data.monthly.find(w=>w.sourceId===offlineId).amountCents',0);eq('data.monthly.find(w=>w.sourceId===offlineId).pendingCents',1735);
// Consumer use has no purpose or mandatory name; equipment requires purpose and no due date.
assert.equal(call('applyStockOperation','I001','领用',{quantity:'1',date:day,owner:''}),true);
assert.equal(call('applyStockOperation','I004','借出',{quantity:'1',date:day,owner:'',borrower:'陈同学',destination:'接送绝育猫'}),true);eq('data.loans[0].dueDate',undefined);
assert.equal(call('applyStockOperation','I004','借出',{quantity:'1',date:day,borrower:'陈同学',destination:''}),false);
// Prevent physical counts below all outstanding allocations.
assert.equal(call('wbSaleSave',{...sale,title:'盘点边界'}),true);assert.equal(call('applyStockOperation','C001','盘点',{quantity:'10',date:day,owner:''}),false);
// Reimbursement must be reviewed before payment can be recorded.
eq("find('finance','B003').status",'待审核');assert.equal(call('wbReimburse','B003',day),false);assert.equal(call('wbReview','B003',true),true);assert.equal(call('wbReimburse','B003',day),true);eq("find('finance','B003').status",'已报销');assert.equal(call('wbReimburse','B003',day),false);
// No destructive migration, duplicate automatic records, or broken route renders after reload.
run('const stored=JSON.parse(localStorage.getItem("miaolin-demo-v1"));const counts=stored.monthly.length;wbSync(wbMigrate(migrateData(stored)));wbSync(stored)');eq('stored.monthly.length',run('counts'));eq('stored.sales.length',run('data.sales.length'));
for(const route of run('Object.keys(names)')){view(route);assert.ok(el('#main').innerHTML.length>80,route)}
view('inventory');run("inventoryGroup='文创';inventoryView='sales';render()");assert.match(el('#wb-list').innerHTML,/快递测试/);
view('adoption');assert.match(el('#main').innerHTML,/待领养/);
assert.ok(JSON.parse(storage.get('miaolin-demo-v1')).audit.length>0);
console.log('PASS: grouped routes; idempotent migration; anonymous rescue; foster/adoption linkage and histories; surgery/release months; phased follow-up; multi-SKU reservation/delivery/cancellation; confirmed-income review; offline totals; automatic monthly aggregation; daily/equipment rules; approval before reimbursement; persistence and every route.');

// Revised views: simple adoption states, direct actions, per-location inventory and loan sources.
eq("wbStatuses.adoption.join(',')",'无领养人,有意向领养人,已领养');
eq("data.loans[0].sourcePlace",run("find('inventory','I004').place"));
run("wbFinanceTab='待结清';writeRecord('finance',{title:'待结清测试',date:today,flow:'个人垫付',amountCents:100,status:'审核通过',owner:'测试'});location.hash='#finance';render()");
assert.match(el('#wb-list').innerHTML,/待结清测试/);assert.doesNotMatch(el('#wb-list').innerHTML,/待确认/);
run("wbFinanceTab='待处理';render()");assert.doesNotMatch(el('#wb-list').innerHTML,/待结清测试/);
run("const locationCopy={...find('inventory','I004'),id:'LOCATION-TEST',place:'第二存放点',qty:3,reserved:0,sold:0};data.inventory.push(locationCopy)");
eq("wbStockGroups(active('inventory').filter(i=>i.name===locationCopy.name)).length",1);
eq("wbStockGroups(active('inventory').filter(i=>i.name===locationCopy.name))[0].length",2);
run("const originalSiteQty=find('inventory','I004').qty");
assert.equal(call('applyStockOperation','LOCATION-TEST','借出',{quantity:'1',date:day,borrower:'地点测试',destination:'救助接送'}),true);
eq("data.loans[0].sourcePlace",'第二存放点');eq("find('inventory','LOCATION-TEST').qty",2);eq("find('inventory','I004').qty",run('originalSiteQty'));
run("location.hash='#inventory';inventoryGroup='日常';inventoryView='stock';render()");assert.match(el('#wb-list').innerHTML,/第二存放点/);assert.doesNotMatch(el('#wb-list').innerHTML,/row-menu/);
run("inventoryView='loans';render()");assert.match(el('#main').innerHTML,/新增借用记录/);assert.match(el('#wb-list').innerHTML,/来源地点/);
run("wbBusinessTab.adoption='推进中';location.hash='#adoption';render()");
assert.match(el('#wb-list').innerHTML,/领养文案/);assert.match(el('#wb-list').innerHTML,/协议文件/);assert.match(el('#wb-list').innerHTML,/待上传/);assert.doesNotMatch(el('#wb-list').innerHTML,/沟通中|试养中|row-menu/);
run("wbAgreementDetail('A001')");assert.match(el('#fields').innerHTML,/\.pdf,.doc,.docx/);
console.log('PASS: three adoption states, contract files, direct actions, pending settlement, multi-location grouping and loan source isolation.');

// Creating a new location cannot change another location or create a duplicate.
run("const siteCount=data.inventory.length");assert.equal(call('wbCreateLocation','I004',{place:'新地点',qty:'2'}),true);eq('data.inventory.length',run('siteCount')+1);
assert.equal(call('wbCreateLocation','I004',{place:'新地点',qty:'3'}),false);eq('data.inventory.length',run('siteCount')+1);
assert.equal(call('wbCreateLocation','I004',{place:'错误地点',qty:'-1'}),false);
// Reopening an adopted cat preserves the signed episode and starts a separate unassigned episode.
run("writeRecord('adoption',{cat:'回退测试',status:'已领养',applicant:'原领养人',adoptDate:today,earlyInterval:7,regularInterval:30,agreements:[{id:'contract-test',name:'保留.pdf'}],photos:[]});const reopenId=data.adoption[0].id");
assert.equal(call('wbBusinessSave','adoption',{cat:'回退测试',status:'无领养人',returnDate:day,returnDisposition:'待安置',returnPlace:'退养交接点',applicant:'原领养人',adoptDate:day,earlyInterval:7,regularInterval:30},run('reopenId')),true);
eq("find('adoption',reopenId).status",'已退养');eq("find('adoption',reopenId).agreements[0].name",'保留.pdf');eq('data.adoption.find(a=>a.sourceAdoptionId===reopenId).agreements.length',0);eq('data.adoption.find(a=>a.sourceAdoptionId===reopenId).status','无领养人');
console.log('PASS: location creation guards and agreement-preserving adoption reopening.');

// A return adds stock only at the selected location and remembers both ends.
run("const crossLoan=data.loans.find(l=>l.itemId==='LOCATION-TEST'&&!l.returnedDate);const crossSourceQty=find('inventory','LOCATION-TEST').qty;const crossTargetQty=find('inventory','I004').qty;const crossTargetPlace=find('inventory','I004').place");
assert.equal(call('wbReturnLoan',run('crossLoan.id'),{returnLocation:run('crossTargetPlace'),date:day,owner:''}),true);
eq("find('inventory','I004').qty",run('crossTargetQty')+1);eq("find('inventory','LOCATION-TEST').qty",run('crossSourceQty'));eq('crossLoan.returnPlace',run('crossTargetPlace'));
assert.equal(call('wbReturnLoan',run('crossLoan.id'),{returnLocation:run('crossTargetPlace'),date:day}),false);
run("const newPlaceLoan=data.loans.find(l=>l.itemId==='I004'&&!l.returnedDate);const returnSiteCount=data.inventory.length");
assert.equal(call('wbReturnLoan',run('newPlaceLoan.id'),{returnLocation:'__new__',newReturnPlace:'',date:day}),false);eq('data.inventory.length',run('returnSiteCount'));
assert.equal(call('wbReturnLoan',run('newPlaceLoan.id'),{returnLocation:'__new__',newReturnPlace:'归还新地点',date:day}),true);
eq("data.inventory.find(i=>i.place==='归还新地点').qty",1);eq('data.inventory.length',run('returnSiteCount')+1);eq('newPlaceLoan.returnPlace','归还新地点');
console.log('PASS: return to another location, automatic location creation, validation and duplicate-return guards.');

// Shared cat facts override old per-adoption values, and avatars can be selected/reset safely.
run("const profileCat=find('cats','CAT-002');profileCat.sex='母';profileCat.age='一岁';find('adoption','A002').age='旧年龄';profileCat.photos.push({id:'AVATAR-TEST',name:'头像测试.jpg'})");
eq("wbAdoptionInfo(find('adoption','A002')).age",'一岁');
assert.equal(call('wbSelectAvatar','CAT-002','AVATAR-TEST'),true);eq("find('cats','CAT-002').avatar.id",'AVATAR-TEST');assert.match(run("catCell('小芝麻')"),/AVATAR-TEST/);
assert.equal(call('wbSelectAvatar','CAT-002','NOT-A-PHOTO'),false);eq("find('cats','CAT-002').avatar.id",'AVATAR-TEST');
assert.equal(call('wbSelectAvatar','CAT-002',''),true);eq("find('cats','CAT-002').avatar",null);assert.doesNotMatch(run("catCell('小芝麻')"),/data-asset=/);
console.log('PASS: shared quick-edit facts and avatar selection/reset persistence.');

eq('wbDefaultCats.length',8);for(const key of ['black','white','tabby','calico','cow','torbie','orange','orange_white']){assert.equal(call('wbSelectAvatarPreset','CAT-002',key),true);eq("find('cats','CAT-002').avatarPreset",key);eq("find('cats','CAT-002').avatar",null);assert.match(run("catCell('小芝麻')"),/clipPath/);}assert.equal(call('wbSelectAvatarPreset','CAT-002','invalid'),false);console.log('PASS: eight default avatar patterns, selection and persistence.');

// Follow-ups support early completion, short notes, rescheduling, and deduplication.
run("writeRecord('adoption',{cat:'回访新逻辑',status:'已领养',applicant:'测试',adoptDate:today,earlyInterval:7,regularInterval:30,agreements:[],photos:[]});const followId=data.adoption[0].id");
assert.equal(call('wbSaveFollowup',run('followId'),{followupState:'已完成',completionDate:day,followupNote:'精神食欲正常',earlyInterval:7,regularInterval:30}),true);
eq("find('adoption',followId).followups[0].note",'精神食欲正常');eq("wbFollowup(find('adoption',followId)).next",run('wbAddDays(today,7)'));
assert.equal(call('wbSaveFollowup',run('followId'),{followupState:'已完成',completionDate:day,followupNote:'补充备注'}),true);eq("find('adoption',followId).followups.length",1);
assert.equal(call('wbSaveFollowup',run('followId'),{followupState:'待回访'}),true);eq("wbFollowup(find('adoption',followId)).due",true);
assert.equal(call('wbSaveFollowup',run('followId'),{followupState:'未到期',nextDate:run('wbAddDays(today,10)')}),true);eq("wbFollowup(find('adoption',followId)).due",false);
// Attachment delete is recoverable and cannot duplicate references on restore.
run("find('adoption',followId).agreements=[{id:'FILE-QA',name:'协议测试.pdf'}]");
assert.equal(call('wbRemoveFile','adoption',run('followId'),'agreements','FILE-QA'),true);eq("find('adoption',followId).agreements.length",0);
run("const fileTrashId=find('adoption',followId).deletedFiles[0].id");assert.equal(call('wbRestoreFile','adoption',run('followId'),run('fileTrashId')),true);eq("find('adoption',followId).agreements.length",1);assert.equal(call('wbRestoreFile','adoption',run('followId'),run('fileTrashId')),false);
run("find('cats','CAT-002').photos.push({id:'PHOTO-DELETE-QA',name:'照片.png'});find('cats','CAT-002').avatar={id:'PHOTO-DELETE-QA',name:'照片.png'}");assert.equal(call('wbRemoveFile','cats','CAT-002','photos','PHOTO-DELETE-QA'),true);eq("find('cats','CAT-002').avatar",null);
// Unpaid supplier debts accrue expenses but do not reduce cash until paid, once.
run("const cashBeforeDebt=wbFinance(data,today.slice(0,7)).balance;writeRecord('finance',{title:'医院欠款',flow:'协会欠款',amountCents:12000,date:today,owner:'测试',creditor:'医院',status:'待付款'});const debtId=data.finance[0].id");
eq("wbFinance(data,today.slice(0,7)).balance",run('cashBeforeDebt'));eq("wbIsPendingSettlement(find('finance',debtId))",true);
assert.equal(call('wbSettleDebt',run('debtId'),day),true);eq("wbFinance(data,today.slice(0,7)).balance",run('cashBeforeDebt')-12000);assert.equal(call('wbSettleDebt',run('debtId'),day),false);
console.log('PASS: annotated follow-ups, rescheduling, recoverable file/photo deletion, and supplier-debt settlement.');

// New cat profiles are created only after valid business saves; unknown facts stay blank.
const newRescue={cat:'新发现猫咪甲',place:'东门',issue:'等待检查',status:'待救助',owner:''};
assert.equal(call('wbBusinessSave','rescue',newRescue),true);eq("wbFindCat('新发现猫咪甲').sex",'');eq("wbFindCat('新发现猫咪甲').age",'');eq("data.rescue[0].catId",run("wbFindCat('新发现猫咪甲').id"));
run("const catsBeforeBadSave=data.cats.length");assert.equal(call('wbBusinessSave','rescue',{...newRescue,cat:'无效记录猫',issue:''}),false);eq('data.cats.length',run('catsBeforeBadSave'));
eq("wbNamesSoundAlike('煤球','梅秋')",true);eq("wbNamesSoundAlike('旺旺','汪汪')",true);eq("wbNamesSoundAlike('黑猫','白猫')",false);
run("const catCountBeforeSound=data.cats.length");assert.equal(call('wbBusinessSave','rescue',{...newRescue,cat:'梅秋'}),false);eq('data.cats.length',run('catCountBeforeSound'));
assert.equal(call('wbBusinessSave','rescue',{...newRescue,cat:'煤球',catAlias:'梅秋',identityDecision:'same'}),true);eq("wbFindCat('梅秋').id",run("wbFindCat('煤球').id"));eq('data.cats.length',run('catCountBeforeSound'));
assert.equal(call('wbBusinessSave','rescue',{...newRescue,cat:'没秋',identityDecision:'new'}),true);eq('data.cats.length',run('catCountBeforeSound')+1);
// Only hospitalization requires a surgery date. Release can be recorded with date and place alone.
assert.equal(call('wbBusinessSave','sterilization',{cat:'日期测试猫',status:'住院中',cost:0,surgeryDate:''}),false);
assert.equal(call('wbBusinessSave','sterilization',{cat:'日期测试猫',status:'已放归',cost:0,releaseDate:day,releasePlace:'校园东侧'}),true);
run("location.hash='#sterilization';wbBusinessTab.sterilization='已放归';month=today.slice(0,7);render()");assert.doesNotMatch(el('#wb-list').innerHTML,/状态 \/ 放归/);
run("wbRecordDetail('sterilization',data.sterilization[0].id)");assert.doesNotMatch(el('#fields').innerHTML,/data-action="wb-state"/);assert.match(el('#fields').innerHTML,/detail-status-text/);
console.log('PASS: automatic profiles, homophone identity guards and aliases, status-specific surgery dates, and read-only detail states.');

// Direct quantity edits stamp the affected location only and do not become completed stocktakes.
run("const stockWorkBefore=data.monthly.length;find('inventory','I001').updatedAt='2020-01-01T00:00:00.000Z';find('inventory','I002').updatedAt='2020-01-01T00:00:00.000Z'");
assert.equal(call('applyStockOperation','I001','修改',{quantity:'0',date:day,owner:''}),true);
eq("find('inventory','I001').qty",0);eq('data.movements[0].type','修改数量');eq('data.monthly.length',run('stockWorkBefore'));
assert.notEqual(run("find('inventory','I001').updatedAt"),'2020-01-01T00:00:00.000Z');eq("find('inventory','I002').updatedAt",'2020-01-01T00:00:00.000Z');
assert.doesNotMatch(run("wbStockTable(active('inventory').filter(i=>i.group==='日常'))"),/待发货|待自提|其他预留/);
assert.match(run("wbStockTable(active('inventory').filter(i=>i.group==='文创'))"),/待发货/);
run("location.hash='#monthly';wbMonthlyCategory='绝育管理';month=today.slice(0,7);render()");assert.doesNotMatch(el('#wb-list').innerHTML,/小芝麻 · 救助结束/);assert.match(el('#wb-list').innerHTML,/绝育/);
// Stories accept image-only posts, annotated replies, and reversible deletion.
assert.equal(call('wbSaveStory',{text:''}),false);
run("const storyTest=wbSaveStory({text:'一段日常',cat:'煤球',author:'测试',photos:[{id:'STORY-PHOTO',name:'猫咪.png'}]})");
assert.equal(call('wbSaveStoryComment',run('storyTest.id'),{text:'食欲正常',author:''}),true);eq('storyTest.comments[0].author','匿名同学');
assert.equal(call('wbSaveStoryComment',run('storyTest.id'),{text:''}),false);
assert.equal(call('wbSetStoryDeleted',run('storyTest.id'),true),true);eq("active('stories').length",0);
assert.equal(call('wbSetStoryDeleted',run('storyTest.id'),false),true);eq("active('stories').length",1);
run("location.hash='#overview';render()");assert.doesNotMatch(el('#main').innerHTML,/财务待处理/);assert.match(el('#main').innerHTML,/queue-scroll/);assert.match(el('#main').innerHTML,/猫咪轶事/);
console.log('PASS: quantity modification, selective update timestamps, daily stock fields, monthly category filter, stories/comments and recoverable deletion.');

// Linked stories use stable cat ids, including after renaming a profile; legacy names still resolve.
run("const linkedCatId=wbFindCat('煤球').id;const linkedStory=wbSaveStory({catId:linkedCatId,text:'关联检索测试',photos:[{id:'PHOTO-1',name:'1.png'},{id:'PHOTO-2',name:'2.png'},{id:'PHOTO-3',name:'3.png'}]})");
eq('linkedStory.catId',run('linkedCatId'));eq('linkedStory.cat','煤球');
assert.equal(call('wbSaveStory',{catId:'MISSING-CAT',text:'不能关联失效档案'}),false);
run("const priorCatName=find('cats',linkedCatId).name;find('cats',linkedCatId).name='煤球新名字'");eq('wbStoriesForCat(linkedCatId).some(r=>r.id===linkedStory.id)',true);
run("find('cats',linkedCatId).name=priorCatName;wbCatStoryFilters.set(linkedCatId,{keyword:'关联检索测试',from:today,to:today})");
assert.match(run('wbCatStoryRows(linkedCatId)'),/关联检索测试/);assert.doesNotMatch(run('wbCatStoryRows(linkedCatId)'),/一段日常/);
run("wbCatStoryFilters.set(linkedCatId,{keyword:'不存在的关键词'})");assert.match(run('wbCatStoryRows(linkedCatId)'),/没有符合条件/);
assert.match(run('wbStoryBoard()'),/story-gallery-3/);assert.match(run('wbStoryBoard()'),/PHOTO-3/);
run("wbHomeJump('rescue',data.rescue[0].id);render()");eq('page','rescue');eq('query',run('data.rescue[0].cat'));
run("wbHomeJump('sales',data.sales.find(s=>s.channel==='线上').id);render()");eq('page','inventory');eq('inventoryView','sales');eq('inventoryGroup','文创');
assert.match(run('wbLedgerTable([])'),/<th>类型<\/th><th>账目 \/ 日期<\/th><th>金额<\/th>/);
console.log('PASS: stable story/profile linkage, date/keyword retrieval, multi-image cards, home navigation and separate ledger type column.');

// Photo notes stay attached to the asset through reversible deletion and restore.
run("find('cats',linkedCatId).photos.push({id:'NOTED-PHOTO',name:'备注测试.png'})");
assert.equal(call('wbSaveCatPhotoNote',run('linkedCatId'),'NOTED-PHOTO','晒太阳时拍摄'),true);
eq("find('cats',linkedCatId).photos.find(p=>p.id==='NOTED-PHOTO').note",'晒太阳时拍摄');
assert.equal(call('wbSaveCatPhotoNote',run('linkedCatId'),'NOTED-PHOTO','字'.repeat(501)),false);
assert.equal(call('wbRemoveFile','cats',run('linkedCatId'),'photos','NOTED-PHOTO'),true);
run("const notedTrashId=find('cats',linkedCatId).deletedFiles.find(e=>e.file.id==='NOTED-PHOTO').id");
assert.equal(call('wbRestoreFile','cats',run('linkedCatId'),run('notedTrashId')),true);
eq("find('cats',linkedCatId).photos.find(p=>p.id==='NOTED-PHOTO').note",'晒太阳时拍摄');
run("wbCatStoryFilters.set(linkedCatId,{keyword:'关联检索测试'});wbHandleStoryAction('read',{id:linkedStory.id,catId:linkedCatId})");
eq('wbStoryOrigin',run('linkedCatId'));assert.match(el('#fields').innerHTML,/← 返回猫咪档案/);
run("wbHandleStoryAction('back',{})");assert.match(el('#fields').innerHTML,/cat-stories-section/);assert.match(el('#fields').innerHTML,/value="关联检索测试"/);
run("wbHandleStoryAction('read',{id:linkedStory.id})");eq('wbStoryOrigin',null);assert.match(el('#fields').innerHTML,/← 返回首页/);
console.log('PASS: persistent photo notes, note recovery and origin-aware story return with retained search filters.');

run("const rescueMigration=clone(data);rescueMigration.rescue[0].status='待响应';rescueMigration.rescue[1].status='已接手';rescueMigration.rescue[2].status='待相应';const rescueIds=rescueMigration.rescue.map(r=>r.id).join(',');wbMigrate(rescueMigration);wbMigrate(rescueMigration)");
eq("wbStatuses.rescue.join(',')",'待救助,就医中,已结束');eq("rescueMigration.rescue.slice(0,3).every(r=>r.status==='待救助')",true);eq("rescueMigration.rescue.map(r=>r.id).join(',')",run('rescueIds'));
run("wbCatStoryFilters.set(linkedCatId,{});");assert.match(run('wbCatStoriesPanel(linkedCatId)'),new RegExp(run("today.replaceAll('-','/')")));assert.match(run('wbCatStoriesPanel(linkedCatId)'),/data-empty="true" value=""/);
console.log('PASS: merged rescue statuses migrate without record loss and current-date hints keep the date filters empty.');

// Dedicated inventory forms omit the opposite group's controls and never require photos.
run("inventoryGroup='日常';editInventory()");assert.match(el('#modal-title').textContent,/新增日常物资/);assert.doesNotMatch(el('#fields').innerHTML,/补给线|name="variant"|name="unitPrice"|<select name="group"/);
assert.equal(call('wbSaveInventoryForm',{name:'日常无图验证',category:'日用',kind:'消耗品',unit:'个',qty:'0',place:'测试位置',group:'文创'},null,'日常'),true);
eq('data.inventory[0].group','日常');eq('data.inventory[0].photos.length',0);eq("Object.hasOwn(data.inventory[0],'min')",false);
run("inventoryGroup='文创';editInventory()");assert.match(el('#modal-title').textContent,/新增文创物资/);assert.match(el('#fields').innerHTML,/name="variant"/);assert.match(el('#fields').innerHTML,/name="unitPrice"/);assert.doesNotMatch(el('#fields').innerHTML,/补给线|<select name="kind"|<select name="group"/);
assert.equal(call('wbSaveInventoryForm',{name:'文创无图验证',category:'贴纸',variant:'橘猫款',unit:'张',qty:'2',place:'文创柜',unitPrice:'3.50'},null,'文创'),true);eq('data.inventory[0].unitPriceCents',350);eq('data.inventory[0].kind','消耗品');
run("data.inventory[0].photos=[{id:'STOCK-PHOTO',name:'位置.png'}];const photographedStock=data.inventory[0].id");
assert.equal(call('wbCreateLocation',run('photographedStock'),{place:'另一存放点',qty:0}),true);eq('data.inventory[0].photos.length',0);
run("wbItemDetail(photographedStock)");assert.match(el('#fields').innerHTML,/物资 \/ 存放位置照片（选填）/);assert.match(el('#fields').innerHTML,/STOCK-PHOTO/);assert.doesNotMatch(el('#fields').innerHTML,/补给线|补给提醒/);
assert.equal(call('wbSaveCatDescription',run('linkedCatId'),'亲人，喜欢晒太阳'),true);eq("find('cats',linkedCatId).description",'亲人，喜欢晒太阳');assert.equal(call('wbSaveCatDescription',run('linkedCatId'),'字'.repeat(1001)),false);
run("wbCatProfile(find('cats',linkedCatId))");assert.ok(el('#fields').innerHTML.indexOf('猫咪描述')<el('#fields').innerHTML.indexOf('经历记录'));
assert.equal(run("wbMonthlyCountText([{id:'1',category:'救助管理',cat:'煤球'},{id:'2',category:'救助管理',cat:'煤球'},{id:'3',category:'绝育管理',cat:'小芝麻'}]).join(',')"),'救助 1 只,绝育 1 只');
// Every id is reachable exactly once across a large paged list; stale pages are clamped.
run("location.hash='#rescue';page='rescue';query='分页测试';wbHomeTarget=null;const manyRows=Array.from({length:137},(_,i)=>({id:'P'+i}));const pageKey=wbPageKey();const visited=[];for(let p=1;p<=14;p++){wbListPages.set(pageKey,p);visited.push(...wbPageRows(manyRows).map(r=>r.id));}");
eq('visited.length',137);eq('new Set(visited).size',137);eq('visited.at(-1)','P136');eq('wbListPageInfo.pages',14);
run("wbPageRows(manyRows.slice(0,11))");eq('wbListPageInfo.current',2);run("query='另一个检索';wbPageRows(manyRows)");eq('wbListPageInfo.current',1);
run("wbStoryDetail(linkedStory.id,linkedCatId)");assert.match(el('#fields').innerHTML,/story-reader-gallery/);assert.match(el('#fields').innerHTML,/PHOTO-3/);
console.log('PASS: separate stock creation, optional location photos, cat descriptions, distinct-cat monthly totals and 137-record pagination coverage.');

// Hospitalization counts immediately, without introducing a duplicate rescue state.
assert.equal(call('wbBusinessSave','rescue',{cat:'就医归档验证',place:'校门',issue:'需要检查',hospital:'演示医院',status:'就医中'}),true);
run("const medicalId=data.rescue[0].id;wbSync(data)");
eq("data.monthly.filter(w=>w.sourceType==='rescue'&&w.sourceId===medicalId).length",1);
eq("data.monthly.find(w=>w.sourceType==='rescue'&&w.sourceId===medicalId).date",day);
assert.equal(call('wbBusinessSave','rescue',{cat:'就医归档验证',place:'校门',issue:'需要检查',status:'已结束',outcome:'放归',releasePlace:'实际放归地点',completedDate:day},run('medicalId')),true);
eq("data.monthly.filter(w=>w.sourceType==='rescue'&&w.sourceId===medicalId).length",1);
eq("wbStatuses.rescue.includes('住院中')",false);
run('const beforeHospitalValidation=data.sterilization.length');
assert.equal(call('wbBusinessSave','sterilization',{cat:'医院必填验证',status:'住院中',hospital:' ',surgeryDate:day}),false);
eq('data.sterilization.length',run('beforeHospitalValidation'));
assert.equal(call('wbBusinessSave','sterilization',{cat:'医院必填验证',status:'待绝育',hospital:'',surgeryDate:day}),true);
run('const pendingHospitalId=data.sterilization[0].id');
eq("data.monthly.some(w=>w.sourceType==='sterilization'&&w.sourceId===pendingHospitalId)",false);
assert.equal(call('wbBusinessSave','sterilization',{cat:'医院必填验证',status:'住院中',hospital:'验证医院',surgeryDate:day},run('pendingHospitalId')),true);
eq("data.monthly.filter(w=>w.sourceType==='sterilization'&&w.sourceId===pendingHospitalId).length",1);
eq("wbFollowup({status:'已领养',adoptDate:today,followupState:'未到期'}).label",'待回访');
eq("wbFollowup({status:'已领养',adoptDate:today,lastFollowup:today,followupState:'已完成'}).label",'已完成');
run("location.hash='#adoption';page='adoption';query='';wbBusinessTab.adoption='推进中';wbAdoptionIntent='有意向领养人'");
eq("wbBusinessRows().every(r=>r.status==='有意向领养人')",true);
run("wbBusinessTab.adoption='已领养';wbFollowupTab='待回访'");
eq("wbBusinessRows().every(r=>wbFollowup(r).label==='待回访')",true);
run("wbFollowupTab='已回访'");
eq("wbBusinessRows().every(r=>r.status==='已退养'||wbFollowup(r).label==='已完成')",true);
assert.match(run('catCell(data.cats[0].name)'),/data-action="wb-cat-profile"/);
console.log('PASS: immediate hospital work totals, required hospitals, two follow-up lists, adoption intent filters and profile links.');

// Independent follow-up entries preserve same-day visits and share image refs with the profile.
assert.equal(call('wbBusinessSave','adoption',{cat:'回访相册验证猫',status:'已领养',adoptDate:day,applicant:'示例领养人'}),true);
run("const albumAdoptionId=data.adoption[0].id;const albumCatId=wbFindCat('回访相册验证猫').id");
assert.equal(call('wbSaveFollowup',run('albumAdoptionId'),{followupState:'已完成',completionDate:day,followupNote:'第一次：饮食正常',newEntry:true,followupPhotos:[{id:'FOLLOW-PHOTO-1',name:'第一次.png'}]}),true);
assert.equal(call('wbSaveFollowup',run('albumAdoptionId'),{followupState:'已完成',completionDate:day,followupNote:'第二次：补充环境照片',newEntry:true,followupPhotos:[{id:'FOLLOW-PHOTO-2',name:'第二次.png'}]}),true);
eq("find('adoption',albumAdoptionId).followups.length",2);
eq("new Set(find('adoption',albumAdoptionId).followups.map(e=>e.id)).size",2);
eq("find('cats',albumCatId).photos.filter(p=>p.followupId).length",2);
eq("wbCatFollowups(find('cats',albumCatId)).length",2);
run("wbFollowupAlbum(albumCatId)");assert.match(el('#fields').innerHTML,/第一次：饮食正常/);assert.match(el('#fields').innerHTML,/第二次：补充环境照片/);assert.match(el('#fields').innerHTML,/FOLLOW-PHOTO-1/);assert.match(el('#fields').innerHTML,/FOLLOW-PHOTO-2/);
run("wbFollowupRecord(albumAdoptionId,find('adoption',albumAdoptionId).followups[0].id)");assert.match(el('#fields').innerHTML,/第一次：饮食正常/);assert.doesNotMatch(el('#fields').innerHTML,/第二次：补充环境照片/);
// Removing the profile copy does not erase the separately archived visit photograph.
assert.equal(call('wbRemoveFile','cats',run('albumCatId'),'photos','FOLLOW-PHOTO-1'),true);
eq("wbCatFollowups(find('cats',albumCatId))[0].entry.photos[0].id",'FOLLOW-PHOTO-1');
const invalidVisit={followupState:'已完成',completionDate:day,newEntry:true,followupPhotos:Array.from({length:13},(_,i)=>({id:'X'+i,name:'x.png'}))};
assert.equal(call('wbSaveFollowup',run('albumAdoptionId'),invalidVisit),false);eq("find('adoption',albumAdoptionId).followups.length",2);
run("wbBusinessSave('adoption',{...find('adoption',albumAdoptionId),status:'已退养',returnDate:today,returnDisposition:'待安置',returnPlace:'交接点'},albumAdoptionId)");eq("wbCatFollowups(find('cats',albumCatId)).length",2);
run("const albumRoundtrip=JSON.parse(JSON.stringify(data));");eq("albumRoundtrip.adoption.find(r=>r.id===albumAdoptionId).followups[1].photos[0].id",'FOLLOW-PHOTO-2');
console.log('PASS: independent same-day follow-up records, photo/profile synchronization, per-cat albums and historical adoption retention.');

// Profile identity stays stable across renaming, stories, archived visits and reopened adoption.
assert.equal(call('wbBusinessSave','adoption',{cat:'一致性验证猫',status:'已领养',adoptDate:day,applicant:'示例家长'}),true);
run("const consistentAdoption=data.adoption[0].id;const consistentCat=wbFindCat('一致性验证猫').id;find('adoption',consistentAdoption).agreements=[{id:'KEPT-CONTRACT',name:'协议.pdf'}]");
assert.equal(call('wbSaveFollowup',run('consistentAdoption'),{followupState:'已完成',completionDate:day,followupNote:'历史回访不能混入新领养段',newEntry:true,followupPhotos:[{id:'KEPT-VISIT-PHOTO',name:'回访.png'}]}),true);
call('wbSaveStory',{catId:run('consistentCat'),text:'改名前的关联轶事'});run('const consistentStory=data.stories[0].id');
assert.equal(call('wbSaveCatProfile',{name:' 一致性新名字 ',sex:'公',age:'一岁',place:'校内',health:'健康'},run('consistentCat')),true);
eq("find('stories',consistentStory).cat",'一致性新名字');eq("find('adoption',consistentAdoption).cat",'一致性新名字');eq("wbFindCat('一致性验证猫').id",run('consistentCat'));
assert.equal(call('wbSaveCatProfile',{name:'一致性验证猫'}),false);
assert.equal(call('wbBusinessSave','adoption',{...run("find('adoption',consistentAdoption)"),cat:'错误换猫'},run('consistentAdoption')),false);eq("wbFindCat('错误换猫')",undefined);
assert.equal(call('wbBusinessSave','adoption',{...run("find('adoption',consistentAdoption)"),status:'无领养人',returnDate:day,returnDisposition:'待安置',returnPlace:'交接点'},run('consistentAdoption')),true);
run("const reopenedConsistent=data.adoption.find(a=>a.sourceAdoptionId===consistentAdoption)");eq('reopenedConsistent.followups.length',0);eq('reopenedConsistent.agreements.length',0);eq('reopenedConsistent.lastFollowup','');eq('reopenedConsistent.nextFollowupDate','');eq('reopenedConsistent.catId',run('consistentCat'));
eq("find('adoption',consistentAdoption).followups.length",1);eq("find('adoption',consistentAdoption).agreements[0].id",'KEPT-CONTRACT');eq("wbCatFollowups(find('cats',consistentCat)).length",1);
// Returning to adoption reuses an already existing pending draft without overwriting it.
call('wbBusinessSave','adoption',{cat:'并行草稿验证猫',status:'已领养',adoptDate:day,applicant:'原领养人'});run('const draftOld=data.adoption[0].id');
call('wbBusinessSave','adoption',{cat:'并行草稿验证猫',status:'有意向领养人',applicant:'新意向人',adoptionCopy:'必须保留草稿文案'});run('const draftKept=data.adoption[0].id');
assert.equal(call('wbBusinessSave','adoption',{...run("find('adoption',draftOld)"),status:'无领养人',returnDate:day,returnDisposition:'待安置',returnPlace:'交接点'},run('draftOld')),true);eq("find('adoption',draftKept).adoptionCopy",'必须保留草稿文案');eq("find('adoption',draftKept).applicant",'新意向人');
// Stale dialogs cannot mutate deleted records, or recreate them by id.
run("find('rescue',medicalId).deletedAt='test';const staleBefore=JSON.stringify(find('rescue',medicalId));wbSync(data)");
assert.equal(call('wbBusinessSave','rescue',{cat:'就医归档验证',place:'不应保存',issue:'不应保存',status:'待救助'},run('medicalId')),false);
assert.equal(call('writeRecord','rescue',{place:'不应保存'},run('medicalId')),false);eq("JSON.stringify(find('rescue',medicalId))",run('staleBefore'));eq("data.monthly.some(w=>w.sourceType==='rescue'&&w.sourceId===medicalId)",false);
assert.equal(call('wbBusinessSave','rescue',{place:'校内',issue:'测试',status:'待救助'},'NONEXISTENT-ID'),false);
assert.equal(call('wbBusinessSave','rescue',{place:'校内',issue:'测试',status:'已结束',outcome:'放归',date:day,completedDate:'2026-01-01'}),false);
run("const duplicateRestore={...find('adoption',draftOld),deletedAt:'test',status:'已领养'};find('adoption',draftKept).status='已领养'");assert.match(run("wbRestoreReason('adoption',duplicateRestore)"),/不能同时恢复/);
console.log('PASS: identity rename/alias propagation, adoption history isolation, safe return with existing drafts, stale-dialog guards and restore conflicts.');

// Rescue quick editing keeps other fields, validates hospitals, and escapes list previews.
assert.equal(call('wbBusinessSave','rescue',{cat:'界面流程猫',place:'测试地点',issue:'初始情况',owner:'原负责人',status:'待救助'}),true);
run("const noteRecord=data.rescue[0].id;const noteCat=data.rescue[0].catId");
assert.equal(call('wbSaveRescueNotes',run('noteRecord'),{issue:'  ',nextStep:'不应保存'}),false);
assert.equal(call('wbSaveRescueNotes',run('noteRecord'),{issue:'第一行\n<b>第二行</b>',nextStep:'联系医院\n安排接送'}),true);
eq("find('rescue',noteRecord).owner",'原负责人');eq("find('rescue',noteRecord).status",'待救助');
run("page='rescue';const notesHTML=wbBusinessTable([find('rescue',noteRecord)])");assert.match(run('notesHTML'),/wb-rescue-notes/);assert.match(run('notesHTML'),/&lt;b&gt;/);
assert.equal(call('wbBusinessSave','rescue',{...run("find('rescue',noteRecord)"),status:'就医中',hospital:''},run('noteRecord')),false);
assert.equal(call('wbBusinessSave','rescue',{...run("find('rescue',noteRecord)"),status:'就医中',hospital:'测试医院'},run('noteRecord')),true);
assert.match(run("page='rescue';wbBusinessTab.rescue='就医中';wbBusinessTable([find('rescue',noteRecord)])"),/测试医院/);
call('wbHandleAction','wb-rescue-notes',{id:run('noteRecord')});assert.match(el('#fields').innerHTML,/name="nextStep"/);
assert.equal(call('submitHandler',{issue:'完整情况',nextStep:''}),true);eq("find('rescue',noteRecord).nextStep",'');
// Classification follows current adoption, old outcomes migrate, and gone takes priority.
run("const categoryFixture=clone(data);categoryFixture.rescue=[];categoryFixture.adoption=[{id:'CATEGORY-A',catId:noteCat,cat:'界面流程猫',status:'已领养'}]");
eq("DanmiaoDomain.catCategory(categoryFixture,find('cats',noteCat))",'已领养');run("categoryFixture.adoption[0].status='已退养'");eq("DanmiaoDomain.catCategory(categoryFixture,find('cats',noteCat))",'其他');
run("categoryFixture.adoption[0].status='已领养';categoryFixture.rescue=[{id:'CATEGORY-R',catId:noteCat,cat:'界面流程猫',status:'已结束',outcome:'死亡'}];wbMigrate(categoryFixture)");eq("categoryFixture.rescue[0].outcome",'去喵星');eq("DanmiaoDomain.catCategory(categoryFixture,find('cats',noteCat))",'已去喵星');
// Long histories fold into a bounded list and run from early to late.
run("for(let i=5;i>=0;i--)data.foster.push({id:'EXPERIENCE-'+i,catId:noteCat,cat:'界面流程猫',status:'寄养中',place:'地点'+i,date:'2026-01-0'+(i+1),segments:[]});wbCatProfile(find('cats',noteCat))");
assert.match(el('#fields').innerHTML,/experience-list is-compact/);assert.match(el('#fields').innerHTML,/<details class="experience-card"><summary/);
assert.ok(el('#fields').innerHTML.indexOf('EXPERIENCE-0')<el('#fields').innerHTML.indexOf('EXPERIENCE-5'));
console.log('PASS: rescue note editing, required hospitals, compatible cat classification, chronological folded histories and compact long lists.');

// Activities and sponsorships use independent records, shared validation and recoverable deletion.
run("const outreachSavedFinance=JSON.stringify(data.finance),outreachSavedStock=JSON.stringify(data.inventory)");
const scheduled={title:'测试校园活动',date:day,place:'测试场地',owner:'测试负责人',staffing:'签到：甲\n摄影：乙',status:'筹备中'};
assert.equal(call('wbSaveOutreach','events',{...scheduled,owner:''}),false);
assert.equal(call('wbSaveOutreach','events',scheduled),true);run('const outreachEvent=data.events[0].id');
const sponsorship={title:'测试支持',organization:'虚构赞助方',owner:'测试对接人',supportType:'物资',supportContent:'示例猫粮2袋',status:'待落实',eventId:run('outreachEvent')};
assert.equal(call('wbSaveOutreach','sponsors',{...sponsorship,eventId:'NONEXISTENT'}),false);
assert.equal(call('wbSaveOutreach','sponsors',sponsorship),true);run('const outreachSponsor=data.sponsors[0].id');
assert.equal(call('wbSaveOutreach','sponsors',{...sponsorship,status:'已落实'},run('outreachSponsor')),false);
assert.equal(call('wbSaveOutreach','sponsors',{...sponsorship,status:'已落实',receivedDate:day},run('outreachSponsor')),true);
eq('JSON.stringify(data.finance)',run('outreachSavedFinance'));eq('JSON.stringify(data.inventory)',run('outreachSavedStock'));
view('events');assert.match(el('#nav').innerHTML,/活动与赞助（测试）/);assert.match(el('#wb-list').innerHTML,/测试校园活动/);
call('wbHandleAction','wb-add',{});assert.match(el('#fields').innerHTML,/name="staffing"/);
call('wbOutreachDetail','events',run('outreachEvent'));assert.match(el('#fields').innerHTML,/虚构赞助方/);
run("find('events',outreachEvent).deletedAt='test'");assert.equal(call('wbSaveOutreach','events',scheduled,run('outreachEvent')),false);
call('restore','events',run('outreachEvent'));eq("find('events',outreachEvent).deletedAt",'');
view('sponsors');assert.match(el('#wb-list').innerHTML,/虚构赞助方/);
console.log('PASS: event staffing, sponsorship links, shared rules, no implicit ledger/stock writes, routes, forms and trash recovery.');

// Notice popups remember exact content per browser; edits trigger a new reminder.
run("data.announcements=[{id:'NOTICE-UI',title:'<测试公告>',content:'第一行\\n第二行',status:'已发布'}];const noticeOriginal=DanmiaoDomain.announcementKey(data.announcements[0])");
eq('wbNoticeSeen().has(noticeOriginal)',false);call('wbStartAnnouncements');eq('wbNoticeSeen().has(noticeOriginal)',true);
assert.match(el('#fields').innerHTML,/&lt;测试公告&gt;/);assert.doesNotMatch(el('#fields').innerHTML,/<测试公告>/);
run("document.querySelector('#modal-title').textContent='保持当前界面'");call('wbStartAnnouncements');eq("document.querySelector('#modal-title').textContent",'保持当前界面');
run("data.announcements[0].content='更新后的公告内容'");eq('wbNoticeSeen().has(DanmiaoDomain.announcementKey(data.announcements[0]))',false);call('wbStartAnnouncements');eq("document.querySelector('#modal-title').textContent",'公告栏');
assert.equal(call('wbSaveAnnouncement',{title:'新草稿',content:'草稿正文',status:'草稿'}),true);eq('wbPublishedAnnouncements().length',1);
assert.match(run('wbAnnouncementBar()'),/wb-announcement-ticker/);
run("window.DanmiaoBackend={user:{id:'notice-viewer',role:'viewer'}}");assert.equal(call('wbSaveAnnouncement',{title:'非法发布',content:'正文',status:'已发布'}),false);eq('wbCanEditAnnouncements()',false);run('delete window.DanmiaoBackend');
console.log('PASS: announcement first-read memory, content revision reminders, draft filtering, escaped text and frontend admin guard.');
// Direct field edits retain business state, dates and historical foster segments.
assert.equal(call('wbBusinessSave','sterilization',{cat:'字段编辑测试猫',status:'待绝育',cost:0,place:'测试花园'}),true);
run('const factsSurgery=data.sterilization[0].id');
view('sterilization');run("wbBusinessTab.sterilization='待绝育';wbRefresh()");
assert.match(el('#wb-list').innerHTML,/<th>最近目击地点<\/th>/);assert.doesNotMatch(el('#wb-list').innerHTML,/医院|<th>抓捕人<\/th>/);
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'area',{place:'测试南门'}),true);
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'cost',{cost:'88.50'}),true);
eq("find('sterilization',factsSurgery).cost",88.5);eq("find('sterilization',factsSurgery).status",'待绝育');eq("find('sterilization',factsSurgery).place",'测试南门');
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'cost',{cost:'-1'}),false);
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'medical',{hospital:'测试医院',surgeryDate:day}),false);
call('wbEditBusinessFacts','sterilization',run('factsSurgery'),'cost');assert.match(el('#fields').innerHTML,/step="0.01"/);
assert.equal(run("wbBusinessSave('sterilization',{...find('sterilization',factsSurgery),status:'住院中',hospital:'字段测试医院',surgeryDate:today},factsSurgery)"),true);
run("wbBusinessTab.sterilization='住院中';wbRefresh()");assert.match(el('#wb-list').innerHTML,new RegExp('字段测试医院<span class="date">'+day));
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'capturer',{capturer:'测试同学'}),true);eq("find('sterilization',factsSurgery).surgeryDate",day);
assert.equal(call('wbBusinessSave','foster',{cat:'字段编辑测试猫',status:'待安置',place:'',caregiver:''}),true);run('const factsFoster=data.foster[0].id');
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'situation',{situation:'食欲恢复\n需要安静观察'}),true);
eq("find('foster',factsFoster).status",'待安置');eq("find('foster',factsFoster).segments.length",0);
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'placement',{place:'测试一号点',caregiver:'甲',date:day}),true);
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'placement',{place:'测试二号点',caregiver:'乙',date:day}),true);
eq("find('foster',factsFoster).segments.length",2);eq("find('foster',factsFoster).segments[0].endDate",day);
run('const factsHistory=JSON.stringify(find("foster",factsFoster).segments)');
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'situation',{situation:'观察正常 <测试>'}),true);eq("find('foster',factsFoster).segments.length",2);eq("find('foster',factsFoster).segments[0].situation",'食欲恢复\n需要安静观察');eq("find('foster',factsFoster).segments[1].situation",'观察正常 <测试>');
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'situation',{situation:'x'.repeat(1001)}),false);
assert.match(run("wbExperienceCard('foster',find('foster',factsFoster))"),/<dt>寄养情况<\/dt><dd>观察正常 &lt;测试&gt;<\/dd>/);
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'placement',{place:'测试三号点',caregiver:'丙',date:'2099-01-01'}),false);
run("window.DanmiaoBackend={user:{role:'viewer'}}");assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'situation',{situation:'无权修改'}),false);run('delete window.DanmiaoBackend');
run("wbBusinessTab.rescue='全部'");view('rescue');assert.match(el('#wb-list').innerHTML,/<th>猫咪<\/th><th>照片<\/th><th>最近目击地点<\/th>/);
console.log('PASS: direct cost/area edits, hospital/date order, separate rescue place, foster situation history and safe placement handoffs.');
// Health is independent from discovery notes and optional on new profiles.
eq("initial.cats.every(c=>c.health==='')",true);
assert.equal(call('wbBusinessSave','rescue',{cat:'健康独立测试猫',place:'测试地点',issue:'发现情况不能填入健康状况',status:'待救助'}),true);
eq("wbFindCat('健康独立测试猫').health",'');
call('edit','cats');assert.match(el('#fields').innerHTML,/name="health"[^>]*value=""/);assert.doesNotMatch(el('#fields').innerHTML,/<input name="health"[^>]*required/);
call('wbCatProfile',run('wbFindCat("健康独立测试猫")'));assert.doesNotMatch(el('#fields').innerHTML,/从早到晚 · 点击展开/);
console.log('PASS: blank demo health defaults, independent automatic profiles and optional health editing.');
// Actual destination changes win in save order; note/cost edits do not move cats.
const locationCat=run('wbFindCat("字段编辑测试猫").id');
assert.equal(call('wbSaveCatOverview',locationCat,'place','人工确认点'),true);
assert.equal(call('wbSaveCatOverview',locationCat,'health','精神正常'),true);
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'cost',{cost:99}),true);eq('wbFindCat("字段编辑测试猫").place','人工确认点');
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'medical',{hospital:'最新医院',surgeryDate:day}),true);eq('wbFindCat("字段编辑测试猫").place','最新医院');
assert.equal(call('wbSaveBusinessFacts','foster',run('factsFoster'),'placement',{place:'最新寄养点',caregiver:'测试照护人',date:day}),true);eq('wbFindCat("字段编辑测试猫").place','最新寄养点');
assert.equal(call('wbSaveBusinessFacts','sterilization',run('factsSurgery'),'capturer',{capturer:'修改历史抓捕人'}),true);eq('wbFindCat("字段编辑测试猫").place','最新寄养点');
eq('wbFindCat("字段编辑测试猫").health','精神正常');
call('wbCatProfile',run('wbFindCat("字段编辑测试猫")'));assert.match(el('#fields').innerHTML,/data-action="wb-cat-overview"/);
call('wbEditCatOverview',locationCat,'health');assert.equal(run("submitHandler({health:''})"),false);eq('wbFindCat("字段编辑测试猫").health','');
console.log('PASS: editable profile facts, latest hospital/foster location changes and unrelated-edit isolation.');
// Discovery place is fixed at creation; current place tracks later moves.
assert.equal(call('wbSaveCatProfile',{name:'发现地点测试猫',sex:'未知',age:'待评估',discoveryPlace:'最初花园'}),true);
run('const discoveryCat=wbFindCat("发现地点测试猫").id');eq('wbFindCat("发现地点测试猫").place','最初花园');
assert.equal(call('wbSaveCatOverview',run('discoveryCat'),'place','后来医院'),true);eq('wbFindCat("发现地点测试猫").discoveryPlace','最初花园');
assert.equal(call('wbSaveCatOverview',run('discoveryCat'),'discoveryPlace','篡改地点'),false);
assert.equal(call('wbSaveCatProfile',{name:'发现地点测试猫',discoveryPlace:'篡改地点'},run('discoveryCat')),false);
assert.equal(call('wbSaveCatProfile',{name:'发现地点测试猫',place:'后来寄养点'},run('discoveryCat')),true);eq('wbFindCat("发现地点测试猫").discoveryPlace','最初花园');
assert.equal(call('wbBusinessSave','rescue',{cat:'自动发现地点猫',place:'首次发现点',issue:'需要观察',status:'待救助'}),true);eq('wbFindCat("自动发现地点猫").discoveryPlace','首次发现点');
run('delete wbFindCat("自动发现地点猫").discoveryPlace');
assert.equal(call('wbSaveCatOverview',run('wbFindCat("自动发现地点猫").id'),'discoveryPlace','旧档案补填点'),true);eq('wbFindCat("自动发现地点猫").place','首次发现点');
console.log('PASS: fixed discovery place, initial current-place default, later moves and one-time legacy filling.');
// Sightings default across the two relevant modules, not from the current hospital.
const sightings={cats:[],rescue:[{id:'R-OLD',catId:'C-SIGHT',cat:'目击猫',place:'旧目击点',sightingUpdatedAt:'2026-10-20T00:00:00Z',status:'就医中',hospital:'医院'}],sterilization:[{id:'S-NEW',catId:'C-SIGHT',cat:'目击猫',place:'新目击点',sightingUpdatedAt:'2026-10-21T00:00:00Z',status:'待绝育'}]};
assert.equal(call('DanmiaoDomain.defaultSightingPlace',sightings,{id:'C-SIGHT',name:'目击猫',discoveryPlace:'最初地点',place:'当前医院'}),'新目击点');
assert.equal(call('DanmiaoDomain.defaultSightingPlace',{rescue:[],sterilization:[]},{id:'C-SIGHT',name:'目击猫',discoveryPlace:'最初地点',place:'当前医院'}),'最初地点');
assert.equal(call('DanmiaoDomain.defaultSightingPlace',{rescue:[],sterilization:[]},{id:'C-SIGHT',name:'目击猫',place:'当前医院'}),'');
view('rescue');run("wbBusinessTab.rescue='就医中';wbRefresh()");assert.doesNotMatch(el('#wb-list').innerHTML,/<th>最近目击地点<\/th>/);
run("wbBusinessTab.rescue='已结束';wbRefresh()");assert.doesNotMatch(el('#wb-list').innerHTML,/<th>最近目击地点<\/th>/);
run("wbBusinessTab.rescue='待救助';wbRefresh()");assert.match(el('#wb-list').innerHTML,/aria-label="修改最近目击地点"/);
assert.equal(call('wbSaveBusinessFacts','rescue',run('medicalId'),'area',{place:'禁止改旧地点'}),false);
assert.equal(call('wbBusinessSave','rescue',{cat:'放归同步猫',place:'最近目击点',issue:'观察',status:'待救助'}),true);run('const sightRescue=data.rescue[0].id');
assert.equal(run("wbBusinessSave('rescue',{...find('rescue',sightRescue),status:'已结束',outcome:'放归',completedDate:today},sightRescue)"),false);
assert.equal(run("wbBusinessSave('rescue',{...find('rescue',sightRescue),status:'已结束',outcome:'放归',completedDate:today,releasePlace:'实际放归点'},sightRescue)"),true);eq('wbFindCat("放归同步猫").place','实际放归点');
assert.equal(call('wbBusinessSave','foster',{cat:'放归同步猫',place:'寄养点',caregiver:'照护人',status:'寄养中',date:day}),true);run('const sightFoster=data.foster[0].id');
assert.equal(run("wbBusinessSave('foster',{...find('foster',sightFoster),status:'已结束',outcome:'已放归',completedDate:today,releasePlace:'第二放归点'},sightFoster)"),true);eq('wbFindCat("放归同步猫").place','第二放归点');
// Profile badges derive from live records and memorial status takes precedence.
run("data.adoption.push({id:'BADGE-A',catId:discoveryCat,cat:'发现地点测试猫',status:'无领养人'});data.foster.push({id:'BADGE-F',catId:discoveryCat,cat:'发现地点测试猫',status:'寄养中',place:'寄养点',caregiver:'照护人',date:today,segments:[]});data.rescue.push({id:'BADGE-R',catId:discoveryCat,cat:'发现地点测试猫',status:'就医中',hospital:'医院',issue:'观察',medicalDate:today})");
eq('wbCatStatusLabels(find("cats",discoveryCat)).join(",")','待领养,住院中,寄养中');
run('find("cats",discoveryCat).archiveStatus="已去喵星"');eq('wbCatStatusLabels(find("cats",discoveryCat)).join(",")','已去喵星');
call('wbCatProfile',run('find("cats",discoveryCat)'));assert.match(el('#fields').innerHTML,/cat-profile-actions/);assert.equal((el('#fields').innerHTML.match(/>编辑档案</g)||[]).length,1);
console.log('PASS: sighting defaults/visibility, real release locations, derived paw badges and top profile actions.');
// Preoperative admissions, completed surgery, external profile statuses and memorials.
assert.equal(call('wbBusinessSave','sterilization',{cat:'术前流程测试猫',status:'住院中',hospital:'术前医院',surgeryDate:'',cost:''}),true);run('const preopSurgery=data.sterilization[0].id');
eq('data.monthly.some(w=>w.sourceId===preopSurgery)',false);eq('wbFindCat("术前流程测试猫").neuterStatus','');
assert.equal(call('wbSaveBusinessFacts','sterilization',run('preopSurgery'),'medical',{hospital:'术前医院',surgeryDate:day}),true);eq('wbFindCat("术前流程测试猫").neuterStatus','已绝育');eq('data.monthly.some(w=>w.sourceId===preopSurgery)',true);
assert.equal(call('wbSaveBusinessFacts','sterilization',run('preopSurgery'),'cost',{cost:'1.001'}),false);
run('const profileOnlyAdoptions=data.adoption.length,profileOnlyFosters=data.foster.length');
assert.equal(call('wbSubmitCatProfile',{name:'外部领养测试猫',discoveryPlace:'校内',archiveStatus:'已领养'}),false);assert.match(el('#fields').innerHTML,/profileRecordChoice/);
assert.equal(call('submitHandler',{profileRecordChoice:'profile',archiveStatusDate:day}),true);eq('data.adoption.length',run('profileOnlyAdoptions'));eq('DanmiaoDomain.catCategory(data,wbFindCat("外部领养测试猫"))','已领养');
assert.equal(call('wbSaveCatProfile',{name:'外部寄养测试猫',discoveryPlace:'校内',archiveStatus:'寄养中',profileRecordChoice:'profile',archiveStatusDate:day}),true);eq('data.foster.length',run('profileOnlyFosters'));eq('DanmiaoDomain.catMatchesTab(data,wbFindCat("外部寄养测试猫"),"寄养中")',true);
assert.equal(call('wbSaveCatProfile',{name:'档案建业务猫',discoveryPlace:'校内',place:'寄养点',archiveStatus:'寄养中',profileRecordChoice:'create',archiveStatusDate:day,profileCaregiver:'照护人'}),true);
run('const profileManagedCat=wbFindCat("档案建业务猫").id');eq('data.foster.some(f=>f.catId===profileManagedCat&&f.status==="寄养中")',true);
assert.equal(call('wbSaveCatProfile',{name:'档案建业务猫',archiveStatus:'已领养',profileRecordChoice:'create',archiveStatusDate:day,profileApplicant:'实际领养人'},run('profileManagedCat')),true);eq('data.foster.some(f=>f.catId===profileManagedCat&&f.status==="寄养中")',false);eq('data.adoption.some(a=>a.catId===profileManagedCat&&a.status==="已领养")',true);
assert.equal(call('wbSaveCatProfile',{name:'档案建业务猫',archiveStatus:'已去喵星'},run('profileManagedCat')),false);
assert.equal(call('wbSaveCatProfile',{name:'档案建业务猫',archiveStatus:'已去喵星',memorialDate:day},run('profileManagedCat')),true);
eq('!!find("cats",profileManagedCat).memorialRegisteredAt',true);assert.match(call('catCell','档案建业务猫'),/is-memorial/);
eq('wbFollowup(data.adoption.find(a=>a.catId===profileManagedCat)).label','已归档');
run("wbBusinessTab.cats='寄养中'");view('cats');assert.match(el('#wb-list').innerHTML,/外部寄养测试猫/);assert.doesNotMatch(el('#wb-list').innerHTML,/档案建业务猫/);
run("wbBusinessTab.rescue='待救助'");view('rescue');assert.doesNotMatch(el('#wb-list').innerHTML,/<th>医院<\/th>/);assert.match(el('#wb-list').innerHTML,/<th>照片<\/th>/);
console.log('PASS: preoperative surgery stages, profile-only/managed records, memorial date/grayscale/archived follow-up and foster filtering.');

run("wbBusinessTab.sterilization='待绝育'");view('sterilization');assert.match(el('#wb-list').innerHTML,/<th>目击照片<\/th>/);
const identityEditor=call('wbCatEditFields',{id:'C-EDITOR',name:'编辑布局猫',sex:'母',age:'1岁',place:'校园'},true);assert.match(identityEditor,/cat-edit-card/);assert.match(identityEditor,/data-wb-enhanced="native"/);assert.match(identityEditor,/name="archiveStatus"/);assert.match(identityEditor,/name="description"/);
console.log('PASS: sighting photo labels and identity-card profile editor with native status selection.');
