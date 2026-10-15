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
const revision = n => 'credential_' + String(n).repeat(32)
const record = (id = 'openrouter') => ({ id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null, stagedAt: null, verificationStatus: null, verificationBasis: null, verifiedAt: null, verificationStale: false, activationPending: false, revokedRevisions: [], secretIncluded: false })
const status = (extra = {}) => ({ schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(record), ...extra })
const paid = { operation: 'paid-policy', expectedAllowed: false, enabled: true }
const { createCredentialState, credentialOperationAllowed: allowed } = loader()('src/components/gateway/credential-state.ts')
function harness() {
 const authStore = createStore(() => owner('A')), reads = [], writes = [], timers = new Map(); let next = 0
 const controller = createCredentialState({ authStore,
  read(signal) { const call = { signal, ...deferred() }; reads.push(call); return call.promise },
  apply(operation, signal, onDispatch) { const call = { operation, signal, onDispatch, ...deferred() }; writes.push(call); return call.promise },
  schedule(run, delay) { const id = ++next; timers.set(id, { run, delay }); return id }, unschedule(id) { timers.delete(id) },
 })
 const stop = controller.start(), state = () => controller.store.getState()
 return { controller, reads, writes, timers, authStore, stop, state,
  apply(operation, expected = state().value, selected = state().selected) { return controller.apply(operation, expected, selected) },
  fire(delay) { const item = [...timers].find(([,timer]) => timer.delay === delay); assert.ok(item, `Timer ${delay}`); timers.delete(item[0]); item[1].run() },
 }
}
async function lifecycle() {
 const h = harness(); h.reads[0].resolve(status()); await flush()
 const old = h.state().value, read = h.controller.read()
 await h.apply(paid); assert.equal(h.writes.length, 0, 'A pending GET cannot race a POST')
 h.fire(15000); await read; assert.equal(h.state().phase, 'unavailable')
 const recover = h.controller.read(); h.reads[2].resolve(status()); await recover
 const write = h.apply(paid); await h.apply(paid); assert.equal(h.writes.length, 1)
 assert.equal(h.state().phase, 'awaiting-verification'); assert.equal(h.timers.size, 0, 'No password-entry deadline')
 h.writes[0].onDispatch(); h.writes[0].onDispatch(); assert.deepEqual([...h.timers.values()].map(t => t.delay), [210000])
 h.writes[0].resolve(status({ paidAllowed: true })); await write
 h.reads[1].resolve(old); await flush(); assert.equal(h.state().value.paidAllowed, true, 'Old abort-ignoring GET cannot undo acknowledged POST')
 await h.apply(paid, old); assert.equal(h.writes.length, 1, 'Old rendered paid-policy intent is refused')
 const lost = h.apply({ ...paid, expectedAllowed: true, enabled: false }); h.writes[1].onDispatch(); h.fire(210000); await lost
 assert.equal(h.state().phase, 'uncertain'); assert.equal(h.writes[1].signal.aborted, true)
 await h.apply({ ...paid, expectedAllowed: true, enabled: false }); assert.equal(h.writes.length, 2)
 const check = h.controller.read(); h.reads[3].resolve(status()); await check
 assert.equal(h.state().uncertain, true); h.writes[1].resolve(status({paidAllowed: true})); await flush(); assert.equal(h.state().value.paidAllowed, false)
 const cancelled = h.apply(paid); h.writes[2].reject({kind:'verification-cancelled'}); await cancelled; assert.equal(h.state().phase, 'current')
 const postFailure = h.apply(paid); h.writes[3].onDispatch(); h.writes[3].reject(Error('private provider error')); await postFailure; assert.equal(h.state().phase, 'uncertain')
 const recovery = h.controller.read(); h.reads[4].resolve(status()); await recovery
 const late = h.apply(paid); h.writes[4].onDispatch(); h.authStore.setState(owner('B')); h.authStore.setState(owner('A'))
 await late; h.writes[4].resolve(status({paidAllowed:true})); h.reads[5].resolve(status({paidAllowed:true})); await flush(); assert.equal(h.state().value, null)
 h.reads[6].resolve(status()); await flush(); assert.equal(h.state().value.paidAllowed,false)
 const stopped = h.apply(paid); h.writes[5].onDispatch(); h.stop(); await stopped; assert.equal(h.state().phase,'inactive'); assert.equal(h.timers.size,0)
 for (const phase of ['awaiting-verification','working']) {
  const x=harness(); x.reads[0].resolve(status()); await flush(); const unsub=x.controller.store.subscribe(s=>{if(s.phase===phase)x.authStore.setState(owner('B'))})
  const action=x.apply(paid); if(phase==='working') assert.throws(()=>x.writes[0].onDispatch()); await action
  assert.equal(x.writes.length,phase==='working'?1:0); assert.deepEqual([...x.timers.values()].map(t=>t.delay),[15000]); unsub(); x.stop()
 }
}
async function editor() {
 const h=harness(); h.reads[0].resolve(status()); await flush(); const snapshot=h.state().value
 h.controller.select('openrouter',snapshot); const a=h.state().selected; h.controller.secret('private-key-A',a)
 const stage={operation:'stage',provider:'openrouter',secret:'private-key-A',activeRevision:null,stagedRevision:null}
 h.controller.close(a); h.controller.select('openrouter',snapshot); const b=h.state().selected
 assert.notEqual(a,b); h.controller.secret('private-key-B',b); h.controller.secret('old-key',a); assert.equal(h.state().secret,'private-key-B')
 assert.equal(h.controller.close(a),false); await h.apply(stage,snapshot,a); assert.equal(h.writes.length,0)
 const pending=h.apply({...stage,secret:'private-key-B'},snapshot,b); assert.equal(h.state().secret,''); assert.equal(h.state().selected,b)
 assert.equal(JSON.stringify(h.state()).includes('private-key'),false,'Store holds no submitted secret')
 h.writes[0].reject({kind:'verification-cancelled'}); await pending; assert.equal(h.state().selected,b); assert.equal(h.state().secret,'')
 h.controller.secret('unsent-key',b); const same=h.controller.read(); h.reads[1].resolve(status()); await same
 assert.equal(h.state().selected,b); assert.equal(h.state().secret,'unsent-key','Unchanged reviewed record keeps unsent draft')
 const oldStatus=h.state().value, change=h.controller.read(), changed=status(); changed.providers[0].stagedRevision=revision(1); h.reads[2].resolve(changed); await change
 assert.equal(h.state().selected,null); assert.equal(h.state().secret,''); assert.equal(h.state().notice,'selection-changed')
 for(const operation of [stage,{operation:'verify',provider:'openrouter',revision:revision(1)},{operation:'activate',provider:'openrouter',revision:revision(1)},paid]) await h.apply(operation,oldStatus,b)
 assert.equal(h.writes.length,1)
 h.controller.select('openrouter',h.state().value); h.controller.secret('another-secret',h.state().selected); h.authStore.setState(owner('B')); h.authStore.setState(owner('A'))
 assert.equal(h.state().secret,''); assert.equal(h.state().selected,null); h.stop()

}
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children), ...walk(node.props?.action)]
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
  const mocks = {
    react: hooks, 'lucide-react': { KeyRound:'svg', RefreshCw:'svg' },
    '@/components/ui/button': {Button:'button'}, '@/components/ui/dialog': {Dialog:'dialog'},
    '@/components/ui/input': {Input:'input'}, '@/components/ui/label': {Label:'label'},
    '@/components/ui/checkbox': {Checkbox:'checkbox'}, '@/components/ui/switch': {Switch:'switch'},
    '@/components/design-system': {WorkspaceSection:'section',TaskDialogContent:'task-dialog',OverlayBody:'div',FormActions:'footer'},
    './credential-focus': {useCredentialFocus:()=>({target:{current:null},operation(){},dialog(){},closeDialog(){}})},
    zustand: {useStore(store) {if(!subscriptions.has(store)) subscriptions.set(store,store.subscribe(()=>{dirty=true}));return store.getState()}},
  }
  const Component = loader(mocks)('src/components/gateway/provider-credentials.tsx').ProviderCredentials
  const authStore = createStore(() => owner('A')), reads = [], writes = [], catalogues = []
  const service = { status(signal) { const call = { signal, ...deferred() }; reads.push(call); return call.promise }, apply(operation, signal, onDispatch) { const call = { operation, signal, onDispatch, ...deferred() }; writes.push(call); return call.promise } }
  let client = { providerCredentials: service }; const original = client
  const onModels = value => catalogues.push(value)
  function expand(node) {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props.children), action: expand(node.props.action) } }
  }
  function render() { cursor = 0; dirty = false; tree = expand(Component({ client, authStore, onChanged:onModels })); effects.splice(0).forEach(run => run()) }
  return { render, reads, writes, catalogues, authStore,
    async settle() { await flush(); for (let index = 0; dirty; index++) { assert.ok(index < 12); render(); await flush() } },
    text: () => text(tree), button: label => walk(tree).find(node => node.type === 'button' && text(node) === label), node: type => walk(tree).find(node=>node.type===type), input: () => walk(tree).find(node=>node.props?.id==='hosted-provider-key'),
    replace() { client = { providerCredentials: { ...service } }; render() }, restore() { client = original; render() },
    stop() { slots.forEach(slot => slot?.cleanup?.()); subscriptions.forEach(stop => stop()) },
  }
}

async function components() {
 const originalSet=global.setTimeout,originalClear=global.clearTimeout,timers=new Map();let next=0
 global.setTimeout=(run,delay)=>{const id=++next;timers.set(id,{run,delay});return id};global.clearTimeout=id=>timers.delete(id)
 try {
  const h=componentHarness();h.render();h.reads[0].resolve(status());await h.settle()
  const oldSwitch=h.node('switch').props.onCheckedChange
  h.button('Refresh').props.onClick();await h.settle();assert.match(h.text(),/last successful check/);oldSwitch(true);assert.equal(h.writes.length,0)
  h.reads[1].reject(Error('private error'));await h.settle();assert.match(h.text(),/Provider status is unavailable/);assert.doesNotMatch(h.text(),/private error/)
  h.button('Check status').props.onClick();h.reads[2].resolve(status());await h.settle()
  h.node('switch').props.onCheckedChange(true);h.node('switch').props.onCheckedChange(true);await h.settle();assert.equal(h.writes.length,1);assert.match(h.text(),/Waiting for owner verification/)
  h.writes[0].onDispatch();h.writes[0].reject(Error('lost'));await h.settle();assert.match(h.text(),/outcome was not confirmed/)
  h.button('Check status').props.onClick();h.reads[3].resolve(status({paidAllowed:true}));await h.settle();assert.equal(h.node('switch').props.checked,true);assert.match(h.text(),/earlier operation/);assert.equal(h.writes.length,1)
  h.button('Connect').props.onClick();await h.settle();h.input().props.onChange({target:{value:'private-key-A'}});await h.settle()
  const oldInput=h.input().props.onChange,oldCancel=h.button('Cancel').props.onClick,oldSubmit=h.node('form').props.onSubmit
  oldCancel();await h.settle();h.button('Connect').props.onClick();await h.settle();h.input().props.onChange({target:{value:'private-key-B'}});await h.settle()
  oldInput({target:{value:'stale'}});oldCancel();oldSubmit({preventDefault(){}});await h.settle();assert.equal(h.input().props.value,'private-key-B');assert.equal(h.writes.length,1,'Stale form/input/close cannot address reopened editor')
  h.node('form').props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.input().props.value,'');assert.equal(h.writes[1].operation.secret,'private-key-B')
  h.writes[1].reject({kind:'verification-cancelled'});await h.settle();assert.equal(h.node('dialog').props.open,true);assert.equal(h.input().props.value,'');h.button('Cancel').props.onClick();await h.settle();assert.equal(h.node('dialog').props.open,false)
  h.button('Connect').props.onClick();await h.settle();h.input().props.onChange({target:{value:'unsent-key'}});await h.settle();h.replace();h.restore();await h.settle()
  assert.equal(h.node('dialog').props.open,false);assert.equal(h.input().props.value,'');h.reads[4].resolve(status({paidAllowed:true}));await h.settle();assert.match(h.text(),/Checking/)
  h.reads[5].resolve(status());await h.settle();h.button('Connect').props.onClick();await h.settle();h.input().props.onChange({target:{value:'owner-secret'}});await h.settle();h.authStore.setState(owner('B'));h.authStore.setState(owner('A'));await h.settle();assert.equal(h.node('dialog').props.open,false);assert.equal(h.input().props.value,'')
  h.reads[7].resolve(status({policyRecoveryRequired:true}));await h.settle();assert.equal(h.button('Recover spending policy').props['aria-disabled'],false);assert.equal(h.node('switch').props['aria-disabled'],true)
  h.button('Recover spending policy').props.onClick();await h.settle();assert.deepEqual(h.writes[2].operation,{operation:'recover-paid-policy'});h.stop();await flush();assert.equal(timers.size,0)
 }finally{global.setTimeout=originalSet;global.clearTimeout=originalClear}
}
function guards() {
 const value=status(), r=value.providers[0];r.stagedRevision=revision(1)
 const verify={operation:'verify',provider:r.id,revision:r.stagedRevision},activate={...verify,operation:'activate'},recover={...verify,operation:'recover'},revoke={operation:'record-revoked',provider:r.id,revision:revision(2),issuerConfirmed:true}
 assert.equal(allowed(value,verify),true);assert.equal(allowed(value,activate),false);r.verificationStatus='verified';assert.equal(allowed(value,activate),true);r.verificationStale=true;assert.equal(allowed(value,activate),false)
 r.activationPending=true;assert.equal(allowed(value,verify),false);assert.equal(allowed(value,recover),true);assert.equal(allowed(value,{...recover,revision:revision(2)}),false);assert.equal(allowed(value,revoke),true);assert.equal(allowed(value,paid),true)
 r.revokedRevisions=[revision(2)];assert.equal(allowed(value,revoke),true,'Retired revocation retains idempotent backend semantics')
 value.policyRecoveryRequired=true;for(const op of [verify,activate,recover,revoke,paid])assert.equal(allowed(value,op),false);assert.equal(allowed(value,{operation:'recover-paid-policy'}),true)
}
function focusCases() {
 const previous={document:global.document,HTMLElement:global.HTMLElement,MutationObserver:global.MutationObserver,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout}
 const slots=[],effects=[],timers=new Map();let cursor=0,observer=null,next=0,source={},scope=0,phase='current',result,open=[]
 class Node {constructor(name,dialog=null){this.name=name;this.isConnected=true;this.dialog=dialog}focus(){global.document.activeElement=this}closest(){return this.dialog}}
 const body=new Node('body'),editor=new Node('editor'),verify=new Node('verify'),input=new Node('key',editor),button=new Node('save',editor),refresh=new Node('refresh'),opener=new Node('connect'),other=new Node('other')
 global.HTMLElement=Node;global.document={body,activeElement:body,querySelector:()=>open[0]??null,querySelectorAll:()=>open}
 global.MutationObserver=class{constructor(callback){this.callback=callback}observe(){observer=this.callback}disconnect(){if(observer===this.callback)observer=null}}
 global.setTimeout=(run)=>{const id=++next;timers.set(id,run);return id};global.clearTimeout=id=>timers.delete(id)
 const hooks={useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=value}]},useLayoutEffect(effect){const i=cursor++;effects.push(()=>{slots[i]?.cleanup?.();slots[i]={cleanup:effect()}})}}
 const hook=loader({react:hooks})('src/components/gateway/credential-focus.ts').useCredentialFocus,authStore=createStore(()=>owner('A'))
 const render=()=>{cursor=0;result=hook(source,scope,authStore,phase,{current:refresh});effects.splice(0).forEach(run=>run())}
 const closeEvent=()=>({preventDefault(){}}),tick=()=>{observer?.();for(const[id,run]of timers){timers.delete(id);run()}}
 try {
  render();opener.focus();result.dialog();render();const oldClose=result.closeDialog;body.focus();result.closeDialog(closeEvent());assert.equal(document.activeElement,opener)
  opener.focus();result.dialog();render();const stale=result.closeDialog;result.dialog();render();body.focus();stale(closeEvent());assert.equal(document.activeElement,body,'Old dialog close cannot restore newer origin')
  result.closeDialog(closeEvent());assert.equal(document.activeElement,opener)
  for(const trigger of [button,input]){
   trigger.focus();result.operation();phase='awaiting-verification';open=[editor,verify];render();phase='current';render();body.focus();open=[editor];tick();assert.equal(document.activeElement,trigger,'Verification cancellation restores actual connected editor action');assert.equal(observer,null,'Settled restoration disconnects its observer');assert.equal(timers.size,0)
  }
  button.focus();result.operation();phase='working';open=[editor,verify];render();phase='current';render();other.focus();open=[editor];tick();assert.equal(document.activeElement,other,'No stealing another control focus');assert.equal(observer,null)
  button.focus();result.operation();phase='working';open=[editor,verify];render();scope++;phase='current';render();body.focus();open=[];tick();assert.equal(document.activeElement,body,'Owner epoch invalidates retained operation focus')
  opener.focus();result.dialog();render();scope++;render();body.focus();result.closeDialog(closeEvent());assert.equal(document.activeElement,body)
  oldClose(closeEvent());assert.equal(document.activeElement,body)
 }finally{slots.forEach(slot=>slot?.cleanup?.());Object.assign(global,previous)}
}
;(async()=>{guards();focusCases();await lifecycle();await editor();await components();console.log('Credential recovery: controller, editor identity, component, policy and lifecycle cases passed')})().catch(error=>{console.error(error);process.exitCode=1})
