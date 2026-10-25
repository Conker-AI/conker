import type { ComponentProps, ReactNode } from 'react'
import { SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function ComposerSelectField({ children, error }: { children: ReactNode; error?: string }) {
  return <div className="min-w-0">
    {children}
    {error && <p role="alert" className="sr-only">{error}</p>}
  </div>
}

/** Agent and Mode set everything else, so they alone get the light outline; other composer controls stay plain. */
export const composerOutlined = 'border border-border'

export function ComposerSelectTrigger({ className, outlined = false, ...props }: ComponentProps<typeof SelectTrigger> & { outlined?: boolean }) {
  return <SelectTrigger
    size="sm"
    className={cn('min-w-0 border-0 bg-transparent px-2 text-sm text-muted-foreground shadow-none before:hidden [&_[data-slot=select-value]]:truncate [&_[data-slot=select-value]]:block dark:bg-transparent', outlined && composerOutlined, className)}
    {...props}
  />
}
