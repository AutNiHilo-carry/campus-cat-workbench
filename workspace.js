'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>v==null?null:structuredClone(v);
const active=type=>(data[type]||[]).filter(r=>!r.deletedAt);
const find=(type,id)=>(data[type]||[]).find(r=>r.id===id);
const uid=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const money=cents=>'¥ '+(Number(cents||0)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const optional=html=>html.replace(' required','');
const belongs=(row,month)=>String(row.date||'').startsWith(month);
let data,persistence=true;
try{data=window.DanmiaoBackend?clone(window.DanmiaoBackend.state):JSON.parse(localStorage.getItem('miaolin-demo-v1'))||clone(initial)}catch{data=clone(initial)}
data=wbSync(wbMigrate(migrateData(data)));
let wbStockFingerprints=new Map(data.inventory.map(item=>[item.id,wbStockFingerprint(item)]));
if(!window.DanmiaoBackend)try{localStorage.setItem('miaolin-demo-v1',JSON.stringify(data))}catch{persistence=false}
let page='overview',query='',filter='',month=today.slice(0,7),inventoryGroup='日常',inventoryView='stock',historyView='audit',submitHandler=null;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200)}
function persist(message,audit){
 wbSync(data,today);
 const stockNow=new Date().toISOString();for(const item of data.inventory){const fingerprint=wbStockFingerprint(item);if(wbStockFingerprints.get(item.id)!==fingerprint)item.updatedAt=stockNow;wbStockFingerprints.set(item.id,fingerprint);}
 if(window.DanmiaoBackend){render();window.DanmiaoBackend.commit(data,message);return;}
 if(message)data.activities.unshift({name:'共用测试账号',text:message,time:new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})});
 if(audit)data.audit.unshift({id:uid('H'),time:new Date().toISOString(),actor:'共用测试账号',...audit});
 data.activities=data.activities.slice(0,40);
 try{localStorage.setItem('miaolin-demo-v1',JSON.stringify(data));persistence=true}catch{persistence=false}
 render();toast(persistence?(message||'已保存'):'浏览器存储空间不足，修改仅保留在当前页面；请立即导出数据');
}
function writeRecord(type,values,id){
 const row=find(type,id),before=clone(row);
 if(id&&(!row||row.deletedAt))return wbError('记录已删除或不可用，请返回列表刷新');
 if(row)Object.assign(row,values);else data[type].unshift({...values,id:uid(type)});
 const after=row||data[type][0];
 if(businessTypes.includes(type))DanmiaoDomain.syncBusinessChange(data,type,before,after);
 persist(`${row?'更新':'新增'}了${after.title||after.cat||after.name}的${names[type]}记录`,{action:row?'修改':'新增',type,recordId:after.id,before,after:clone(after)});
 return after;
}
function badge(text){return `<span class="badge ${/待|预约/.test(text)?'orange':/就医|试养|垫付/.test(text)?'purple':/逾期|不足/.test(text)?'red':''}">${esc(text)}</span>`}
function person(name){return `<span class="person"><span class="mini-avatar">${name?esc(name[0]):'○'}</span>${esc(name||'待认领')}</span>`}
function catCell(name){const c=data.cats.find(r=>r.name===name),photo=c?.avatar;return `<div class="cat-cell ${c&&DanmiaoDomain.catCategory(data,c)==='已去喵星'?'is-memorial':''}">${c&&!c.deletedAt?`<button type="button" class="cat-face avatar-edit" data-action="wb-cat-profile" data-id="${esc(c.id)}" aria-label="查看${esc(name)}档案" title="查看猫咪档案">${photo?`<img data-asset="${esc(photo.id)}" alt="${esc(name)}头像">`:wbCatFace(c)}</button>`:`<span class="cat-face">${wbCatFace(c)}</span>`}<div>${c&&!c.deletedAt?wbButton(esc(name),'cat-profile',`data-id="${esc(c.id)}"`):`<strong>${esc(name)}</strong>`}<small>${esc(c?.id||'公共事项')}${c?.deletedAt?' · 已归档':''}</small></div></div>`}

function button(label,action,attrs='',cls='secondary'){return `<button type="button" class="button ${cls}" data-action="${action}" ${attrs}>${label}</button>`}
function heading(title,subtitle,addLabel){return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions">${button(icon('download')+'导出数据','export')}${addLabel?button(icon('plus')+addLabel,'add','','primary'):''}</div></div>`}
function tabs(items,current,attr){return `<div class="tabs" role="tablist">${items.map(([key,label])=>`<button type="button" role="tab" aria-selected="${current===key}" class="tab ${current===key?'selected':''}" ${attr}="${key}">${label}</button>`).join('')}</div>`}
function table(heads,rows){return wbTable(heads,rows)}
function statusSelect(type,r){return `<select class="status-select" aria-label="${esc(r.cat||r.title)}的进度" data-status="${type}" data-id="${r.id}">${states[type].map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select>`}
function rowActions(type,r){return `<div class="row-actions">${button('编辑','edit',`data-type="${type}" data-id="${r.id}"`)}${completedStates[type]&&completedStates[type]===r.status?button('加入本月工作','archive',`data-type="${type}" data-id="${r.id}"`):''}${button('移入回收站','delete',`data-type="${type}" data-id="${r.id}"`,'subtle')}</div>`}
function statCards(items,cls=''){return `<div class="stats metrics ${cls}">${items.map(([label,value,note,key])=>`<${key?'button':'div'} class="stat" ${key?`data-go="${key}"`:''}><div class="stat-top">${label}<span class="stat-icon">${icon(key||'overview')}</span></div><div class="stat-value">${value}</div><p class="stat-note">${note}</p></${key?'button':'div'}>`).join('')}</div>`}
function overview(){return wbHome();}
function businessPage(){
 const descriptions={rescue:'跟进求助、接送和送医；结案后可加入本月工作。',foster:'寄养独立跟进，记录照护人、起止日期和交接清单。',adoption:'跟进申请、试养和领养；完成后归档成果。',sterilization:'记录预约、费用和术后照护；财务费用另行关联记账。'};
 return heading(names[page],descriptions[page],{rescue:'发起救助',foster:'新增寄养',adoption:'新增领养',sterilization:'新增安排'}[page])+`<div class="notice">完成工作后可手动“加入本月工作”，同一条记录不会重复归档。修改及移入回收站操作均会留下记录。</div>${filterBar(states[page])}<section class="panel" id="records-table"></section>`;
}
function filterBar(options=[],withMonth=false){return `<div class="filters">${withMonth?`<label class="month-field">月份<input id="month" type="month" value="${month}" required aria-label="筛选月份"></label>`:''}<input class="search" id="search" placeholder="搜索名称、负责人或记录内容…" value="${esc(query)}" aria-label="搜索记录">${options.length?`<select class="filter-select" id="filter" aria-label="筛选记录"><option value="">全部${page==='finance'?'收支类型':page==='monthly'?'工作类型':'状态'}</option>${options.map(s=>`<option ${filter===s?'selected':''}>${esc(s)}</option>`).join('')}</select>`:''}<span id="count" class="record-count"></span></div>`}
function matches(r){return JSON.stringify(r).toLowerCase().includes(query.toLowerCase())}
function filteredRows(){
 return active(page).filter(r=>matches(r)&&(!filter||(page==='monthly'?r.category:page==='finance'?r.flow:r.status)===filter)&&(!['monthly','finance'].includes(page)||belongs(r,month))&&(page!=='inventory'||r.group===inventoryGroup));
}
function businessTable(type,rows){
 const shared=r=>[statusSelect(type,r),person(r.owner),rowActions(type,r)];
 if(type==='rescue')return table(['猫咪','地点 / 情况','记录日期','进度','负责人','操作'],rows.map(r=>[catCell(r.cat),esc(r.place)+`<div class="date">${esc(r.issue)}</div>`,esc(r.date),...shared(r)]));
 if(type==='foster')return table(['猫咪','寄养地点 / 照护人','起止日期','交接情况','进度','协会对接人','操作'],rows.map(r=>[catCell(r.cat),esc(r.place)+`<div class="date">照护人：${esc(r.caregiver)}</div>`,esc(r.date)+`<div class="date">至 ${esc(r.endDate||'待定')}</div>`,`<button class="text-button" data-action="checklist" data-id="${r.id}">${Object.values(r.checklist||{}).filter(Boolean).length} / 5 项已确认 →</button><div class="date wrap">${esc(r.note)}</div>`,...shared(r)]));
 if(type==='adoption')return table(['猫咪','申请人','跟进备注','进度','负责人','操作'],rows.map(r=>[catCell(r.cat),esc(r.applicant),`<span class="wrap">${esc(r.note||'—')}</span>`,...shared(r)]));
 return table(['猫咪','医院 / 日期','预计或实际费用','进度','负责人','操作'],rows.map(r=>[catCell(r.cat),esc(r.hospital)+`<div class="date">${esc(r.date)}</div>`,money(Math.round(Number(r.cost||0)*100)),...shared(r)]));
}
function monthlyPage(){
 return heading('本月工作','只记录已经完成的工作，让月底总结有据可查。','补充已完成工作')+`<div class="notice">从救助、寄养、领养、绝育的已完成记录或物资盘点加入；也可手动补充。按完成日期归入月份，不是待办清单。</div><div id="module-summary"></div>${filterBar([...new Set([...businessTypes.map(t=>names[t]),'物资盘点','其他'])],true)}<div class="section-toolbar">${button('导出所选月份月报','month-report')}<span>月报包含该月全部有效记录，不受关键词筛选影响。</span></div><section class="panel" id="records-table"></section>`;
}
function sourceLabel(row){
 const type=row.sourceType||row.linkType,id=row.sourceId||row.linkId;if(!type||!id)return '手动登记';
 const r=find(type,id),title=r?.title||r?.cat||r?.name||r?.itemName||id;
 return `${names[type]||'物资流水'} · ${title}${r?.deletedAt?'（来源在回收站）':''}`;
}
function financialSummary(selectedMonth){
 const rows=active('finance'),m=rows.filter(r=>belongs(r,selectedMonth));
 const sum=xs=>xs.reduce((a,r)=>a+r.amountCents,0);
 return {income:sum(m.filter(r=>r.flow==='收入')),expense:sum(m.filter(r=>r.flow!=='收入')),pending:sum(rows.filter(r=>r.flow==='个人垫付'&&r.status==='待报销')),
 balance:sum(rows.filter(r=>r.flow==='收入'))-sum(rows.filter(r=>r.flow==='协会支出'||r.flow==='个人垫付'&&r.status==='已报销'))};
}
function financePage(){return heading('财务管理','每一笔收入、支出和垫付，都有去向、有记录。','新增账目')+`<div class="notice">本月支出包含成员垫付；累计账面结余只扣除协会已付款和已报销金额，示例期初为零。这里只登记账目，不执行付款。文创销售自动生成收入；票据目前以编号或说明记录。</div><div id="module-summary"></div>${filterBar(['收入','协会支出','个人垫付'],true)}<section class="panel" id="records-table"></section>`}
function financeTable(rows){return table(['日期 / 账目','收支类型 / 金额','经办或垫付人','业务关联','票据说明','状态','操作'],rows.map(r=>[
 esc(r.date)+`<div class="date">${esc(r.title)}</div>`,badge(r.flow)+`<div class="money ${r.flow==='收入'?'positive':''}">${r.flow==='收入'?'+':'−'} ${money(r.amountCents)}</div>`,person(r.owner),`<span class="wrap">${esc(sourceLabel(r))}</span>`,`<span class="wrap">${esc(r.receipt||'待补充')}</span>`,badge(r.status)+(r.paidDate?`<div class="date">入账 / 报销 ${esc(r.paidDate)}</div>`:''),r.movementId?button('查看销售流水','show-movement',`data-id="${r.movementId}"`):`<div class="row-actions">${button('编辑','edit',`data-type="finance" data-id="${r.id}"`)}${r.flow==='个人垫付'&&r.status==='待报销'?button('登记已报销','reimburse',`data-id="${r.id}"`):''}${button('移入回收站','delete',`data-type="finance" data-id="${r.id}"`,'subtle')}</div>`]));}
function available(r){return wbAvailable(data,r.id)}
function inventoryPage(){return heading('物资清点','文创与日常分开管理，数量变化和领用去向都有记录。','新增物资')+tabs([['日常','日常物资'],['文创','文创物资']],inventoryGroup,'data-group')+tabs([['stock','库存'],['loans','器材借还'],['movements','物资流水']],inventoryView,'data-stock-view')+`<div class="notice">${inventoryGroup==='文创'?'在库数量包含已预留数量，可用 = 在库 − 预留。售出后自动生成一笔财务收入。':'消耗品记录领用去向；航空箱等器材通过“借出 / 归还”登记。盘点完成后可加入本月工作。'} 所有变动仅保存于当前浏览器。</div>${filterBar([])}<section class="panel" id="records-table"></section>`}
function inventoryTable(rows){return wbStockTable(rows);}
function movementTable(rows){return table(['日期 / 物资','操作 / 数量','经办人','去向 / 关联猫咪','备注','关联记录'],rows.map(r=>[esc(r.date)+`<div class="date">${esc(r.itemName)}</div>`,badge(r.type)+`<div class="date">${r.quantity} ${esc(find('inventory',r.itemId)?.unit||'')}</div>`,person(r.owner),esc(r.destination||'—')+`<div class="date">${esc(r.cat||'公共事项')}</div>`,`<span class="wrap">${esc(r.note||'—')}</span>`,r.type==='盘点'?button('加入本月工作','archive',`data-type="movements" data-id="${r.id}"`):r.financeId?button('查看财务','view-finance',`data-id="${r.financeId}"`):'—']));}
function loansTable(rows){return table(['器材','数量 / 借用人','借出 / 应还日期','使用去向','归还情况','操作'],rows.map(r=>[esc(r.itemName),`${r.quantity} ${esc(find('inventory',r.itemId)?.unit||'个')}<div class="date">${esc(r.borrower)}</div>`,esc(r.date)+`<div class="date">应还 ${esc(r.dueDate)}</div>`,esc(r.destination)+`<div class="date">${esc(r.cat)}</div>`,badge(r.returnedDate?'已归还':r.dueDate<today?'逾期未还':'借用中'),r.returnedDate?esc(r.returnedDate):button('登记归还','return',`data-id="${r.id}"`)]));}
function refreshTable(){wbRefresh()}
function cats(){return heading('猫咪档案','同一只猫咪，共用救助、寄养、领养和绝育的关联档案。','新增猫咪')+`<div class="cat-grid">${active('cats').map(c=>`<article class="cat-card"><div class="cat-portrait">${face(c.color)}</div><div class="cat-card-body"><div class="cat-card-title"><h3>${esc(c.name)}</h3>${badge(c.sex+' · '+c.age)}</div><p>${esc(c.id)} · ${esc(c.place)}<br>${esc(c.health)}<br>负责人：${esc(c.owner||'待认领')}</p>${button('查看完整档案 →','cat-details',`data-id="${c.id}"`)}${button('编辑','edit',`data-type="cats" data-id="${c.id}"`)}</div></article>`).join('')}</div>`}
function historyPage(){return wbTop('记录与回收站','查看修改前后内容，恢复误删记录。')+tabs([['audit','修改记录'],['trash','回收站']],historyView,'data-history')+`<div class="notice">当前使用共用测试账号。记录移入回收站后可恢复；业务流水保留。</div><section class="panel">${historyView==='audit'?table(['时间','操作人','模块 / 操作','记录','详情'],data.audit.map(r=>[esc(new Date(r.time).toLocaleString('zh-CN')),person(r.actor),esc(wbDataName[r.type]||'物资流水')+' · '+esc(r.action),esc(r.after?.title||r.after?.cat||r.after?.name||r.before?.title||r.before?.cat||r.before?.name||r.recordId),button('查看前后内容','audit-details',`data-id="${r.id}"`)])):table(['记录','模块','移入时间','操作'],recordTypes.flatMap(type=>data[type].filter(r=>r.deletedAt).map(r=>[esc(r.title||r.cat||r.name),esc(names[type]),esc(new Date(r.deletedAt).toLocaleString('zh-CN')),button('恢复记录','restore',`data-type="${type}" data-id="${r.id}"`)])))}</section>`}
function render(){wbRender()}
function go(dest){query='';filter='';if(location.hash==='#'+dest)render();else location.hash=dest}
function field(label,name,value='',type='text',options=null){
 const control=options?`<select name="${name}" required>${options.map(o=>{const v=typeof o==='object'?o.value:o,t=typeof o==='object'?o.label:o;return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`}).join('')}</select>`:type==='textarea'?`<textarea name="${name}" maxlength="1000">${esc(value)}</textarea>`:`<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="1" max="1000000"':type==='date'?'':'maxlength="150"'} required>`;
 return `<label>${label}${control}</label>`;
}
let wbModalStack=[],wbModalTitle='';
function showModal(title,html,onSubmit,submitLabel='保存记录'){const dialog=$('#dialog'),fields=$('#fields');wbCloseDropdown();if(!dialog.open){wbModalStack=[];}else if(title!==wbModalTitle&&typeof fields.replaceChildren==='function'){const ancestor=wbModalStack.map(s=>s.title).lastIndexOf(title);if(ancestor>=0)wbModalStack.length=ancestor;else wbModalStack.push({title:wbModalTitle,nodes:[...fields.childNodes],handler:submitHandler,classes:dialog.className,actionsHidden:$('.modal-actions').hidden,submitLabel:$('#form button[type="submit"]').textContent,scrollTop:dialog.scrollTop,titleActions:document.querySelector('.story-title-actions')});}document.querySelector('.story-title-actions')?.remove?.();wbModalTitle=title;dialog.classList.remove('avatar-dialog','attachment-dialog','cat-detail-dialog','inventory-dialog','photo-detail-dialog','story-reader-dialog','cat-edit-dialog');$('#modal-title').textContent=title;fields.innerHTML=html;submitHandler=onSubmit;$('.modal-actions').hidden=!onSubmit;$('#form button[type="submit"]').textContent=submitLabel;$('#form button[type="submit"]').disabled=false;dialog.showModal();dialog.scrollTop=0;wbEnhanceSelects()}
function wbCloseModal(){wbCloseDropdown();const prior=wbModalStack.pop(),dialog=$('#dialog');if(!prior){dialog.close();wbModalTitle='';return;}document.querySelector('.story-title-actions')?.remove?.();$('#modal-title').textContent=prior.title;if(prior.titleActions)document.querySelector('.modal-head>div').append(prior.titleActions);$('#fields').replaceChildren(...prior.nodes);submitHandler=prior.handler;dialog.className=prior.classes;$('.modal-actions').hidden=prior.actionsHidden;$('#form button[type="submit"]').textContent=prior.submitLabel;$('#form button[type="submit"]').disabled=false;wbModalTitle=prior.title;dialog.scrollTop=prior.scrollTop;wbEnhanceSelects();wbLoadImages();wbRefreshCatEditorMedia();}
function requireValues(values,keys){return keys.every(key=>String(values[key]??'').trim())}
function readMoney(value){const s=String(value??'').trim();if(!/^\d{1,7}(\.\d{1,2})?$/.test(s))return null;const [whole,fraction='']=s.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return cents>0&&cents<=100000000?cents:null}
function catOptions(value,publicOption=false){const options=active('cats').map(c=>c.name);if(publicOption)options.unshift('公共事项');if(value&&!options.includes(value))options.push(value);return options}
function checkFields(checklist){return `<fieldset class="checklist"><legend>寄养交接清单</legend>${Object.entries(checklistItems).map(([key,label])=>`<label><input type="checkbox" name="check_${key}" ${checklist?.[key]?'checked':''}>${label}</label>`).join('')}</fieldset>`}
function edit(type,id){
 if(type==='announcements')return wbAnnouncementForm(id);
 if(['events','sponsors'].includes(type))return wbOutreachForm(type,id);
 if(businessTypes.includes(type))return wbEditBusiness(type,id);
 if(type==='monthly')return wbEditMonthly(id);
 if(type==='finance')return wbEditFinance(id);
 const old=find(type,id),r=old||{};let fields='';
 if(type==='finance')return editFinance(id);
 if(type==='monthly')return editMonthly(id);
 if(type==='inventory')return editInventory(id);
 if(type==='cats')fields=wbCatEditFields(r,old);
 else{
  fields=field('关联猫咪','cat',r.cat||catOptions()[0],'text',catOptions(r.cat));
  if(type==='rescue')fields+=field('发现地点','place',r.place)+field('救助情况','issue',r.issue,'textarea');
  if(type==='foster')fields+=field('寄养地点','place',r.place)+field('实际照护人','caregiver',r.caregiver||'陈同学')+optional(field('预计结束日期（可留空）','endDate',r.endDate||'','date'))+field('照护与交接备注','note',r.note,'textarea')+checkFields(r.checklist);
  if(type==='adoption')fields+=field('申请人称呼（示例）','applicant',r.applicant)+field('跟进备注','note',r.note,'textarea');
  if(type==='sterilization')fields+=field('医院','hospital',r.hospital||'待确定')+field('预计或实际费用（元）','cost',r.cost??0,'number').replace('step="1"','step="0.01"');
  fields+=field(type==='foster'?'入住日期':type==='sterilization'?'预约 / 手术日期':'记录日期','date',r.date||today,'date')+optional(field(type==='foster'?'协会对接人（可留空，待认领）':'负责人（可留空，待认领）','owner',r.owner||''))+field('当前进度','status',r.status||states[type][0],'text',states[type]);
  if(r.status===completedStates[type])fields+=field('完成日期','completedDate',r.completedDate||r.date,'date');
 }
 showModal(old?'编辑'+names[type]:'新增'+names[type]+'记录',fields,values=>{
  const required=type==='cats'?['name','sex','age',old?'place':'discoveryPlace']:['cat','date','status',...(type==='foster'?['place','caregiver']:type==='adoption'?['applicant']:type==='rescue'?['place']:['hospital','cost'])];
  values.owner=String(values.owner||'').trim();
  if(!requireValues(values,required))return toast('请完整填写必填项'),false;
  if(type==='foster'&&values.endDate&&values.endDate<values.date)return toast('预计结束日期不能早于入住日期'),false;
  if(type==='cats')return wbSubmitCatProfile(values,id);

  if(type==='sterilization'){values.cost=Number(values.cost);if(!Number.isFinite(values.cost)||values.cost<0)return toast('费用格式有误'),false;}
  if(type==='foster'){values.checklist=Object.fromEntries(Object.keys(checklistItems).map(k=>[k,values['check_'+k]==='on']));for(const k of Object.keys(checklistItems))delete values['check_'+k];}
  if(values.status===completedStates[type])values.completedDate=values.completedDate||today;
  if(values.completedDate&&values.completedDate>today)return toast('已完成工作的日期不能晚于今天'),false;
  writeRecord(type,values,id);return true;
 });if(type==='cats'){$('#dialog').classList.add('cat-edit-dialog');wbProfileStatusVisibility();wbLoadImages();}
}
function editMonthly(id,source){
 const old=find('monthly',id),r=old||source||{};
 const sourceType=r.sourceType||'',sourceId=r.sourceId||'';
 const fields=field('已完成的工作','title',r.title)+field('工作类型','category',r.category||'其他','text',[...businessTypes.map(t=>names[t]),'物资盘点','其他'])+field('关联猫咪','cat',r.cat||'公共事项','text',catOptions(r.cat,true))+field('完成日期','date',r.date||today,'date')+optional(field('负责人（可留空）','owner',r.owner||''))+field('完成成果 / 总结','result',r.result,'textarea')+(sourceType?`<div class="notice">来源：${esc(sourceLabel(r))}。关联工作只归档一次。</div>`:'');
 showModal(old?'编辑已完成工作':'加入本月工作',fields,values=>{
  if(!requireValues(values,['title','category','cat','date','result']))return toast('请填写工作名称、完成日期和成果'),false;
  values.owner=String(values.owner||'').trim();
  if(values.date>today)return toast('这里只收录已完成工作，日期不能晚于今天'),false;
  if(sourceType&&data.monthly.some(x=>x.id!==id&&x.sourceType===sourceType&&x.sourceId===sourceId))return toast('这项工作已归档；如在回收站，请恢复原记录'),false;
  writeRecord('monthly',{...values,sourceType,sourceId},id);return true;
 });
}
function archive(type,id){
 const row=find(type,id);if(!row||row.deletedAt)return;
 if(type==='movements'?row.type!=='盘点':row.status!==completedStates[type])return toast('请先完成工作再归档');
 const exists=data.monthly.find(r=>r.sourceType===type&&r.sourceId===id);
 if(exists)return toast(exists.deletedAt?'已归档记录在回收站，可恢复原记录':'这项工作已加入本月工作，无需重复添加');
 editMonthly(null,{title:type==='movements'?row.itemName+'物资盘点完成':row.cat+' · '+names[type]+'完成',category:type==='movements'?'物资盘点':names[type],cat:row.cat||'公共事项',owner:row.owner,date:row.completedDate||row.date||today,result:row.note||row.issue||'已完成，请补充本次工作成果。',sourceType:type,sourceId:id});
}
function linkOptions(current){const out=[{value:'',label:'公共事项 / 不关联'}];for(const t of [...businessTypes,'inventory'])for(const r of active(t))out.push({value:t+':'+r.id,label:names[t]+' · '+(r.cat||r.name)+' · '+r.id});if(current&&!out.some(o=>o.value===current))out.push({value:current,label:'原关联（已移入回收站）'});return out}
function financeStatuses(flow){return flow==='个人垫付'?['待报销','已报销']:['已入账']}
function editFinance(id){
 const old=find('finance',id),r=old||{};if(r.movementId)return showDetails('自动关联账目',`文创销售自动生成的收入与物资流水关联，请通过对应销售流水核对。金额：${money(r.amountCents)}`);
 const fields=field('账目名称','title',r.title)+field('收支类型','flow',r.flow||'协会支出','text',['收入','协会支出','个人垫付'])+field('金额（元，最多两位小数）','amount',r.amountCents?(r.amountCents/100).toFixed(2):'','number').replace('step="1"','step="0.01"')+field('发生日期','date',r.date||today,'date')+field('经办人 / 垫付人','owner',r.owner||'林同学')+optional(field('关联业务','link',r.linkType?r.linkType+':'+r.linkId:'','text',linkOptions(r.linkType?r.linkType+':'+r.linkId:'')))+field('入账 / 报销状态','status',r.status||'已入账','text',financeStatuses(r.flow||'协会支出'))+optional(field('入账 / 报销日期（已报销必填）','paidDate',r.paidDate||'','date'))+optional(field('票据编号或说明','receipt',r.receipt))+field('备注','note',r.note,'textarea');
 showModal(old?'编辑账目':'新增账目',fields,values=>{
  if(!requireValues(values,['title','flow','date','owner','status']))return toast('请完整填写必填项'),false;
  const cents=readMoney(values.amount);if(cents===null)return toast('金额需大于零且最多两位小数'),false;
  if(!financeStatuses(values.flow).includes(values.status))return toast('收支类型与报销状态不匹配'),false;
  if(values.date>today)return toast('请登记已发生账目，发生日期不能晚于今天'),false;
  if(values.status==='已报销'&&(!values.paidDate||values.paidDate<values.date||values.paidDate>today))return toast('请填写发生日至今天之间的报销日期'),false;
  const [linkType='',linkId='']=(values.link||'').split(':');
  if(linkId&&(!find(linkType,linkId)||find(linkType,linkId).deletedAt)&&values.link!==(r.linkType+':'+r.linkId))return toast('关联记录不可用'),false;
  const paidDate=values.flow==='个人垫付'?(values.status==='已报销'?values.paidDate:''):values.date;
  delete values.amount;delete values.link;
  writeRecord('finance',{...values,amountCents:cents,linkType,linkId,paidDate},id);return true;
 });
}
function reimburse(id){const r=find('finance',id);if(!r||r.status!=='审核通过')return toast('请先完成报销审核');showModal('登记已报销','<p class="details">'+esc(r.title)+' · '+money(r.amountCents)+'。这里只登记已完成的报销，不执行付款。</p>'+field('报销日期','date',today,'date'),v=>wbReimburse(id,v.date),'登记已报销')}
function editInventory(id,prefill){
 const old=find('inventory',id),r=old||prefill||{},group=r.group||inventoryGroup,creative=group==='文创';
 const fields=`<input type="hidden" name="group" value="${esc(group)}">`+field(creative?'文创名称':'物资名称','name',r.name)+field(creative?'文创分类':'物资分类','category',r.category||(creative?'贴纸':'食品'))+(creative?optional(field('款式（可留空）','variant',r.variant||''))+`<input type="hidden" name="kind" value="消耗品">`:field('使用方式','kind',r.kind||'消耗品','text',['消耗品','可借用器材']))+field('计量单位','unit',r.unit||(creative?'个':'袋'))+(old?`<div class="notice">在库 ${r.qty} ${esc(r.unit)}${creative?'，预留 '+(r.reserved||0):''}。数量请通过库存操作修改。</div>`:field('初始在库数量','qty',0,'number'))+field('存放位置','place',prefill?'':r.place||'活动室')+(creative?optional(field('参考单价（元，可留空）','unitPrice',r.unitPriceCents?(r.unitPriceCents/100).toFixed(2):'','number').replace('step="1"','step="0.01"')):'');
 showModal((old?'编辑':'新增')+(creative?'文创物资':'日常物资'),fields,values=>wbSaveInventoryForm(values,id,group));
}
function wbSaveInventoryForm(values,id,group){
 const old=find('inventory',id),r=old||{},creative=group==='文创';if(id&&(!old||old.deletedAt))return wbError('物资已删除或不可用');values={...values,group,kind:creative?'消耗品':values.kind,variant:creative?values.variant||'':''};
 if(!['日常','文创'].includes(group)||!requireValues(values,['name','category','kind','unit','place']))return wbError('请完整填写必填项');
 const qty=old?old.qty:Number(values.qty);if(!old&&String(values.qty??'').trim()===''||!Number.isInteger(qty)||qty<0||qty>1000000)return wbError('库存需为有效非负整数');
 if(!['消耗品','可借用器材'].includes(values.kind))return wbError('请选择有效使用方式');
 const hasLoans=active('loans').some(l=>l.itemId===id&&!l.returnedDate);if(hasLoans&&values.place!==old.place)return wbError('该地点仍有器材借出，请先归还后再修改地点');
 if(old&&(old.reserved>0||wbReservations(data,old.id).total>0||hasLoans)&&(values.group!==old.group||values.kind!==old.kind||values.unit!==old.unit))return wbError('请先处理订单占用、预留或未归还器材，再修改使用方式或单位');
 const price=creative&&values.unitPrice?readMoney(values.unitPrice):0;if(price===null)return wbError('参考单价格式有误');
 if(active('inventory').some(i=>i.id!==id&&wbStockKey(i)===wbStockKey(values)&&i.place.trim()===values.place.trim()))return wbError('这个存放地点已有同款物资，请通过入库增加数量');
 delete values.unitPrice;delete values.min;writeRecord('inventory',{...values,qty,unitPriceCents:price,reserved:r.reserved||0,sold:r.sold||0,photos:r.photos||[]},id);return true;
}
function stockOperation(id,type){
 const r=find('inventory',id);if(!r||r.deletedAt)return;
 let html='<div class="notice">'+esc(r.name)+' · 来源：'+esc(r.place)+' · 在库 '+r.qty+' '+esc(r.unit)+' · 可用 '+available(r)+'</div>'+field(['盘点','修改'].includes(type)?(type==='修改'?'修改后的在库数量':'实盘在库数量'):'数量','quantity',['盘点','修改'].includes(type)?r.qty:1,'number')+field('日期','date',today,'date')+optional(field(type==='领用'?'领用人（可留空）':'经办人（可留空）','owner',''));
 if(type==='借出')html+=field('借用人','borrower','')+field('用途','destination','');
 if(type==='预留')html+=field('预留标记','destination','文创预留');
 showModal(type+' · '+r.name,html,v=>applyStockOperation(id,type,v),'确认'+type);
}
function applyStockOperation(id,type,values){
 const r=find('inventory',id),quantity=Number(values.quantity);
 if(!r||r.deletedAt)return toast('物资记录不可用'),false;
 if(!['入库','领用','借出','预留','取消预留','售出','盘点','修改'].includes(type))return toast('不支持的物资操作'),false;
 if(String(values.quantity??'').trim()==='')return toast('请填写数量'),false;
 if(!Number.isInteger(quantity)||quantity<0||(!['盘点','修改'].includes(type)&&quantity===0)||quantity>1000000)return toast('数量需为有效整数，数量增减操作需大于零'),false;
 if(!wbValidDate(values.date)||values.date>today)return toast('请填写不晚于今天的有效日期'),false;
 if(['售出','借出','预留'].includes(type)&&!String(values.destination||'').trim())return toast('请填写去向或用途'),false;
 if(['预留','取消预留','售出'].includes(type)&&r.group!=='文创')return toast('此操作只适用于文创物资'),false;
 if(type==='借出'&&(r.kind!=='可借用器材'||!values.borrower?.trim()))return toast('请填写器材借用人'),false;
 if(type==='领用'&&r.kind==='可借用器材')return toast('可借用器材请通过借出登记'),false;
 const unitPrice=type==='售出'?readMoney(values.unitPrice):0;
 if(type==='售出'&&(unitPrice===null||!['可用库存','已预留'].includes(values.allocation)))return toast('请填写有效单价及售出来源'),false;
 if(type==='取消预留'&&quantity>r.reserved||type==='售出'&&values.allocation==='已预留'&&quantity>r.reserved)return toast('数量超过已预留库存'),false;
 if(['领用','借出','预留'].includes(type)||type==='售出'&&values.allocation==='可用库存')if(quantity>available(r))return toast('可用库存不足，预留数量需先取消或选择从已预留售出'),false;
 if(['盘点','修改'].includes(type)&&quantity<r.reserved+wbReservations(data,id).total)return toast('修改后的在库数量不能低于待发货、自提及其他预留数量'),false;
 if(type==='入库'&&r.qty+quantity>1000000)return toast('库存超过演示支持上限'),false;
 const before=clone(r),movementId=uid('M');
 if(type==='入库')r.qty+=quantity;
 if(['领用','借出','售出'].includes(type))r.qty-=quantity;
 if(['盘点','修改'].includes(type))r.qty=quantity;
 if(type==='预留')r.reserved+=quantity;
 if(type==='取消预留'||type==='售出'&&values.allocation==='已预留')r.reserved-=quantity;
 if(type==='售出')r.sold+=quantity;
 const movement={id:movementId,itemId:r.id,itemName:r.name,sourcePlace:r.place,type:type==='修改'?'修改数量':type,quantity,date:values.date,owner:values.owner,destination:values.destination||'',cat:values.cat||'公共事项',note:[values.useNote,values.note].filter(Boolean).join('；'),beforeQty:before.qty,afterQty:r.qty};
 if(type==='借出'){
  const loan={id:uid('L'),itemId:r.id,itemName:r.name,sourcePlace:r.place,quantity,borrower:values.borrower,owner:values.owner,date:values.date,dueDate:values.dueDate,destination:values.destination,cat:values.cat||'公共事项',returnedDate:'',movementId};data.loans.unshift(loan);movement.loanId=loan.id;
 }
 if(type==='售出'){
  const bill={id:uid('B'),title:r.name+'销售',flow:'收入',amountCents:quantity*unitPrice,owner:values.owner,date:values.date,status:'已入账',paidDate:values.date,linkType:'inventory',linkId:r.id,receipt:'销售流水 '+movementId,note:quantity+' '+r.unit+' × '+money(unitPrice)+'；'+values.destination,movementId};
  data.finance.unshift(bill);movement.financeId=bill.id;movement.amountCents=bill.amountCents;
 }
 data.movements.unshift(movement);
 persist(`${type}：${r.name} ${quantity} ${r.unit}`,{action:type,type:'inventory',recordId:r.id,before,after:{...clone(r),movement:clone(movement)}});return true;
}
function returnLoan(id){const loan=find('loans',id),item=find('inventory',loan?.itemId);if(!loan||loan.returnedDate||!item||item.deletedAt)return toast('此借用记录无法重复归还');const places=[...new Set(active('inventory').map(i=>i.place).filter(Boolean))];showModal('登记器材归还',`<p class="loan-return-number">借还单号：${wbRecordNumber(loan.id)}</p><div class="notice">${esc(loan.borrower)}归还 ${esc(loan.itemName)} ${loan.quantity} ${esc(item.unit)}。借出来源：${esc(loan.sourcePlace||item.place)}。库存将补到本次选择的归还地点。</div>${field('归还位置','returnLocation',item.place,'text',[...places.map(p=>({value:p,label:p})),{value:'__new__',label:'＋ 新增地点'}])}<div id="return-new-place">${field('新地点名称','newReturnPlace','')}</div>${field('实际归还日期','date',today,'date')}${optional(field('接收人（可留空）','owner',''))}`,v=>wbReturnLoan(id,v),'确认登记归还');wbReturnLocationVisibility();}

function checklist(id){const r=find('foster',id);showModal(r.cat+' · 寄养交接',checkFields(r.checklist)+field('照护及交接说明','note',r.note,'textarea'),values=>{const checklist=Object.fromEntries(Object.keys(checklistItems).map(k=>[k,values['check_'+k]==='on']));writeRecord('foster',{checklist,note:values.note},id);return true;})}
function deletionReason(type,r){if(type==='finance'&&(r.movementId||r.saleId))return '销售收入由物资流水自动关联，不能单独删除。';if(type==='inventory'&&(r.reserved>0||wbReservations(data,r.id).total>0||active('loans').some(l=>l.itemId===r.id&&!l.returnedDate)))return '请先取消预留并收回未归还器材，再移入回收站。';return ''}
function softDelete(type,id){
 const row=find(type,id);if(!row||row.deletedAt)return;
 const reason=deletionReason(type,row);if(reason)return toast(reason);
 showModal('移入回收站',`<div class="details">将“${esc(row.title||row.cat||row.name)}”移入回收站？可在“记录与回收站”恢复。${type==='finance'?'移出有效账目后，财务汇总也会重新计算。':''}自动月度统计随有效来源重新计算，历史流水保留。</div>`,()=>{
  const before=clone(row);row.deletedAt=new Date().toISOString();
  persist('已移入回收站，可随时恢复',{action:'移入回收站',type,recordId:id,before,after:clone(row)});return true;
 },'确认移入回收站');
}
function restore(type,id){const r=find(type,id);if(!r?.deletedAt)return;const reason=wbRestoreReason(type,r);if(reason)return toast(reason);const before=clone(r);r.deletedAt='';persist('恢复了'+(r.title||r.cat||r.name),{action:'恢复',type,recordId:id,before,after:clone(r)})}
function showDetails(title,text){showModal(title,`<div class="details">${esc(text).replace(/\n/g,'<br>')}</div>`,null)}
function catDetails(id){const c=find('cats',id);const rows=businessTypes.flatMap(t=>active(t).filter(r=>r.cat===c.name).map(r=>`<p><b>${names[t]}</b> · ${esc(r.status)}<br>${esc(r.date)} · ${esc(r.owner)}</p>`));showModal(c.name+' · '+c.id,`<div class="details"><p>${esc(c.sex)} · ${esc(c.age)} · ${esc(c.place)}<br>${esc(c.health)}</p><b>关联记录</b>${rows.join('')||'<p>暂无业务记录。</p>'}</div>`,null)}
function download(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function monthReport(){const rows=active('monthly').filter(r=>belongs(r,month));let report='# 大学猫协一站通猫协 '+month+' 工作月报\n\n已完成 '+rows.length+' 项工作。\n\n';for(const r of rows)report+='## '+r.title+'\n\n- 完成日期：'+r.date+'\n- 工作类型：'+r.category+'\n- 负责人：'+r.owner+'\n- 关联猫咪：'+(r.cat||'公共事项')+'\n\n'+r.result+'\n\n';return report}
function handleAction(action,ds){
 if(wbHandleAction(action,ds))return;
 if(action==='add')return page==='inventory'&&inventoryView==='sales'?wbSaleForm():edit(page==='overview'?'rescue':page);
 if(action==='edit')return edit(ds.type,ds.id);
 if(action==='archive')return archive(ds.type,ds.id);
 if(action==='delete')return softDelete(ds.type,ds.id);
 if(action==='restore')return restore(ds.type,ds.id);
 if(action==='checklist')return checklist(ds.id);
 if(action==='stock-op')return stockOperation(ds.id,ds.op);
 if(action==='return')return returnLoan(ds.id);
 if(action==='reimburse')return reimburse(ds.id);
 if(action==='cat-details')return catDetails(ds.id);
 if(action==='show-movement'){const r=find('movements',ds.id);return showDetails('关联销售流水',r?`${r.date} · ${r.itemName}\n${r.type} ${r.quantity} · ${money(r.amountCents)}\n经办人：${r.owner}\n去向：${r.destination}\n${r.note||''}`:'对应流水不可用');}
 if(action==='view-finance'){const r=find('finance',ds.id);return showDetails('关联收入',r?`${r.title}\n金额：${money(r.amountCents)}\n${r.date} · ${r.status}\n票据说明：${r.receipt}`:'对应账目不可用');}
 if(action==='audit-details'){const r=find('audit',ds.id);return showModal('修改前后内容',`<div class="audit-grid"><section><h3>修改前</h3><pre>${esc(JSON.stringify(r.before,null,2))}</pre></section><section><h3>修改后</h3><pre>${esc(JSON.stringify(r.after,null,2))}</pre></section></div>`,null);}
 if(action==='export'){download(JSON.stringify(data,null,2),'大学猫协一站通-全部演示数据.json','application/json');return toast('已导出全部数据，含修改记录和回收站');}
 if(action==='month-report'){download(monthReport(),'大学猫协一站通-'+month+'-工作月报.md','text/markdown;charset=utf-8');return toast('已导出所选月份的全部完成工作');}
 if(action==='reset')return showModal('恢复示例数据','<div class="details">会清除本浏览器新增和修改的演示记录。需要保留的内容请先导出。</div>',()=>{data=wbSync(wbMigrate(migrateData(clone(initial))));persist('已恢复示例数据');return true;},'确认恢复示例数据');
}
document.addEventListener('click',e=>{
 const t=e.target.closest('button,[data-go]');if(!t)return;const ds=t.dataset;
 if(ds.go)return go(ds.go);
 if(ds.group){inventoryGroup=ds.group;query='';filter='';render();return;}
 if(ds.stockView){inventoryView=ds.stockView;query='';filter='';render();return;}
 if(ds.history){historyView=ds.history;render();return;}
 if(ds.action)handleAction(ds.action,ds);
});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;refreshTable()}});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.id==='filter'){filter=t.value;refreshTable()}
 if(t.id==='month'&&/^\d{4}-\d{2}$/.test(t.value)){month=t.value;refreshTable()}
 if(t.name==='flow'){
  const selector=$('#form select[name="status"]');if(selector)selector.innerHTML=financeStatuses(t.value).map(s=>`<option>${s}</option>`).join('');
 }
 if(t.dataset.status){
  const type=t.dataset.status,row=find(type,t.dataset.id);if(!row||row.deletedAt||!states[type].includes(t.value))return;
  writeRecord(type,{status:t.value,...(t.value===completedStates[type]?{completedDate:today}:{})},row.id);
 }
});
$('#form').addEventListener('submit',e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));for(const k in values)if(typeof values[k]==='string')values[k]=values[k].trim();if(submitHandler&&submitHandler(values))$('#dialog').close()});
$('#close').onclick=$('#cancel').onclick=wbCloseModal;
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();wbCloseModal();});
$('#dialog').addEventListener('close',()=>{wbModalStack=[];wbModalTitle='';});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)wbCloseModal()}});
$('#help').onclick=$('#profile').onclick=()=>{wbHandleAction('wb-manage',{});};
window.addEventListener('hashchange',()=>{query='';filter='';render()});render();

function wbRestoreReason(type,r){if(businessTypes.includes(type)){const reason=DanmiaoDomain.businessRuleError(data,type,{...r,deletedAt:''},r,today);if(reason)return reason;}if(type==='adoption'&&r.status==='已领养'&&active('adoption').some(a=>a.id!==r.id&&a.status==='已领养'&&(a.catId&&a.catId===r.catId||a.cat===r.cat)))return '这只猫已有进行中的领养经历，不能同时恢复两段已领养记录';if(type==='inventory'&&active('inventory').some(i=>wbStockKey(i)===wbStockKey(r)&&i.place.trim()===r.place.trim()))return '同款物资在该地点已有记录，请先核对库存再恢复';return '';}
