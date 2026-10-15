const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { createStore } = require('zustand/vanilla')
const root = path.resolve(__dirname, '..')
function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { fileName:file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('require', 'module', 'exports', code)(name => {
      if (mocks[name]) return mocks[name]
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
      const next = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
      return load(next + (fs.existsSync(path.join(root, next + '.ts')) ? '.ts' : '.tsx'))
    }, module, module.exports)
    return module.exports
  }
  return load
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const owner = id => ({ phase: 'authenticated', session: { authenticated: true, sessionId: id }, pending: false, logoutUnconfirmed: false })
const snapshot = (id='mem_one', revision=1) => ({schemaVersion:1,memoryId:id,revision,text:'Authoritative full memory',sourceType:'conversation',confidence:'high'})
const identity = (extra={}) => ({requestId:'correction_test_0001',memoryId:'mem_one',expectedRevision:1,payloadHash:'a'.repeat(64),...extra})
const receipt = (status='applied',extra={}) => ({schemaVersion:1,requestId:'correction_test_0001',memoryId:'mem_one',previousRevision:1,payloadHash:'a'.repeat(64),status,revision:status==='applied'?2:null,indexing:status==='applied'?'indexed':null,errorCode:status==='rejected'?'revision_conflict':null,cachedPackagesCleared:0,sourceConversationKept:true,...extra})
const {createMemoryCorrectionState}=loader()('src/components/gateway/memory-correction-state.ts')
function harness() {
 const authStore=createStore(()=>owner('A')),privacy=createStore(()=>({sessionIds:[]})),calls=[],timers=new Map();let next=0,intentCount=0
 const client=Object.fromEntries(['pending','snapshot','status','apply','retry'].map(method=>[method,(...args)=>{const call={method,args,...deferred()};calls.push(call);return call.promise}]))
 const control=createMemoryCorrectionState({client,authStore,sourcePrivacy:privacy,requestId:()=>`correction_test_${String(++intentCount).padStart(4,'0')}`,schedule(run,delay){const id=++next;timers.set(id,{run,delay});return id},unschedule(id){timers.delete(id)}})
 const stop=control.start(),state=()=>control.store.getState()
 return {control,state,calls,authStore,privacy,timers,stop,
  async ready(){calls.at(-1).resolve(null);await flush();control.select('mem_one')},
  async open(id='mem_one'){control.select(id);const read=control.open(id);calls.at(-1).resolve(snapshot(id));await read;return state().editor},
  edit(text='Reviewed correction'){control.edit(text,state().editor);return state().editor},
  fire(delay){const item=[...timers].find(([,v])=>v.delay===delay);assert.ok(item,`Timer${delay}`);timers.delete(item[0]);item[1].run()},
 }
}
async function lifecycle(){
 const h=harness();await h.ready();const initial=await h.open();h.edit();const reviewed=h.state().editor
 const write=h.control.apply(reviewed);await h.control.apply(reviewed);assert.equal(h.calls.filter(c=>c.method==='apply').length,1)
 assert.equal(h.state().busy,'verification');assert.equal(h.timers.size,0,'Owner verification has no request deadline')
 const apply=h.calls.at(-1);assert.equal(apply.args[0].expected_revision,1);assert.equal(apply.args[0].text,'Reviewed correction')
 apply.args[2]();apply.args[2]();assert.deepEqual([...h.timers.values()].map(v=>v.delay),[45000]);assert.equal(h.state().editor.text,'')
 h.fire(45000);await write;assert.equal(h.state().editor,null);assert.equal(h.state().recovery.requestId,identity().requestId)
 assert.equal(JSON.stringify(h.state()).includes('Reviewed correction'),false,'Recovery holds no approved text')
 await h.control.apply(initial);assert.equal(h.calls.filter(c=>c.method==='apply').length,1)
 const expected=h.state().recovery,check=h.control.check(expected);h.calls.at(-1).resolve(receipt('unknown'));await check
 assert.equal(h.calls.filter(c=>c.method==='retry').length,0,'GET never retries')
 apply.resolve(receipt());await flush();assert.equal(h.state().receipt.status,'unknown','Late original response cannot override status read')
 await h.control.retry(expected);assert.equal(h.calls.filter(c=>c.method==='retry').length,0,'Stale review object cannot approve new recovery evidence')
 const retry=h.control.retry(h.state().recovery),retryCall=h.calls.at(-1);assert.equal(retryCall.method,'retry');assert.equal(retryCall.args[0].payloadHash,'a'.repeat(64));retryCall.args[2]();retryCall.resolve(receipt());await retry
 assert.equal(h.state().recovery,null);assert.equal(h.state().changed,1);assert.equal(h.timers.size,0);h.stop()
}
async function fences(){
 const h=harness();await h.ready();await h.open();const old=h.edit('private A');h.control.close(old);await h.open();const current=h.edit('private B')
 h.control.edit('old event',old);h.control.close(old);await h.control.apply(old);assert.equal(h.state().editor,current);assert.equal(h.calls.filter(c=>c.method==='apply').length,0)
 const cancel=h.control.apply(current);h.calls.at(-1).reject({kind:'verification-cancelled'});await cancel;assert.equal(h.state().editor.text,'private B')
 const conflict=h.control.apply(h.state().editor);h.calls.at(-1).args[2]();h.calls.at(-1).reject({code:'revision_conflict'});await conflict;assert.equal(h.state().notice,'revision-conflict');assert.equal(h.state().recovery,null)
 const oldRead=h.control.open('mem_one'),held=h.calls.at(-1);h.control.select('mem_two');h.control.select('mem_one');const newRead=h.control.open('mem_one');h.calls.at(-1).resolve(snapshot('mem_one',3));await newRead;held.resolve(snapshot());await oldRead;assert.equal(h.state().editor.snapshot.revision,3)
 h.edit();const verify=h.control.apply(h.state().editor),prior=h.calls.at(-1);h.authStore.setState(owner('B'));h.authStore.setState(owner('A'));await verify
 assert.throws(()=>prior.args[2]());assert.equal(h.state().editor,null);assert.equal(h.state().recovery,null)
 h.calls.at(-1).resolve(null);await flush();await h.open();h.edit('forget this text');h.privacy.setState({sessionIds:['ses_forgotten']});assert.equal(h.state().editor,null);assert.equal(h.state().ready,false)
 const refresh=h.control.refresh();h.calls.at(-1).resolve(null);await refresh
 await h.open();h.edit();const action=h.control.apply(h.state().editor);const late=h.calls.at(-1);late.args[2]();h.stop();await action;late.resolve(receipt());await flush();assert.equal(h.state().receipt,null);assert.equal(h.timers.size,0)
 for(const stage of ['verification','saving']){
  const x=harness();await x.ready();await x.open();x.edit();const off=x.control.store.subscribe(state=>{if(state.busy===stage)x.authStore.setState(owner('B'))})
  const work=x.control.apply(x.state().editor);if(stage==='saving')assert.throws(()=>x.calls.find(c=>c.method==='apply').args[2]());await work
  assert.equal(x.calls.filter(c=>c.method==='apply').length,stage==='saving'?1:0);off();x.stop();assert.equal(x.timers.size,0)
 }
}
async function reads(){
 const h=harness();h.fire(35000);await flush();assert.equal(h.state().ready,false);assert.equal(h.state().notice,'read')
 const again=h.control.refresh();h.calls.at(-1).resolve({...identity(),status:'unknown'});await again;assert.equal(h.state().recovery.payloadHash,identity().payloadHash)
 h.control.select('mem_one');await h.control.open('mem_one');assert.equal(h.state().editor,null,'Unresolved correction blocks a new edit')
 const check=h.control.check(h.state().recovery);h.calls.at(-1).reject({status:404});await check;assert.equal(h.state().notice,'not-recorded');assert.ok(h.state().recovery)
 const rejected=h.control.check(h.state().recovery);h.calls.at(-1).resolve(receipt('rejected',{errorCode:'memory_forgotten'}));await rejected;assert.equal(h.state().recovery,null);assert.equal(h.state().changed,1)
 const unavailable=h.control.open('mem_one');h.calls.at(-1).reject({status:404});await unavailable;assert.equal(h.state().notice,'unsupported');h.stop()
}
async function freshReview(){
 const h=harness();await h.ready();await h.open();h.edit();const write=h.control.apply(h.state().editor);h.calls.at(-1).args[2]();h.calls.at(-1).reject(Error('lost'));await write
 const check=h.control.check(h.state().recovery);h.calls.at(-1).reject({status:404});await check
 const old=h.state().recovery,review=h.control.reviewNew(old);assert.equal(h.calls.at(-1).method,'pending');h.calls.at(-1).resolve(null);await flush();assert.equal(h.calls.at(-1).method,'snapshot');h.calls.at(-1).resolve(snapshot('mem_one',3));await review
 assert.equal(h.state().previousUnconfirmed,old);assert.equal(h.state().editor.snapshot.revision,3);assert.equal(h.calls.filter(c=>c.method==='apply').length,1,'Fresh review never sends text')
 h.edit();const fresh=h.control.apply(h.state().editor);assert.equal(h.calls.at(-1).args[0].expected_revision,3);assert.notEqual(h.calls.at(-1).args[0].request_id,old.requestId);h.calls.at(-1).reject({kind:'verification-cancelled'});await fresh;h.stop()
 const x=harness();x.calls[0].resolve({...identity(),status:'unknown'});await flush();x.control.select('mem_one');const missing=x.control.check(x.state().recovery);x.calls.at(-1).reject({status:404});await missing
 const late=x.control.reviewNew(x.state().recovery),held=x.calls.at(-1);x.control.select('mem_two');x.control.select('mem_one');held.resolve(null);await late;assert.equal(x.state().editor,null);assert.equal(x.calls.filter(c=>c.method==='snapshot').length,0);x.stop()
}
async function clients(){
 const load=loader(),{createMemoryCorrectionsClient,correctionTextValid}=load('src/lib/gateway/memory-corrections.ts'),{createGatewayTransport,snapshotGatewayOperation,isConversationWrite}=load('src/lib/gateway/transport.ts'),{describeGatewayOperation}=load('src/lib/gateway/verification.ts')
 const calls=[];let response=snapshot();const client=createMemoryCorrectionsClient({request:async(path,options)=>{calls.push({path,options});return response}})
 assert.equal((await client.snapshot('mem_one')).text,snapshot().text)
 for(const id of ['../x','mem\n','mem/x',''])await assert.rejects(()=>client.snapshot(id))
 response={...snapshot(),memoryId:'another'};await assert.rejects(()=>client.snapshot('mem_one'))
 response=receipt('unknown',{revision:2});await assert.rejects(()=>client.status(identity()))
 response={...receipt(),text:'private extra'};await assert.rejects(()=>client.status(identity()))
 response=receipt();await client.retry(identity());assert.deepEqual(calls.at(-1).options.body,{expected_payload_hash:'a'.repeat(64)})
 const requests=[],transport=createGatewayTransport({origin:'https://conker.test',fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(receipt()),{headers:{'content-type':'application/json'}})}})
 for(const text of ['😀'.repeat(16000),'\u0001'.repeat(16000)]){
  assert.equal(correctionTextValid(text),true)
  const body={request_id:identity().requestId,memory_id:'mem_one',expected_revision:1,text},operation=snapshotGatewayOperation('/api/control/pi/memory/corrections',body)
  await transport.request('/auth/verify',{method:'POST',csrfToken:'a'.repeat(32),body:{password:'owner',operation}})
  await transport.request(operation.path,{method:'POST',csrfToken:'a'.repeat(32),body})
  assert.equal(JSON.parse(requests.at(-1).options.body).text,text)
  assert.equal(describeGatewayOperation(operation).details.join(' ').includes(text),false,'Verification copy omits memory text')
 }
 for(const text of ['','  ','\0','\uD800','x'.repeat(16001)])assert.equal(correctionTextValid(text),false)
 assert.equal(isConversationWrite('/api/control/pi/memory/corrections'),false)
 await assert.rejects(()=>transport.request('/api/control/pi/memory/corrections/pending',{query:{x:1}}))
 await assert.rejects(()=>transport.request('/api/control/pi/memory/corrections/memories/mem_one',{method:'POST',csrfToken:'a'.repeat(32),body:{}}))
 await transport.request('/api/control/pi/memory/corrections/memories/mem:companion.record-01');assert.match(requests.at(-1).url,/mem:companion.record-01$/)
 for(const invalid of ['/api/control/pi/memory/corrections/memories/x%2Fy','/api/pi/sessions/x:y'])await assert.rejects(()=>transport.request(invalid))
 const {createGatewayAuthClient}=load('src/lib/gateway/auth.ts'),wire=[]
 const authenticated=createGatewayAuthClient({now:()=>10000,verification:{cancelAll(){},request:async(_,verify)=>verify('synthetic owner',new AbortController().signal)},transport:createGatewayTransport({origin:'https://conker.test',fetch:async(url,options)=>{
  wire.push({path:new URL(url).pathname,options,body:options.body?JSON.parse(options.body):null})
  const result=url.endsWith('/auth/session')?{authenticated:true,setup_required:false,session_id:'a'.repeat(24),csrf_token:'c'.repeat(43),expires_at:90000,unlock_expires_at:11800}:url.endsWith('/auth/verify')?{verification_token:'v'.repeat(43),verification_expires_at:10120,unlock_expires_at:11800}:receipt()
  return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}})
 }})})
 const realClient=createMemoryCorrectionsClient(authenticated);await authenticated.bootstrap()
 for(const fullText of ['😀'.repeat(16000),'\u0001'.repeat(16000)]){
  let dispatched=0;await realClient.apply({request_id:identity().requestId,memory_id:'mem_one',expected_revision:1,text:fullText},undefined,()=>dispatched++)
  const proof=wire.at(-2),sent=wire.at(-1);assert.equal(dispatched,1);assert.equal(proof.path,'/auth/verify');assert.deepEqual(proof.body.operation.body,sent.body);assert.equal(sent.options.headers['X-Conker-Verification'],'v'.repeat(43));assert.equal(sent.body.text,fullText);assert.equal(Object.hasOwn(sent.options,'onDispatch'),false)
 }
 response=receipt('applied',{previousRevision:2147483646,revision:2147483647});await client.status(identity({expectedRevision:2147483646}))
}
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)]
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):''
async function component(){
 const h=harness();await h.ready();await h.open();h.edit();const slots=[];let cursor=0,tree
 const hooks={useRef(value){const i=cursor++;return slots[i]??={current:value}},useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value}]}}
 const Component=loader({react:hooks,'./credential-focus':{useCredentialFocus:()=>({operation(){},dialog(){},closeDialog(){}})},'@/components/ui/button':{Button:'button'},'@/components/ui/dialog':{Dialog:'dialog'},'@/components/ui/label':{Label:'label'},'@/components/ui/textarea':{Textarea:'textarea'},'@/components/design-system':{ConfirmationDialog:'confirm',TaskDialogContent:'task-dialog',OverlayBody:'div',FormActions:'footer'}})('src/components/gateway/memory-correction.tsx').MemoryCorrection
 const render=()=>{cursor=0;tree=Component({control:{controller:h.control,authStore:h.authStore,...h.state()},focusTarget:{current:null}})},node=type=>walk(tree).find(n=>n.type===type),button=label=>walk(tree).find(n=>n.type==='button'&&text(n)===label)
 render();assert.equal(node('textarea').props.value,'Reviewed correction');assert.match(text(tree),/SourceconversationConfidencehigh/)
 const oldSubmit=node('form').props.onSubmit;h.control.close(h.state().editor);await h.open();h.edit('New editor');render();oldSubmit({preventDefault(){}});assert.equal(h.calls.filter(c=>c.method==='apply').length,0)
 node('form').props.onSubmit({preventDefault(){}});const call=h.calls.at(-1);call.args[2]();call.reject(Error('lost'));await flush();render();assert.match(text(tree),/not confirmed/)
 button('Check status').props.onClick();h.calls.at(-1).resolve(receipt('unknown'));await flush();render();button('Retry approved change').props.onClick();render();const oldConfirm=node('confirm').props.onConfirm
 const check=h.control.check(h.state().recovery);h.calls.at(-1).resolve(receipt('unknown'));await check;render();assert.equal(node('confirm').props.open,false);await oldConfirm();assert.equal(h.calls.filter(c=>c.method==='retry').length,0,'Old confirmation cannot target refreshed receipt')
 button('Retry approved change').props.onClick();render();const confirmation=node('confirm').props.onConfirm();h.calls.at(-1).args[2]();h.calls.at(-1).resolve(receipt());await confirmation;render();assert.match(text(tree),/Memory updated to revision 2/);assert.match(text(tree),/source conversation is kept/);h.stop()
}
;(async()=>{await clients();await lifecycle();await fences();await reads();await freshReview();await component();console.log('Memory corrections: strict client, transport, controller, recovery, privacy and actual component checks passed')})().catch(error=>{console.error(error);process.exitCode=1})
