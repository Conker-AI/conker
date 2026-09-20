import { runtimeMode } from './runtime-mode'

// Only preview presets fetch external fonts. Gateway mode uses local/system fallbacks.
const presetFontWeights: Record<string, string> = Object.fromEntries([
  'Inter', 'Source Serif 4', 'JetBrains Mono', 'Plus Jakarta Sans', 'Lora', 'IBM Plex Mono',
  'Open Sans', 'DM Sans', 'Poppins', 'Geist', 'Geist Mono', 'Oxanium', 'Montserrat',
  'Source Code Pro', 'Merriweather', 'Quicksand', 'Roboto', 'Outfit', 'Libre Baskerville',
  'Fira Code', 'Roboto Mono', 'Playfair Display',
].map(name => [name, '400;500;600;700']))
presetFontWeights['Architects Daughter'] = '400'
presetFontWeights['Space Mono'] = '400;700'
presetFontWeights['Ubuntu Mono'] = '400;700'
presetFontWeights['Libre Baskerville'] = '400;700'

export function loadThemeFonts(styles: Record<string, string>) {
  if (runtimeMode !== 'fixture') return
  for (const key of ['font-sans', 'font-serif', 'font-mono']) {
    const family = (styles[key] ?? (key === 'font-sans' ? 'Inter' : '')).split(',')[0].trim().replace(/^["']|["']$/g, '')
    const weights = presetFontWeights[family]
    if (!weights || [...document.querySelectorAll<HTMLLinkElement>('link[data-conker-font]')].some(link => link.dataset.conkerFont === family)) continue
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.conkerFont = family
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights}&display=swap`
    document.head.append(link)
  }
}
