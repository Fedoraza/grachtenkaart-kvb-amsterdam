import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'

test('open signup cannot elevate privileges; only assigned Flagship employees see planning and crew', {timeout:30000}, async t => {
  const dir=await mkdtemp(join(tmpdir(),'boottracker-accounts-'))
  await mkdir(join(dir,'data'))
  const reservation=createServer()
  await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port
  await new Promise(r=>reservation.close(r))
  const child=spawn(process.execPath,[resolve('server.mjs')],{cwd:dir,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),DATABASE_PATH:join(dir,'data/test.sqlite'),WHATSAPP_ENABLED:'false',AISSTREAM_API_KEY:'',AUTH_SETUP_TOKEN:'initial-setup-secret',DATABASE_BACKUP_DIRECTORY:join(dir,'backups')},stdio:['ignore','pipe','pipe']})
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c)
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit')}await rm(dir,{recursive:true,force:true})})
  const origin=`http://127.0.0.1:${port}`
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/healthz')).ok)break}catch{}if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,100))}
  const call=(path,method='GET',body,cookie='',headers={})=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})
  const credentials={name:'Public user',email:'public@example.invalid',password:'correct-horse-battery',confirmPassword:'correct-horse-battery',role:'admin'}
  assert.equal((await call('/api/auth/register','POST',credentials)).status,409)
  const setup=await call('/api/auth/setup','POST',{...credentials,email:'admin@example.invalid'},'',{'X-Setup-Token':'initial-setup-secret'})
  assert.equal(setup.status,201,output)
  const adminCookie=setup.headers.get('set-cookie').split(';')[0]
  const signup=await call('/api/auth/register','POST',credentials)
  assert.equal(signup.status,201)
  const publicCookie=signup.headers.get('set-cookie').split(';')[0]
  const {user}=await signup.json();assert.equal(user.role,'viewer');assert.equal(user.password_hash,undefined)
  assert.equal((await call('/api/auth/register/start','POST',{})).status,410)
  assert.equal((await call('/api/auth/register/set-password','POST',{})).status,410)
  assert.equal((await call('/api/auth/register','POST',credentials)).status,400)
  assert.equal((await call('/api/auth/register','POST',{...credentials,email:'short@example.invalid',password:'short',confirmPassword:'short'})).status,400)
  assert.equal((await call('/api/auth/users/'+user.id,'PUT',{role:'flagship_employee'},publicCookie)).status,403)
  const boatResponse=await call('/api/fleet/boats','POST',{name:'Test Flagship boat',homeDock:'Test dock',operatorId:'flagship',notes:'private crew note'},adminCookie)
  assert.equal(boatResponse.status,201)
  const boat=await boatResponse.json()
  const db=new DatabaseSync(join(dir,'data/test.sqlite'))
  const date='2026-11-07',now=Date.now()
  db.prepare('INSERT INTO planning_imports(external_message_id,service_date,created_at) VALUES(?,?,?)').run('account-test',date,now)
  const importId=db.prepare('SELECT id FROM planning_imports').get().id
  db.prepare("INSERT INTO planning_items(import_id,boat_id,boat_name,service_date,start_time,end_time,person_name,role,created_at) VALUES(?,?,?,?,?,?,?,'skipper',?)").run(importId,boat.id,boat.name,date,'10:00','18:00','Private Skipper',now)
  db.prepare("INSERT INTO fleet_assignments(boat_id,service_date,skipper,created_at,updated_at) VALUES(?,?,?,?,?)").run(boat.id,date,'Private Skipper',now,now)
  db.close()
  for(const path of ['/api/planning/day?date='+date,'/api/planning/options','/api/planning/imports','/api/boat-duty','/api/inventory']) assert.equal((await call(path,'GET',null,publicCookie)).status,403,path)
  for(const cookie of ['',publicCookie]) {
    const summary=await (await call('/api/fleet/summary?date='+date,'GET',null,cookie)).json()
    assert.deepEqual(summary.planning,[]);assert.deepEqual(summary.assignments,[])
    assert.ok(!JSON.stringify(summary).includes('Private Skipper'))
    assert.ok(!JSON.stringify(summary).includes('private crew note'))
  }
  assert.equal((await call('/api/auth/users/'+user.id,'PUT',{role:'flagship_employee'},adminCookie)).status,200)
  assert.equal((await (await call('/api/auth/status','GET',null,publicCookie)).json()).user.role,'flagship_employee')
  const planning=await call('/api/planning/day?date='+date,'GET',null,publicCookie)
  assert.equal(planning.status,200)
  assert.ok(JSON.stringify(await planning.json()).includes('Private Skipper'))
  const employeeSummary=await (await call('/api/fleet/summary?date='+date,'GET',null,publicCookie)).json()
  assert.equal(employeeSummary.planning[0].person_name,'Private Skipper')
  assert.equal((await call('/api/planning/analyze','POST',{},publicCookie)).status,403)
  assert.equal((await call('/api/auth/users/'+user.id,'PUT',{role:'viewer'},adminCookie)).status,200)
  assert.equal((await call('/api/planning/day?date='+date,'GET',null,publicCookie)).status,403)
  const login=await call('/api/auth/login','POST',{email:credentials.email,password:credentials.password})
  assert.equal(login.status,200)
})
