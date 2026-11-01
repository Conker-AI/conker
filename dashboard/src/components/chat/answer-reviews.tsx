'use client'

import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, Scale, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import type { ChatMessage } from '@/lib/chat/contract'
import type { AnswerTools } from '@/lib/chat/answer-tools-context'
import type { Judgement, Votes, FactCheck } from '@/lib/gateway/chat-reviews'

/** Reviews of one answer: blind judge of its versions, the owner's vote and a fact check. */
export function AnswerReviews({ message, tools }: { message: ChatMessage; tools: AnswerTools }) {
  const [votes, setVotes] = useState<Votes | null>(null)
  const [judgements, setJudgements] = useState<Judgement[]>([])
  const [factChecks, setFactChecks] = useState<FactCheck[]>([])
  const [judgeError, setJudgeError] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [factCheckError, setFactCheckError] = useState<string | null>(null)
  const [judgeLoading, setJudgeLoading] = useState(false)
  const [factCheckLoading, setFactCheckLoading] = useState(false)

  // Load votes once on mount if we have a family
  useEffect(() => {
    if (message.family && !tools.disabled) {
      tools.reviews.votes(message.sessionId, message.family.rootId)
        .then(setVotes)
        .catch(error => setVoteError(chatFeatureMessage(error)))
    }
  }, [message, tools])

  const handleVote = async (vote: 'up' | 'down' | 'clear') => {
    if (!message.family || tools.disabled) return

    try {
      setVoteError(null)
      const currentVote = votes?.votes[message.id]
      const newVote = currentVote === vote ? 'clear' : vote

      const result = await tools.reviews.vote(message.sessionId, message.family.rootId, message.id, newVote)
      setVotes(result)
    } catch (error) {
      setVoteError(chatFeatureMessage(error))
    }
  }

  const handleJudge = async () => {
    if (!message.family || tools.disabled) return

    try {
      setJudgeError(null)
      setJudgeLoading(true)
      const result = await tools.reviews.judge(message.sessionId, message.family.rootId)
      setJudgements(prev => [result, ...prev])
    } catch (error) {
      setJudgeError(chatFeatureMessage(error))
    } finally {
      setJudgeLoading(false)
    }
  }

  const handleFactCheck = async () => {
    if (tools.disabled) return

    try {
      setFactCheckError(null)
      setFactCheckLoading(true)
      const result = await tools.reviews.factCheck(message.sessionId, message.id)
      setFactChecks(prev => [result, ...prev])
    } catch (error) {
      setFactCheckError(chatFeatureMessage(error))
    } finally {
      setFactCheckLoading(false)
    }
  }

  const loadJudgements = async () => {
    if (!message.family) return

    try {
      setJudgeError(null)
      const results = await tools.reviews.judgements(message.sessionId, message.family.rootId)
      setJudgements(results)
    } catch (error) {
      setJudgeError(chatFeatureMessage(error))
    }
  }

  const loadFactChecks = async () => {
    try {
      setFactCheckError(null)
      const results = await tools.reviews.factChecks(message.sessionId, message.id)
      setFactChecks(results)
    } catch (error) {
      setFactCheckError(chatFeatureMessage(error))
    }
  }

  const currentVote = votes?.votes[message.id]
  const hasVersions = message.family && message.family.versions.length >= 2

  return (
    <div className="flex items-center gap-1 mt-2">
      {/* Vote buttons - only show with family */}
      {message.family && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Good answer"
            aria-pressed={currentVote === 'up' || currentVote === 'winner'}
            onClick={() => handleVote('up')}
            disabled={tools.disabled}
            className={currentVote === 'up' || currentVote === 'winner' ? 'text-green-600' : ''}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bad answer"
            aria-pressed={currentVote === 'down'}
            onClick={() => handleVote('down')}
            disabled={tools.disabled}
            className={currentVote === 'down' ? 'text-red-600' : ''}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
          {voteError && (
            <p role="alert" className="text-xs text-destructive">{voteError}</p>
          )}
        </>
      )}

      {/* Judge button - only with 2+ versions */}
      {hasVersions && (
        <Popover onOpenChange={(open) => open && loadJudgements()}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Judge versions"
              disabled={tools.disabled}
            >
              <Scale className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-4">
            {judgements.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  {judgements[0].scores.map((score) => {
                    const versionNumber = message.family!.versions.indexOf(score.messageId) + 1
                    const isWinner = score.messageId === judgements[0].winner
                    return (
                      <div key={score.messageId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Version {versionNumber} · {score.score}/10</span>
                          {isWinner && <Badge variant="secondary" className="text-xs">Best</Badge>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {judgements[0].excluded.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {judgements[0].excluded.length} not scored: written by the judge's own model.
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={handleJudge}
                  disabled={judgeLoading || tools.disabled}
                  className="w-full"
                >
                  {judgeLoading ? 'Judging...' : 'Judge again'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No judgements yet</p>
                <Button
                  size="sm"
                  onClick={handleJudge}
                  disabled={judgeLoading || tools.disabled}
                  className="w-full"
                >
                  {judgeLoading ? 'Judging...' : 'Judge'}
                </Button>
              </div>
            )}
            {judgeError && (
              <p role="alert" className="text-xs text-destructive mt-2">{judgeError}</p>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Fact check button - for every answer */}
      <Popover onOpenChange={(open) => open && loadFactChecks()}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Check facts"
            disabled={tools.disabled}
          >
            <ShieldCheck className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-4">
          {factChecks.length > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-xs">
                  Supported: {factChecks[0].counts.supported}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Contradicted: {factChecks[0].counts.contradicted}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  No source: {factChecks[0].counts.noSource}
                </Badge>
              </div>
              <div className="space-y-2">
                {factChecks[0].claims.map((claim, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={claim.mark === 'supported' ? 'default' : claim.mark === 'contradicted' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {claim.mark === 'supported' ? 'Supported' : claim.mark === 'contradicted' ? 'Contradicted' : 'No source'}
                      </Badge>
                    </div>
                    <p className="text-xs">{claim.claim}</p>
                    {claim.note && (
                      <p className="text-xs text-muted-foreground">{claim.note}</p>
                    )}
                    {claim.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {claim.sources.map(sourceId => {
                          const source = factChecks[0].sources.find(s => s.id === sourceId)
                          return source ? (
                            <a
                              key={sourceId}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {source.title}
                            </a>
                          ) : (
                            <span key={sourceId} className="text-xs text-muted-foreground">
                              {sourceId}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {factChecks[0].sourcesTruncated && (
                <p className="text-xs text-muted-foreground">
                  Some sources were too long to read in full.
                </p>
              )}
              <Button
                size="sm"
                onClick={handleFactCheck}
                disabled={factCheckLoading || tools.disabled}
                className="w-full"
              >
                {factCheckLoading ? 'Checking...' : 'Check again'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No fact checks yet</p>
              <Button
                size="sm"
                onClick={handleFactCheck}
                disabled={factCheckLoading || tools.disabled}
                className="w-full"
              >
                {factCheckLoading ? 'Checking...' : 'Check'}
              </Button>
            </div>
          )}
          {factCheckError && (
            <p role="alert" className="text-xs text-destructive mt-2">{factCheckError}</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
