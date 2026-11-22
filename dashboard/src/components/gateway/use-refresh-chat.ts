import { useEffect, useRef } from 'react'
import { useRefreshState } from './use-refresh'

type Reader = { load: (id: string) => unknown }

/**
 * The chat panel stays mounted through "Refresh everything" (it may hold a stream or unsent text),
 * so it re-reads its open chat and draft here instead. Never while a send is in progress.
 */
export function useRefreshChat({ active, selected, busy, refreshDetail, draftController }: { active: boolean; selected: string | null; busy: boolean; refreshDetail: (id: string) => unknown; draftController: Reader }) {
  const reads = useRefreshState(state => state.reads)
  const seen = useRef(reads)
  useEffect(() => {
    if (seen.current === reads) return
    seen.current = reads
    if (!active || busy) return
    if (selected) void refreshDetail(selected)
    void draftController.load(selected ?? 'new')
  }, [reads, active, busy, selected, refreshDetail, draftController])
}
