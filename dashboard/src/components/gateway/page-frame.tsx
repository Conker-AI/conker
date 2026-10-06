import type { ComponentProps } from 'react'
import { WorkspaceDocument } from '@/components/design-system/workspace-document'

export function GatewayPageFrame({ className, ...props }: ComponentProps<'div'>) {
  return <WorkspaceDocument className={className} {...props} />
}
