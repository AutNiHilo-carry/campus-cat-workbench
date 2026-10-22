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
const outreachStates={events:['筹备中','报名中','进行中','已完成','已取消'],sponsors:['意向沟通','待落实','已落实','已结束','已取消']};
function outreachError(type,row,store,asOf=day()){
 if(!outreachStates[type]?.includes(row.status))return '请选择有效状态';
 for(const key of ['title','owner'])if(typeof row[key]!=='string'||!row[key].trim()||row[key].length>120)return key==='title'?'请填写名称（120字以内）':'请填写负责人（120字以内）';
 for(const key of ['place','staffing','agenda','materials','note','result','organization','contact','supportContent','eventId','supportType','date','endDate','time','completedDate','targetDate','receivedDate'])if(row[key]!==undefined&&(typeof row[key]!=='string'||row[key].length>10000))return '文字字段格式有误或内容过长';
 if(type==='events'){
  if(!wbValidDate(row.date)||!row.place?.trim())return '请填写有效活动日期和地点';
  if(row.endDate&&(!wbValidDate(row.endDate)||row.endDate<row.date))return '结束日期不能早于活动日期';
  if(row.status==='进行中'&&row.date>asOf)return '活动尚未到开始日期';
  if(row.completedDate&&(!wbValidDate(row.completedDate)||row.completedDate<row.date||row.completedDate>asOf))return '实际完成日期应在活动开始日至今天之间';
  if(row.status==='已完成'&&(!wbValidDate(row.completedDate)||!row.result?.trim()))return '已完成活动需填写实际完成日期和成果';
 }else{
  if(!row.organization?.trim()||!row.supportContent?.trim())return '请填写赞助方和支持内容';
  if(!['资金','物资','服务','其他'].includes(row.supportType))return '请选择支持类型';
  if(row.eventId&&!store.events.some(e=>e.id===row.eventId))return '关联活动不存在，请重新选择';
  if(row.targetDate&&!wbValidDate(row.targetDate))return '预计落实日期无效';
  if(row.receivedDate&&(!wbValidDate(row.receivedDate)||row.receivedDate>asOf))return '实际落实日期不能晚于今天';
  if(['已落实','已结束'].includes(row.status)&&!wbValidDate(row.receivedDate))return '请填写实际落实日期';
 }
 return '';
}
function announcementError(row){
 if(!['草稿','已发布','已撤下'].includes(row.status))return '请选择有效公告状态';
 if(typeof row.title!=='string'||!row.title.trim()||row.title.length>120)return '请填写公告标题（120字以内）';
 if(typeof row.content!=='string'||!row.content.trim()||row.content.length>8000)return '请填写公告正文（8000字以内）';
 return '';
}
function announcementKey(row){const text=JSON.stringify([row.id,row.title,row.content]);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return row.id+':'+(hash>>>0).toString(16);}
const wbId=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const wbActive=(store,type)=>(store[type]||[]).filter(r=>!r.deletedAt);
const wbValidDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function wbAddDays(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
function wbAddMonth(day){const d=new Date(day+'T00:00:00Z'),date=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,last));return d.toISOString().slice(0,10)}
function wbFollowup(row,asOf=day(),store){
 if(store){const cat=wbActive(store,'cats').find(c=>row.catId?c.id===row.catId:c.name===row.cat);if(cat&&catCategory(store,cat)==='去了喵星')return {due:false,next:'',label:'已归档'};}
 if(row.status!=='已领养'||!wbValidDate(row.adoptDate))return {due:false,next:'',label:'已暂停'};
 const early=Number(row.earlyInterval||7),regular=Number(row.regularInterval||30),boundary=wbAddMonth(row.adoptDate),base=row.lastFollowup||row.adoptDate;
 let next=wbAddDays(base,base<boundary?early:regular);
 // A weekly reminder must not be scheduled after the initial one-month stage.
 if(base<boundary&&next>=boundary)next=wbAddDays(base,regular);
 if(wbValidDate(row.nextFollowupDate))next=row.nextFollowupDate;
 return {due:next<=asOf,next,label:next<=asOf?'待回访':row.followupState==='待回访'||row.followupState==='未到期'?'待回访':row.lastFollowup?'已完成':'待回访'};
}
function catCategory(store,cat){
 const gone=v=>['死亡','已死亡','去喵星','已去喵星','去了喵星'].includes(v),related=r=>r.catId?r.catId===cat.id:r.cat===cat.name||(cat.aliases||[]).includes(r.cat);
 if([cat.archiveStatus,cat.status,cat.health].some(gone)||['rescue','foster'].some(t=>wbActive(store,t).some(r=>related(r)&&r.status==='已结束'&&gone(r.outcome))))return '去了喵星';
 return cat.archiveStatus==='已领养'||wbActive(store,'adoption').some(r=>related(r)&&r.status==='已领养')?'已领养':'其他';
}
function wbMigrate(store,asOf=day()){
 store.events??=[];store.sponsors??=[];store.announcements??=[];
 store.sales??=[];store.dismissed??=[];store.stories??=[];for(const item of store.inventory){delete item.min;item.photos??=[];}store.dismissed=store.dismissed.filter(key=>!key.startsWith('low:'));
 for(const t of businessTypes)for(const r of store[t]){
  r.status=({rescue:{'待响应':'待救助','待相应':'待救助','已接手':'待救助','救助中':'待救助','已结案':'已结束'},foster:{'待入住':'待安置','待交接':'待安置'},adoption:{'待审核':'无领养人','待领养':'无领养人','沟通中':'有意向领养人','试养中':'有意向领养人','未通过':'无领养人'},sterilization:{'待预约':'待绝育','已预约':'待绝育','术后照护':'住院中','已完成':'已放归'}}[t][r.status])||r.status;
  if(['rescue','foster'].includes(t)&&['死亡','去了喵星','已去喵星'].includes(r.outcome))r.outcome='去喵星';
  r.nextStep??='';r.photos??=[];r.owner??='';const linked=store.cats.find(c=>!c.deletedAt&&(c.name===r.cat||(c.aliases||[]).includes(r.cat)));if(linked){if(!r.catId)r.catId=linked.id;r.cat=linked.name;}
  if(t==='rescue'&&r.status==='就医中'&&!r.medicalDate)r.medicalDate=wbValidDate(r.date)&&r.date<=asOf?r.date:asOf;
  if(t==='sterilization'){
   r.surgeryDate??=(r.status!=='待绝育'&&r.date<=asOf?r.date:'');r.capturer??=r.owner||'';r.releaseDate??=r.status==='已放归'?(r.completedDate||r.date):'';r.releasePlace??='';
  }
  if(t==='foster'){
   r.segments??=r.place?[{id:wbId('SEG'),place:r.place,caregiver:r.caregiver||'',startDate:r.date,endDate:r.status==='已结束'?(r.completedDate||r.endDate||r.date):r.status==='待安置'?asOf:'',note:r.note||''}]:[];
   r.outcome??='';if(r.status!=='待安置'&&r.segments.length)r.segments.at(-1).situation??=r.situation||'';
  }
  if(t==='adoption'){
   r.postStatus=['本月领养帖','已上领养帖','本月领养贴','已上领养贴'].includes(r.postStatus)?'已上领养贴':'未上领养贴';r.agreements??=[];r.earlyInterval??=7;r.regularInterval??=30;r.adoptDate??=r.status==='已领养'?(r.date||asOf):'';r.lastFollowup??='';r.followups??=[];for(const entry of r.followups){entry.id??=wbId('FOLLOW');entry.photos??=[];}
  }
 }
 for(const c of store.cats){c.photos??=[];for(const k of ['health','status','archiveStatus'])if(['死亡','已死亡','已去喵星'].includes(c[k]))c[k]='去了喵星';}
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
 const bills=wbActive(store,'finance'),confirmed=bills.filter(b=>b.status==='已入账'||b.status==='已报销'||b.status==='已结清'),sum=xs=>xs.reduce((a,b)=>a+signedAmount(b),0);
 return {income:sum(confirmed.filter(b=>b.flow==='收入'&&b.date.startsWith(selectedMonth))),expense:sum(bills.filter(b=>b.flow!=='收入'&&b.status!=='未通过'&&b.date.startsWith(selectedMonth))),unconfirmed:sum(bills.filter(b=>b.flow==='收入'&&b.status==='待确认'&&b.date.startsWith(selectedMonth))),pending:sum(bills.filter(b=>b.flow==='个人垫付'&&['待审核','审核通过'].includes(b.status))),balance:sum(confirmed.filter(b=>b.flow==='收入'))-sum(confirmed.filter(b=>b.flow==='协会支出'||b.flow==='协会欠款'&&b.status==='已结清'||b.flow==='个人垫付'&&b.status==='已报销'))};
}
function archiveProfileError(cat,prior,asOf=day()){
 if(cat.archiveStatusDate&&(!wbValidDate(cat.archiveStatusDate)||cat.archiveStatusDate>asOf))return '档案状态日期不能晚于今天';
 if(!['','寄养中','已领养','去了喵星'].includes(cat.archiveStatus||''))return '无效档案状态';
 if(cat.archiveStatus==='去了喵星'&&(prior?.archiveStatus!=='去了喵星'||cat.memorialDate!==prior?.memorialDate)&&(!wbValidDate(cat.memorialDate)||cat.memorialDate>asOf))return '请填写不晚于今天的去喵星日期';
 return '';
}
function sameCat(a,b){return !!a&&!!b&&(a.catId&&b.catId?a.catId===b.catId:a.cat===b.cat);}
function catMatchesTab(store,cat,tab){if(tab==='已归档')return !!cat.archivedAt;if(cat.archivedAt)return false;return !tab||tab==='全部'||(tab==='住院中'?catCategory(store,cat)!=='去了喵星'&&['rescue','sterilization'].some(type=>wbActive(store,type).some(r=>sameCat(r,{catId:cat.id,cat:cat.name})&&r.status===(type==='rescue'?'就医中':'住院中'))):tab==='寄养中'?catCategory(store,cat)!=='去了喵星'&&(cat.archiveStatus==='寄养中'||wbActive(store,'foster').some(r=>sameCat(r,{catId:cat.id,cat:cat.name})&&r.status==='寄养中')):catCategory(store,cat)===tab);}
function businessRuleError(store,type,r,prior,asOf=day()){
 if(!businessTypes.includes(type)||!r)return '';
 const policy=businessIntegrityError(store,type,r,prior,asOf);if(policy)return policy;
 if(r.deletedAt)return '';
 const changed=k=>!prior||JSON.stringify(prior[k])!==JSON.stringify(r[k]);
 const cat=wbActive(store,'cats').find(c=>r.catId?c.id===r.catId:c.name===r.cat);
 const ongoing={rescue:['待救助','就医中'],foster:['待安置','寄养中'],adoption:['无领养人','有意向领养人','已领养'],sterilization:['待绝育','住院中']}[type]||[];
 if(cat&&catCategory(store,cat)==='去了喵星'&&((ongoing.includes(r.status)&&(!prior||prior.deletedAt||!sameCat(prior,r)||prior.status!==r.status))||(type==='foster'&&r.status==='已结束'&&r.outcome==='已领养'&&changed('outcome'))))return '去了喵星的猫咪不能开启新业务，可补录已结束的历史';
 if(type==='sterilization'&&r.cost!==null&&r.cost!==undefined&&r.cost!==''){
  const cost=r.cost;if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>1000000||Math.abs(cost*100-Math.round(cost*100))>0.000001)return '费用需为非负金额，最多两位小数且不超过100万元';
 }
 if(r.status==='已结束'&&(changed('completedDate')||changed('date')||changed('medicalDate')||changed('status'))){const start=r.medicalDate||r.date;if(!wbValidDate(r.completedDate)||r.completedDate>asOf||wbValidDate(start)&&r.completedDate<start)return '结束日期不能早于开始或就医日期，也不能晚于今天';}
 if(type==='foster'&&(changed('segments')||changed('date')||changed('status'))){
  let end='';const segments=r.segments||[];
  for(let i=0;i<segments.length;i++){const seg=segments[i];if(!seg.place?.trim()||!seg.caregiver?.trim()||!wbValidDate(seg.startDate)||seg.startDate>asOf||end&&seg.startDate<end||seg.endDate&&(!wbValidDate(seg.endDate)||seg.endDate<seg.startDate||seg.endDate>asOf)||!seg.endDate&&i<segments.length-1)return '寄养分段的地点、照护人或日期顺序有误';end=seg.endDate||seg.startDate;}
  const last=segments.at(-1);if(r.status==='寄养中'&&(!last||last.endDate||last.place!==r.place||last.caregiver!==r.caregiver||last.startDate!==r.date))return '寄养中必须保留与当前地点、照护人、入住日期一致的开放分段';
  if(r.status!=='寄养中'&&last&&!last.endDate)return '结束或待安置时应先关闭上一段寄养经历';
 }
 if(type==='adoption'&&r.status==='已领养'&&(!prior||prior.status!=='已领养')){const latest=wbActive(store,'foster').filter(f=>sameCat(f,r)&&f.status==='寄养中').map(f=>f.date).sort().at(-1);if(latest&&r.adoptDate<latest)return '领养日期不能早于关联寄养的入住日期';}
 if(type==='adoption'&&r.status==='已退养'&&(!prior||prior.status!=='已退养'||changed('returnDate')||changed('returnDisposition')||changed('returnPlace')||changed('returnCaregiver'))){
  if(!wbValidDate(r.returnDate)||r.returnDate<r.adoptDate||r.returnDate>asOf||(r.followups||[]).some(e=>e.date>r.returnDate))return '退养日期应在领养日、最后一次回访之后且不晚于今天';
  if(!['待安置','寄养中'].includes(r.returnDisposition)||!r.returnPlace?.trim()||r.returnDisposition==='寄养中'&&!r.returnCaregiver?.trim())return '退养时需登记当前地点、安置方式，入住寄养还需实际照护人';
 }
 if(type==='rescue'&&prior?.status==='已结束'&&prior.outcome==='转寄养'&&(r.status!=='已结束'||r.outcome!=='转寄养')&&wbActive(store,'foster').some(f=>f.sourceRescueId===r.id&&(f.status!=='待安置'||f.segments?.length)))return '关联寄养已有入住经历，请先处理寄养交接，不能直接撤销转寄养结果';
 if(type==='foster'&&prior?.deletedAt&&r.sourceRescueId){const source=wbActive(store,'rescue').find(x=>x.id===r.sourceRescueId);if(!source||source.status!=='已结束'||source.outcome!=='转寄养')return '原救助结果已更正，不能恢复这段自动寄养';}
 if(type==='foster'&&prior?.status==='已结束'&&prior.outcome==='已领养'&&(r.status!=='已结束'||r.outcome!=='已领养')){
  const linked=wbActive(store,'adoption').filter(a=>a.sourceFosterId===r.id&&a.status==='已领养');
  if(linked.some(a=>!a.autoCreatedByFoster&&!String(a.id).startsWith('AUTO-A-')||a.applicant?.trim()||a.agreements?.length||a.followups?.length))return '关联领养已有人员或归档资料，请先登记退养或更正关联领养，再更正寄养结果';
 }
 if(type==='adoption'&&r.status==='已领养'&&prior?.deletedAt&&r.sourceFosterId){const f=wbActive(store,'foster').find(f=>f.id===r.sourceFosterId);if(!f||f.status!=='已结束'||f.outcome!=='已领养')return '原寄养结果已更正，不能恢复这段自动领养';}
 return '';
}
function applyBusinessLinks(store,type,before,after){
 if(!after||after.deletedAt||before?.deletedAt)return;
 const linkedCat=wbActive(store,'cats').find(c=>sameCat(after,{catId:c.id,cat:c.name}));if(linkedCat&&catCategory(store,linkedCat)==='去了喵星')return;
 if(after.cat&&(!before?.cat&&!before?.catId))for(const node of businessLinks(store,type,after.id))if(!node.row.cat&&!node.row.catId){node.row.cat=after.cat;node.row.catId=after.catId||'';}
 const related=t=>wbActive(store,t).filter(r=>sameCat(r,after));
 if(type==='rescue'&&before?.status==='已结束'&&before.outcome==='转寄养'&&(after.status!=='已结束'||after.outcome!=='转寄养'))for(const f of related('foster').filter(f=>f.sourceRescueId===after.id)){f.deletedAt=new Date().toISOString();f.cancellationReason='原救助结果已更正';}
 if(type==='foster'&&before?.status==='已结束'&&before.outcome==='已领养'&&(after.status!=='已结束'||after.outcome!=='已领养'))for(const a of related('adoption').filter(a=>a.sourceFosterId===after.id&&a.status==='已领养')){a.deletedAt=new Date().toISOString();a.cancellationReason='原寄养结果已更正';}
 if(type==='adoption'&&after.status==='已领养'&&before?.status==='已领养'&&after.adoptDate!==before.adoptDate)for(const f of related('foster').filter(f=>f.adoptionId===after.id||f.id===after.sourceFosterId)){f.completedDate=after.adoptDate;if(f.segments?.at(-1))f.segments.at(-1).endDate=after.adoptDate;}
 if(type==='adoption'&&after.status==='已领养'&&before?.status!=='已领养')for(const f of related('foster').filter(f=>f.status==='寄养中'||f.status==='待安置')){f.status='已结束';f.outcome='已领养';f.completedDate=after.adoptDate;if(f.segments?.at(-1)&&!f.segments.at(-1).endDate)f.segments.at(-1).endDate=after.adoptDate;f.adoptionId=after.id;after.sourceFosterId||=f.id;}
 if(type==='adoption'&&after.status==='已退养'&&before?.status!=='已退养'){
  let f=store.foster.find(f=>f.sourceAdoptionId===after.id);
  if(!f){f={id:'RETURN-F-'+after.id,cat:after.cat,catId:after.catId||'',sourceAdoptionId:after.id,status:after.returnDisposition,place:after.returnDisposition==='寄养中'?after.returnPlace:'',caregiver:after.returnDisposition==='寄养中'?after.returnCaregiver:'',date:after.returnDate,owner:after.owner||'',situation:'退养交接；当前地点：'+after.returnPlace,segments:[],photos:[]};if(f.status==='寄养中')f.segments.push({id:'RETURN-SEG-'+after.id,place:f.place,caregiver:f.caregiver,startDate:f.date,endDate:'',situation:f.situation});store.foster.unshift(f);}
 }
}
// Sightings come from rescue/sterilization records, never hospital or foster addresses.
function defaultSightingPlace(store,cat){
 if(!cat)return '';
 const candidates=['rescue','sterilization'].flatMap(type=>wbActive(store,type).filter(r=>r.place?.trim()&&(r.catId&&cat.id?r.catId===cat.id:r.cat===cat.name)).map(r=>({place:r.place,time:r.sightingUpdatedAt||r.createdAt||(r.date&&r.date<=day()?r.date:''),id:r.id})));
 candidates.sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))||String(b.id).localeCompare(String(a.id)));
 return candidates[0]?.place||cat.discoveryPlace||'';
}
// Apply a saved business change once; unrelated edits must not replay old moves.
function syncBusinessChange(store,type,before,after){
 if(!after||after.deletedAt||before?.deletedAt)return;
 applyDerivedCorrection(store,type,before,after);
 applyBusinessLinks(store,type,before,after);

 if(after.locationAction!=='history'&&['rescue','sterilization'].includes(type)&&['待救助','待绝育'].includes(after.status)&&after.place?.trim()&&(!before||before.place!==after.place))after.sightingUpdatedAt=new Date().toISOString();
 if(type==='foster'&&after.status!=='待安置'&&after.segments?.length&&after.situation!==before?.situation){after.segments.at(-1).situation=after.situation||'';}
 if(before&&after.status===before.status&&after.locationAction==='history')return;
 const destination=r=>{
  if(!r)return '';
  if(type==='rescue')return r.status==='就医中'?r.hospital:r.status==='待救助'?r.place:r.status==='已结束'&&r.outcome==='放归'?r.releasePlace:'';
  if(type==='sterilization')return r.status==='住院中'?r.hospital:r.status==='已放归'?r.releasePlace:r.status==='待绝育'?r.place:'';
  if(type==='adoption')return r.status==='已退养'?r.returnPlace:r.status==='已领养'?r.adoptPlace||'领养家庭':'';
  if(type==='foster')return r.status==='寄养中'?r.place:r.status==='已结束'&&r.outcome==='已放归'?r.releasePlace:'';
  return '';
 };
 const place=String(destination(after)||'').trim();
 if(!place||['待确定','待确认','待补充','未填写','待安置'].includes(place))return;
 if(before&&(before.catId&&after.catId?before.catId===after.catId:before.cat===after.cat)&&before.status===after.status&&before.outcome===after.outcome&&String(destination(before)||'').trim()===place)return;
 const cat=wbActive(store,'cats').find(c=>after.catId?c.id===after.catId:c.name===after.cat);
 if(cat&&catCategory(store,cat)!=='去了喵星')pushLocation(store,cat,{kind:'business',sourceType:type,sourceId:after.id,place,changeKey:JSON.stringify([after.status,after.outcome||'',place,after.date||'',after.adoptDate||'',after.releaseDate||''])});
}
function wbSync(store,asOf=day()){
 const active=t=>wbActive(store,t),works=[];
 // Keep a separate archive copy; removing it there must not re-import it on reload.
 for(const r of active('sterilization').filter(r=>r.status==='待绝育')){
  const cat=active('cats').find(c=>sameCat(r,{catId:c.id,cat:c.name}));if(!cat)continue;
  cat.photos??=[];const known=new Set([...cat.photos.map(p=>p.id),...(cat.deletedFiles||[]).filter(e=>e.key==='photos').map(e=>e.file?.id)]);
  for(const photo of r.photos||[])if(!known.has(photo.id)){cat.photos.push({...photo,sourceType:'sterilization',sourceId:r.id,note:photo.note||'目击照片'+(r.place?' · '+r.place:'')});known.add(photo.id);}
 }
 reconcileDerived(store,asOf);reconcileLocations(store);syncRefundReviews(store);
 // Stable source ids ensure repeated saves/reloads do not duplicate linked records.
 for(const r of active('rescue'))if(r.status==='已结束'&&r.outcome==='转寄养'&&!store.foster.some(f=>f.sourceRescueId===r.id))store.foster.unshift({id:'AUTO-F-'+r.id,cat:r.cat||'',catId:r.catId||'',place:'',caregiver:'',owner:'',date:r.completedDate||asOf,endDate:'',status:'待安置',outcome:'',note:r.issue||'',photos:[...(r.photos||[])],segments:[],checklist:{},sourceRescueId:r.id});
 for(const f of active('foster'))if(f.status==='已结束'&&f.outcome==='已领养'&&!active('cats').some(c=>sameCat(f,{catId:c.id,cat:c.name})&&catCategory(store,c)==='去了喵星')&&!f.externalAdoption&&!store.adoption.some(a=>a.sourceFosterId===f.id)){
  let a=active('adoption').find(a=>a.cat===f.cat&&['有意向领养人','已领养'].includes(a.status));
  if(!a){a={id:'AUTO-A-'+f.id,cat:f.cat,catId:f.catId||'',applicant:'',owner:'',date:f.completedDate||asOf,autoCreatedByFoster:true,note:'由寄养结束自动建立',agreements:[],earlyInterval:7,regularInterval:30,lastFollowup:''};store.adoption.unshift(a);}
  a.sourceFosterId=f.id;a.status='已领养';a.adoptDate||=f.completedDate||asOf;
 }
 for(const a of active('adoption'))if(a.status==='已退养'&&!active('cats').some(c=>sameCat(a,{catId:c.id,cat:c.name})&&catCategory(store,c)==='去了喵星')&&!active('adoption').some(b=>b.cat===a.cat&&['无领养人','有意向领养人','已领养'].includes(b.status)))store.adoption.unshift({id:'RETURN-'+a.id,cat:a.cat,catId:a.catId||'',applicant:'',owner:'',date:a.returnDate||asOf,status:'无领养人',note:'上一段领养已结束，历史协议保留。',photos:[],followups:[],followupState:'待回访',nextFollowupDate:'',returnDate:'',agreements:[],earlyInterval:7,regularInterval:30,adoptDate:'',lastFollowup:'',sourceAdoptionId:a.id});
 const add=(type,r,date,title,result,amountCents,pendingCents)=>{if(wbValidDate(date)&&date<=asOf)works.push({sourceType:type,sourceId:r.id,title,category:type==='sales'?'文创销售':type==='movements'?'物资盘点':names[type],cat:r.cat||'公共事项',owner:r.owner||'',date,result,amountCents,pendingCents,auto:true});};
 for(const r of active('rescue'))if(['就医中','已结束'].includes(r.status))add('rescue',r,r.medicalDate||(r.status==='就医中'?r.date||asOf:r.completedDate||r.date),(r.cat||r.place||'未建档猫咪')+(r.status==='已结束'?' · 救助结束':' · 救助就医'),r.status==='已结束'?r.outcome||r.issue||'已结束':r.issue||'已就医，继续跟进');
 for(const r of active('foster'))if(r.status==='已结束')add('foster',r,r.completedDate||r.endDate||r.date,(r.cat||'未命名猫咪')+' · 寄养结束',r.outcome||r.note||'已结束');
 for(const r of active('adoption'))if(['已领养','已退养'].includes(r.status))add('adoption',r,r.adoptDate,(r.cat||'未命名猫咪')+' · 领养',r.applicant?'领养人：'+r.applicant:'已建立独立领养经历');
 for(const r of active('sterilization'))if(['住院中','已放归'].includes(r.status)&&wbValidDate(r.surgeryDate)&&r.surgeryDate<=asOf)add('sterilization',r,r.surgeryDate||(wbValidDate(r.date)&&r.date<=asOf?r.date:asOf),r.cat+' · 绝育手术',r.hospital||'住院中，继续跟进放归');
 for(const r of active('movements'))if(r.type==='盘点')add('movements',r,r.date,r.itemName+' · 物资盘点','实盘在库 '+r.quantity+' '+(store.inventory.find(i=>i.id===r.itemId)?.unit||''));
 const saleBills=active('finance'),getBill=s=>saleBills.find(b=>b.saleId===s.id);
 const onlineMonths=[...new Set(active('sales').filter(s=>s.channel==='线上').map(s=>s.date.slice(0,7)))];
 function salesTotals(rows){let confirmed=0,pending=0;for(const s of rows){const b=getBill(s);if(b?.status==='已入账')confirmed+=b.amountCents+saleBills.filter(a=>a.adjustmentOf===b.id).reduce((n,a)=>n+signedAmount(a),0);if(b?.status==='待确认')pending+=b.amountCents;}return {confirmed,pending};}
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

// Integrity rules shared by the browser and API. Existing histories are not silently merged.
const settledFinance=r=>!!r&&['已入账','已报销','已结清'].includes(r.status);
const financeCritical=['amountCents','flow','owner','creditor','receipt','linkType','linkId','date'];
const reviewKey=r=>JSON.stringify(financeCritical.map(k=>r?.[k]??''));
const signedAmount=r=>Number(r.amountCents||0)*(r.adjustmentSign===-1?-1:1);
function businessLinks(store,type,id){
 const all=businessTypes.flatMap(t=>(store[t]||[]).map(row=>({type:t,row,key:t+':'+row.id}))),seen=new Set([type+':'+id]);
 const refs=x=>[['sourceRescueId','rescue'],['sourceFosterId','foster'],['sourceAdoptionId','adoption'],['adoptionId','adoption']].filter(([key])=>x.row[key]).map(([key,t])=>t+':'+x.row[key]);
 let changed=true;while(changed){changed=false;for(const node of all){const links=refs(node);if(seen.has(node.key)||links.some(key=>seen.has(key))){for(const key of [node.key,...links])if(!seen.has(key)){seen.add(key);changed=true;}}}}
 return all.filter(n=>seen.has(n.key));
}
function catBusinesses(store,cat){return businessTypes.flatMap(type=>(store[type]||[]).filter(r=>sameCat(r,{catId:cat.id,cat:cat.name})).map(row=>({type,row})));}
function archiveCatError(store,cat){if(catCategory(store,cat)==='去了喵星')return '';return catBusinesses(store,cat).some(({type,row:r})=>!r.deletedAt&&({rescue:['待救助','就医中'],foster:['待安置','寄养中'],sterilization:['待绝育','住院中'],adoption:['无领养人','有意向领养人']}[type]||[]).includes(r.status))?'仍有未完成业务，请先处理业务后再归档':'';}
function deletionError(store,type,row){
 if(!row)return '记录不存在';
 if(type==='cats'&&catBusinesses(store,row).length)return archiveCatError(store,row)||'已有业务历史，请归档隐藏，不能删除猫咪档案';
 if(type==='finance'&&(settledFinance(row)||row.adjustmentOf))return '已入账或已结清账目不能删除，请新增关联冲销／调整记录';
 if(businessTypes.includes(type)&&(businessLinks(store,type,row.id).length>1||type==='adoption'&&(row.status==='已领养'||row.agreements?.length||row.followups?.length)))return '已有后续关联或归档资料，不能直接删除；请先核对关联记录';
 return '';
}
function memorialDateSignature(store,cat){return JSON.stringify([cat?.archiveStatus,cat?.memorialDate,cat?catBusinesses(store,cat).map(x=>[x.type,x.row.id,x.row.deletedAt||'',x.row.adoptDate,x.row.medicalDate,x.row.admissionDate,x.row.surgeryDate,x.row.releaseDate,x.row.completedDate,(x.row.followups||[]).map(e=>e.date),(x.row.segments||[]).map(e=>[e.startDate,e.endDate])]):[]]);}
function memorialDateError(store,cat,asOf=day()){
 const gone=catCategory(store,cat)==='去了喵星';if(!gone)return '';
 const date=cat.memorialDate||catBusinesses(store,cat).filter(x=>['rescue','foster'].includes(x.type)&&!x.row.deletedAt&&['去喵星','死亡'].includes(x.row.outcome)).map(x=>x.row.completedDate).filter(Boolean).sort()[0];if(!wbValidDate(date))return '';
 const actual=[];for(const {type,row:r}of catBusinesses(store,cat).filter(x=>!x.row.deletedAt)){
  if(type==='adoption'){actual.push(r.adoptDate,...(r.followups||[]).map(e=>e.date));}
  if(type==='rescue')actual.push(r.medicalDate,r.completedDate);
  if(type==='sterilization')actual.push(r.admissionDate,r.surgeryDate,r.releaseDate);
  if(type==='foster')for(const segment of r.segments||[])actual.push(segment.startDate,segment.endDate);
 }
 return actual.some(d=>wbValidDate(d)&&d<=asOf&&d>date)?'去喵星日期早于已登记的实际业务或回访日期，请先核对相关记录':'';
}
function financeChangeError(store,r,before,asOf=day()){
 if(r.deletedAt)return deletionError(store,'finance',before||r);
 if(before?.reviewDate&&before.status!=='待审核'&&reviewKey(before)===reviewKey(r)&&r.reviewDate!==before.reviewDate)return '实际审核日期已归档，不能在付款或备注修改时改写';
 if(before&&reviewKey(before)===reviewKey(r)&&JSON.stringify(r.reviewHistory||[])!==JSON.stringify(before.reviewHistory||[]))return '历史审核记录不能覆盖或删除';
 if(settledFinance(before)&&[...financeCritical,'paidDate','status','adjustmentOf','adjustmentSign'].some(k=>JSON.stringify(before[k]??'')!==JSON.stringify(r[k]??'')))return '已入账或已结清记录不能改写关键资料，请新增关联调整记录';
 if(['审核通过','未通过'].includes(r.status)&&(!before||before.status!==r.status)&&(!wbValidDate(r.reviewDate)||r.reviewDate<r.date||r.reviewDate>asOf))return '实际审核日期应在费用发生日至今天之间';
 if(r.status==='已报销'&&(!before||before.status!=='已报销'||before.paidDate!==r.paidDate)&&(!wbValidDate(r.reviewDate)||r.paidDate<r.reviewDate))return '实际付款日期不能早于实际审核日期；旧记录请补填审核日期';
 if(r.adjustmentOf){const original=(store.finance||[]).find(b=>b.id===r.adjustmentOf&&!b.deletedAt);if(!original||!settledFinance(original)||original.adjustmentOf||![-1,1].includes(r.adjustmentSign)||!r.note?.trim()||!wbValidDate(r.date)||r.date<(original.paidDate||original.date)||r.date>asOf)return '调整需关联有效原账目，填写调整原因及原收付款日至今天之间的日期';if(r.flow!==(original.flow==='收入'?'收入':'协会支出')||r.status!=='已入账'||r.paidDate!==r.date)return '调整方向或入账状态与原单不一致';const adjustments=(store.finance||[]).filter(b=>!b.deletedAt&&b.adjustmentOf===original.id&&b.id!==r.id);if(original.amountCents+adjustments.reduce((n,b)=>n+signedAmount(b),0)+signedAmount(r)<0)return '累计冲销金额不能超过原金额与补记金额之和';}
 return '';
}
function prepareFinanceChange(before,r,asOf=day()){
 if(before&&['审核通过','未通过'].includes(before.status)&&before.flow==='个人垫付'&&reviewKey(before)!==reviewKey(r)){
  if(r.status==='已报销')return '关键资料变更后需重新审核，不能同时登记报销';
  r.reviewHistory=[...(before.reviewHistory||[]),{reviewer:before.reviewer||'',reviewDate:before.reviewDate||'',recordedAt:before.reviewRecordedAt||'',snapshot:before.reviewSnapshot||Object.fromEntries(financeCritical.map(k=>[k,before[k]??'']))}];r.status='待审核';r.reviewDate='';r.reviewer='';r.reviewRecordedAt='';r.reviewSnapshot=null;
 }
 if(['审核通过','未通过'].includes(r.status)&&before?.status!==r.status){r.reviewDate=r.reviewDate||asOf;r.reviewRecordedAt=new Date().toISOString();r.reviewSnapshot=Object.fromEntries(financeCritical.map(k=>[k,r[k]??'']));}
 return '';
}
function businessIntegrityError(store,type,r,before,asOf=day()){
 if(r.deletedAt)return deletionError(store,type,before||r);
 const identityChanged=before&&!sameCat(before,r);
 if(identityChanged&&businessLinks(store,type,r.id).some(x=>x.type!==type||x.row.id!==r.id? !!(x.row.cat||x.row.catId)&&!sameCat(x.row,r):false))return '已有其他猫咪的关联记录，不能单独更换猫咪，请使用关联身份更正';
 const cat=wbActive(store,'cats').find(c=>sameCat(r,{catId:c.id,cat:c.name}));
 if(before&&type==='sterilization'&&before.surgeryDate&&['住院中','已放归'].includes(before.status)&&(!r.surgeryDate||!['住院中','已放归'].includes(r.status))&&cat?.neuterDerivation?.legacy&&!r.neuterCorrection)return '旧档案绝育依据不明确，请确认保留已绝育还是改为待确认';
 if(before&&['rescue','foster'].includes(type)&&before.status==='已结束'&&['去喵星','死亡'].includes(before.outcome)&&!(r.status==='已结束'&&['去喵星','死亡'].includes(r.outcome))&&cat?.memorialDerivation?.legacy&&!r.memorialCorrection)return '旧档案去喵星依据不明确，请确认保留还是撤销标记';
 if(r.neuterCorrection==='待确认'&&wbActive(store,'sterilization').some(x=>x.id!==r.id&&sameCat(x,r)&&['住院中','已放归'].includes(x.status)&&wbValidDate(x.surgeryDate)))return '还有其他已完成手术记录，请先核对，不能直接改为待确认';
 if(r.memorialCorrection==='撤销标记'&&['rescue','foster'].some(t=>wbActive(store,t).some(x=>(t!==type||x.id!==r.id)&&sameCat(x,r)&&x.status==='已结束'&&['去喵星','死亡'].includes(x.outcome))))return '还有其他去喵星依据，请先核对相关记录';
 const isNewStage=!before||before.deletedAt||identityChanged||before.status!==r.status;
 if(cat?.archivedAt&&isNewStage&&({rescue:['待救助','就医中'],foster:['待安置','寄养中'],sterilization:['待绝育','住院中'],adoption:['无领养人','有意向领养人']}[type]||[]).includes(r.status))return '猫咪档案已归档，请先取消归档后再开启业务';
 if(type==='foster'&&r.status==='寄养中'&&isNewStage&&wbActive(store,'foster').some(f=>f.id!==r.id&&f.status==='寄养中'&&sameCat(f,r)))return '这只猫已有进行中的寄养，请在原记录办理交接';
 if(type==='adoption'&&r.status==='已领养'){
  if((r.followups||[]).some(e=>e.date<r.adoptDate))return '领养日期不能晚于已有回访日期';
  if(before?.status==='已领养'&&before.adoptDate!==r.adoptDate){for(const f of wbActive(store,'foster').filter(f=>f.adoptionId===r.id||f.id===r.sourceFosterId)){if(f.status!=='已结束'||f.outcome!=='已领养'||![before.adoptDate,r.adoptDate].includes(f.completedDate))return '关联寄养已有独立更正，请先核对寄养结束日期';if((f.segments||[]).some(s=>s.startDate>r.adoptDate))return '领养日期不能早于关联寄养分段的开始日期';}}
 }
 return '';
}
function recordChangeError(store,type,r,before,asOf=day()){
 if(!r)return '';
 if(r.deletedAt&&!before?.deletedAt){const error=deletionError(store,type,before||r);if(error)return error;}
 if(type==='finance')return financeChangeError(store,r,before,asOf);
 if(type==='cats'){if(r.archivedAt&&!before?.archivedAt){const error=archiveCatError(store,r);if(error)return error;}return before&&before.memorialDate===r.memorialDate&&before.archiveStatus===r.archiveStatus?'':memorialDateError(store,r,asOf);}
 return '';
}
function businessDestination(type,r){if(!r)return '';if(type==='rescue')return r.status==='就医中'?r.hospital:r.status==='待救助'?r.place:r.status==='已结束'&&r.outcome==='放归'?r.releasePlace:'';if(type==='sterilization')return r.status==='住院中'?r.hospital:r.status==='已放归'?r.releasePlace:r.status==='待绝育'?r.place:'';if(type==='foster')return r.status==='寄养中'?r.place:r.status==='已结束'&&r.outcome==='已放归'?r.releasePlace:'';if(type==='adoption')return r.status==='已领养'?r.adoptPlace||'领养家庭':r.status==='已退养'?r.returnPlace:'';return '';}
function initLocation(store,cat){if(cat.locationHistory?.length)return;cat.locationHistory=[{id:'LOC-INITIAL-'+cat.id,kind:'initial',place:cat.discoveryPlace||cat.place||'',at:''}];const matching=catBusinesses(store,cat).filter(x=>!x.row.deletedAt&&businessDestination(x.type,x.row)===cat.place&&cat.place).sort((a,b)=>String(a.row.updatedAt||a.row.date||'').localeCompare(String(b.row.updatedAt||b.row.date||''))).at(-1);if(matching){cat.locationHistory[0].place=cat.discoveryPlace||'';cat.locationHistory.push({id:'LOC-LEGACY-'+cat.id,kind:'business',sourceType:matching.type,sourceId:matching.row.id,place:cat.place,at:matching.row.updatedAt||matching.row.date||'',legacy:true});}}
function pushLocation(store,cat,event){initLocation(store,cat);const last=cat.locationHistory.at(-1);if(last.kind===event.kind&&last.sourceType===event.sourceType&&last.sourceId===event.sourceId&&last.place===event.place&&last.changeKey===event.changeKey)return;cat.locationHistory.push({id:wbId('LOC'),at:new Date().toISOString(),...event});cat.place=event.place;}
function noteCatChange(store,before,cat){
 if(before&&cat.place!==before.place){const latest=cat.locationHistory?.at(-1),oldLatest=before.locationHistory?.at(-1);if(!latest||latest.id===oldLatest?.id||latest.place!==cat.place)pushLocation(store,cat,{kind:'manual',place:cat.place||''});}
 if(cat.archiveStatus==='去了喵星'&&before?.archiveStatus!=='去了喵星'&&!cat.memorialDerivation)cat.memorialManual=true;
 if(before&&cat.archiveStatus!=='去了喵星'&&before.archiveStatus==='去了喵星'){cat.memorialManual=false;delete cat.memorialDate;delete cat.memorialRegisteredAt;}
}
function reconcileLocations(store){for(const cat of wbActive(store,'cats')){initLocation(store,cat);const last=[...cat.locationHistory].reverse().find(e=>e.kind!=='business'||(store[e.sourceType]||[]).some(r=>r.id===e.sourceId&&!r.deletedAt&&sameCat(r,{catId:cat.id,cat:cat.name})));cat.place=last?.place||'';}}
function reconcileDerived(store,asOf=day()){
 for(const cat of wbActive(store,'cats')){
  const operations=wbActive(store,'sterilization').filter(r=>sameCat(r,{catId:cat.id,cat:cat.name})&&['住院中','已放归'].includes(r.status)&&wbValidDate(r.surgeryDate)&&r.surgeryDate<=asOf);
  if(operations.length){cat.neuterDerivation??={previousValue:cat.neuterStatus||'',legacy:cat.neuterStatus==='已绝育'};cat.neuterDerivation.sourceIds=operations.map(r=>r.id);cat.neuterStatus='已绝育';}
  else if(cat.neuterDerivation){if(cat.neuterDerivation.legacy)cat.neuterReviewRequired=true;else cat.neuterStatus=cat.neuterDerivation.previousValue;delete cat.neuterDerivation;}
  const deaths=['rescue','foster'].flatMap(type=>wbActive(store,type).filter(r=>sameCat(r,{catId:cat.id,cat:cat.name})&&r.status==='已结束'&&['去喵星','死亡'].includes(r.outcome)));
  if(deaths.length&&!cat.memorialManual){cat.memorialDerivation??={previousStatus:cat.archiveStatus||'',previousDate:cat.memorialDate||'',previousRegisteredAt:cat.memorialRegisteredAt||'',legacy:cat.archiveStatus==='去了喵星'};cat.memorialDerivation.sourceIds=deaths.map(r=>r.id);cat.archiveStatus='去了喵星';cat.memorialDate=deaths.map(r=>r.completedDate).sort()[0];cat.memorialRegisteredAt||=new Date().toISOString();}
  else if(!deaths.length&&cat.memorialDerivation){const origin=cat.memorialDerivation;if(origin.legacy)cat.memorialReviewRequired=true;else{cat.archiveStatus=origin.previousStatus;if(origin.previousDate)cat.memorialDate=origin.previousDate;else delete cat.memorialDate;if(origin.previousRegisteredAt)cat.memorialRegisteredAt=origin.previousRegisteredAt;else delete cat.memorialRegisteredAt;}delete cat.memorialDerivation;}
 }
}
function applyDerivedCorrection(store,type,before,after){const cat=wbActive(store,'cats').find(c=>sameCat(after,{catId:c.id,cat:c.name}));if(!cat)return;
 if(after.neuterCorrection){if(after.neuterCorrection==='待确认'){cat.neuterStatus='待确认';cat.neuterDerivation={previousValue:'待确认',legacy:false};}else if(after.neuterCorrection==='保留已绝育'){cat.neuterStatus='已绝育';cat.neuterDerivation={previousValue:'已绝育',legacy:false};}delete cat.neuterReviewRequired;}
 delete after.neuterCorrection;
 if(after.memorialCorrection){if(after.memorialCorrection==='撤销标记'){cat.archiveStatus='';cat.memorialManual=false;cat.memorialDerivation={previousStatus:'',legacy:false};}else if(after.memorialCorrection==='保留标记'){cat.memorialManual=true;}delete cat.memorialReviewRequired;}delete after.memorialCorrection;delete after.correctionChecked;
}
function syncRefundReviews(store){for(const sale of store.sales||[]){const bill=(store.finance||[]).find(b=>b.saleId===sale.id&&!b.deletedAt);if(!bill||!sale.cancelledAt)continue;if(bill.status==='待确认'){bill.status='已取消';continue;}if(bill.status!=='已入账')continue;const key=String(sale.cancelledAt);if(!bill.refundCheckedEvent&&!bill.refundReview&&bill.refundCheckedDate&&bill.refundCheckedDate>=key.slice(0,10))bill.refundCheckedEvent=key;bill.refundReviewEvent=key;bill.refundReview=bill.refundCheckedEvent!==key;}}

return {memorialDateSignature,settledFinance,signedAmount,reviewKey,prepareFinanceChange,financeChangeError,recordChangeError,deletionError,archiveCatError,businessLinks,noteCatChange,memorialDateError,initLocation,pushLocation,businessDestination,reconcileDerived,reconcileLocations,syncRefundReviews,archiveProfileError,catMatchesTab,businessRuleError,applyBusinessLinks,defaultSightingPlace,syncBusinessChange,day,catCategory,outreachStates,outreachError,announcementError,announcementKey,statuses:wbStatuses,id:wbId,active:wbActive,validDate:wbValidDate,addDays:wbAddDays,addMonth:wbAddMonth,followup:wbFollowup,migrate:wbMigrate,legacyMigrate:migrateData,reservations:wbReservations,available:wbAvailable,finance:wbFinance,sync:wbSync,normalize(store,asOf=day()){return wbSync(wbMigrate(migrateData(store),asOf),asOf);}};
});
