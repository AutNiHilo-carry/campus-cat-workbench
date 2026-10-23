const {isDeepStrictEqual} = require('node:util');
const domain=require('../shared-domain.js');
const {COLLECTIONS} = require('./store.cjs');
const roles=['admin','finance','adoption','member','viewer'];
const business=['rescue','foster','adoption','sterilization'];
const states={rescue:['待救助','就医中','已结束'],foster:['待安置','寄养中','已结束'],adoption:['无领养人','有意向领养人','已领养','已退养'],sterilization:['待绝育','住院中','已放归']};
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function assert(condition,message,status){if(!condition)fail(message,status);}
function publicUser(user){return {id:user.id,username:user.username,name:user.name,role:user.role,disabled:Boolean(user.disabled)};}
const financeAccess=u=>['admin','finance'].includes(u.role);
const agreementAccess=u=>['admin','adoption'].includes(u.role);
function project(state,user){
  const out=structuredClone(state);
  if(!financeAccess(user))out.finance=out.finance.filter(r=>r.flow==='个人垫付'&&r.createdBy===user.id);
  if(!agreementAccess(user))for(const row of out.adoption){row.agreements=[];row.deletedFiles=(row.deletedFiles||[]).filter(e=>e.key!=='agreements');}
  if(user.role!=='admin'){out.audit=[];out.activities=[];out.announcements=(out.announcements||[]).filter(r=>r.status==='已发布'&&!r.deletedAt);}
  return out;
}
function stripped(row){if(!row)return row;const copy=structuredClone(row);for(const key of ['createdBy','updatedBy','updatedAt','createdAt'])delete copy[key];return copy;}
function same(a,b){return isDeepStrictEqual(stripped(a),stripped(b));}
function authorizeChange(c,before,after,user,next){
  assert(user.role!=='viewer','只读账号不能修改数据',403);
  if(c==='cats'&&before?.discoveryPlace)assert(after.discoveryPlace===before.discoveryPlace,'发现地点首次登记后固定，不能修改');
  if(business.includes(c)&&before&&!(before.catId&&after.catId?before.catId===after.catId:before.cat===after.cat)&&after.identityCorrectionId)assert(user.role==='admin'&&after.identityCorrectionId!==before.identityCorrectionId&&after.identityCorrectionReason?.trim(),'关联身份更正仅限管理员并需填写原因',403);
  if(c==='announcements')assert(user.role==='admin','仅管理员可管理公告',403);
  if(c==='finance'){
    if(!financeAccess(user))assert(after.refundCheckedDate===before?.refundCheckedDate&&after.refundCheckedEvent===before?.refundCheckedEvent,'核对完成仅限财务',403);
    const generated=after.saleId&&next.sales.find(s=>s.id===after.saleId);
    if(!financeAccess(user)){
      if(generated){
        assert(!before||same({...before,title:after.title,date:after.date,owner:after.owner,note:after.note,receipt:after.receipt,amountCents:after.amountCents,status:after.status,refundReview:after.refundReview},after),'无权修改关联收入',403);
        assert(after.flow==='收入'&&after.amountCents===generated.amountCents,'销售收入金额不匹配');
        assert(!before?after.status==='待确认':after.status===before.status||before.status==='待确认'&&after.status==='已取消'&&generated.cancelledAt,'收入确认仅限财务',403);
        assert(after.refundReview===before?.refundReview||!!generated.cancelledAt&&after.refundReview===true||!before&&!after.refundReview,'退款核对仅限财务',403);
      }else{
        assert(after.flow==='个人垫付'&&after.status==='待审核'&&(!before||before.createdBy===user.id&&before.status==='待审核'),'仅可提交或修改本人待审核报销',403);
      }
    }
    assert(['收入','协会支出','个人垫付','协会欠款'].includes(after.flow),'无效收支类型');
    const allowed={收入:['待确认','已入账','已取消'],协会支出:['已入账'],个人垫付:['待审核','审核通过','未通过','已报销'],协会欠款:['待付款','已结清']};
    assert(allowed[after.flow].includes(after.status),'账目状态与收支类型不匹配');
    if(before?.flow===after.flow&&before.status!==after.status){
      const transitions={待确认:['已入账','已取消'],待审核:['审核通过','未通过'],审核通过:['已报销','待审核'],未通过:['待审核'],待付款:['已结清']};
      assert(transitions[before.status]?.includes(after.status),'不允许跳过财务审核或重复付款');
    }
    if(before&&['已入账','已报销','已结清'].includes(before.status))assert(before.amountCents===after.amountCents&&before.flow===after.flow&&before.status===after.status,'已入账或已结清金额不可直接改写');
    if(!before)assert(['待确认','待审核','待付款','已入账'].includes(after.status)&&!(after.flow==='个人垫付'&&after.status!=='待审核')&&!(after.flow==='协会欠款'&&after.status!=='待付款'),'新账目必须从初始状态开始');
  }
  if(c==='adoption'){
    if(!agreementAccess(user))assert(isDeepStrictEqual(before?.agreements||[],after.agreements||[]),'协议仅限管理员及领养负责人管理',403);
    if(before&&(before.agreements?.length||before.followups?.length||['已领养','已退养'].includes(before.status))&&!(after.identityCorrectionId&&after.identityCorrectionId!==before.identityCorrectionId))assert(before.catId&&after.catId?before.catId===after.catId:before.cat===after.cat,'已有归档记录的领养经历不能更换猫咪');
    if(before&&['已领养','已退养'].includes(before.status)&&before.applicant)assert(before.applicant===after.applicant,'更换领养人请新建经历，原协议和回访保留');
    if(before?.followups?.length)for(const entry of before.followups)assert(after.followups?.some(e=>isDeepStrictEqual(e,entry)),'已保存的回访记录不能被覆盖或删除');
  }
  if(c==='movements'&&before)assert(same({...before,cat:after.cat,catId:after.catId},after),'库存流水不能直接编辑');
  if(c==='loans'&&before){assert(before.itemId===after.itemId&&before.quantity===after.quantity,'借用来源和数量不能改写');if(before.returnedDate)assert(before.returnedDate===after.returnedDate&&before.returnItemId===after.returnItemId,'器材不能重复归还');}
  if(c==='sales'&&before&&(before.deliveredDate||before.cancelledAt))assert(same({...before,cat:after.cat,catId:after.catId},after),'已交付或取消的订单不能重复操作');
  if(c==='sales')assert(!after.deletedAt,'订单请使用取消流程，不能直接删除');
}
function shape(row){
  assert(row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(row.id),'记录结构或编号无效');
  function walk(value){
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(key==='id')assert(typeof item==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item),'记录编号包含不允许的字符');
      if(['photos','agreements','followups','deletedFiles','comments','aliases','lines','segments','hospitalHistory'].includes(key))assert(Array.isArray(item),'字段 '+key+' 必须是列表');
      if(['name','cat','catId','hospital','place','issue','caregiver','status','description','note','title','result','manualResult'].includes(key))assert(typeof item==='string','字段 '+key+' 必须是文字');
      if(Array.isArray(item))for(const entry of item){assert(entry!==null&&entry!==undefined,'列表不能包含空记录');walk(entry);}else walk(item);
    }
  }
  walk(row);
}
function applyChanges(state,changes,user){
  assert(Array.isArray(changes)&&changes.length<=1000,'修改数量超出限制');
  const view=project(state,user),next=structuredClone(state),seen=new Set(),accepted=[];
  for(const change of changes){
    assert(change&&typeof change==='object'&&!Array.isArray(change),'修改记录格式有误');
    const {collection:c,id,before,after}=change;
    assert(COLLECTIONS.includes(c)&&typeof id==='string'&&id.length<=120,'无效记录类型或编号');
    assert(!seen.has(c+':'+id),'同一记录不能重复修改');seen.add(c+':'+id);
    assert(after&&typeof after==='object'&&!Array.isArray(after)&&after.id===id,'使用回收站删除，不支持直接清除记录');
    shape(after);
    const current=state[c].find(r=>r.id===id),visible=view[c].find(r=>r.id===id);
    assert(!current||visible,'没有此记录的访问权限',403);
    assert(same(visible||null,before||null),'记录已被其他人修改，请刷新后重试',409);
    if(c==='monthly'&&(current?.auto||after.auto)){
      if(after.manualResult!==before?.manualResult&&typeof after.manualResult==='string'){assert(current,'不能手动创建自动统计');const row=next[c].find(r=>r.id===id);row.manualResult=after.manualResult;row.result=after.manualResult;accepted.push(change);}
      continue;
    }
    const value=structuredClone(after);if(c==='cats'&&value.archiveStatus==='已去喵星')value.archiveStatus='去了喵星';if(['rescue','foster'].includes(c)&&['死亡','去了喵星','已去喵星'].includes(value.outcome))value.outcome='去喵星';
    if(c==='sterilization'&&!current)value.surgeryDate??='';
    if(c==='sterilization'&&value.status==='住院中'&&current?.status!=='住院中')value.admissionDate=value.admissionDate||today();
    if(!current&&['rescue','sterilization'].includes(c)&&!value.place?.trim()){const cat=next.cats.find(cat=>value.catId?cat.id===value.catId:cat.name===value.cat);value.place=domain.defaultSightingPlace(next,cat);}
    if(c==='cats'&&value.archiveStatus==='去了喵星')value.memorialRegisteredAt=current?.memorialRegisteredAt||new Date().toISOString();
    if(c==='cats'&&!current){value.discoveryPlace??=value.place||'';if(!value.place)value.place=value.discoveryPlace;}
    if(c==='adoption'&&!agreementAccess(user)){assert(!(value.agreements||[]).length,'协议仅限管理员及领养负责人管理',403);value.agreements=current?.agreements||[];value.deletedFiles=[...(value.deletedFiles||[]).filter(e=>e.key!=='agreements'),...(current?.deletedFiles||[]).filter(e=>e.key==='agreements')];}
    value.createdBy=current?.createdBy||user.id;value.createdAt=current?.createdAt||new Date().toISOString();value.updatedBy=user.id;value.updatedAt=new Date().toISOString();
    if(c==='finance'){const error=domain.prepareFinanceChange(current,value,today());assert(!error,error);}
    if(c==='finance'&&current?.status==='待审核'&&['审核通过','未通过'].includes(value.status)){value.reviewer=user.name;value.reviewDate=value.reviewDate||today();value.reviewRecordedAt=new Date().toISOString();}
    const index=next[c].findIndex(r=>r.id===id);if(index<0)next[c].unshift(value);else next[c][index]=value;
    accepted.push({...change,after:value});
  }
  for(const change of accepted)authorizeChange(change.collection,state[change.collection].find(r=>r.id===change.id),next[change.collection].find(r=>r.id===change.id),user,next);
  const hospitalError=domain.prepareHospitalChanges(next,state,accepted);assert(!hospitalError,hospitalError);const dischargeError=domain.prepareHospitalDischarge(next,state,accepted);assert(!dischargeError,dischargeError);const linkedDateError=domain.prepareLinkedDates(next,state,accepted);assert(!linkedDateError,linkedDateError);
  // Income is reconciled from orders even when the acting member cannot read the finance ledger.
  for(const sale of next.sales){
    const original=state.finance.find(b=>b.saleId===sale.id),linked=next.finance.filter(b=>b.saleId===sale.id);
    if(original)next.finance=next.finance.filter(b=>b.saleId!==sale.id||b.id===original.id);
    let bill=next.finance.find(b=>b.saleId===sale.id);
    if(!bill){bill={id:'AUTO-BILL-'+sale.id,saleId:sale.id,flow:'收入',status:'待确认',paidDate:'',createdBy:user.id};next.finance.unshift(bill);}
    if(original?.status==='已入账')assert(original.amountCents===sale.amountCents,'已确认收入的订单金额不能改写');
    if(bill.status==='待确认'||!original)Object.assign(bill,{title:sale.title,amountCents:sale.amountCents,date:sale.date,owner:sale.owner||'',linkType:'sales',linkId:sale.id,note:sale.channel+' · '+sale.delivery});
  }
  domain.syncRefundReviews(next);
  for(const change of accepted)if(change.collection==='cats')domain.noteCatChange(next,state.cats.find(c=>c.id===change.id),next.cats.find(c=>c.id===change.id));
  for(const change of accepted){const policy=domain.recordChangeError(next,change.collection,next[change.collection].find(r=>r.id===change.id),state[change.collection].find(r=>r.id===change.id));assert(!policy,policy);}
  for(const type of business)for(const row of next[type]){const prior=state[type].find(r=>r.id===row.id);if(same(prior,row)||row.deletedAt&&!accepted.some(c=>c.collection===type&&c.id===row.id))continue;const error=domain.businessRuleError(next,type,row,prior);assert(!error,error);domain.syncBusinessChange(next,type,prior,row);}
  domain.reconcileDerived(next);domain.reconcileLocations(next);domain.syncRefundReviews(next);
  return {next,accepted};
}
function validateState(next,old,files){
  const active=c=>next[c].filter(r=>!r.deletedAt),oldItem=id=>old.inventory.find(i=>i.id===id),future=today();
  for(const c of COLLECTIONS){
    assert(Array.isArray(next[c])&&next[c].length<=20000,'数据量超过本地版限制');
    const ids=new Set();for(const row of next[c]){shape(row);assert(typeof row.id==='string'&&!ids.has(row.id),'记录编号重复');ids.add(row.id);assert(JSON.stringify(row).length<=300000,'单条记录过大');}
  }
  const names=new Map();for(const cat of active('cats')){const chronology=domain.memorialDateError(next,cat,future),priorCat=old.cats.find(c=>c.id===cat.id);assert(!chronology||priorCat&&domain.memorialDateSignature(next,cat)===domain.memorialDateSignature(old,priorCat),chronology);const error=domain.archiveProfileError(cat,old.cats.find(c=>c.id===cat.id),future);assert(!error,error);assert(cat.discoveryPlace===undefined||typeof cat.discoveryPlace==='string'&&cat.discoveryPlace.length<=150,'发现地点应为150字以内文字');assert(cat.archiveStatus===undefined||['','寄养中','已领养','去了喵星'].includes(cat.archiveStatus),'无效档案标记');assert(typeof cat.name==='string'&&cat.name.trim().length>0&&cat.name.length<=80,'猫咪名字无效');for(const name of [cat.name,...cat.aliases||[]]){const key=String(name).normalize('NFKC').toLowerCase().replace(/\s+/g,'');assert(key&&(!names.has(key)||names.get(key)===cat.id),'猫咪名字或曾用名重复');names.set(key,cat.id);}}
  for(const c of business)for(const r of active(c)){
    const prior=old[c].find(row=>row.id===r.id);const ruleError=domain.businessRuleError(next,c,r,prior,future);assert(!ruleError,ruleError);
    assert(states[c].includes(r.status),'无效业务状态');
    if(r.catId)assert(next.cats.some(cat=>cat.id===r.catId&&cat.name===r.cat),'关联猫咪档案不一致');
    if(r.cat)assert(r.catId&&next.cats.some(cat=>cat.id===r.catId),'请关联有效猫咪档案');
    for(const key of ['admissionDate','hospitalSinceDate','surgeryDate','releaseDate','completedDate','medicalDate','adoptDate','lastFollowup','postDate'])if(r[key])assert(date(r[key])&&r[key]<=future,'实际日期格式有误或晚于今天');
    if(['rescue','sterilization'].includes(c)&&r.hospitalHistory){assert(Array.isArray(r.hospitalHistory)&&r.hospitalHistory.length<=100,'医院历史数量无效');for(const h of r.hospitalHistory){assert(h.hospital?.trim()&&date(h.endDate)&&h.endDate<=future&&(!h.startDate||date(h.startDate)&&h.startDate<=h.endDate)&&(!h.surgeryDate||date(h.surgeryDate)&&h.surgeryDate<=h.endDate),'医院历史日期或名称无效');assert(h.cost===null||h.cost===undefined||typeof h.cost==='number'&&Number.isFinite(h.cost)&&h.cost>=0&&h.cost<=1000000,'原医院费用无效');}}
    if(c==='sterilization'&&r.status==='住院中')assert(r.hospital?.trim()&&!['待确定','待补充','未填写'].includes(r.hospital),'住院中必须填写医院');
    if(c==='sterilization'&&r.status==='已放归')assert(date(r.releaseDate)&&r.releasePlace?.trim()&&(!r.surgeryDate||r.releaseDate>=r.surgeryDate),'放归信息不完整');
    if(c==='rescue'&&r.status==='就医中'&&(prior?.status!=='就医中'||prior?.hospital!==r.hospital))assert(r.hospital?.trim()&&!['待确定','待补充','未填写'].includes(r.hospital),'就医中必须填写医院名称');
    if(c==='rescue')assert((r.status!=='待救助'||r.place?.trim())&&r.issue?.trim(),'待救助需填写最近目击地点，救助记录需填写发现情况');
    if(c==='foster'&&r.situation!==undefined)assert(typeof r.situation==='string'&&r.situation.length<=1000,'寄养情况最多1000字');
    if(c==='foster'&&r.status==='寄养中')assert(r.place?.trim()&&r.caregiver?.trim(),'寄养中需填写地点和照护人');
    if(c==='foster'&&r.status==='寄养中')assert(date(r.date)&&r.date<=future,'入住日期不能晚于今天');
    if(['rescue','foster'].includes(c)&&r.status==='已结束'&&['放归','已放归'].includes(r.outcome)&&(!prior||prior.status!=='已结束'||prior.outcome!==r.outcome||prior.releasePlace!==r.releasePlace))assert(r.releasePlace?.trim()&&date(r.releaseDate||r.completedDate),'放归时需填写实际放归地点和日期');
    if(r.status==='已结束'&&prior?.status!=='已结束'){
      if(c==='rescue')assert(['去喵星','死亡','放归','转寄养'].includes(r.outcome),'结束救助请选择后续结果');
      if(c==='foster')assert(['已领养','已放归','去喵星'].includes(r.outcome),'结束寄养请选择去向');
      assert(date(r.completedDate)&&(!date(r.medicalDate||r.date)||r.completedDate>=(r.medicalDate||r.date)),'结束日期不能早于开始或就医日期');
    }
    if(c==='adoption'&&['已领养','已退养'].includes(r.status))assert(date(r.adoptDate),'请填写实际领养日期');
    if(c==='adoption')for(const entry of r.followups||[])assert(entry.id&&date(entry.date)&&entry.date>=r.adoptDate&&entry.date<=future&&String(entry.note||'').length<=300&&(entry.photos||[]).length<=12,'回访日期、文字或照片数量无效');
  }
  for(const type of ['events','sponsors'])for(const row of active(type)){const error=require('../shared-domain.js').outreachError(type,row,next,future);assert(!error,error);}
  for(const row of active('announcements')){const error=require('../shared-domain.js').announcementError(row);assert(!error,error);}
  const adopted=new Set();for(const a of active('adoption').filter(a=>a.status==='已领养')){const key=a.catId||a.cat;assert(!adopted.has(key),'同一只猫只能有一段有效领养');adopted.add(key);}
  for(const i of next.inventory){const before=oldItem(i.id);if(!before)continue;const borrowing=next.loans.some(l=>!l.deletedAt&&!l.returnedDate&&l.itemId===i.id),occupied=next.sales.some(s=>!s.deletedAt&&!s.deliveredDate&&!s.cancelledAt&&s.channel==='线上'&&s.lines.some(l=>l.itemId===i.id));if(borrowing)assert(i.kind===before.kind&&i.unit===before.unit&&i.place===before.place,'器材未归还前不能修改使用方式、单位或地点');if(borrowing||occupied||i.reserved>0){assert(!i.deletedAt,'存在借出或预留的物资不能删除');assert(i.group===before.group&&i.kind===before.kind&&i.unit===before.unit,'处理借出和预留后才能修改物资类型或单位');}}
  const locationKeys=new Set();for(const i of active('inventory')){
    assert(['日常','文创'].includes(i.group)&&['消耗品','可借用器材'].includes(i.kind),'无效物资分类');
    assert(Number.isInteger(i.qty)&&i.qty>=0&&i.qty<=1000000&&Number.isInteger(i.reserved||0)&&(i.reserved||0)>=0,'库存或预留数量无效');
    const key=JSON.stringify([i.group,i.name,i.variant||'',i.kind,i.unit,String(i.place).trim()]);assert(!locationKeys.has(key),'同款物资同地点重复');locationKeys.add(key);
    const reserved=active('sales').filter(s=>s.channel==='线上'&&!s.deliveredDate&&!s.cancelledAt).flatMap(s=>s.lines).filter(l=>l.itemId===i.id).reduce((n,l)=>n+l.quantity,0);
    assert(i.qty>=(i.reserved||0)+reserved,'库存不足，不能超卖或低于预留数量');
  }
  const expected=new Map(old.inventory.map(i=>[i.id,i.qty]));
  for(const m of next.movements.filter(m=>!old.movements.some(x=>x.id===m.id))){
    assert(date(m.date)&&m.date<=future&&Number.isInteger(m.quantity)&&m.quantity>=0,'库存流水日期或数量无效');
    if(!m.itemId||!oldItem(m.itemId))continue;
    let qty=expected.get(m.itemId);
    if(['修改数量','盘点'].includes(m.type)){assert(m.beforeQty===qty&&m.afterQty===m.quantity,'库存修改前后数量不一致');qty=m.quantity;}
    else if(['入库','归还'].includes(m.type))qty+=m.quantity;
    else if(['领用','借出','售出','发货','自提交付'].includes(m.type))qty-=m.quantity;
    else assert(['预留','取消预留'].includes(m.type),'未知库存操作');
    expected.set(m.itemId,qty);
  }
  const newMovements=next.movements.filter(m=>!old.movements.some(prior=>prior.id===m.id));
  for(const m of newMovements.filter(m=>['借出','归还'].includes(m.type))){
    const loan=next.loans.find(l=>l.id===m.loanId&&!l.deletedAt);assert(loan,'借还流水必须关联有效借还单号');
    assert(m.quantity===loan.quantity,'借还流水数量与借还单不一致');
    if(m.type==='借出')assert(!old.loans.some(l=>l.id===loan.id)&&m.itemId===loan.itemId&&m.date===loan.date&&m.id===loan.movementId,'借出流水与借还单不对应');
    else {assert(old.loans.some(l=>l.id===loan.id&&!l.returnedDate)&&loan.returnedDate===m.date&&m.itemId===loan.returnItemId,'归还流水与借还单不对应或已归还');const source=next.inventory.find(i=>i.id===loan.itemId),target=next.inventory.find(i=>i.id===m.itemId);assert(source&&target&&['group','name','variant','kind','unit'].every(key=>(source[key]||'')===(target[key]||'')),'归还器材与借出来源不一致');}
    assert(next.movements.filter(row=>row.loanId===loan.id&&row.type===m.type).length===1,'同一借还单不能重复借出或归还');
  }
  for(const s of active('sales')){
    const priorSale=old.sales.find(prior=>prior.id===s.id);
    assert(Array.isArray(s.lines)&&s.lines.length>0&&s.lines.length<=20,'订单商品信息无效');
    if(s.channel==='线下'&&!priorSale)assert(s.deliveredDate===s.date&&!s.cancelledAt,'线下义卖须按活动日期登记实际交付');
    assert(!(s.deliveredDate&&s.cancelledAt),'订单不能同时交付与取消');
    if(s.channel==='线上')assert(['快递','自提'].includes(s.delivery),'请选择有效交付方式');
    if(s.deliveredDate&&!priorSale?.deliveredDate){
      assert(date(s.deliveredDate)&&s.deliveredDate>=s.date&&s.deliveredDate<=future,'交付日期应在订单日至今天之间');
      if(s.channel==='线上'){
        const deliveries=newMovements.filter(m=>m.saleId===s.id&&['发货','自提交付'].includes(m.type));
        assert(deliveries.length===s.lines.length,'交付订单必须同时登记每款商品的出库流水');
        for(const line of s.lines)assert(deliveries.filter(m=>m.itemId===line.itemId&&m.date===s.deliveredDate&&m.type===(s.delivery==='自提'?'自提交付':'发货')).reduce((n,m)=>n+m.quantity,0)===line.quantity,'交付出库数量、日期或方式与订单不一致');
      }
    }
    assert(['线上','线下'].includes(s.channel)&&date(s.date)&&s.date<=future&&Array.isArray(s.lines)&&s.lines.length>0&&s.lines.length<=20,'订单信息不完整');
    const seen=new Set();for(const l of s.lines){assert(next.inventory.some(i=>i.id===l.itemId&&i.group==='文创')&&!seen.has(l.itemId)&&Number.isInteger(l.quantity)&&l.quantity>0,'订单商品或数量无效');seen.add(l.itemId);}
    assert(Number.isSafeInteger(s.amountCents)&&s.amountCents>0&&s.amountCents<=100000000,'订单金额无效');
    if(s.channel==='线上')assert(s.amountCents===s.lines.reduce((sum,l)=>sum+l.quantity*l.unitPriceCents,0),'订单总额不等于商品金额');
    if(s.channel==='线下'&&!old.sales.some(x=>x.id===s.id))for(const l of s.lines)if(oldItem(l.itemId))expected.set(l.itemId,expected.get(l.itemId)-l.quantity);
  }
  for(const movement of newMovements.filter(m=>['发货','自提交付'].includes(m.type))){const sale=next.sales.find(s=>s.id===movement.saleId);assert(sale&&sale.channel==='线上'&&sale.deliveredDate&&!sale.cancelledAt&&!old.sales.find(s=>s.id===sale.id)?.deliveredDate,'订单出库流水必须关联本次有效交付');}
  for(const i of next.inventory)if(oldItem(i.id))assert(i.qty===expected.get(i.id),'库存变化必须与入出库、借还或销售流水一致');
  for(const loan of next.loans){const prior=old.loans.find(l=>l.id===loan.id);if(!prior)assert(next.movements.some(m=>m.loanId===loan.id&&m.type==='借出'&&m.itemId===loan.itemId&&m.quantity===loan.quantity),'借出记录必须关联实际出库流水');if(loan.returnedDate&&!prior?.returnedDate)assert(date(loan.returnedDate)&&loan.returnedDate>=loan.date&&loan.returnedDate<=future&&next.movements.some(m=>!old.movements.some(x=>x.id===m.id)&&m.loanId===loan.id&&m.type==='归还'&&m.quantity===loan.quantity&&m.itemId===loan.returnItemId),'归还必须关联实际入库流水');}
  for(const bill of active('finance'))if(['已入账','已报销','已结清'].includes(bill.status))assert(date(bill.paidDate)&&bill.paidDate>=bill.date&&bill.paidDate<=future,'实际收付款日期无效');
  for(const row of active('monthly').filter(row=>!row.auto))assert(date(row.date)&&row.date<=future&&typeof row.title==='string'&&row.title.trim()&&typeof row.result==='string'&&row.result.trim(),'手动工作记录需填写名称、有效日期和成果');
  for(const b of active('finance')){const policy=domain.financeChangeError(next,b,old.finance.find(x=>x.id===b.id),future);assert(!policy,policy);assert(Number.isSafeInteger(b.amountCents)&&b.amountCents>=0&&b.amountCents<=100000000&&date(b.date)&&b.date<=future,'账目金额或日期无效');if(b.saleId){const sale=next.sales.find(s=>s.id===b.saleId);assert(sale&&sale.amountCents===b.amountCents,'销售账目与订单金额不一致');}}
  // Only registered uploads can be attached; agreement files cannot be exposed as ordinary photos.
  function refs(value,key=''){
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const item of value)refs(item,key);return;}
    if(value.id&&value.name&&(key==='photos'||key==='agreements'||key==='avatar'||key==='file')){const f=files(value.id);assert(f,'附件尚未上传或不存在');if(key!=='agreements'&&key!=='file')assert(f.kind==='image','协议文件不能放入公开照片区');return;}
    for(const [k,v]of Object.entries(value))refs(v,k);
  }
  for(const c of COLLECTIONS)for(const row of next[c])refs(row);
}
module.exports={roles,today,date,fail,assert,publicUser,financeAccess,agreementAccess,project,same,applyChanges,validateState};
