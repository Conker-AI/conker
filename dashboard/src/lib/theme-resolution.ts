type ThemeVariables = Record<string, string>
type ThemeModes = { light: ThemeVariables; dark: ThemeVariables }

const colorToken = /^(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|sidebar|sidebar-background|sidebar-primary|sidebar-accent|sidebar-border|sidebar-ring|warning|success|info|chart-[1-5]|shadow-color)(-foreground)?$/
const bareHsl = /^[-+]?\d*\.?\d+(?:deg)?\s+[-+]?\d*\.?\d+%\s+[-+]?\d*\.?\d+%(?:\s*\/\s*[-+]?\d*\.?\d+%?)?$/

export function normalizeThemeVariables(variables: ThemeVariables): ThemeVariables {
  return Object.fromEntries(Object.entries(variables).map(([key, raw]) => {
    const value = raw.trim()
    return [key, colorToken.test(key) && bareHsl.test(value) ? `hsl(${value})` : value]
  }))
}

/** Same scale as tweakcn/utils/shadows.ts; explicit exported shadows always win. */
export function resolveThemeVariables(theme: ThemeModes, dark: boolean): ThemeVariables {
  const styles = normalizeThemeVariables({ ...theme.light, ...(dark ? theme.dark : {}) })
  if (styles['letter-spacing'] && !styles['tracking-normal']) styles['tracking-normal'] = styles['letter-spacing']
  if (styles['sidebar-background'] && !styles.sidebar) styles.sidebar = styles['sidebar-background']
  const parameters = ['shadow-color', 'shadow-opacity', 'shadow-blur', 'shadow-spread', 'shadow-offset-x', 'shadow-offset-y']
  if (!parameters.some(key => styles[key] !== undefined)) return styles

  const x = styles['shadow-offset-x'] ?? '0px'
  const y = styles['shadow-offset-y'] ?? '1px'
  const blur = styles['shadow-blur'] ?? '3px'
  const spread = styles['shadow-spread'] ?? '0px'
  const parsedOpacity = Number.parseFloat(styles['shadow-opacity'] ?? '0.1')
  const opacity = Number.isFinite(parsedOpacity) ? Math.min(1, Math.max(0, parsedOpacity)) : 0.1
  const color = (factor: number) => `hsl(from ${styles['shadow-color'] ?? 'hsl(0 0% 0%)'} h s l / ${Math.min(1, opacity * factor).toFixed(2)})`
  const first = (factor = 1) => `${x} ${y} ${blur} ${spread} ${color(factor)}`
  const second = (offset: number, size: number) => `${x} ${offset}px ${size}px calc(${spread} - 1px) ${color(1)}`
  const shadows: ThemeVariables = {
    'shadow-2xs': first(0.5), 'shadow-xs': first(0.5), 'shadow-2xl': first(2.5),
    'shadow-sm': `${first()}, ${second(1, 2)}`, shadow: `${first()}, ${second(1, 2)}`,
    'shadow-md': `${first()}, ${second(2, 4)}`, 'shadow-lg': `${first()}, ${second(4, 6)}`,
    'shadow-xl': `${first()}, ${second(8, 10)}`,
  }
  return { ...shadows, ...styles }
}

/** The old default was saved automatically, so only non-default old values prove intent. */
export function migrateRadiusPreference(value: unknown): string {
  return typeof value === 'string' && value !== '0.625rem' ? value : ''
}
