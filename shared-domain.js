(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DanmiaoDomain=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const businessTypes=['rescue','foster','adoption','sterilization'];
const names={rescue:'救助管理',foster:'寄养管理',adoption:'领养管理',sterilization:'绝育管理'};
const completedStates={rescue:'已结案',foster:'已结束',adoption:'已领养',sterilization:'已完成'};
const checklistItems={health:1,medicine:1,food:1,supplies:1,contact:1};
const money=cents=>'¥ '+(Number(cents||0)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
// Pure shared rules: no DOM, browser storage or server dependencies.
const wbStatuses={rescue:['待救助','就医中','已结束'],foster:['待安置','寄养中','已结束'],adoption:['无领养人','有意向领养人','已领养'],sterilization:['待绝育','住院中','已放归']};
const wbId=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const wbActive=(store,type)=>(store[type]||[]).filter(r=>!r.deletedAt);
const wbValidDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function wbAddDays(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
function wbAddMonth(day){const d=new Date(day+'T00:00:00Z'),date=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,last));return d.toISOString().slice(0,10)}
function wbFollowup(row,asOf=day()){
 if(row.status!=='已领养'||!wbValidDate(row.adoptDate))return {due:false,next:'',label:'已暂停'};
 const early=Number(row.earlyInterval||7),regular=Number(row.regularInterval||30),boundary=wbAddMonth(row.adoptDate),base=row.lastFollowup||row.adoptDate;
 let next=wbAddDays(base,base<boundary?early:regular);
 // A weekly reminder must not be scheduled after the initial one-month stage.
 if(base<boundary&&next>=boundary)next=wbAddDays(base,regular);
 if(wbValidDate(row.nextFollowupDate))next=row.nextFollowupDate;
 return {due:next<=asOf,next,label:next<=asOf?'待回访':row.followupState==='待回访'||row.followupState==='未到期'?'待回访':row.lastFollowup?'已完成':'待回访'};
}
function catCategory(store,cat){
 const gone=v=>['死亡','已死亡','去喵星','已去喵星'].includes(v),related=r=>r.catId?r.catId===cat.id:r.cat===cat.name||(cat.aliases||[]).includes(r.cat);
 if([cat.archiveStatus,cat.status,cat.health].some(gone)||wbActive(store,'rescue').some(r=>related(r)&&r.status==='已结束'&&gone(r.outcome)))return '已去喵星';
 return wbActive(store,'adoption').some(r=>related(r)&&r.status==='已领养')?'已领养':'其他';
}
function wbMigrate(store,asOf=day()){
 store.sales??=[];store.dismissed??=[];store.stories??=[];for(const item of store.inventory){delete item.min;item.photos??=[];}store.dismissed=store.dismissed.filter(key=>!key.startsWith('low:'));
 for(const t of businessTypes)for(const r of store[t]){
  r.status=({rescue:{'待响应':'待救助','待相应':'待救助','已接手':'待救助','救助中':'待救助','已结案':'已结束'},foster:{'待入住':'待安置','待交接':'待安置'},adoption:{'待审核':'无领养人','待领养':'无领养人','沟通中':'有意向领养人','试养中':'有意向领养人','未通过':'无领养人'},sterilization:{'待预约':'待绝育','已预约':'待绝育','术后照护':'住院中','已完成':'已放归'}}[t][r.status])||r.status;
  if(t==='rescue'&&r.outcome==='死亡')r.outcome='去喵星';
  r.nextStep??='';r.photos??=[];r.owner??='';const linked=store.cats.find(c=>!c.deletedAt&&(c.name===r.cat||(c.aliases||[]).includes(r.cat)));if(linked){if(!r.catId)r.catId=linked.id;r.cat=linked.name;}
  if(t==='rescue'&&r.status==='就医中'&&!r.medicalDate)r.medicalDate=wbValidDate(r.date)&&r.date<=asOf?r.date:asOf;
  if(t==='sterilization'){
   r.surgeryDate??=(r.status!=='待绝育'&&r.date<=asOf?r.date:'');r.capturer??=r.owner||'';r.releaseDate??=r.status==='已放归'?(r.completedDate||r.date):'';r.releasePlace??='';
  }
  if(t==='foster'){
   r.segments??=r.place?[{id:wbId('SEG'),place:r.place,caregiver:r.caregiver||'',startDate:r.date,endDate:r.status==='已结束'?(r.completedDate||r.endDate||r.date):r.status==='待安置'?asOf:'',note:r.note||''}]:[];
   r.outcome??='';
  }
  if(t==='adoption'){
   r.postStatus=['本月领养帖','已上领养帖','本月领养贴','已上领养贴'].includes(r.postStatus)?'已上领养贴':'未上领养贴';r.agreements??=[];r.earlyInterval??=7;r.regularInterval??=30;r.adoptDate??=r.status==='已领养'?(r.date||asOf):'';r.lastFollowup??='';r.followups??=[];for(const entry of r.followups){entry.id??=wbId('FOLLOW');entry.photos??=[];}
  }
 }
 for(const c of store.cats){c.photos??=[];for(const k of ['health','status','archiveStatus'])if(['死亡','已死亡'].includes(c[k]))c[k]='已去喵星';}
 for(const l of store.loans||[])l.sourcePlace??=store.inventory.find(i=>i.id===l.itemId)?.place||'';
 for(const b of store.finance){if(b.flow==='个人垫付'&&b.status==='待报销')b.status='待审核';b.refundReview??=false;}
 store.schemaVersion=4;return store;
}
function wbReservations(store,itemId,excludeId=''){
 let shipping=0,pickup=0;
 for(const order of wbActive(store,'sales'))if(order.channel==='线上'&&!order.cancelledAt&&!order.deliveredDate&&order.id!==excludeId){
  for(const line of order.lines)if(line.itemId===itemId){if(order.delivery==='自提')pickup+=line.quantity;else shipping+=line.quantity;}
 }
 return {shipping,pickup,total:shipping+pickup};
}
function wbAvailable(store,itemId,excludeId=''){const item=store.inventory.find(r=>r.id===itemId);return item?item.qty-(item.reserved||0)-wbReservations(store,itemId,excludeId).total:0}
function wbFinance(store,selectedMonth){
 const bills=wbActive(store,'finance'),confirmed=bills.filter(b=>b.status==='已入账'||b.status==='已报销'||b.status==='已结清'),sum=xs=>xs.reduce((a,b)=>a+b.amountCents,0);
 return {income:sum(confirmed.filter(b=>b.flow==='收入'&&b.date.startsWith(selectedMonth))),expense:sum(bills.filter(b=>b.flow!=='收入'&&b.status!=='未通过'&&b.date.startsWith(selectedMonth))),unconfirmed:sum(bills.filter(b=>b.flow==='收入'&&b.status==='待确认'&&b.date.startsWith(selectedMonth))),pending:sum(bills.filter(b=>b.flow==='个人垫付'&&['待审核','审核通过'].includes(b.status))),balance:sum(confirmed.filter(b=>b.flow==='收入'))-sum(confirmed.filter(b=>b.flow==='协会支出'||b.flow==='协会欠款'&&b.status==='已结清'||b.flow==='个人垫付'&&b.status==='已报销'))};
}
function wbSync(store,asOf=day()){
 const active=t=>wbActive(store,t),works=[];
 // Stable source ids ensure repeated saves/reloads do not duplicate linked records.
 for(const r of active('rescue'))if(r.status==='已结束'&&r.outcome==='转寄养'&&!store.foster.some(f=>f.sourceRescueId===r.id))store.foster.unshift({id:'AUTO-F-'+r.id,cat:r.cat||'',catId:r.catId||'',place:'',caregiver:'',owner:'',date:r.completedDate||asOf,endDate:'',status:'待安置',outcome:'',note:r.issue||'',photos:[...(r.photos||[])],segments:[],checklist:{},sourceRescueId:r.id});
 for(const f of active('foster'))if(f.status==='已结束'&&f.outcome==='已领养'&&!store.adoption.some(a=>a.sourceFosterId===f.id)){
  let a=active('adoption').find(a=>a.cat===f.cat&&['有意向领养人','已领养'].includes(a.status));
  if(!a){a={id:'AUTO-A-'+f.id,cat:f.cat,catId:f.catId||'',applicant:'',owner:'',date:f.completedDate||asOf,note:'由寄养结束自动建立',agreements:[],earlyInterval:7,regularInterval:30,lastFollowup:''};store.adoption.unshift(a);}
  a.sourceFosterId=f.id;a.status='已领养';a.adoptDate||=f.completedDate||asOf;
 }
 for(const a of active('adoption'))if(a.status==='已退养'&&!active('adoption').some(b=>b.cat===a.cat&&['无领养人','有意向领养人','已领养'].includes(b.status)))store.adoption.unshift({id:'RETURN-'+a.id,cat:a.cat,catId:a.catId||'',applicant:'',owner:'',date:a.returnDate||asOf,status:'无领养人',note:'上一段领养已结束，历史协议保留。',agreements:[],earlyInterval:7,regularInterval:30,adoptDate:'',lastFollowup:'',sourceAdoptionId:a.id});
 const add=(type,r,date,title,result,amountCents,pendingCents)=>{if(wbValidDate(date)&&date<=asOf)works.push({sourceType:type,sourceId:r.id,title,category:type==='sales'?'文创销售':type==='movements'?'物资盘点':names[type],cat:r.cat||'公共事项',owner:r.owner||'',date,result,amountCents,pendingCents,auto:true});};
 for(const r of active('rescue'))if(['就医中','已结束'].includes(r.status))add('rescue',r,r.medicalDate||(r.status==='就医中'?r.date||asOf:r.completedDate||r.date),(r.cat||r.place||'未建档猫咪')+(r.status==='已结束'?' · 救助结束':' · 救助就医'),r.status==='已结束'?r.outcome||r.issue||'已结束':r.issue||'已就医，继续跟进');
 for(const r of active('foster'))if(r.status==='已结束')add('foster',r,r.completedDate||r.endDate||r.date,(r.cat||'未命名猫咪')+' · 寄养结束',r.outcome||r.note||'已结束');
 for(const r of active('adoption'))if(['已领养','已退养'].includes(r.status))add('adoption',r,r.adoptDate,(r.cat||'未命名猫咪')+' · 领养',r.applicant?'领养人：'+r.applicant:'已建立独立领养经历');
 for(const r of active('sterilization'))if(['住院中','已放归'].includes(r.status))add('sterilization',r,r.surgeryDate||(wbValidDate(r.date)&&r.date<=asOf?r.date:asOf),r.cat+' · 绝育手术',r.hospital||'住院中，继续跟进放归');
 for(const r of active('movements'))if(r.type==='盘点')add('movements',r,r.date,r.itemName+' · 物资盘点','实盘在库 '+r.quantity+' '+(store.inventory.find(i=>i.id===r.itemId)?.unit||''));
 const saleBills=active('finance'),getBill=s=>saleBills.find(b=>b.saleId===s.id);
 const onlineMonths=[...new Set(active('sales').filter(s=>s.channel==='线上').map(s=>s.date.slice(0,7)))];
 function salesTotals(rows){let confirmed=0,pending=0;for(const s of rows){const b=getBill(s);if(b?.status==='已入账')confirmed+=b.amountCents;if(b?.status==='待确认')pending+=b.amountCents;}return {confirmed,pending};}
 for(const m of onlineMonths){const rows=active('sales').filter(s=>s.channel==='线上'&&s.date.startsWith(m)),t=salesTotals(rows);add('sales',{id:'ONLINE-'+m},rows.map(s=>s.date).sort().at(-1),'线上文创销售月度汇总',`${rows.filter(s=>!s.cancelledAt).length} 笔有效订单；确认收入 ${money(t.confirmed)}；待确认 ${money(t.pending)}。`,t.confirmed,t.pending);}
 for(const s of active('sales'))if(s.channel==='线下'){const t=salesTotals([s]);add('sales',s,s.date,s.title+' · 线下义卖',`${s.lines.reduce((n,l)=>n+l.quantity,0)} 件；确认收入 ${money(t.confirmed)}；待确认 ${money(t.pending)}。`,t.confirmed,t.pending);}
 const keys=new Set(works.map(w=>w.sourceType+':'+w.sourceId));
 store.monthly=store.monthly.filter(w=>!w.auto||keys.has(w.sourceType+':'+w.sourceId));
 for(const w of works){const previous=store.monthly.find(p=>p.sourceType===w.sourceType&&p.sourceId===w.sourceId);if(previous){const manual=previous.manualResult||(!previous.auto?previous.result:'');Object.assign(previous,w,{result:manual||w.result,...(manual?{manualResult:manual}:{})});}else store.monthly.push({...w,id:'AUTO-W-'+w.sourceType+'-'+w.sourceId});}
 return store;
}
function migrateData(input,{defaults={},extraInventory=[],asOf=day()}={}){
 for(const type of ['foster','monthly','finance','movements','loans','audit']) {
  if(!Array.isArray(input[type]))input[type]=structuredClone(defaults[type]||[]);
 }
 for(const rescue of input.rescue){
  if(rescue.status!=='寄养中')continue;
  if(!input.foster.some(f=>f.sourceRescueId===rescue.id)) input.foster.push({id:'F-MIG-'+rescue.id,cat:rescue.cat,place:'待确认（旧记录迁移）',caregiver:rescue.owner,date:rescue.date,endDate:'',owner:rescue.owner,status:'寄养中',note:rescue.issue||'',sourceRescueId:rescue.id});
  rescue.status='已结案';
 }
 if((input.schemaVersion||0)<3){
  for(const item of extraInventory)if(!input.inventory.some(r=>r.id===item.id))input.inventory.push(structuredClone(item));
 }
 for(const item of input.inventory){
  item.group??='日常';item.reserved??=0;item.sold??=0;item.variant??='';item.unitPriceCents??=0;item.kind??=item.category==='器材'?'可借用器材':'消耗品';
 }
 for(const foster of input.foster)foster.checklist??=Object.fromEntries(Object.keys(checklistItems).map(k=>[k,foster.status==='已结束']));
 for(const type of businessTypes)for(const row of input[type])if(row.status===completedStates[type])row.completedDate??=row.date;
 input.schemaVersion=3;
 return input;
}

return {day,catCategory,statuses:wbStatuses,id:wbId,active:wbActive,validDate:wbValidDate,addDays:wbAddDays,addMonth:wbAddMonth,followup:wbFollowup,migrate:wbMigrate,legacyMigrate:migrateData,reservations:wbReservations,available:wbAvailable,finance:wbFinance,sync:wbSync,normalize(store,asOf=day()){return wbSync(wbMigrate(migrateData(store),asOf),asOf);}};
});
