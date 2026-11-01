import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import type { ChatSummaryClient, ChatSummary, SummaryDraft, Compaction } from '@/lib/gateway/chat-summary'

/** The chat's summary: edit, draft, restore an older version, fold old messages into it, or continue in a new chat from it. */
export function ContextSummaryPanel({ client, sessionId, lastMessageId, disabled, onChanged }: { client: ChatSummaryClient; sessionId: string; lastMessageId: string | null; disabled: boolean; onChanged: () => void }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ChatSummary | null>(null)
  const [compaction, setCompaction] = useState<Compaction | null>(null)
  const [policyRevision, setPolicyRevision] = useState(0)
  const [draft, setDraft] = useState<SummaryDraft | null>(null)
  const [editingText, setEditingText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        const [summaryData, compactionData, policyRev] = await Promise.all([
          client.summary(sessionId),
          client.compaction(sessionId),
          client.policyRevision(sessionId)
        ])
        setSummary(summaryData)
        setCompaction(compactionData)
        setPolicyRevision(policyRev)
        setEditingText(summaryData.summary ?? '')
        setDraft(null)
      } catch (err) {
        setError(chatFeatureMessage(err))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [sessionId, client])

  const handleSave = async () => {
    if (!summary || loading) return
    try {
      setLoading(true)
      setError(null)
      await client.save(sessionId, editingText, summary.revision)
      await loadData()
      onChanged()
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDraft = async () => {
    if (loading) return
    try {
      setLoading(true)
      setError(null)
      const draftData = await client.draft(sessionId)
      setDraft(draftData)
      setEditingText(draftData.summary)
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleFold = async () => {
    if (!draft || !summary || loading) return
    try {
      setLoading(true)
      setError(null)
      await client.compact(sessionId, {
        policyRevision,
        summaryRevision: draft.summaryRevision,
        summary: draft.summary,
        covers: draft.messageIds
      })
      await loadData()
      onChanged()
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (revision: number) => {
    if (!summary || loading) return
    try {
      setLoading(true)
      setError(null)
      await client.restore(sessionId, revision, summary.revision)
      await loadData()
      onChanged()
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleFork = async () => {
    if (!summary || loading) return
    try {
      setLoading(true)
      setError(null)
      const result = await client.fork(sessionId, {
        policyRevision,
        lastMessageId,
        summary: summary.summary ?? ''
      })
      setShowForkDialog(false)
      onChanged()
      navigate(`/chat/${result.sessionId}`)
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const canFold = policyRevision > 0 && draft !== null
  const canFork = policyRevision > 0

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Summary</h3>

      <div className="space-y-2">
        <Textarea
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          placeholder="No summary yet."
          rows={6}
          disabled={disabled || loading}
        />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={disabled || loading || editingText === (summary?.summary ?? '')}
          >
            Save
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDraft}
            disabled={disabled || loading}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Draft with AI
          </Button>
        </div>

        {draft && (
          <div className="text-xs text-muted-foreground">
            Read {draft.messageIds.length} messages
            {draft.truncated && ' · shortened'}
          </div>
        )}

        {canFold && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleFold}
            disabled={disabled || loading}
          >
            Fold these messages
          </Button>
        )}

        {policyRevision === 0 && (draft || canFold) && (
          <div className="text-xs text-muted-foreground">
            Save the context settings above first.
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">{error}</p>
        )}
      </div>

      {compaction && compaction.folded.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {compaction.folded.length} messages folded into the summary.
        </div>
      )}

      {summary && summary.versions.length > 1 && (
        <Collapsible open={versionsOpen} onOpenChange={setVersionsOpen}>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" className="text-xs">
              Earlier versions ({summary.versions.length - 1})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {summary.versions.slice(1).map((version) => (
              <div key={version.revision} className="text-xs space-y-1 p-2 border rounded">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Version {version.revision} · {new Date(version.createdAt * 1000).toLocaleString()}
                    {version.restoredFrom && ` · restored from ${version.restoredFrom}`}
                  </span>
                  {version.revision !== summary.revision && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRestore(version.revision)}
                      disabled={disabled || loading}
                    >
                      Restore
                    </Button>
                  )}
                </div>
                {version.summary && (
                  <div className="line-clamp-2 text-muted-foreground">
                    {version.summary}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowForkDialog(true)}
        disabled={disabled || loading || !canFork}
      >
        Continue in a new chat
      </Button>

      {!canFork && (
        <div className="text-xs text-muted-foreground">
          Save the context settings above first.
        </div>
      )}

      <AlertDialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continue in a new chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This chat closes and a new one starts from the summary and the pinned messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFork} disabled={loading}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
