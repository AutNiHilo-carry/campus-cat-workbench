/* Local service adapter. The original index.html remains a standalone demo. */
(async()=>{
 const collections=['cats','rescue','foster','adoption','sterilization','inventory','loans','movements','sales','finance','stories','monthly','events','sponsors','announcements'];
 const roleNames={admin:'管理员',finance:'财务',adoption:'领养负责人',member:'成员',viewer:'只读'};
 const clone=value=>JSON.parse(JSON.stringify(value));
 let csrf='',user=null,appLoaded=false;
 async function api(url,options={}){const response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers}});const result=await response.json().catch(()=>{throw new Error('服务响应异常，请检查服务连接');});if(!response.ok)throw Object.assign(new Error(result.error||'服务请求失败'),{status:response.status});return result;}
 const session=await api('/api/session').catch(error=>{document.querySelector('#auth-intro').textContent='本地服务连接失败，请确认服务已启动。';throw error;});
 if(session.user){user=session.user;csrf=session.csrf;}
 const setup=session.setupRequired,form=document.querySelector('#auth-form');
 document.querySelector('#auth-intro').textContent=setup?'首次使用，请创建管理员账号。密码至少10位。':'登录后使用共享数据库中的记录。';
 document.querySelector('#setup-token').hidden=!(setup&&session.setupTokenRequired);form.elements.setupToken.required=setup&&session.setupTokenRequired;
 document.querySelector('#setup-name').hidden=!setup;form.elements.name.required=setup;form.elements.password.autocomplete=setup?'new-password':'current-password';document.querySelector('#auth-submit').textContent=setup?'创建管理员并进入':'登录';form.hidden=!!session.user;
 form.addEventListener('submit',async event=>{event.preventDefault();const button=document.querySelector('#auth-submit');button.disabled=true;document.querySelector('#auth-error').textContent='';try{const result=await api(setup?'/api/setup':'/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});user=result.user;csrf=result.csrf;await start();}catch(error){document.querySelector('#auth-error').textContent=error.message;button.disabled=false;}});
 function diff(before,after){const changes=[];for(const c of collections){const base=new Map((before[c]||[]).map(r=>[r.id,r]));for(const row of after[c]||[]){const prior=base.get(row.id)||null;if(c==='monthly'&&(row.auto||prior?.auto)&&row.manualResult===prior?.manualResult)continue;if(JSON.stringify(row)!==JSON.stringify(prior))changes.push({collection:c,id:row.id,before:prior,after:row});}}return changes;}
 const backend={listCache:new Map(),state:null,revision:0,summaries:{},pending:0,queue:Promise.resolve(),failedDraft:null,stopped:false,
  async uploadFiles(files,contract=false){const refs=[];for(const file of files){const result=await api('/api/files?kind='+(contract?'agreement':'image')+'&name='+encodeURIComponent(file.name),{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream'}});refs.push(result.file);}return refs;},
  loadImages(){for(const el of document.querySelectorAll('img[data-asset],a[data-asset-file]')){const id=el.dataset.asset||el.dataset.assetFile;if(el.dataset.assetFile)el.href='/api/files/'+encodeURIComponent(id);else el.src='/api/files/'+encodeURIComponent(id);}},
  commit(value,message){if(this.stopped){this.failedDraft=clone(value);toast('有尚未保存的修改，请先处理页面顶部提示');return;}const snapshot=clone(value),changes=diff(this.lastSubmitted,snapshot);if(!changes.length)return;this.lastSubmitted=snapshot;const requestKey=crypto.randomUUID();this.pending++;this.paint();
   this.queue=this.queue.then(async()=>{if(this.stopped){this.pending--;this.paint();return;}try{const result=await api('/api/commands',{method:'PATCH',headers:{'Idempotency-Key':requestKey},body:JSON.stringify({changes,message,since:this.revision,day:this.day})});await this.accept(result,this.pending===1);toast('已保存到数据库');}catch(error){this.stopped=true;this.failedDraft=clone(this.lastSubmitted);this.error=error.message;toast('保存失败：'+error.message);}finally{this.pending--;this.paint();}});
  },
  paint(){if(!appLoaded)return;const status=document.querySelector('.server-status');if(status){status.textContent=this.stopped?'保存失败':this.pending?'保存中…':'已连接';status.classList.toggle('is-error',this.stopped);}let notice=document.querySelector('#backend-notice');if(this.stopped&&!notice){notice=document.createElement('div');notice.id='backend-notice';notice.className='backend-notice';notice.innerHTML=`<strong>修改尚未保存</strong><p></p><button class="button secondary" type="button" id="backend-save-draft">下载未保存的数据</button><button class="button secondary" type="button" id="backend-reload">重新加载服务数据</button>`;document.querySelector('#main').prepend(notice);notice.querySelector('p').textContent=this.error;notice.querySelector('#backend-save-draft').onclick=()=>download(JSON.stringify(this.failedDraft,null,2),'大学猫协-未保存的修改.json','application/json');notice.querySelector('#backend-reload').onclick=()=>location.reload();}},
  clearLists(){this.listCache.clear();},
  getList(request){
   if(this.pending||this.stopped)return null;
   const signature=JSON.stringify([this.revision,this.day,request]),cached=this.listCache.get(signature);if(cached)return cached;
   this.activeList=signature;const loading={loading:true};this.listCache.set(signature,loading);
   if(this.listCache.size>20)this.listCache.delete(this.listCache.keys().next().value);
   const expected=this.revision;
   api('/api/records/'+request.collection+'?'+new URLSearchParams(request.params)).then(async result=>{
    if(this.pending||this.stopped||this.revision!==expected){this.listCache.delete(signature);return;}
    if(result.revision!==expected||result.day!==this.day){this.listCache.delete(signature);await this.refresh();if(this.activeList===signature&&wbPageKey()===request.key)wbRefresh();return;}
    this.listCache.set(signature,result);if(this.activeList===signature&&wbPageKey()===request.key)wbRefresh();
   }).catch(error=>{this.listCache.set(signature,{error:error.message});if(this.activeList===signature&&wbPageKey()===request.key)wbRefresh();});
   return loading;
  },
  async accept(reply,updateUI=true){
   let result=reply;if(result.resetRequired)result=await api('/api/state');
   if(result.unchanged)return;
   if(result.state)this.state=clone(result.state);
   else{
    for(const change of result.changes||[]){const rows=this.state[change.collection],index=rows.findIndex(r=>r.id===change.id);if(change.record){if(index<0)rows.unshift(change.record);else rows[index]=change.record;}else if(index>=0)rows.splice(index,1);}
    for(const [collection,ids]of Object.entries(result.orders||{})){const order=new Map(ids.map((id,i)=>[id,i]));this.state[collection].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));}
    this.state.audit=result.audit||[];this.state.dismissed=result.dismissed||[];
   }
   this.revision=result.revision;this.day=result.day;this.summaries=result.summaries;this.clearLists();
   if(updateUI){this.lastSubmitted=clone(this.state);data=clone(this.state);wbStockFingerprints=new Map(data.inventory.map(i=>[i.id,wbStockFingerprint(i)]));render();}
  },
  async refresh(){
   if(this.refreshing||this.pending||this.stopped||document.querySelector('#dialog')?.open)return;
   this.refreshing=true;const expected=this.revision;
   try{let result=await api('/api/changes?since='+this.revision+'&day='+encodeURIComponent(this.day||''));if(result.resetRequired)result=await api('/api/state');if(!this.pending&&!this.stopped&&this.revision===expected&&!document.querySelector('#dialog')?.open)await this.accept(result);}finally{this.refreshing=false;}
  }

 };
 if(session.user){await start();return;}
 async function start(){
  const result=await api('/api/state');Object.assign(backend,{user,state:result.state,lastSubmitted:clone(result.state),revision:result.revision,day:result.day,summaries:result.summaries});window.DanmiaoBackend=backend;
  const shell=new DOMParser().parseFromString(await(await fetch('/app-shell')).text(),'text/html');
  for(const link of shell.querySelectorAll('link[rel="stylesheet"]')){const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=link.getAttribute('href');document.head.append(stylesheet);}
  const backendStyle=document.createElement('link');backendStyle.rel='stylesheet';backendStyle.href='backend.css';document.head.append(backendStyle);
  const scripts=[...shell.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));shell.querySelectorAll('script').forEach(s=>s.remove());document.body.className='role-'+user.role;document.body.innerHTML=shell.body.innerHTML;
  for(const src of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('加载程序失败'));document.body.append(script);});
  appLoaded=true;
  const baseRender=wbRender;wbRender=function(){baseRender();decorate();};
  const baseFinance=wbFinance;wbFinance=function(store,month){return backend.summaries[month]||{income:0,expense:0,unconfirmed:0,pending:Object.values(backend.summaries)[0]?.pending||0,balance:Object.values(backend.summaries)[0]?.balance||0};};
  const baseFinanceForm=wbEditFinance;wbEditFinance=function(id){baseFinanceForm(id);if(!['admin','finance'].includes(user.role)){const select=document.querySelector('select[name="flow"]');if(select){for(const option of [...select.options])if(option.value!=='个人垫付')option.remove();select.value='个人垫付';select.dispatchEvent(new Event('change',{bubbles:true}));}const owner=document.querySelector('[name="owner"]');if(owner&&!owner.value)owner.value=user.name;}};
  const baseAction=wbHandleAction;wbHandleAction=function(action,ds){if(action==='wb-manage'){manage();return true;}if(action==='wb-server-users'){users();return true;}return baseAction(action,ds);};
  const oldEditFollowup=wbEditFollowup;wbEditFollowup=function(...args){oldEditFollowup(...args);backend.loadImages();};
  window.addEventListener('beforeunload',event=>{if(backend.pending||backend.stopped){event.preventDefault();event.returnValue='';}});
  render();setInterval(()=>backend.refresh().catch(error=>{const status=document.querySelector('.server-status');if(status)status.textContent=error.status===401?'登录已过期，请刷新登录':'连接中断';}),5000);
 }
 function decorate(){
  document.title='大学猫协一站通 · Campus Cat Workbench';const header=document.querySelector('.header-right');if(!header.querySelector('.server-toolbar')){const toolbar=document.createElement('div');toolbar.className='server-toolbar';toolbar.innerHTML='<span class="server-status">已连接</span><span class="user-role"></span><button type="button" class="button secondary" id="server-refresh">刷新</button>';toolbar.querySelector('.user-role').textContent=roleNames[user.role];toolbar.querySelector('button').onclick=()=>backend.refresh().catch(e=>toast(e.message));header.prepend(toolbar);}
  const pill=document.querySelector('.demo-pill');if(pill)pill.textContent=user.name;const profile=document.querySelector('#profile');if(profile)profile.innerHTML=`<span class="avatar">${esc(user.name[0])}</span><span>${esc(user.name)}<small>${roleNames[user.role]}</small></span><span>⌄</span>`;backend.paint();
  if(!['admin','adoption'].includes(user.role))for(const input of document.querySelectorAll('[data-wb-upload="agreements"]'))input.closest('.upload-label').hidden=true;
 }
 async function manage(){let backupStatus='';if(user.role==='admin'){try{const s=await api('/api/backup-status');backupStatus='<p class="backend-help">自动备份：'+(s.enabled?'已开启':'未开启')+'；最近成功：'+esc(s.lastSuccess?new Date(s.lastSuccess).toLocaleString('zh-CN'):'暂无记录')+(s.lastFailure&&(!s.lastSuccess||s.lastFailure>s.lastSuccess)?'。最近备份失败，请检查服务器存储。':'')+'</p>';}catch{backupStatus='<p class="backend-help">暂时无法读取备份状态，请检查服务连接。</p>';}}showModal('协作服务',`<p class="backend-help">当前账号：${esc(user.name)} · ${roleNames[user.role]}。记录统一保存在服务器 SQLite 数据库，图片和协议存放在服务的数据目录。</p>${backupStatus}<div class="manage-options">${user.role==='admin'?'<button class="button secondary" type="button" id="server-users">账号与权限</button><button class="button secondary" type="button" id="server-backup-now">创建服务器备份</button><a class="button secondary" href="/api/backup" download>下载完整备份（含照片和协议）</a><label class="upload-label">恢复完整备份<input type="file" id="server-restore" accept="application/json,.json"></label>':''}<button class="button secondary" id="server-password" type="button">修改密码</button><button class="button secondary" id="server-history" type="button">记录与回收站</button><button class="button secondary" id="server-logout" type="button">退出登录</button></div>`,null);if(user.role==='admin'){document.querySelector('#server-users').onclick=users;document.querySelector('#server-backup-now').onclick=async event=>{event.target.disabled=true;try{await api('/api/system-backup',{method:'POST',body:'{}'});toast('服务器备份已完成');await manage();}catch(error){toast('备份失败：'+error.message);event.target.disabled=false;}};document.querySelector('#server-restore').onchange=restoreBackup;}document.querySelector('#server-password').onclick=()=>passwordForm();document.querySelector('#server-history').onclick=()=>{$('#dialog').close();go('history');};document.querySelector('#server-logout').onclick=async()=>{if(backend.pending)return toast('正在保存，请稍后退出');await api('/api/logout',{method:'POST',body:'{}'});location.reload();};}
 async function users(){try{const result=await api('/api/users');showModal('账号与权限',`<div class="server-users">${result.users.map(u=>`<article><strong>${esc(u.name)} · ${esc(u.username)}</strong><span>${roleNames[u.role]}${u.disabled?' · 已停用':''}</span>${u.id!==user.id?`<label>角色<select data-user-role="${u.id}">${Object.entries(roleNames).map(([value,label])=>`<option value="${value}" ${u.role===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="button secondary" type="button" data-user-reset="${u.id}">重置密码</button><button class="button secondary" type="button" data-user-save="${u.id}">保存角色</button><button class="button secondary" type="button" data-user-toggle="${u.id}">${u.disabled?'启用':'停用'}</button>`:''}</article>`).join('')}</div><div class="detail-page-footer"><button class="button primary" id="server-user-new" type="button">新增账号</button></div>`,null);for(const button of document.querySelectorAll('[data-user-toggle]'))button.onclick=async()=>{try{const target=result.users.find(u=>u.id===button.dataset.userToggle);await api('/api/users/'+target.id,{method:'PATCH',body:JSON.stringify({role:target.role,disabled:!target.disabled})});users();}catch(e){toast(e.message);}};for(const button of document.querySelectorAll('[data-user-save]'))button.onclick=async()=>{try{const target=result.users.find(u=>u.id===button.dataset.userSave),role=document.querySelector('[data-user-role="'+target.id+'"]').value;await api('/api/users/'+target.id,{method:'PATCH',body:JSON.stringify({role,disabled:target.disabled})});users();toast('角色已更新，该用户需重新登录');}catch(e){toast(e.message);}};for(const button of document.querySelectorAll('[data-user-reset]'))button.onclick=()=>passwordForm(result.users.find(u=>u.id===button.dataset.userReset));document.querySelector('#server-user-new').onclick=newUser;}catch(e){toast(e.message);}}
 function passwordForm(target){
  if(backend.pending||backend.stopped)return toast('请先保存当前修改后再操作密码');
  showModal(target?'重置 '+target.name+' 的密码':'修改密码',`<p class="backend-help">${target?'验证你的管理员密码后重置该账号。':'修改成功后需重新登录。'}该账号全部旧会话都会失效。</p>`+field(target?'你的管理员密码':'当前密码','currentPassword','','password')+field('新密码（10至128位）','newPassword','','password')+field('再次输入新密码','confirmPassword','','password'),v=>{
   if(v.newPassword!==v.confirmPassword){toast('两次输入的新密码不一致');return false;}
   const submit=document.querySelector('#form button[type="submit"]');submit.disabled=true;
   api(target?'/api/users/'+target.id+'/password':'/api/password',{method:'POST',body:JSON.stringify({currentPassword:v.currentPassword,newPassword:v.newPassword})}).then(()=>{if(target){toast('密码已重置，请通过私密渠道交付新密码');users();}else location.reload();}).catch(error=>{toast(error.message);submit.disabled=false;});return false;
  },target?'重置密码':'修改并重新登录');
  for(const input of document.querySelectorAll('#form input[type="password"]')){input.maxLength=128;input.minLength=10;input.autocomplete=input.name==='currentPassword'?'current-password':'new-password';}
 }
 async function restoreBackup(event){const file=event.target.files[0];if(!file)return;if(backend.pending)return toast('正在保存，请稍后恢复');try{if(file.size>150*1024*1024)throw new Error('备份文件超过150MB');const value=JSON.parse(await file.text());if(value.format!=='danmiao-backup-v1')throw new Error('请选择协作版导出的完整备份，普通演示 JSON 不含附件');showModal('恢复完整备份',`<p class="backend-help">将替换当前业务记录，恢复备份中的照片与协议。现有账号不变。请先下载当前数据的完整备份。</p><p>备份时间：${esc(value.exportedAt||'未知')} · ${(value.files||[]).length} 个附件</p>`,()=>{const submit=document.querySelector('#form button[type="submit"]');submit.disabled=true;api('/api/restore',{method:'POST',body:JSON.stringify(value)}).then(()=>location.reload()).catch(error=>{submit.disabled=false;toast(error.message);});return false;},'确认恢复');}catch(e){toast(e.message);}}
 function newUser(){showModal('新增账号',field('用户名（字母 / 数字，3至40位）','username','')+field('显示名称','name','')+field('初始密码（至少10位）','password','','password')+field('角色','role','member','text',Object.entries(roleNames).map(([value,label])=>({value,label}))),v=>{const submit=document.querySelector('#form button[type="submit"]');submit.disabled=true;api('/api/users',{method:'POST',body:JSON.stringify(v)}).then(()=>{users();toast('账号已创建');}).catch(e=>toast(e.message)).finally(()=>submit.disabled=false);return false;},'创建账号');}
})().catch(error=>{console.error(error);const intro=document.querySelector('#auth-intro');if(intro)intro.textContent=error.message;});
