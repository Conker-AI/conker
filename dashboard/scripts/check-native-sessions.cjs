const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { createStore } = require('zustand/vanilla')
const root = path.resolve(__dirname, '..')
function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
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
const record = (id='native_A', extra={}) => ({id,identity:(id==='native_A'?'a':'b').repeat(64),sessionId:'conversation_1',name:'Review files',cwd:'C:/work/conker',startedAt:100000,state:'working',processStatus:'busy',waitingFor:null,canStop:true,...extra})
const envelope = {schemaVersion:1,provider:'claude'}
const list = (...results) => ({...envelope,scope:'background_sessions',results,truncated:false,omittedCount:0})
const receipt = row => ({...envelope,id:row.id,identity:row.identity,status:'stop_requested',automaticReplay:false})
const output = row => ({...envelope,id:row.id,identity:row.identity,text:'<script>inert text</script>',truncated:false,outputPersisted:false})
const {createNativeSessionsClient,nativeAttachCommand}=loader()('src/lib/gateway/native-sessions.ts')
async function clientCases(){
 const calls=[];let reply=list(record());const client=createNativeSessionsClient({request:async(path,options)=>{calls.push({path,options});return reply}})
 assert.equal((await client.list()).results.length,1);assert.equal(calls[0].path,'/api/host/claude/sessions')
 reply={...envelope,result:record()};await client.get('native_A');reply=output(record());await client.output(record());reply=receipt(record());const dispatch=()=>{};await client.stop(record(),undefined,dispatch)
 assert.deepEqual(calls.at(-1).options.body,{expectedIdentity:'a'.repeat(64)});assert.equal(calls.at(-1).options.onDispatch,dispatch)
 assert.equal(nativeAttachCommand('native_A'),'python scripts/conker.py native claude attach native_A')
 for(const id of ['../outside','abc\n','abc\u2028','-bad','x;whoami','', 'a'.repeat(101)])assert.throws(()=>nativeAttachCommand(id));
 reply=output(record('native_A',{identity:'b'.repeat(64)}));await assert.rejects(()=>client.output(record()))
 reply={...output(record()),text:'😀'.repeat(16385)};await assert.rejects(()=>client.output(record()))
 reply={...output(record()),text:'ok\u001b[31m'};await assert.rejects(()=>client.output(record()));reply={...output(record()),text:'ok\u200b'};await assert.rejects(()=>client.output(record()))
 reply={...output(record()),text:'😀'.repeat(16384)};await client.output(record())
 reply=list(record(),record());await assert.rejects(()=>client.list());reply=list(record('native_A',{state:'done',canStop:true}));await assert.rejects(()=>client.list())
 reply={...list(),omittedCount:3};assert.equal((await client.list()).omittedCount,3);reply={...list(record()),truncated:true,omittedCount:0};assert.equal((await client.list()).truncated,true)
 reply=list(record('native_A',{cwd:'😀'.repeat(4096),name:'😀'.repeat(300)}));await client.list()
}
const {createNativeSessionsState}=loader()('src/components/gateway/native-sessions-state.ts')
function harness(){
 const authStore=createStore(()=>owner('A')),calls=[],timers=new Map();let next=0
 const call=(kind,record,signal,onDispatch)=>{const value={kind,record,signal,onDispatch,...deferred()};calls.push(value);return value.promise}
 const controller=createNativeSessionsState({authStore,client:{list:s=>call('list',null,s),get:(id,s)=>call('get',id,s),output:(r,s)=>call('output',r,s),stop:(r,s,d)=>call('stop',r,s,d)},schedule(run,delay){const id=++next;timers.set(id,{run,delay});return id},unschedule(id){timers.delete(id)}})
 const stop=controller.start(),state=()=>controller.store.getState()
 return{controller,authStore,calls,timers,stop,state,fire(delay){const item=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(item,`Expected ${delay} deadline`);timers.delete(item[0]);item[1].run()}}
}
async function lifecycleCases(){
 const h=harness(),a=record(),b=record('native_B');h.calls[0].resolve(list(a,b));await flush()
 h.controller.select(a);const oldA=h.calls.at(-1);h.controller.select(b);const oldB=h.calls.at(-1);h.controller.select(a);h.calls.at(-1).resolve({...a});await flush();const current=h.state().selected
 oldA.resolve({...a,name:'Old A'});oldB.resolve(b);await flush();assert.equal(h.state().selected,current);assert.equal(h.calls.filter(c=>c.kind==='output').length,0,'Opening a session does not fetch output')
 const readOutput=h.controller.output(current);const heldOutput=h.calls.at(-1);h.controller.select(b);h.calls.at(-1).resolve({...b});await flush();heldOutput.resolve(output(a));await readOutput;assert.equal(h.state().output,null)
 const selected=h.state().selected,out=h.controller.output(selected);h.calls.at(-1).resolve(output(b));await out;assert.equal(h.state().output.text,'<script>inert text</script>')
 const refresh=h.controller.list();h.calls.at(-1).resolve({...list(a),truncated:true});await refresh;assert.equal(h.state().selected,selected,'Absence from bounded list is not deletion');assert.equal(h.state().output,null);assert.equal(h.state().detailCurrent,false)
 const restore=h.controller.get(selected);h.calls.at(-1).resolve({...b});await restore
 const target=h.state().selected,operation=h.controller.stop(target);await h.controller.stop(target);assert.equal(h.calls.filter(c=>c.kind==='stop').length,1);assert.equal(h.timers.size,0,'No password-entry timeout')
 const post=h.calls.at(-1);post.onDispatch();post.onDispatch();assert.deepEqual([...h.timers.values()].map(t=>t.delay),[45000]);h.fire(45000);await operation
 assert.equal(h.state().stopNotice.kind,'uncertain');assert.equal(h.state().detailCurrent,false)
 await h.controller.stop(target);assert.equal(h.calls.filter(c=>c.kind==='stop').length,1,'Uncertain Stop cannot be replayed')
 const check=h.controller.get(target);h.calls.at(-1).resolve({...b});await check;assert.equal(h.state().stopNotice.checked,true);assert.equal(h.state().stopNotice.kind,'uncertain')
 post.resolve(receipt(b));await flush();assert.equal(h.state().stopNotice.kind,'uncertain','Late Stop cannot undo reconciliation')
 await h.controller.stop(target);assert.equal(h.calls.filter(c=>c.kind==='stop').length,1,'Old reviewed snapshot cannot target fresh status')
 const nextTarget=h.state().selected,success=h.controller.stop(nextTarget),successCall=h.calls.at(-1);successCall.onDispatch();successCall.resolve(receipt(b));await success
 assert.equal(h.state().selected.state,'working');assert.equal(h.state().stopNotice.kind,'requested');assert.equal(h.state().detailCurrent,false,'Stop requested is not Stopped')
 const get=h.controller.get(nextTarget);h.calls.at(-1).resolve({...b,state:'stopped',canStop:false});await get;assert.equal(h.state().selected.state,'stopped')
 h.controller.select(a);h.calls.at(-1).resolve({...a});await flush();const before=h.state().selected,cancelled=h.controller.stop(before);h.calls.at(-1).reject({kind:'verification-cancelled'});await cancelled;assert.equal(h.state().detailCurrent,true)
 const held=h.controller.output(before);const heldCall=h.calls.at(-1);h.authStore.setState(owner('B'));h.authStore.setState(owner('A'));heldCall.resolve(output(a));await held;assert.equal(h.state().rows,null);assert.equal(h.state().selected,null);assert.equal(h.state().output,null)
 h.calls.at(-1).resolve(list(a));await flush();h.controller.select(a);const late=h.calls.at(-1);h.fire(35000);await flush();assert.equal(h.state().detailError,true);late.resolve(a);await flush();assert.equal(h.state().detailCurrent,false)
 const listRecovery=h.controller.list();h.calls.at(-1).resolve(list({...a}));await listRecovery;assert.equal(h.state().detailCurrent,true);assert.equal(h.state().detailError,false,'Same-identity list recovery clears contradictory stale error');const retry=h.controller.get(h.state().selected);h.calls.at(-1).resolve({...a});await retry;h.stop();assert.equal(h.state().selected,null);assert.equal(h.timers.size,0)
 for(const phase of ['verification','stop']){
  const x=harness();x.calls[0].resolve(list(a));await flush();x.controller.select(a);x.calls[1].resolve({...a});await flush();const unsub=x.controller.store.subscribe(s=>{if(s.pending===phase)x.authStore.setState(owner('B'))}),p=x.controller.stop(x.state().selected)
  if(phase==='stop')assert.throws(()=>x.calls.find(c=>c.kind==='stop').onDispatch());await p;assert.deepEqual([...x.timers.values()].map(t=>t.delay),[35000]);unsub();x.stop()
 }
}
async function replacementCases(){
 const h=harness(),a=record();h.calls[0].resolve(list(a));await flush();h.controller.select(a);h.calls[1].resolve({...a});await flush()
 const action=h.controller.stop(h.state().selected);h.calls[2].onDispatch();h.calls[2].reject(Error('lost'));await action
 const read=h.controller.get(h.state().selected),replacement={...a,identity:'c'.repeat(64)};h.calls[3].resolve(replacement);await read
 assert.equal(h.state().stopNotice.identity,a.identity);assert.equal(h.state().stopNotice.checked,false,'New identity cannot reconcile the prior Stop')
 const fresh=h.controller.stop(replacement);assert.equal(h.calls[4].record.identity,replacement.identity);h.calls[4].reject({kind:'verification-cancelled'});await fresh;h.stop()
}
async function transportCases(){
 const {createGatewayTransport,isConversationWrite,snapshotGatewayOperation}=loader()('src/lib/gateway/transport.ts'),calls=[];let response=list(record())
 const transport=createGatewayTransport({origin:'https://conker.test',fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}})}})
 await transport.request('/api/host/claude/sessions');await transport.request('/api/host/claude/sessions/native_A/output')
 assert.equal(isConversationWrite('/api/host/claude/sessions/native_A/stop'),false,'Stop requires fresh owner verification')
 assert.deepEqual(snapshotGatewayOperation('/api/host/claude/sessions/native_A/stop',{expectedIdentity:'a'.repeat(64)}).body,{expectedIdentity:'a'.repeat(64)})
 for(const path of ['/api/host/claude/sessions/native_A/launch','/api/host/claude/sessions/native_A/attach','/api/host/claude/sessions/native_A/approve'])await assert.rejects(()=>transport.request(path,{method:'POST',body:{},csrfToken:'a'.repeat(32)}))
 await assert.rejects(()=>transport.request('/api/host/claude/sessions',{query:{limit:1}}))
 response={text:'x'.repeat(1024*1024)};await assert.rejects(()=>transport.request('/api/host/claude/sessions'),e=>e.kind==='response-too-large')
 response={text:'x'.repeat(512*1024)};await assert.rejects(()=>transport.request('/api/host/claude/sessions/native_A/output'),e=>e.kind==='response-too-large')
 const {describeGatewayOperation}=loader()('src/lib/gateway/verification.ts');const review=describeGatewayOperation(snapshotGatewayOperation('/api/host/claude/sessions/native_A/stop',{expectedIdentity:'a'.repeat(64)}));assert.match(review.target,/native_A/);assert.match(review.details.join(' '),/not prove the process has stopped/)
}
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children), ...walk(node.props?.action), ...walk(node.props?.actions)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
function componentHarness() {
  const slots = [], effects = [], subscriptions = new Map(); let cursor = 0, dirty = false, tree
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) slots[i] = { value: factory(), deps }; return slots[i].value },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((value, index) => value !== old.deps[index])) { slots[i] = { deps, effect }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect() }) } },
  }
  hooks.useLayoutEffect = hooks.useEffect
  const mocks = {react:hooks,'react-router-dom':{Link:'a'},'lucide-react':{Copy:'svg',RefreshCw:'svg',Square:'svg',TerminalSquare:'svg'},'@/components/ui/button':{Button:'button'},'@/components/status-badge':{StatusBadge:'badge'},'@/components/reference-section':{ReferenceSection:'section'},'./page-frame':{GatewayPageFrame:'main'},'@/components/design-system':{CollectionLoading:'loading',CollectionPanel:'collection',CollectionSection:'section',ConfirmationDialog:'confirmation',DetailPanel:'detail',OverlayBody:'div',PageHeader:'header',RecordItem:'record',WorkspaceAction:'button'},zustand:{useStore(store){if(!subscriptions.has(store))subscriptions.set(store,store.subscribe(()=>{dirty=true}));return store.getState()}}}
  const Component=loader(mocks)('src/components/gateway/native-sessions-workspace.tsx').GatewayNativeSessionsWorkspace
  const authStore=createStore(()=>owner('A')),reads=[],writes=[],catalogues=[]
  const service={list(signal){const call={kind:'list',signal,...deferred()};reads.push(call);return call.promise},get(id,signal){const call={kind:'get',id,signal,...deferred()};reads.push(call);return call.promise},output(row,signal){const call={kind:'output',row,signal,...deferred()};reads.push(call);return call.promise},stop(row,signal,onDispatch){const call={row,signal,onDispatch,...deferred()};writes.push(call);return call.promise}}
  let client=service;const original=client
  function expand(node) {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props.children), action: expand(node.props.action) } }
  }
  function render() { cursor = 0; dirty = false; tree = expand(Component({ client, authStore,  })); effects.splice(0).forEach(run => run()) }
  return { render, reads, writes, catalogues, authStore,
    async settle() { await flush(); for (let index = 0; dirty; index++) { assert.ok(index < 12); render(); await flush() } },
    text: () => text(tree), button: label => walk(tree).find(node => node.type === 'button' && text(node) === label), node: type => walk(tree).find(node=>node.type===type), row: id => walk(tree).find(node=>node.type==='record'&&node.props.title===id),
    replace() { client = { ...service }; render() }, restore() { client = original; render() },
    stop() { slots.forEach(slot => slot?.cleanup?.()); subscriptions.forEach(stop => stop()) },
  }
}

async function focusCases(h){
 const prior={document:global.document,HTMLElement:global.HTMLElement,requestAnimationFrame:global.requestAnimationFrame},frames=[],panel={};
 class Element{isConnected=true;closest(){return panel}focus(){global.document.activeElement=this}}
 const body=new Element(),target=new Element();global.HTMLElement=Element;global.document={body,activeElement:body,querySelectorAll:()=>[panel]};global.requestAnimationFrame=run=>frames.push(run)
 try{
  h.button('Stop session').props.ref.current=target;h.button('Stop session').props.onClick();await h.settle();const oldClose=h.node('confirmation').props.onCloseAutoFocus;
  h.node('confirmation').props.onOpenChange(false);await h.settle();h.node('confirmation').props.onCloseAutoFocus({preventDefault(){}});await h.settle();frames.splice(0).forEach(run=>run());assert.equal(global.document.activeElement,target,'Imperative confirmation Cancel restores its opener');
  global.document.activeElement=panel;h.button('Stop session').props.onClick();await h.settle();oldClose({preventDefault(){}});assert.equal(frames.length,0,'An older close cannot consume a newer review origin');
  h.node('confirmation').props.onOpenChange(false);await h.settle();h.node('confirmation').props.onCloseAutoFocus({preventDefault(){}});await h.settle();frames.splice(0).forEach(run=>run());assert.equal(global.document.activeElement,target,'Nested dialog trap fallback restores the actual Stop action');h.button('Stop session').props.onClick();await h.settle();
  h.node('confirmation').props.onOpenChange(false);await h.settle();h.node('confirmation').props.onCloseAutoFocus({preventDefault(){}});await h.settle();const other=new Element();global.document.activeElement=other;frames.splice(0).forEach(run=>run());assert.equal(global.document.activeElement,other,'Closing confirmation does not steal other control focus');
 }finally{Object.assign(global,prior)}
}
async function components(){
 const h=componentHarness(),a=record('native_A',{name:'Session A'}),b=record('native_B',{name:'Session B',state:'blocked',processStatus:'waiting',waitingFor:'permission_prompt'})
 h.render();h.reads[0].resolve({...list(a,b),omittedCount:3});await h.settle();assert.match(h.text(),/3 native entries are omitted/)
 h.node('collection').props.onQueryChange('Session');await h.settle();h.row('Session A').props.onOpen();h.reads[1].resolve({...a});await h.settle();assert.equal(h.node('detail').props.open,true);assert.equal(h.reads.filter(r=>r.kind==='output').length,0)
 h.button('Read recent output').props.onClick();h.reads[2].resolve(output(a));await h.settle();assert.equal(h.node('pre').props.children,output(a).text);assert.equal(h.node('pre').props.dangerouslySetInnerHTML,undefined);await focusCases(h)
 h.button('Stop session').props.onClick();await h.settle();assert.equal(h.node('confirmation').props.open,true);const confirm=h.node('confirmation').props.onConfirm;void confirm();void confirm();await h.settle();assert.equal(h.writes.length,1);assert.equal(h.node('confirmation').props.open,true)
 h.writes[0].onDispatch();h.writes[0].reject(Error('lost'));await h.settle();assert.equal(h.node('confirmation').props.open,false);assert.match(h.text(),/Stop outcome was not confirmed/);assert.equal(h.node('pre'),undefined);assert.equal(h.button('Stop session').props['aria-disabled'],true)
 h.button('Check status').props.onClick();h.reads[3].resolve({...a,state:'stopped',canStop:false});await h.settle();assert.match(h.text(),/earlier Stop outcome remains unconfirmed/);assert.match(h.text(),/Stopped/);assert.equal(h.writes.length,1)
 h.node('detail').props.onOpenChange(false);await h.settle();h.row('Session B').props.onOpen();h.reads[4].resolve({...b});await h.settle();assert.match(h.text(),/Native permission prompt/)
 h.button('Stop session').props.onClick();await h.settle();void h.node('confirmation').props.onConfirm();await h.settle();const retired=h.writes[1];h.replace();h.restore();assert.equal(retired.signal.aborted,true,'Layout cleanup fences retired client before late dispatch');assert.throws(()=>retired.onDispatch());retired.resolve(receipt(b));await h.settle();assert.equal(h.node('detail').props.open,false);assert.equal(h.node('collection').props.query,'');h.reads[5].resolve(list(a));await h.settle();assert.equal(h.row('Session A'),undefined);h.reads[6].resolve(list(b));await h.settle();h.row('Session B').props.onOpen();h.reads[7].resolve({...b});await h.settle();h.authStore.setState(owner('B'));h.authStore.setState(owner('A'));await h.settle();assert.equal(h.node('detail').props.open,false);h.stop()
}
;(async()=>{await clientCases();await lifecycleCases();await replacementCases();await transportCases();await components();console.log('Native sessions: DTO, output identity/bounds, lifecycle, exact Stop and transport cases passed')})().catch(error=>{console.error(error);process.exitCode=1})
