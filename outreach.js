/* Events and sponsorship records share validation with the local API. */
function wbOutreachPage(){
 const event=page==='events';
 return tabs([['events','活动安排'],['sponsors','赞助合作']],page,'data-wb-route')+wbTop(event?'活动安排（测试）':'赞助合作（测试）',event?'记录即将开展的活动、人员分工和筹备进度。':'记录赞助对接、支持内容及落实情况，可关联具体活动。',event?'新增活动':'新增赞助')+`<p class="outreach-notice">测试模块 · 请使用虚构资料。赞助记录不自动确认收入或增加物资库存。</p>`+tabs([...(event?['即将开展']:[]),'全部',...DanmiaoDomain.outreachStates[page]].map(s=>[s,s]),wbBusinessTab[page],'data-wb-state')+wbFilters()+'<div id="wb-list"></div>';
}
function wbOutreachRows(type){const rows=active(type).filter(r=>matches(r)&&(wbBusinessTab[type]==='全部'||wbBusinessTab[type]==='即将开展'&&r.date>=today&&!['已完成','已取消'].includes(r.status)||r.status===wbBusinessTab[type]));return type==='events'?rows.sort((a,b)=>a.date.localeCompare(b.date)):rows;}
function wbOutreachTable(type,rows){
 const preview=v=>`<span class="outreach-preview">${esc(v||'待补充')}</span>`;
 if(type==='events')return wbTable(['活动 / 日期','地点 / 时段','负责人','人员安排','状态','操作'],rows.map(r=>[`<strong class="record-main-title">${esc(r.title)}</strong><div class="date">${esc(r.date)}${r.endDate&&r.endDate!==r.date?' — '+esc(r.endDate):''}</div>`,preview(r.place)+`<div class="date">${esc(r.time||'时段待定')}</div>`,person(r.owner),preview(r.staffing),badge(r.status),wbRowActions(type,r)]));
 return wbTable(['赞助项目 / 赞助方','支持内容','关联活动','对接人','预计 / 实际落实','状态','操作'],rows.map(r=>{const event=find('events',r.eventId);return [`<strong class="record-main-title">${esc(r.title)}</strong><div class="date">${esc(r.organization)}</div>`,badge(r.supportType)+preview(r.supportContent),event?wbButton(esc(event.title)+(event.deletedAt?'（已移入回收站）':''),'detail',`data-type="events" data-id="${esc(event.id)}"`):'未关联',person(r.owner),esc(r.targetDate||'待定')+`<div class="date">实际：${esc(r.receivedDate||'未落实')}</div>`,badge(r.status),wbRowActions(type,r)];}));
}
function wbSaveOutreach(type,values,id){
 if(!['events','sponsors'].includes(type))return wbError('未知记录类型');
 const old=find(type,id);if(id&&(!old||old.deletedAt))return wbError('记录已删除或不可用，请返回列表刷新');
 const keys=type==='events'?['title','date','endDate','time','place','owner','staffing','agenda','materials','status','completedDate','result','note']:['title','organization','contact','owner','supportType','supportContent','eventId','targetDate','receivedDate','status','note'];
 const row={...old,...Object.fromEntries(keys.map(k=>[k,String(values[k]??old?.[k]??'').trim()]))};
 const error=DanmiaoDomain.outreachError(type,row,data,today);if(error)return wbError(error);
 return !!writeRecord(type,row,id);
}
function wbOutreachForm(type,id){
 const r=find(type,id)||{},event=type==='events';if(id&&(!r.id||r.deletedAt))return wbError('记录已删除或不可用');
 let fields=field(event?'活动名称':'赞助项目名称','title',r.title||'');
 if(event)fields+=field('开始日期','date',r.date||today,'date')+optional(field('结束日期（可留空）','endDate',r.endDate||'','date'))+optional(field('具体时段（如 14:00—16:00）','time',r.time||''))+field('活动地点','place',r.place||'')+field('活动负责人','owner',r.owner||'')+optional(field('人员安排（每行填写岗位、人员与任务）','staffing',r.staffing||'','textarea'))+optional(field('活动内容与流程','agenda',r.agenda||'','textarea'))+optional(field('物资与准备事项','materials',r.materials||'','textarea'));
 else{
  const options=[{value:'',label:'不关联活动'},...active('events').map(e=>({value:e.id,label:e.title+' · '+e.date}))];
  const linked=find('events',r.eventId);if(linked?.deletedAt)options.push({value:linked.id,label:linked.title+'（已移入回收站）'});
  fields+=field('赞助方 / 合作方','organization',r.organization||'')+field('协会对接人','owner',r.owner||'')+optional(field('赞助方联系人与联系备注（仅填写测试资料）','contact',r.contact||''))+field('支持类型','supportType',r.supportType||'物资','text',['资金','物资','服务','其他'])+field('支持内容（金额、物资数量或服务事项）','supportContent',r.supportContent||'','textarea')+optional(field('关联活动','eventId',r.eventId||'','text',options))+optional(field('预计落实日期','targetDate',r.targetDate||'','date'))+optional(field('实际落实日期（已落实 / 已结束时必填）','receivedDate',r.receivedDate||'','date'));
 }
 fields+=field('状态','status',r.status||DanmiaoDomain.outreachStates[type][0],'text',DanmiaoDomain.outreachStates[type]);
 if(event)fields+=optional(field('实际完成日期（已完成时必填）','completedDate',r.completedDate||'','date'))+optional(field('活动成果 / 复盘（已完成时必填）','result',r.result||'','textarea'));
 fields+=optional(field('补充说明','note',r.note||'','textarea'));
 showModal((id?'编辑':'新增')+(event?'活动':'赞助')+'（测试）',fields,v=>wbSaveOutreach(type,v,id),'保存记录');
}
function wbOutreachDetail(type,id){
 const r=find(type,id);if(!r)return wbError('记录不存在');const event=type==='events',linked=find('events',r.eventId);
 const facts=event?{开始日期:r.date,结束日期:r.endDate,时段:r.time,地点:r.place,负责人:r.owner,人员安排:r.staffing,活动流程:r.agenda,准备事项:r.materials,实际完成:r.completedDate,活动成果:r.result,补充说明:r.note}:{赞助方:r.organization,协会对接人:r.owner,联系人备注:r.contact,支持类型:r.supportType,支持内容:r.supportContent,预计落实:r.targetDate,实际落实:r.receivedDate,补充说明:r.note};
 let html=`<div class="detail-summary"><strong>${esc(r.title)}</strong>${badge(r.status)}${r.deletedAt?'<span>已移入回收站</span>':''}</div><dl class="detail-fields outreach-details">${Object.entries(facts).filter(([,v])=>v).map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
 if(!event&&linked)html+=`<p>关联活动：${wbButton(esc(linked.title),'detail',`data-type="events" data-id="${esc(linked.id)}"`)}</p>`;
 if(event){const sponsors=active('sponsors').filter(s=>s.eventId===id);html+=`<section class="outreach-related"><h3>关联赞助 · ${sponsors.length}</h3>${sponsors.map(s=>wbButton(esc(s.organization)+' · '+esc(s.title),'detail',`data-type="sponsors" data-id="${esc(s.id)}"`)).join('')||'<p>暂无关联赞助</p>'}</section>`;}
 if(!r.deletedAt)html+=`<div class="detail-page-footer">${wbButton('编辑记录','edit',`data-type="${type}" data-id="${esc(id)}"`)}</div>`;
 showModal((event?'活动详情':'赞助详情')+'（测试）',html,null);
}

let wbAnnouncementTimer=null;
const wbAnnouncementMemory=new Map();
function wbCanEditAnnouncements(){return !window.DanmiaoBackend||window.DanmiaoBackend.user?.role==='admin';}
function wbPublishedAnnouncements(){return active('announcements').filter(r=>r.status==='已发布');}
function wbNoticeStorageKey(){return 'campus-cat-notices-seen:'+String(window.DanmiaoBackend?.user?.id||'demo');}
function wbNoticeSeen(){const key=wbNoticeStorageKey(),seen=new Set(wbAnnouncementMemory.get(key)||[]);try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))for(const v of value)if(typeof v==='string')seen.add(v);}catch{}return seen;}
function wbMarkNoticesRead(rows){const key=wbNoticeStorageKey(),seen=wbNoticeSeen();for(const row of rows)seen.add(DanmiaoDomain.announcementKey(row));const values=[...seen].slice(-100);wbAnnouncementMemory.set(key,values);try{localStorage.setItem(key,JSON.stringify(values));}catch{}}
function wbAnnouncementBar(){
 const rows=wbPublishedAnnouncements(),edit=wbCanEditAnnouncements();
 if(!rows.length)return edit?`<div class="announcement-empty"><span>暂无已发布公告</span>${wbButton('＋ 发布公告','announcement-new')}${active('announcements').length?wbButton('管理公告','announcement-manage'):''}</div>`:'';
 return `<section class="announcement-bar" aria-label="首页公告"><strong>公告</strong><button type="button" id="wb-announcement-ticker" class="announcement-ticker ${rows.length>1?'is-cycling':''}" data-action="wb-announcement-ticker" data-id="${esc(rows[0].id)}" aria-label="${edit?'点击编辑公告':'点击查看公告'}"><span>${esc(rows[0].title)}</span></button><span class="announcement-count">${rows.length} 条</span>${wbButton(edit?'管理公告':'查看全部',edit?'announcement-manage':'announcement-read')}</section>`;
}
function wbReadAnnouncements(){
 const rows=wbPublishedAnnouncements();if(!rows.length)return wbCanEditAnnouncements()?wbManageAnnouncements():wbError('暂无已发布公告');
 showModal('公告栏',`<div class="announcement-list">${rows.map(r=>`<article><div class="section-caption"><h3>${esc(r.title)}</h3>${wbCanEditAnnouncements()?wbButton('编辑公告','announcement-edit',`data-id="${esc(r.id)}"`):''}</div><p>${esc(r.content)}</p></article>`).join('')}</div><p class="form-hint">关闭后，同一浏览器不会重复弹出已读内容；公告正文更新后会再次提醒。</p>`,null);
 wbMarkNoticesRead(rows);
}
function wbAnnouncementsPage(){return wbTop('公告', '查看最新通知与公告。')+wbPublishedAnnouncements().map(r=>`<article class="announcement-page-item"><h2>${esc(r.title)}</h2><p>${esc(r.content)}</p>${wbCanEditAnnouncements()?wbButton('编辑公告','announcement-edit',`data-id="${esc(r.id)}"`):''}</article>`).join('');}
function wbManageAnnouncements(){
 if(!wbCanEditAnnouncements())return wbReadAnnouncements();
 showModal('管理公告',`<div class="announcement-manage">${active('announcements').map(r=>`<article><div><strong>${esc(r.title)}</strong>${badge(r.status)}</div>${wbButton('编辑','announcement-edit',`data-id="${esc(r.id)}"`)}${button('移入回收站','delete',`data-type="announcements" data-id="${esc(r.id)}"`)}</article>`).join('')||'<p>暂无公告，可新增后发布。</p>'}</div>${wbButton('＋ 新增公告','announcement-new')}`,null);
}
function wbSaveAnnouncement(values,id){
 if(!wbCanEditAnnouncements())return wbError('仅管理员可管理公告');
 const old=find('announcements',id);if(id&&(!old||old.deletedAt))return wbError('公告已删除或不可用');
 const row={title:String(values.title||'').trim(),content:String(values.content||'').trim(),status:values.status};
 const error=DanmiaoDomain.announcementError(row);if(error)return wbError(error);
 return !!writeRecord('announcements',row,id);
}
function wbAnnouncementForm(id){
 if(!wbCanEditAnnouncements())return wbReadAnnouncements();const r=find('announcements',id)||{};if(id&&(!r.id||r.deletedAt))return wbError('公告已删除或不可用');
 showModal((id?'编辑':'发布')+'公告',`<div class="announcement-editor">${field('公告标题（120字以内）','title',r.title||'').replace('name="title"','name="title" maxlength="120"')}${field('公告正文（8000字以内）','content',r.content||'','textarea').replace('name="content"','name="content" maxlength="8000"')}${field('发布状态','status',r.status||'已发布','text',['草稿','已发布','已撤下'])}</div>`,v=>wbSaveAnnouncement(v,id),'保存公告');
}
function wbStartAnnouncements(){
 if(wbAnnouncementTimer){clearInterval(wbAnnouncementTimer);wbAnnouncementTimer=null;}
 const rows=wbPublishedAnnouncements();
 if(page==='overview'&&rows.length>1){let index=0;wbAnnouncementTimer=setInterval(()=>{const button=document.querySelector('#wb-announcement-ticker');if(!button)return;index=(index+1)%rows.length;button.dataset.id=rows[index].id;button.querySelector('span').textContent=rows[index].title;},5000);}
 if(rows.length&&!document.querySelector('#dialog')?.open){const seen=wbNoticeSeen();if(rows.some(r=>!seen.has(DanmiaoDomain.announcementKey(r))))wbReadAnnouncements();}
}
function wbAnnouncementAction(action,ds){
 if(!action.startsWith('wb-announcement-'))return false;
 if(action==='wb-announcement-new')wbAnnouncementForm();
 if(action==='wb-announcement-edit')wbAnnouncementForm(ds.id);
 if(action==='wb-announcement-manage')wbManageAnnouncements();
 if(action==='wb-announcement-read')wbReadAnnouncements();
 if(action==='wb-announcement-ticker'){if(wbCanEditAnnouncements())wbAnnouncementForm(ds.id);else wbReadAnnouncements();}
 return true;
}
