import { Link } from 'react-router-dom'
import { chatFeatureTextFix } from '@/lib/gateway/chat-feature-errors'
import { cn } from '@/lib/utils'

/** A failed chat action's inline line, with a link to where it is fixed when there is one. */
export function ChatFeatureError({ text, className }: { text: string; className?: string }) {
  const fix = chatFeatureTextFix(text)
  return <p role="alert" className={cn('text-xs text-destructive', className)}>
    {text}{fix && <> <Link className="font-medium underline underline-offset-4" to={fix.to}>{fix.label}</Link></>}
  </p>
}
