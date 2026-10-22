const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const {engine} = require('./engine.cjs');
const COLLECTIONS = ['cats','rescue','foster','adoption','sterilization','inventory','loans','movements','sales','finance','stories','monthly'];
class Store {
  constructor(directory,{seedMode='demo'}={}) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(path.join(this.directory,'uploads'), {recursive:true});
    this.db = new DatabaseSync(path.join(this.directory,'workbench.sqlite'));
    if(this.db.prepare('PRAGMA user_version').get().user_version>3){this.db.close();throw new Error('数据库版本高于当前程序，拒绝降级写入');}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(collection,id));
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,mime TEXT NOT NULL,kind TEXT NOT NULL,size INTEGER NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,user_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,changes TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(user_id TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,key));
      CREATE INDEX IF NOT EXISTS audit_time ON audit(time);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS record_changes(revision INTEGER NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,body TEXT,before_body TEXT,PRIMARY KEY(revision,collection,id));
      CREATE INDEX IF NOT EXISTS records_status ON records(collection,json_extract(body,'$.status'));
      CREATE INDEX IF NOT EXISTS records_date ON records(collection,json_extract(body,'$.date'));
      PRAGMA user_version=3;`);
    if(!this.db.prepare('SELECT value FROM meta WHERE key=?').get('changes_floor'))this.db.prepare('INSERT INTO meta VALUES(?,?)').run('changes_floor',this.db.prepare('SELECT value FROM meta WHERE key=?').get('revision')?.value||'0');
    if(!this.db.prepare('PRAGMA table_info(record_changes)').all().some(c=>c.name==='before_body'))this.db.exec('ALTER TABLE record_changes ADD COLUMN before_body TEXT');
    for(const c of COLLECTIONS)if(!this.db.prepare('SELECT value FROM meta WHERE key=?').get('order:'+c))this.db.prepare('INSERT INTO meta VALUES(?,?)').run('order:'+c,JSON.stringify(this.db.prepare('SELECT id FROM records WHERE collection=? ORDER BY rowid').all(c).map(r=>r.id)));
    if (!this.db.prepare('SELECT value FROM meta WHERE key=?').get('revision')){
      const initial=engine().state;if(seedMode==='empty'){for(const c of COLLECTIONS)initial[c]=[];initial.audit=[];initial.activities=[];initial.dismissed=[];}
      this.transaction(()=>this.save(initial,0));
    }
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE');try {const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  load() {
    const state = {schemaVersion:4,activities:[],audit:[],dismissed:[]};
    for (const c of COLLECTIONS) state[c]=[];
    for (const r of this.db.prepare('SELECT collection,body FROM records ORDER BY rowid').all()) state[r.collection].push(JSON.parse(r.body));
    for(const c of COLLECTIONS){const ids=JSON.parse(this.db.prepare('SELECT value FROM meta WHERE key=?').get('order:'+c)?.value||'[]'),positions=new Map(ids.map((id,index)=>[id,index]));state[c].sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity));}
    state.dismissed=JSON.parse(this.db.prepare('SELECT value FROM meta WHERE key=?').get('dismissed')?.value||'[]');
    state.audit=this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all().map(a=>({id:'AUDIT-'+a.id,time:a.time,actor:a.actor,action:a.action,changes:JSON.parse(a.changes)}));
    return state;
  }
  save(state, revision) {
    const current=new Map(this.db.prepare('SELECT collection,id,body FROM records').all().map(r=>[r.collection+':'+r.id,r]));
    const upsert=this.db.prepare('INSERT INTO records(collection,id,body) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body');
    const remove=this.db.prepare('DELETE FROM records WHERE collection=? AND id=?');
    const change=this.db.prepare('INSERT OR REPLACE INTO record_changes(revision,collection,id,body,before_body) VALUES(?,?,?,?,?)');
    const meta=this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value');
    let written=0;
    for(const c of COLLECTIONS){
      for(const row of state[c]||[]){const key=c+':'+row.id,body=JSON.stringify(row),before=current.get(key);if(before?.body!==body){upsert.run(c,row.id,body);change.run(revision,c,row.id,body,before?.body??null);written++;}current.delete(key);}
      meta.run('order:'+c,JSON.stringify((state[c]||[]).map(r=>r.id)));
    }
    for(const row of current.values()){remove.run(row.collection,row.id);change.run(revision,row.collection,row.id,null,row.body);written++;}
    meta.run('revision',String(revision));meta.run('dismissed',JSON.stringify(state.dismissed||[]));
    const floor=Math.max(Number(this.db.prepare('SELECT value FROM meta WHERE key=?').get('changes_floor').value),0,revision-1000);meta.run('changes_floor',String(floor));this.db.prepare('DELETE FROM record_changes WHERE revision<?').run(floor);
    this.lastWriteCount=written;
  }
  changesSince(since){
    const floor=Number(this.db.prepare('SELECT value FROM meta WHERE key=?').get('changes_floor').value);
    if(!Number.isSafeInteger(since)||since<0||since>this.revision()||since<floor)return null;
    const rows=this.db.prepare('SELECT collection,id,body,before_body FROM record_changes WHERE revision>? ORDER BY revision').all(since);
    if(rows.length>5000)return null;
    const latest=new Map();for(const row of rows){const key=row.collection+':'+row.id,prior=latest.get(key);latest.set(key,{...row,before_body:prior?prior.before_body:row.before_body});}
    return [...latest.values()].map(r=>({collection:r.collection,id:r.id,record:r.body?JSON.parse(r.body):null,prior:r.before_body?JSON.parse(r.before_body):null}));
  }
  revision(){return Number(this.db.prepare('SELECT value FROM meta WHERE key=?').get('revision').value);}
  close(){this.db.close();}
}
module.exports={Store,COLLECTIONS};
