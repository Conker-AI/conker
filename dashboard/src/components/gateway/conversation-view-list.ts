import type { LucideIcon } from 'lucide-react'
import { Layers, Lightbulb, ListTree } from 'lucide-react'

/** Views of one conversation, opened one at a time in the reference drawer. Each reads saved Pi records only. */
export type ConversationView = 'context' | 'thinking' | 'logs'
export const conversationViews: readonly { id: ConversationView; label: string; icon: LucideIcon }[] = [
  { id: 'context', label: 'Context', icon: Layers },
  { id: 'thinking', label: 'Thinking', icon: Lightbulb },
  { id: 'logs', label: 'Logs', icon: ListTree },
]
export const conversationViewLabel = (view: ConversationView) => conversationViews.find(item => item.id === view)!.label
