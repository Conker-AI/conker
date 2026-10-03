import type { ComponentProps, ReactNode } from 'react'
import { SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function ComposerSelectField({ children, error }: { children: ReactNode; error?: string }) {
  return <div className="min-w-0">
    {children}
    {error && <p role="alert" className="sr-only">{error}</p>}
  </div>
}

export function ComposerSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return <SelectTrigger
    size="sm"
    className={cn('min-w-0 border-0 bg-transparent px-2 text-sm text-muted-foreground shadow-none [&_[data-slot=select-value]]:truncate [&_[data-slot=select-value]]:block dark:bg-transparent', className)}
    {...props}
  />
}
