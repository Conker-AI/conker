import { Hourglass } from 'lucide-react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'

const settingsWord = (count: number) => (count === 1 ? 'setting' : 'settings')

/**
 * The "Planned" switch at the foot of a topic page or of search results, so it is in reach on a
 * phone too, where the side list with the chip is a page away. Says how many planned settings are
 * here, and turns them on or off. Nothing shows when there are none.
 */
export function PlannedNote({ count, shown, onShown, where = 'here' }: { count: number; shown: boolean; onShown: (value: boolean) => void; where?: 'here' | 'match' }) {
  if (count === 0) return null
  const text = shown
    ? `Showing ${count} planned ${settingsWord(count)}: nothing uses ${count === 1 ? 'it' : 'them'} yet.`
    : where === 'match'
      ? `${count} planned ${count === 1 ? 'setting also matches' : 'settings also match'}: saved for features still being built.`
      : `${count} planned ${count === 1 ? 'setting is' : 'settings are'} hidden here: saved for features still being built.`
  return (
    <p className="text-sm text-muted-foreground">
      {text}{' '}
      <button type="button" aria-pressed={shown} className="font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm" onClick={() => onShown(!shown)}>
        {shown ? 'Hide planned' : `Show planned (${count})`}
      </button>
    </p>
  )
}

/** A topic whose every setting is planned: a calm empty state with the one way to see them. */
export function PlannedTopic({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <Empty className="rounded-xl border py-10 md:py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Hourglass aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">Nothing here works yet</EmptyTitle>
        <EmptyDescription>Every setting in this topic is planned: it is saved for a feature still being built, and nothing uses it yet.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={onShow}>
          Show planned ({count})
        </Button>
      </EmptyContent>
    </Empty>
  )
}
