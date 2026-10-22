// UI mutations use the same pure migration, aggregation and date rules as the API.
const wbStatuses=DanmiaoDomain.statuses,wbId=DanmiaoDomain.id,wbActive=DanmiaoDomain.active,wbValidDate=DanmiaoDomain.validDate,wbAddDays=DanmiaoDomain.addDays,wbAddMonth=DanmiaoDomain.addMonth,wbReservations=DanmiaoDomain.reservations,wbAvailable=DanmiaoDomain.available;
let wbFinance=DanmiaoDomain.finance;
function wbFollowup(row,asOf=today){return DanmiaoDomain.followup(row,asOf,data);}
function wbMigrate(store){return DanmiaoDomain.migrate(store,today);}
function wbSync(store,asOf=today){return DanmiaoDomain.sync(store,asOf);}
function wbError(text){toast(text);return false}
function wbBusinessSave(type,values,id){
 const old=find(type,id),v={...values,owner:(values.owner||'').trim()};if(['rescue','foster'].includes(type)&&['死亡','去了喵星','已去喵星'].includes(v.outcome))v.outcome='去喵星';if(id&&(!old||old.deletedAt))return wbError('记录已删除或不可用，请返回列表刷新');
 v.cat=String(v.cat||'').trim();const exact=wbFindCat(v.cat);if(exact){if(v.cat!==exact.name)v.catAlias=v.cat;v.cat=exact.name;}else if(v.cat&&wbHomophoneCats(v.cat).length&&!values.identityDecision)return wbError('发现同音猫名，请先确认是否为同一只猫');
 if(v.cat&&!exact&&data.cats.some(c=>c.deletedAt&&(wbCatNameKey(c.name)===wbCatNameKey(v.cat)||(c.aliases||[]).some(a=>wbCatNameKey(a)===wbCatNameKey(v.cat)))))return wbError('这只猫的档案在回收站，请先恢复原档案');delete v.identityDecision;
 if(type==='adoption')v.status=({'待领养':'无领养人','沟通中':'有意向领养人','试养中':'有意向领养人','未通过':'无领养人'})[v.status]||v.status;
 if(!wbStatuses[type]?.includes(v.status)&&!(type==='adoption'&&v.status==='已退养'))return wbError('请选择有效状态');
 if(['rescue','sterilization'].includes(type)){v.place=String(values.place??old?.place??'').trim();if(!old&&!v.place)v.place=DanmiaoDomain.defaultSightingPlace(data,exact);}
 if(type==='rescue'){
  if(v.outcome==='死亡')v.outcome='去喵星';
  v.hospital=String(values.hospital??old?.hospital??'').trim();
  if(v.status==='就医中'&&(!old||old.status!=='就医中'||Object.hasOwn(values,'hospital'))&&(!v.hospital||['待确定','待补充','未填写'].includes(v.hospital)))return wbError('请填写医院名称');
  if(v.status==='待救助'&&!v.place?.trim()||!v.issue?.trim())return wbError('请填写最近目击地点和情况，猫咪档案可以后补');
  if(v.status==='就医中')v.medicalDate=old?.medicalDate||(old?.status==='就医中'&&wbValidDate(old.date)&&old.date<=today?old.date:today);
  else if(old?.medicalDate)v.medicalDate=old.medicalDate;
  if(v.status==='已结束'&&!['去喵星','放归','转寄养'].includes(v.outcome))return wbError('结束救助时请选择后续结果');
  if(v.status==='已结束')v.completedDate=v.completedDate||today;
 }else if(!v.cat?.trim())return wbError('请填写猫咪名称或临时称呼');
 if(type==='sterilization'){
  v.hospital=String(v.hospital??old?.hospital??'').trim();
  if(v.status==='住院中'&&(!v.hospital||['待确定','待补充','未填写'].includes(v.hospital)))return wbError('请填写医院名称');
  if(!Object.hasOwn(values,'surgeryDate'))v.surgeryDate=old?.surgeryDate||'';

  if(v.surgeryDate&&(!wbValidDate(v.surgeryDate)||v.surgeryDate>today))return wbError('手术日期应填写实际完成日期，不能晚于今天');
  if(v.status==='已放归'&&(!v.releasePlace?.trim()||!wbValidDate(v.releaseDate)||v.surgeryDate&&v.releaseDate<v.surgeryDate||v.releaseDate>today))return wbError('已放归需填写有效放归日期及位置');
  if(!Object.hasOwn(values,'cost'))v.cost=old?.cost??null;v.cost=v.cost===null||v.cost===undefined||v.cost===''?null:Number(v.cost);if(v.cost!==null&&(!Number.isFinite(v.cost)||v.cost<0))return wbError('费用应为非负金额');if(v.status==='住院中')v.admissionDate=old?.admissionDate||(old?.status==='住院中'&&wbValidDate(old.date)&&old.date<=today?old.date:today);v.date=v.surgeryDate||v.admissionDate||old?.date||today;
 }
 if(type==='foster'){
  if(v.situation!==undefined&&(typeof v.situation!=='string'||v.situation.length>1000))return wbError('寄养情况最多1000字');
  if(v.status==='寄养中'&&(!v.place?.trim()||!v.caregiver?.trim()))return wbError('入住寄养时请填写地点及实际照护人');
  if(v.status==='已结束'&&!['已领养','已放归','去喵星'].includes(v.outcome))return wbError('请填写寄养结束去向');
  if(v.status==='已结束')v.completedDate=v.completedDate||today;
  v.segments=clone(old?.segments||[]);const last=v.segments.at(-1),changed=old&&old.status==='寄养中'&&(v.status!=='寄养中'||v.place!==old.place||v.caregiver!==old.caregiver);
  if(old?.status==='寄养中'&&v.status==='寄养中'&&!changed&&last&&!last.endDate&&v.date!==old.date)last.startDate=v.date;
  if(changed&&last&&!last.endDate)last.endDate=v.status==='已结束'?v.completedDate:v.transitionDate||today;
  if(v.status==='寄养中'&&(!last||last.endDate||last.place!==v.place||last.caregiver!==v.caregiver)){
   const start=changed?(v.transitionDate||(v.date===old.date?today:v.date||today)):v.date||today;
   if(!wbValidDate(start)||start>today||last?.endDate&&start<last.endDate)return wbError('新一段入住日期不能早于上段结束日期或晚于今天');
   v.date=start;v.segments.push({id:wbId('SEG'),place:v.place,caregiver:v.caregiver,startDate:start,endDate:'',note:v.note||'',situation:v.situation||''});
  }
  if(v.status==='待安置'){v.place='';v.caregiver='';v.waitingSince=old?.status==='待安置'?(old.waitingSince||old.date):v.transitionDate||v.date||today;v.date=v.waitingSince;}
 }
 if(type==='adoption'){
  if(old&&old.cat!==v.cat&&(['已领养','已退养'].includes(old.status)||old.agreements?.length||old.followups?.length))return wbError('这段领养已有归档记录，不能更换猫咪，请新建领养经历');
  v.postStatus=wbPostStatus(v.postStatus??old?.postStatus);v.postDate=String(v.postDate??old?.postDate??'').trim();if(v.postDate&&(!wbValidDate(v.postDate)||v.postDate>today))return wbError('领养帖日期不能晚于今天');if(v.postStatus==='已上领养贴'&&!v.postDate&&wbPostStatus(old?.postStatus)!=='已上领养贴')v.postDate=today;
  if(['已领养','已退养'].includes(v.status)&&(!wbValidDate(v.adoptDate)||v.adoptDate>today))return wbError('请填写不晚于今天的实际领养日期');
  if(v.status==='已领养'&&active('adoption').some(a=>a.id!==id&&a.cat===v.cat&&a.status==='已领养'))return wbError('这只猫已有进行中的领养经历，请先结束原经历');
  if(old&&['已领养','已退养'].includes(old.status)&&old.applicant&&v.applicant!==old.applicant)return wbError('更换领养人请新建一段经历，原协议及记录保留');
  for(const k of ['earlyInterval','regularInterval']){v[k]=Number(v[k]||old?.[k]||(k==='earlyInterval'?7:30));if(!Number.isInteger(v[k])||v[k]<1||v[k]>365)return wbError('回访间隔需为1到365天');}
  if(v.status==='已退养')v.returnDate=v.returnDate||today;
  if(old?.status==='已领养'&&['无领养人','有意向领养人'].includes(v.status)){v.status='已退养';v.returnDate=v.returnDate||today;}
  v.agreements=old?.agreements||[];v.date=v.adoptDate||v.date||today;if(v.status==='已领养')v.adoptPlace=values.adoptPlace||old?.adoptPlace||'领养家庭';
 }
 if(v.completedDate&&(!wbValidDate(v.completedDate)||v.completedDate>today))return wbError('完成日期不能晚于今天');if(v.status==='已结束'&&v.completedDate){const start=type==='rescue'?v.medicalDate||old?.date||v.date:v.date||old?.date;if(wbValidDate(start)&&v.completedDate<start)return wbError('结束日期不能早于开始或就医日期');}
 if(['rescue','foster'].includes(type)&&v.status==='已结束'&&['放归','已放归'].includes(v.outcome)){
  v.releasePlace=String(values.releasePlace??old?.releasePlace??'').trim();v.releaseDate=v.completedDate;
  const releasing=!old||old.status!=='已结束'||old.outcome!==v.outcome;
  if((releasing||Object.hasOwn(values,'releasePlace'))&&!v.releasePlace)return wbError('请填写实际放归地点');
 }
 const ruleError=DanmiaoDomain.businessRuleError(data,type,{...old,...v},old,today);if(ruleError)return wbError(ruleError);
 const linkedCat=v.cat?wbEnsureBusinessCat(v):null;if(linkedCat)v.catId=linkedCat.id;
 if(type==='adoption'){const cat=active('cats').find(c=>c.name===v.cat);if(cat)for(const k of ['sex','age','coatType','neuterStatus','medicalHistory'])if(Object.hasOwn(values,k))cat[k]=v[k];}
 v.photos=old?.photos||[];return !!writeRecord(type,v,id);
}
function wbSaleSave(values,id){
 const old=find('sales',id);if(id&&(!old||old.deletedAt))return wbError('订单已删除或不可用');if(old&&(old.deliveredDate||old.cancelledAt))return wbError('已交付或已取消记录保留历史；数量差异请人工盘点');
 const channel=values.channel||old?.channel;if(!['线上','线下'].includes(channel))return wbError('请选择销售渠道');
 if(!wbValidDate(values.date)||values.date>today)return wbError('请填写不晚于今天的销售日期');
 if(channel==='线上'&&!['快递','自提'].includes(values.delivery))return wbError('请选择快递或自提');
 if(channel==='线下'&&!values.title?.trim())return wbError('请填写义卖活动名称');
 const seen=new Set(),lines=[];
 for(const raw of values.lines||[]){
  const item=find('inventory',raw.itemId),q=Number(raw.quantity);
  if(!item||item.deletedAt||item.group!=='文创')return wbError('请选择有效文创商品');
  if(seen.has(item.id))return wbError('同款商品请合并到一行');seen.add(item.id);
  if(!Number.isInteger(q)||q<1||q>1000000)return wbError('商品数量需为正整数');
  if(q>wbAvailable(data,item.id,id))return wbError(item.name+'可售库存不足');
  const price=channel==='线上'?readMoney(raw.unitPrice):0;if(channel==='线上'&&price===null)return wbError('请填写有效单价，最多两位小数');
  lines.push({itemId:item.id,name:item.name,unit:item.unit,quantity:q,unitPriceCents:price||0});
 }
 if(!lines.length)return wbError('至少添加一款商品');
 const amountCents=channel==='线上'?lines.reduce((n,l)=>n+l.quantity*l.unitPriceCents,0):readMoney(values.total);
 if(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>100000000)return wbError('请填写有效的整场实际总收入');
 const existingBill=old?data.finance.find(b=>b.saleId===old.id):null;
 if(existingBill?.status==='已入账'&&existingBill.amountCents!==amountCents)return wbError('收入已确认，请保留金额；如需更正请先人工核对财务');
 const saleId=old?.id||wbId('SALE');
 const sale={...old,id:saleId,channel,title:values.title?.trim()||(channel==='线上'?'线上订单 '+saleId.slice(-5).toUpperCase():'线下义卖'),date:values.date,owner:values.owner||'',delivery:channel==='线上'?values.delivery:'现场交付',lines,amountCents,note:values.note||'',deliveredDate:channel==='线下'?values.date:'',cancelledAt:''};
 const before=clone(old||null);
 if(channel==='线下')for(const l of lines){const item=find('inventory',l.itemId);item.qty-=l.quantity;item.sold+=l.quantity;}
 if(old)Object.assign(old,sale);else data.sales.unshift(sale);
 let bill=data.finance.find(b=>b.saleId===sale.id);
 if(!bill){bill={id:wbId('BILL'),flow:'收入',status:'待确认',paidDate:'',saleId:sale.id};data.finance.unshift(bill);}
 if(bill.status==='已入账'&&bill.amountCents!==amountCents){
  // Editing confirmed totals would invalidate the ledger; this is checked before mutation below by the UI.
  bill.refundReview=true;
 }else Object.assign(bill,{amountCents,title:sale.title,date:sale.date,owner:sale.owner,linkType:'sales',linkId:sale.id,receipt:'销售记录 '+sale.id,note:sale.channel+' · '+sale.delivery});
 if(channel==='线下')data.movements.unshift({id:wbId('M'),type:'线下义卖',saleId:sale.id,itemName:sale.title,date:sale.date,owner:sale.owner,quantity:lines.reduce((n,l)=>n+l.quantity,0),note:'各款销量已扣库存；收入待确认。'});
 persist('已登记'+channel+'售卖'+(channel==='线上'?'，交付前占用库存':'，收入待确认'),{type:'sales',action:old?'修改订单':'登记销售',recordId:sale.id,before,after:clone(sale)});return true;
}
function wbDeliver(id,date=today){
 const s=find('sales',id);if(!s||s.deletedAt||s.cancelledAt||s.deliveredDate||s.channel!=='线上')return wbError('此订单无需重复交付');
 if(!wbValidDate(date)||date<s.date||date>today)return wbError('请填写订单日至今天之间的交付日期');
 for(const l of s.lines){const i=find('inventory',l.itemId);if(!i||i.deletedAt||l.quantity>wbAvailable(data,i.id,s.id))return wbError(l.name+'库存不足，无法交付');}
 const before=clone(s);
 for(const l of s.lines){const i=find('inventory',l.itemId);i.qty-=l.quantity;i.sold+=l.quantity;data.movements.unshift({id:wbId('M'),itemId:i.id,itemName:i.name,type:s.delivery==='自提'?'自提交付':'发货',quantity:l.quantity,date,owner:s.owner,saleId:s.id,note:s.title});}
 s.deliveredDate=date;persist(s.delivery==='自提'?'已自提，库存已扣减':'已发货，库存已扣减',{type:'sales',action:'交付',recordId:id,before,after:clone(s)});return true;
}
function wbCancelSale(id){
 const s=find('sales',id);if(!s||s.deletedAt||s.cancelledAt)return wbError('订单已取消或不可用');if(s.deliveredDate)return wbError('已交付订单暂不做退货流程，请人工盘点和核对财务');
 const before=clone(s);s.cancelledAt=new Date().toISOString();const b=data.finance.find(b=>b.saleId===id);
 if(b?.status==='待确认')b.status='已取消';else if(b?.status==='已入账'){b.refundReview=true;b.refundReviewEvent=s.cancelledAt;}
 persist('订单已取消，占用库存已释放'+(b?.refundReview?'；已确认收入需人工核对':''),{type:'sales',action:'取消订单',recordId:id,before,after:clone(s)});return true;
}
function wbConfirmIncome(id){const b=find('finance',id);if(!b||b.deletedAt||b.flow!=='收入'||b.status!=='待确认')return wbError('此记录当前不可确认');const sale=b.saleId?find('sales',b.saleId):null;if(b.saleId&&(!sale||sale.deletedAt||sale.cancelledAt))return wbError('订单已取消，不能确认收入');writeRecord('finance',{status:'已入账',paidDate:today},id);return true}
function wbReview(id,passed,actualDate=today){const b=find('finance',id);if(!b||b.deletedAt||b.flow!=='个人垫付'||b.status!=='待审核')return wbError('该记录无需重复审核');if(!wbValidDate(actualDate)||actualDate<b.date||actualDate>today)return wbError('实际审核日期应在费用发生日至今天之间');return !!writeRecord('finance',{status:passed?'审核通过':'未通过',reviewDate:actualDate,reviewer:window.DanmiaoBackend?.user?.name||'共用测试账号'},id);}
function wbReimburse(id,date,reviewDate){const b=find('finance',id);if(!b||b.deletedAt||b.flow!=='个人垫付'||b.status!=='审核通过')return wbError('请先审核通过，再登记报销');const reviewed=b.reviewDate||reviewDate;if(!wbValidDate(reviewed))return wbError('请补填实际审核日期');if(!wbValidDate(date)||date<b.date||date<reviewed||date>today)return wbError('实际付款日期不能早于费用发生或实际审核日期，也不能晚于今天');return !!writeRecord('finance',{status:'已报销',paidDate:date,...(!b.reviewDate?{reviewDate:reviewed}:{})},id);}

function wbCompleteFollowup(id,date=today){const a=find('adoption',id);if(!a||!wbFollowup(a,date).due)return wbError('当前没有到期回访');return wbSaveFollowup(id,{followupState:'已完成',completionDate:date,earlyInterval:a.earlyInterval,regularInterval:a.regularInterval});}

function wbReturnLoan(id,v){const loan=find('loans',id),source=find('inventory',loan?.itemId);if(!loan||loan.deletedAt||loan.returnedDate||!source||source.deletedAt)return wbError('该借用记录无法归还或已经归还');if(!wbValidDate(v.date)||v.date<loan.date||v.date>today)return wbError('请填写借出日至今天之间的有效归还日期');const place=String(v.returnLocation==='__new__'?v.newReturnPlace||'':v.returnLocation||'').trim();if(!place||place.length>100)return wbError('请填写有效归还地点（100字以内）');let target=active('inventory').find(i=>wbStockKey(i)===wbStockKey(source)&&i.place.trim()===place);if(!Number.isInteger(loan.quantity)||loan.quantity<1||(target?.qty||0)+loan.quantity>1000000)return wbError('归还数量无效或超过库存上限');const before={source:clone(source),target:clone(target),loan:clone(loan)};if(!target){target={...clone(source),id:uid('inventory'),place,qty:0,reserved:0,sold:0,photos:[]};data.inventory.unshift(target);}target.qty+=loan.quantity;loan.returnedDate=v.date;loan.returnPlace=place;loan.returnItemId=target.id;data.movements.unshift({id:uid('M'),itemId:target.id,itemName:target.name,sourceItemId:source.id,sourcePlace:loan.sourcePlace||source.place,returnPlace:place,type:'归还',quantity:loan.quantity,date:v.date,owner:v.owner||'',destination:place,cat:loan.cat,loanId:id,note:'借用人：'+loan.borrower+'；归还至：'+place});persist('登记归还：'+target.name+' → '+place,{action:'归还',type:'inventory',recordId:target.id,before,after:{source:clone(source),target:clone(target),loan:clone(loan)}});return true;}

function wbSaveFollowup(id,v){const r=find('adoption',id);if(!r||r.deletedAt||r.status!=='已领养'||!['未到期','待回访','已完成'].includes(v.followupState))return wbError('请选择有效的已领养记录及回访状态');const values={followupState:v.followupState};for(const key of ['earlyInterval','regularInterval']){values[key]=Number(v[key]||r[key]||(key==='earlyInterval'?7:30));if(!Number.isInteger(values[key])||values[key]<1||values[key]>365)return wbError('回访间隔需为1到365天');}if(v.followupState==='已完成'){if(!wbValidDate(v.completionDate)||v.completionDate<r.adoptDate||v.completionDate>today)return wbError('实际回访日期应在领养日至今天之间');if(r.lastFollowup&&v.completionDate<r.lastFollowup)return wbError('本次回访不能早于上次回访');const note=String(v.followupNote||'').trim();if(note.length>300)return wbError('简短备注最多300字');values.lastFollowup=v.completionDate;values.nextFollowupDate='';values.followups=clone(r.followups||[]);const photos=clone(v.followupPhotos||[]);if(!Array.isArray(photos)||photos.length>12||photos.some(p=>!p.id||!p.name))return wbError('回访照片无效，每次最多12张');const existing=v.newEntry?null:values.followups.find(x=>x.date===v.completionDate);let entry=existing;if(existing){if(Object.hasOwn(v,'followupNote'))existing.note=note;existing.photos=[...(existing.photos||[]),...photos];}else{entry={id:wbId('FOLLOW'),date:v.completionDate,note,photos};values.followups.push(entry);}const cat=find('cats',r.catId)||wbFindCat(r.cat);if(cat&&photos.length){cat.photos??=[];for(const photo of photos)if(!cat.photos.some(p=>p.id===photo.id))cat.photos.push({...photo,followupId:entry.id,adoptionId:r.id,followupDate:entry.date,note:'回访 '+entry.date+(note?'：'+note:'')});}}else if(v.followupState==='未到期'){if(!wbValidDate(v.nextDate)||v.nextDate<=today)return wbError('下次提醒请选择今天之后的日期');values.nextFollowupDate=v.nextDate;}else{if(v.nextDate&&(!wbValidDate(v.nextDate)||v.nextDate<r.adoptDate))return wbError('预计下次回访日期不能早于领养日期');values.nextFollowupDate=v.nextDate||today;}writeRecord('adoption',values,id);return true;}
function wbRemoveFile(type,id,key,asset){const row=find(type,id);if(!row||row.deletedAt||!['photos','agreements'].includes(key))return wbError('文件记录不可用');const file=row[key]?.find(f=>f.id===asset);if(!file)return wbError('文件已经删除或不可用');const before=clone(row);row[key]=row[key].filter(f=>f.id!==asset);row.deletedFiles??=[];row.deletedFiles.push({id:wbId('DELETED-FILE'),key,file:clone(file),date:today});if(row.avatar?.id===asset)row.avatar=null;persist('已删除文件，可在最近删除中恢复',{action:'删除附件',type,recordId:id,before,after:clone(row)});return true;}
function wbRestoreFile(type,id,trashId){const row=find(type,id),entry=row?.deletedFiles?.find(x=>x.id===trashId);if(!row||row.deletedAt||!entry)return wbError('这份文件已恢复或不可用');const before=clone(row);row[entry.key]??=[];if(!row[entry.key].some(f=>f.id===entry.file.id))row[entry.key].push(clone(entry.file));row.deletedFiles=row.deletedFiles.filter(x=>x.id!==trashId);persist('已恢复文件',{action:'恢复附件',type,recordId:id,before,after:clone(row)});return true;}

function wbSettleDebt(id,date,owner){const b=find('finance',id);if(!b||b.deletedAt||b.flow!=='协会欠款'||b.status!=='待付款')return wbError('此账目不是待支付的协会欠款');if(!wbValidDate(date)||date<b.date||date>today)return wbError('付款日期应在费用发生日至今天之间');const payer=String(owner??b.owner??'').trim();if(!payer)return wbError('请填写实际付款经办人');return !!writeRecord('finance',{status:'已结清',paidDate:date,owner:payer},id);}

function wbCatNameKey(name){return String(name||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');}
function wbFindCat(name){const key=wbCatNameKey(name);return key?active('cats').find(c=>wbCatNameKey(c.name)===key||(c.aliases||[]).some(a=>wbCatNameKey(a)===key)):null;}
function wbNamesSoundAlike(a,b){a=wbCatNameKey(a);b=wbCatNameKey(b);if(!a||!b||a===b||typeof pinyinPro==='undefined')return false;const left=[...a],right=[...b];if(left.length!==right.length)return false;return left.every((char,i)=>{if(char===right[i])return true;const options=pinyinPro.pinyin(char,{toneType:'none',type:'array',multiple:true});const other=pinyinPro.pinyin(right[i],{toneType:'none',type:'array',multiple:true});return options.some(p=>other.includes(p));});}
function wbHomophoneCats(name){return active('cats').filter(c=>wbNamesSoundAlike(name,c.name)||(c.aliases||[]).some(a=>wbNamesSoundAlike(name,a)));}
function wbEnsureBusinessCat(v){if(!v.cat)return null;let cat=wbFindCat(v.cat);if(cat){v.cat=cat.name;if(v.catAlias&&!cat.aliases?.includes(v.catAlias)){cat.aliases??=[];cat.aliases.push(v.catAlias);}return cat;}cat={id:wbId('CAT'),name:v.cat,sex:v.sex||'',age:v.age||'',coatType:v.coatType||'',neuterStatus:v.neuterStatus||'',medicalHistory:v.medicalHistory||'',discoveryPlace:v.place||'',place:v.place||'',health:'',owner:v.owner||'',color:'#c9ac82',photos:[],aliases:[],autoCreated:true};data.cats.unshift(cat);data.audit.unshift({id:wbId('H'),time:new Date().toISOString(),actor:'共用测试账号',action:'自动建档',type:'cats',recordId:cat.id,before:null,after:clone(cat)});return cat;}

function wbStockFingerprint(item){const {updatedAt,...values}=item;return JSON.stringify([values,wbReservations(data,item.id),active('loans').filter(l=>l.itemId===item.id&&!l.returnedDate).map(l=>[l.id,l.quantity])]);}
function wbSaveCatPhotoNote(id,asset,value){const cat=find('cats',id),photo=cat?.photos?.find(p=>p.id===asset),note=String(value??'').trim();if(!cat||cat.deletedAt||!photo)return wbError('这张档案照片已不可用');if(note.length>500)return wbError('照片备注最多500字');const before=clone(cat);photo.note=note;persist('照片备注已保存',{type:'cats',recordId:id,action:'修改照片备注',before,after:clone(cat)});return true;}
function wbSaveCatDescription(id,value){const cat=find('cats',id),description=String(value??'').trim();if(!cat||cat.deletedAt)return wbError('猫咪档案已不可用');if(description.length>1000)return wbError('猫咪描述最多1000字');writeRecord('cats',{description},id);return true;}
function wbStockUpdatedAt(items){return items.map(i=>i.updatedAt||'').filter(Boolean).sort().at(-1)||'';}
function wbFormatUpdated(value){if(!value)return '暂无更新记录';const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Date(date.getTime()+8*3600000).toISOString().slice(0,16).replace('T',' ');}

function wbSaveStory(v,id){const old=find('stories',id),text=String(v.text||'').trim(),photos=v.photos||old?.photos||[],author=String(v.author||old?.author||'匿名同学').trim();if(!text&&!photos.length)return wbError('写一段日常或添加一张图片');if(text.length>1500||author.length>30||photos.length>6)return wbError('正文最多1500字，称呼最多30字，每条最多6张图片');if(v.catId&&!active('cats').some(c=>c.id===v.catId))return wbError('关联猫咪已不可用，请重新选择');const linked=Object.hasOwn(v,'catId')?(v.catId?find('cats',v.catId):null):wbFindCat(v.cat);const before=clone(old),now=new Date().toISOString(),row=old||{id:wbId('STORY'),createdAt:now,comments:[]};Object.assign(row,{text,author:author||'匿名同学',catId:linked?.id||'',cat:linked?.name||String(v.cat||'').trim(),photos,updatedAt:now});if(!old)data.stories.unshift(row);persist(old?'已修改猫咪轶事':'已发布猫咪轶事',{type:'stories',recordId:row.id,action:old?'修改轶事':'发布轶事',before,after:clone(row)});return row;}
function wbSaveStoryComment(id,v){const row=find('stories',id),text=String(v.text||'').trim(),photos=v.photos||[],author=String(v.author||'匿名同学').trim();if(!row||row.deletedAt)return wbError('这条轶事不可用');if(!text&&!photos.length)return wbError('填写留言或选择图片');if(text.length>300||author.length>30||photos.length>3)return wbError('留言最多300字，每次最多3张图片');const before=clone(row);row.comments??=[];row.comments.push({id:wbId('COMMENT'),text,photos,author:author||'匿名同学',createdAt:new Date().toISOString()});persist('已添加留言',{type:'stories',recordId:id,action:'留言',before,after:clone(row)});return true;}
function wbSetStoryDeleted(id,deleted){const row=find('stories',id);if(!row)return wbError('轶事记录不存在');const before=clone(row);row.deletedAt=deleted?new Date().toISOString():null;persist(deleted?'轶事已移入最近删除':'已恢复轶事',{type:'stories',recordId:id,action:deleted?'删除轶事':'恢复轶事',before,after:clone(row)});return true;}

function wbSaveCatProfileCore(values,id){const old=find('cats',id);if(id&&(!old||old.deletedAt))return wbError('猫咪档案已删除或不可用');const name=String(values.name||'').trim(),key=wbCatNameKey(name);if(!name)return wbError('请填写猫咪名字');if(data.cats.some(c=>c.id!==id&&(wbCatNameKey(c.name)===key||(c.aliases||[]).some(a=>wbCatNameKey(a)===key))))return wbError('该名字或曾用名已有档案，请使用原档案或先从回收站恢复');if(old?.discoveryPlace&&Object.hasOwn(values,'discoveryPlace')&&values.discoveryPlace!==old.discoveryPlace)return wbError('发现地点首次登记后固定，不能修改');const discoveryPlace=String(old?.discoveryPlace||values.discoveryPlace||(!old?values.place:'')||'').trim();if(discoveryPlace.length>150)return wbError('发现地点最多150字');const next={...values,discoveryPlace,place:old?(values.place??old.place??discoveryPlace):(values.place||discoveryPlace),name,color:old?.color||'#c9ac82',aliases:[...(old?.aliases||[])],photos:old?.photos||[]};if(old&&name!==old.name){if(!next.aliases.includes(old.name))next.aliases.push(old.name);for(const type of [...businessTypes,'stories','monthly','movements','loans'])for(const row of data[type]||[])if(row.catId===id||!row.catId&&row.cat===old.name){row.cat=name;if([...businessTypes,'stories'].includes(type))row.catId=id;}}return !!writeRecord('cats',next,id);}

function wbSaveBusinessFacts(type,id,mode,values){
 const r=find(type,id);if(!r||r.deletedAt)return wbError('记录已删除或不可用，请刷新列表');
 if(window.DanmiaoBackend?.user?.role==='viewer')return wbError('只读账号不能修改数据');
 if(type==='sterilization'&&mode==='cost')return wbBusinessSave(type,{...r,cost:values.cost},id);
 if(['rescue','sterilization'].includes(type)&&mode==='area'){if(!['待救助','待绝育'].includes(r.status))return wbError('仅待救助、待绝育记录可修改最近目击地点');return wbBusinessSave(type,{...r,place:String(values.place||'').trim(),locationAction:'move'},id);}
 if(type==='sterilization'&&mode==='capturer')return wbBusinessSave(type,{...r,capturer:String(values.capturer||'').trim()},id);
 if(type==='sterilization'&&mode==='medical'){
  if(r.status==='待绝育')return wbError('请通过更新状态登记医院与手术日期');
  return wbSubmitBusiness(type,{...r,hospital:String(values.hospital||'').trim(),surgeryDate:String(values.surgeryDate||'').trim(),locationAction:values.locationAction||'move'},id);
 }
 if(type==='foster'&&mode==='situation'){const situation=String(values.situation||'').trim();if(situation.length>1000)return wbError('寄养情况最多1000字');return !!writeRecord(type,{situation},id);}
 if(type!=='foster'||mode!=='placement')return wbError('未知编辑字段');
 const place=String(values.place||'').trim(),caregiver=String(values.caregiver||'').trim();if(!place||!caregiver)return wbError('请填写寄养地点与实际照护人');
 const last=r.segments?.at(-1);
 if(r.status==='已结束'){
  const segments=clone(r.segments||[]);if(segments.length)Object.assign(segments.at(-1),{place,caregiver});
  return !!writeRecord(type,{place,caregiver,segments},id);
 }
 const changed=r.place!==place||r.caregiver!==caregiver;
 if(r.status==='寄养中'&&!changed)return true;
 const date=String(values.date||'');if(!wbValidDate(date)||date>today||last&&(date<(last.endDate||last.startDate)))return wbError('入住或交接日期不能晚于今天或早于上一段寄养');
 return wbBusinessSave(type,{...r,place,caregiver,status:'寄养中',date,transitionDate:date,locationAction:'move'},id);
}

function wbSaveCatProfile(values,id){
 const old=find('cats',id),next={...old,...values};const error=DanmiaoDomain.archiveProfileError(next,old,today);if(error)return wbError(error);
 const status=values.archiveStatus??old?.archiveStatus??'',create=values.profileRecordChoice==='create',type=status==='已领养'?'adoption':'foster',date=values.archiveStatusDate||today;
 if(create&&(!wbValidDate(date)||date>today||status==='已领养'&&!values.profileApplicant?.trim()||status==='寄养中'&&(!values.place?.trim()||!values.profileCaregiver?.trim())))return wbError('建立业务记录需填写实际日期、领养人或寄养地点与照护人');
 if(create||values.profileRecordChoice==='profile'&&status==='已领养'){const candidate={cat:values.name,catId:id||'',status:status==='已领养'?'已领养':'寄养中',adoptDate:date,date,place:values.place,caregiver:values.profileCaregiver};if(type==='foster')candidate.segments=[{place:candidate.place,caregiver:candidate.caregiver,startDate:date,endDate:''}];const reason=DanmiaoDomain.businessRuleError(data,type,candidate,null,today);if(reason)return wbError(reason);}
 if(values.profileRecordChoice==='profile'&&status==='已领养'&&old&&active('adoption').some(a=>a.catId===id&&a.status==='已领养'))return wbError('已有协会领养归档资料，请在原领养记录中处理，不能改为不显示');
 const clean={...values};if(create)clean.archiveStatus='';if(values.profileRecordChoice==='profile'&&status==='已领养'&&(!old||old.archiveStatus!==status))clean.place=values.place&&values.place!==old?.place?values.place:'领养家庭';for(const key of ['profileRecordChoice','profileApplicant','profileCaregiver'])delete clean[key];if(status==='去了喵星')clean.memorialRegisteredAt=old?.memorialRegisteredAt||new Date().toISOString();
 clean.profileOnly=['已领养','寄养中'].includes(status)&&!create;
 if(!wbSaveCatProfileCore(clean,id))return false;
 const cat=wbFindCat(values.name);
 if(create){const existing=active(type).find(r=>(r.catId===cat.id||r.cat===cat.name)&&(type==='adoption'?['无领养人','有意向领养人'].includes(r.status):r.status==='待安置'));return wbBusinessSave(type,{...existing,cat:cat.name,status:type==='adoption'?'已领养':'寄养中',adoptDate:date,date,applicant:values.profileApplicant||'',place:cat.place,caregiver:values.profileCaregiver||'',situation:existing?.situation||''},existing?.id);}
 if(values.profileRecordChoice==='profile'&&status==='寄养中'){for(const f of active('foster').filter(r=>(r.catId===cat.id||r.cat===cat.name)&&r.status==='待安置')){f.deletedAt=new Date().toISOString();f.cancellationReason='档案单独登记外部寄养';}persist('档案寄养状态已更新，未新增协会寄养记录');}
 if(values.profileRecordChoice==='profile'&&status==='已领养'){
  for(const a of active('adoption').filter(r=>(r.catId===cat.id||r.cat===cat.name)&&['无领养人','有意向领养人'].includes(r.status))){a.deletedAt=new Date().toISOString();a.cancellationReason='档案标记为外部领养';}
  for(const f of active('foster').filter(r=>(r.catId===cat.id||r.cat===cat.name)&&['寄养中','待安置'].includes(r.status))){f.status='已结束';f.outcome='已领养';f.externalAdoption=true;f.completedDate=date;if(f.segments?.at(-1)&&!f.segments.at(-1).endDate)f.segments.at(-1).endDate=date;}
  persist('档案状态已更新，未新增协会领养记录');
 }
 return true;
}

function wbSaveCatPhotoInfo(id,asset,title,note){const cat=find('cats',id),photo=cat?.photos?.find(p=>p.id===asset);title=String(title||'').trim();note=String(note||'').trim();if(!cat||cat.deletedAt||!photo)return wbError('照片已不可用');if(!title||title.length>80||note.length>500)return wbError('照片名称需为1到80字，备注最多500字');const before=clone(cat);Object.assign(photo,{title,note});if(cat.avatar?.id===asset)Object.assign(cat.avatar,{title,note});persist('照片信息已保存',{type:'cats',recordId:id,action:'修改照片信息',before,after:clone(cat)});return true;}
function wbArchiveCat(id,archive,reason=''){const cat=find('cats',id);if(!cat||cat.deletedAt)return wbError('档案不可用');if(archive){const error=DanmiaoDomain.archiveCatError(data,cat);if(error)return wbError(error);}return !!writeRecord('cats',{archivedAt:archive?new Date().toISOString():'',archiveReason:reason},id);}
function wbCreateFinanceAdjustment(id,v){const original=find('finance',id);if(!DanmiaoDomain.settledFinance(original)||original.adjustmentOf)return wbError('请选择已入账的原始账目');const amountCents=readMoney(v.amount);if(amountCents===null||!['冲销','补记'].includes(v.kind)||!v.note?.trim())return wbError('请填写调整方式、有效金额和原因');const row={title:v.kind+'：'+original.title,flow:original.flow==='收入'?'收入':'协会支出',status:'已入账',date:v.date,paidDate:v.date,amountCents,adjustmentOf:id,adjustmentSign:v.kind==='冲销'?-1:1,owner:window.DanmiaoBackend?.user?.name||'共用测试账号',note:v.note,linkType:'finance',linkId:id};return !!writeRecord('finance',row);}
function wbCorrectBusinessIdentity(type,id,targetId,reason){if(window.DanmiaoBackend&&window.DanmiaoBackend.user.role!=='admin')return wbError('关联身份更正仅限管理员');const target=find('cats',targetId),original=find(type,id);if(!target||target.deletedAt||!original||!reason?.trim())return wbError('请选择有效档案并填写更正原因');const nodes=DanmiaoDomain.businessLinks(data,type,id);if(nodes.some(n=>n.row.deletedAt))return wbError('包含回收站中的关联记录，请先核对并恢复后再整体更正');const proposal=clone(data),operation=uid('IDENTITY');for(const node of nodes){const row=proposal[node.type].find(r=>r.id===node.row.id);Object.assign(row,{cat:target.name,catId:target.id,identityCorrectionId:operation,identityCorrectionReason:reason,locationAction:'history'});}
 for(const node of nodes){const row=proposal[node.type].find(r=>r.id===node.row.id),error=DanmiaoDomain.businessRuleError(proposal,node.type,row,node.row,today);if(error)return wbError(error);}
 for(const node of nodes){const row=proposal[node.type].find(r=>r.id===node.row.id);DanmiaoDomain.syncBusinessChange(proposal,node.type,node.row,row);}DanmiaoDomain.sync(proposal,today);for(const cat of proposal.cats.filter(c=>!c.deletedAt)){const error=DanmiaoDomain.memorialDateError(proposal,cat,today);if(error)return wbError(error);}
 const before=nodes.map(n=>({type:n.type,row:clone(n.row)}));for(const node of nodes)Object.assign(node.row,proposal[node.type].find(r=>r.id===node.row.id));persist('已整体更正 '+nodes.length+' 条关联记录，请核对两份档案地点',{action:'关联身份更正',type,recordId:id,before,after:{targetCatId:target.id,reason,operation}});return true;}
