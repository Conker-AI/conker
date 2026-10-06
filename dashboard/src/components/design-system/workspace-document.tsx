import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DocumentIndexContext, type DocumentChapter } from '@/lib/workspace-document'

export function WorkspaceDocument({ children, className, ...props }: ComponentProps<'div'>) {
  const [chapters, setChapters] = useState<DocumentChapter[]>([])
  const [active, setActive] = useState<string | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const mobileIndex = useRef<HTMLDetailsElement>(null)
  const register = useCallback((chapter: DocumentChapter) => {
    setChapters(current => [...current.filter(item => item.id !== chapter.id), chapter].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    return () => setChapters(current => current.filter(item => item.id !== chapter.id))
  }, [])
  const context = useMemo(() => ({ register }), [register])
  useEffect(() => {
    if (!viewport.current || !chapters.length) return
    const intersecting = new Map<string, Element>()
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) intersecting.set(entry.target.id, entry.target)
        else intersecting.delete(entry.target.id)
      })
      const visible = [...intersecting.values()].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      if (visible[0]) setActive(visible[0].id)
    }, { root: viewport.current, rootMargin: '0px 0px -65% 0px', threshold: 0 })
    chapters.forEach(chapter => observer.observe(chapter.element))
    return () => observer.disconnect()
  }, [chapters])
  const go = (chapter: DocumentChapter) => {
    if (mobileIndex.current) mobileIndex.current.open = false
    setActive(chapter.id)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chapter.element.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' })
    chapter.element.focus({ preventScroll: true })
  }
  const index = (mobile = false): ReactNode => <nav aria-label={mobile ? 'Document contents menu' : 'Document contents'} className="workspace-outline-links">
    {chapters.map(chapter => <button type="button" key={chapter.id} aria-current={(active ?? chapters[0]?.id) === chapter.id ? 'location' : undefined} onClick={() => go(chapter)}>{chapter.title}</button>)}
  </nav>
  return <DocumentIndexContext.Provider value={context}>
    <div data-slot="workspace-document" data-indexed={chapters.length > 1 || undefined} className="workspace-document">
      {chapters.length > 1 && <>
        <aside className="workspace-outline"><div className="workspace-outline-heading"><ListTree aria-hidden="true" />Contents</div>{index()}</aside>
        <details ref={mobileIndex} className="workspace-mobile-outline"><summary><ListTree aria-hidden="true" />Contents</summary>{index(true)}</details>
      </>}
      <div ref={viewport} {...props} data-slot="gateway-page" className={cn('workspace-document-body', className)}>{children}</div>
    </div>
  </DocumentIndexContext.Provider>
}
