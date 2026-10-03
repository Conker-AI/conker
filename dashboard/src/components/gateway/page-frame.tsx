import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function GatewayPageFrame({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="gateway-page" className={cn('min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8', className)} {...props} />
}
