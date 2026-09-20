const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, imports = {}) {
  const filename = path.join(__dirname, '..', file)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => imports[name] ?? require(name), module, module.exports)
  return module.exports
}
const resolution = load('src/lib/theme-resolution.ts')
const { resolveThemeVariables, migrateRadiusPreference } = resolution
const theme = {
  light: { background: '0 0% 100%', radius: '1.4rem', 'font-sans': 'Poppins, sans-serif', 'letter-spacing': '-0.025em', 'shadow-opacity': '0.2', 'shadow-spread': '2px' },
  dark: { background: '0 0% 10%', 'shadow-opacity': '0' },
}
const light = resolveThemeVariables(theme, false)
const dark = resolveThemeVariables(theme, true)
assert.equal(light.background, 'hsl(0 0% 100%)')
assert.equal(dark.background, 'hsl(0 0% 10%)')
assert.equal(dark['font-sans'], 'Poppins, sans-serif')
assert.equal(dark.radius, '1.4rem')
assert.equal(dark['tracking-normal'], '-0.025em')
assert.match(light['shadow-sm'], /calc\(2px - 1px\)/)
assert.match(light['shadow-2xs'], /0\.10\)/)
assert.match(dark['shadow-sm'], /0\.00\)/)
assert.equal(theme.light.background, '0 0% 100%', 'resolution must not mutate the saved import')
assert.equal(resolveThemeVariables({ light: { 'shadow-opacity': '0.2', 'shadow-sm': 'none' }, dark: {} }, true)['shadow-sm'], 'none')
assert.equal(resolveThemeVariables({ light: { 'tracking-normal': '0.02em', 'letter-spacing': '-0.01em', spacing: '0.25rem' }, dark: {} }, false)['tracking-normal'], '0.02em')
assert.equal(resolveThemeVariables({ light: { 'font-sans': '0 0% 10%' }, dark: {} }, false)['font-sans'], '0 0% 10%', 'legacy HSL normalization applies only to color tokens')
assert.equal(resolveThemeVariables({ light: {}, dark: {} }, false)['shadow-sm'], undefined, 'default themes retain native CSS shadows')
assert.equal(migrateRadiusPreference('0.625rem'), '')
assert.equal(migrateRadiusPreference('0'), '0')
assert.equal(migrateRadiusPreference('1rem'), '1rem')

// Exercise actual preference actions using Zustand's in-memory store.
const { useCustomizerPreferences: preferences } = load('src/components/theme-customizer/preferences.ts', {
  '@/lib/theme-resolution': resolution,
  'zustand/middleware': { persist: initialize => initialize },
})
assert.equal(preferences.getState().selectedRadius, '')
preferences.getState().setSelectedRadius('1rem')
preferences.getState().setColors({ '--primary': 'red' })
preferences.getState().setSelectedTweakcnTheme('modern-minimal')
assert.equal(preferences.getState().selectedRadius, '1rem', 'an explicit override survives theme changes')
assert.deepEqual(preferences.getState().colors, {}, 'preset selection clears old color overrides')
preferences.getState().setColors({ '--primary': 'red' })
preferences.getState().setImportedTheme(theme)
assert.deepEqual(preferences.getState().colors, {}, 'new imports discard stale manual color overrides')
preferences.getState().setSelectedRadius('')
assert.equal(preferences.getState().selectedRadius, '', 'theme radius can be restored without resetting colors')
preferences.getState().reset()
assert.equal(preferences.getState().importedTheme, null)
assert.equal(preferences.getState().selectedRadius, '')
assert.deepEqual(preferences.getState().colors, {})

const fontLinks = []
global.document = {
  querySelectorAll: () => fontLinks,
  createElement: () => ({ dataset: {} }),
  head: { append: link => fontLinks.push(link) },
}
const { loadThemeFonts } = load('src/lib/fonts.ts', { './runtime-mode': { runtimeMode: 'fixture' } })
loadThemeFonts({ 'font-sans': '"Plus Jakarta Sans", sans-serif', 'font-mono': 'Geist Mono, monospace' })
loadThemeFonts({ 'font-sans': 'Plus Jakarta Sans, sans-serif', 'font-mono': 'Geist Mono, monospace' })
assert.equal(fontLinks.length, 2, 'repeat selections reuse the loaded font stylesheets')
assert.ok(fontLinks[0].href.includes('Plus%20Jakarta%20Sans'))
loadThemeFonts({ 'font-sans': 'Unrecognized Custom Font, sans-serif' })
assert.equal(fontLinks.length, 2, 'custom imports never fetch unknown font URLs')
loadThemeFonts({})
assert.equal(fontLinks[2].dataset.conkerFont, 'Inter', 'reset restores a loaded default font')
const gatewayFonts = load('src/lib/fonts.ts', { './runtime-mode': { runtimeMode: 'gateway' } })
gatewayFonts.loadThemeFonts({ 'font-sans': 'Roboto, sans-serif' })
assert.equal(fontLinks.length, 3, 'gateway mode never requests external font stylesheets')

let cleanup
let onSystemChange
const classes = new Set()
const media = {
  matches: true,
  addEventListener: (_, listener) => { onSystemChange = listener },
  removeEventListener: (_, listener) => { assert.equal(listener, onSystemChange); onSystemChange = undefined },
}
global.window = { document: { documentElement: { classList: {
  add: item => classes.add(item), remove: (...items) => items.forEach(item => classes.delete(item)),
} } }, matchMedia: () => media }
global.localStorage = { getItem: () => 'system' }
const { ThemeProvider } = load('src/components/theme-provider.tsx', {
  react: { useState: initializer => [initializer(), () => {}], useEffect: effect => { cleanup = effect() } },
  '@/contexts/theme-context': { ThemeProviderContext: { Provider: 'provider' } },
})
ThemeProvider({ children: null })
assert.ok(classes.has('dark'))
media.matches = false
onSystemChange()
assert.ok(classes.has('light') && !classes.has('dark'), 'system appearance follows OS changes')
cleanup()
assert.equal(onSystemChange, undefined, 'system appearance listener is removed on cleanup')
console.log('Theme checks passed: mode inheritance, HSL imports, tracking, shadow scale/precedence, radius migration/override/reset, color reset, font deduplication, system mode/listener cleanup.')
