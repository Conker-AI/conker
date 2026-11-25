import type { TimeStyle } from '@/lib/shown-time'
import { useServerSetting } from '@/settings/server-setting'

/** Settings > Appearance > Times, kept current (src/lib/shown-time.ts says what each pick shows). */
export function useTimeStyle(): TimeStyle {
  return useServerSetting<'relative' | 'exact' | 'hidden'>('appearance.timestamps', 'relative')
}
