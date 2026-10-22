const {assert,today,financeAccess,agreementAccess}=require('./validation.cjs');
const domain=require('../shared-domain.js');
function visibleRecord(collection,record,user){
 if(!record)return null;
 if(collection==='announcements'&&user.role!=='admin'&&(record.status!=='已发布'||record.deletedAt))return null;
 if(collection==='finance'&&!financeAccess(user)&&!(record.flow==='个人垫付'&&record.createdBy===user.id))return null;
 const out=structuredClone(record);
 if(collection==='adoption'&&!agreementAccess(user)){out.agreements=[];out.deletedFiles=(out.deletedFiles||[]).filter(e=>e.key!=='agreements');}
 return out;
}
function listRecords(store,collection,params,user){
 assert(require('./store.cjs').COLLECTIONS.includes(collection),'未知模块',404);
 const db=store.db,get=name=>params.get(name)||'',integer=(name,fallback,max)=>{const text=get(name);if(!text)return fallback;const n=Number(text);assert(/^\d+$/.test(text)&&Number.isSafeInteger(n)&&n>=1&&n<=max,'分页参数无效');return n;};
 const requested=integer('page',1,1000000),size=integer('pageSize',10,100),q=get('q'),month=get('month');
 assert(q.length<=200&&(!month||/^\d{4}-(0[1-9]|1[0-2])$/.test(month)),'搜索或月份参数无效');
 const field=name=>`json_extract(r.body,'$.${name}')`,where=['r.collection=?'],args=[collection];
 function add(sql,...values){where.push(sql);args.push(...values);}
 function exact(name,value){if(value)add(field(name)+'=?',value);}
 add(`coalesce(${field('deletedAt')},'')=''`);
 if(collection==='announcements'&&user.role!=='admin')exact('status','已发布');
 if(collection==='finance'&&!financeAccess(user))add(`${field('flow')}='个人垫付' AND ${field('createdBy')}=?`,user.id);
 if(q){
  // Search the same projection returned to this actor, including counts and target pages.
  db.function('danmiao_search_visible',text=>JSON.stringify(visibleRecord(collection,JSON.parse(text),user)).toLowerCase());
  add('instr(danmiao_search_visible(r.body),?)>0',q.toLowerCase());
 }
 exact('status',get('status'));
 if(collection==='inventory')exact('group',get('group'));
 if(collection==='sales')exact('channel',get('channel'));
 if(collection==='movements'&&get('group'))add(`(${field('itemId')} IS NULL OR ${field('itemId')}='' OR EXISTS(SELECT 1 FROM records i WHERE i.collection='inventory' AND i.id=${field('itemId')} AND json_extract(i.body,'$.group')=?))`,get('group'));
 const tab=get('tab');
 if(['events','sponsors'].includes(collection)){if(collection==='events'&&tab==='即将开展'){add(`${field('date')}>=? AND ${field('status')} NOT IN ('已完成','已取消')`,today());}else if(tab&&tab!=='全部'){assert(domain.outreachStates[collection].includes(tab),'无效活动或赞助状态');exact('status',tab);}if(get('eventId'))exact('eventId',get('eventId'));}
 if(collection==='cats'&&tab&&tab!=='全部'){assert(['已领养','已去喵星'].includes(tab),'无效档案分类');const state=store.load(),categories=new Map(state.cats.map(c=>[c.id,domain.catCategory(state,c)]));db.function('danmiao_cat_category',id=>categories.get(id)||'其他');add('danmiao_cat_category(r.id)=?',tab);}
 if(['rescue','foster'].includes(collection)&&tab&&tab!=='全部')exact('status',tab);
 if(collection==='sterilization'&&tab){exact('status',tab);if(tab==='已放归'&&month)add(`substr(${field('releaseDate')},1,7)=?`,month);}
 if(collection==='adoption'&&tab){
  if(tab==='已领养'){
   db.function('danmiao_followup',text=>domain.followup(JSON.parse(text),today()).label);
   const completed=get('followup')==='已回访';
   add(`((${field('status')}='已领养' AND danmiao_followup(r.body)=?)${completed&&get('history')==='1'?` OR ${field('status')}='已退养'`:''})`,completed?'已完成':'待回访');
  }else{add(`${field('status')} IN ('无领养人','有意向领养人')`);if(get('intent')&&get('intent')!=='全部')exact('status',get('intent'));}
 }
 if(collection==='finance'){
  if(tab==='待结清')add(`((${field('flow')}='个人垫付' AND ${field('status')}='审核通过') OR (${field('flow')}='协会欠款' AND ${field('status')}='待付款'))`);
  else if(tab==='收入待确认')add(`${field('flow')}='收入' AND (${field('status')}='待确认' OR ${field('refundReview')}=1)`);
  else if(tab==='报销待审核')add(`${field('flow')}='个人垫付' AND ${field('status')}='待审核'`);
  else if(tab==='待处理')add(`(${field('status')} IN ('待确认','待审核') OR ${field('refundReview')}=1)`);
  else if(month)add(`substr(${field('date')},1,7)=?`,month);
  if(tab==='明细'&&get('direction')&&get('direction')!=='全部')add(field('flow')+(get('direction')==='收入'?"='收入'":"<>'收入'"));
 }
 if(collection==='monthly'){if(month)add(`substr(${field('date')},1,7)=?`,month);if(get('category')&&get('category')!=='全部')exact('category',get('category'));}
 const from=`json_each((SELECT value FROM meta WHERE key='order:${collection}')) o CROSS JOIN records r ON r.id=o.value AND r.collection='${collection}'`;
 const condition=where.map(x=>'('+x+')').join(' AND '),order=collection==='events'?`${field('date')} ASC,cast(o.key AS INTEGER),r.id`:collection==='monthly'?`${field('date')} DESC,cast(o.key AS INTEGER),r.id`:'coalesce(cast(o.key AS INTEGER),r.rowid),r.id';
 const grouped=collection==='inventory'&&get('grouped')==='1';
 let total,recordTotal,rows,current,pages;
 const target=get('target');assert(target.length<=120,'目标记录编号无效');
 if(grouped){
  const groupKey=`json_array(${['group','name','variant','kind','unit'].map(k=>k==='variant'?`coalesce(${field(k)},'')`:field(k)).join(',')})`;
  const groups=db.prepare(`SELECT ${groupKey} AS k,min(coalesce(cast(o.key AS INTEGER),r.rowid)) AS pos,count(*) AS n FROM ${from} WHERE ${condition} GROUP BY k ORDER BY pos,k`).all(...args);
  total=groups.length;recordTotal=groups.reduce((n,g)=>n+g.n,0);pages=Math.max(1,Math.ceil(total/size));current=Math.min(requested,pages);
  if(target){const targetKey=db.prepare(`SELECT ${groupKey} AS k FROM ${from} WHERE ${condition} AND r.id=?`).get(...args,target)?.k;const i=groups.findIndex(g=>g.k===targetKey);if(i>=0)current=Math.floor(i/size)+1;}
  const selected=groups.slice((current-1)*size,current*size).map(g=>g.k);
  rows=selected.length?db.prepare(`SELECT r.body FROM ${from} WHERE ${condition} AND ${groupKey} IN (${selected.map(()=>'?').join(',')}) ORDER BY ${order}`).all(...args,...selected):[];
 }else{
  total=Number(db.prepare(`SELECT count(*) AS n FROM ${from} WHERE ${condition}`).get(...args).n);recordTotal=total;pages=Math.max(1,Math.ceil(total/size));current=Math.min(requested,pages);
  if(target){const ranked=db.prepare(`SELECT number FROM (SELECT r.id,row_number() OVER(ORDER BY ${order}) AS number FROM ${from} WHERE ${condition}) WHERE id=?`).get(...args,target);if(ranked)current=Math.floor((Number(ranked.number)-1)/size)+1;}
  rows=db.prepare(`SELECT r.body FROM ${from} WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,size,(current-1)*size);
 }
 return{records:rows.map(r=>visibleRecord(collection,JSON.parse(r.body),user)),total,recordTotal,page:current,pages,pageSize:size,grouped,revision:store.revision(),day:today()};
}
module.exports={listRecords,visibleRecord};
