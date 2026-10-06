import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const requireFromRoot = createRequire(path.join(root, 'package.json'))
const { build } = createRequire(import.meta.resolve('vite'))('esbuild')
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-workspace-check-'))
const checks = []
const check = (name, run) => { run(); checks.push(name) }
try {
  await build({
    entryPoints: [path.join(root, 'src/components/design-system/primitives.tsx'), path.join(root, 'src/components/data-table.tsx')],
    outdir: temporary, outbase: path.join(root, 'src'), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.app.json'), define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'one-react-runtime', setup(builder) {
      builder.onResolve({ filter: /^(?:react(?:-dom)?|react-router-dom)(?:\/.*)?$/ }, args => ({ path: requireFromRoot.resolve(args.path), external: true }))
    } }],
  })
  const ui = await import(pathToFileURL(path.join(temporary, 'components/design-system/primitives.js')))
  const { DataTable } = await import(pathToFileURL(path.join(temporary, 'components/data-table.js')))
  const { MemoryRouter } = requireFromRoot('react-router-dom')
  const h = React.createElement
  const render = element => renderToStaticMarkup(h(MemoryRouter, {}, element))
  check('Workspace search preserves local query props outside workspace chrome', () => {
    const html = render(h(ui.WorkspaceSearch, { label: 'Find projects', value: 'judo', disabled: true, maxLength: 200, onChange() {} }))
    assert.equal((html.match(/type="search"/g) ?? []).length, 1)
    assert.ok(html.includes('value="judo"')); assert.ok(html.includes('aria-label="Find projects"'))
    assert.ok(html.includes('disabled=""')); assert.ok(html.includes('maxLength="200"'))
  })
  check('Local search, filters, count and actions share one ordered toolbar', () => {
    const html = render(h(ui.CollectionToolbar, { search: 'local-search', filters: 'type-filter', count: 3, unit: 'projects', actions: 'view-action' }))
    assert.ok(html.includes('data-slot="collection-toolbar"'))
    const positions = ['local-search', 'type-filter', '3', 'view-action'].map(text => html.indexOf(text))
    assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]))
    assert.ok(html.includes('role="status"'))
  })
  check('Collections preserve one semantic list, wrap long titles, and expose hints after records', () => {
    const html = render(h(ui.CollectionPanel, { query: '', onQueryChange() {}, label: 'Find projects', placeholder: 'Search projects', count: 1, unit: 'project', emptyTitle: 'No projects', emptyDescription: 'Create one', hint: 'scope-guidance' },
      h(ui.CollectionSection, { title: 'Active' }, h('ul', {}, h(ui.CollectionRow, { to: '/projects', title: '<Long untrusted title>', description: 'description' }))),
    ))
    assert.equal((html.match(/<ul/g) ?? []).length, 1)
    assert.ok(html.includes('&lt;Long untrusted title&gt;'))
    assert.ok(html.includes('break-words'))
    assert.ok(html.includes('collection-surface'))
    assert.ok(html.indexOf('scope-guidance') > html.indexOf('data-slot="collection-row"'))
  })
  check('An empty search offers clear search; a new collection offers creation', () => {
    const base = { onQueryChange() {}, label: 'Find', placeholder: 'Search', count: 0, unit: 'records', emptyTitle: 'Empty', emptyDescription: 'Next step', emptyAction: h('button', {}, 'Create record') }
    const filtered = render(h(ui.CollectionPanel, { ...base, query: 'needle' }))
    assert.ok(filtered.includes('Clear search')); assert.ok(!filtered.includes('Create record'))
    assert.ok(render(h(ui.CollectionPanel, { ...base, query: '' })).includes('Create record'))
  })
  check('Sections and loading states expose their purpose without duplicate route headings', () => {
    const section = render(h(ui.WorkspaceSection, { title: 'Identity', description: 'Related fields' }, h('input', { 'aria-label': 'Name' })))
    assert.ok(section.includes('aria-labelledby=')); assert.ok(section.includes('<h2'))
    assert.ok(!section.includes('<h1')); assert.ok(!section.includes('bg-card'))
    const loading = render(h(ui.CollectionLoading, { label: 'Loading projects' }))
    assert.ok(loading.includes('role="status"')); assert.ok(loading.includes('aria-label="Loading projects"'))
  })
  check('A selected responsive record communicates current context without a checkbox', () => {
    const selected = render(h(ui.RecordItem, { title: 'Long memory title', description: 'Memory · 2 connections', selected: true, onOpen() {} }))
    assert.ok(selected.includes('aria-current="true"')); assert.ok(selected.includes('bg-accent'))
    assert.ok(!selected.includes('aria-pressed')); assert.ok(!selected.includes('role="checkbox"'))
    assert.ok(!render(h(ui.RecordItem, { title: 'Other record', onOpen() {} })).includes('aria-current'))
  })
  check('Empty tables retain contextual creation but omit irrelevant sort/view controls', () => {
    const html = render(h(DataTable, { columns: [{ accessorKey: 'title', header: 'Title' }], data: [], searchColumn: 'title', renderItem: item => item.title,
      emptyState: { title: 'No saved tasks', description: 'Create an outcome', action: h('button', {}, 'Create task') } }))
    assert.ok(html.includes('No saved tasks')); assert.ok(html.includes('Create task'))
    assert.ok(!html.includes('Sort records')); assert.ok(!html.includes('View'))
  })
  console.log(checks.map(name => `PASS ${name}`).join('\n'))
} finally {
  const relative = path.relative(os.tmpdir(), temporary)
  assert.ok(relative.startsWith('conker-workspace-check-') && !relative.includes(path.sep))
  await fs.rm(temporary, { recursive: true, force: true })
}
