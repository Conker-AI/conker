import { useState } from 'react'
import { ReferenceSection } from '@/components/reference-section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { readClassMessage, type GatewayMcpClient, type McpReadClass, type McpTool } from '@/lib/gateway/mcp'
import { cn } from '@/lib/utils'

const CHOICES: readonly { value: McpReadClass; label: string; hint: string }[] = [
  { value: 'act_outward', label: 'Asks every time', hint: 'Each call waits for your yes in the Inbox.' },
  { value: 'observe', label: 'Runs without asking (read only)', hint: 'For a tool that only reads. Its limits, spending and the action log still apply.' },
]

/** Whether an imported MCP tool asks before each call. The choice shown is always the class ToolGate
 * stored: a tap only starts the change (the radios wait while it is out), and the radio moves when
 * ToolGate's answer comes back. `onStored` gets that answer even if the details closed meanwhile. */
export function McpReadClassControl({ client, tool, onStored, onReload }: { client: GatewayMcpClient; tool: McpTool; onStored: (value: McpTool) => void; onReload: () => void }) {
  const [pending, setPending] = useState<McpReadClass | null>(null),
    [error, setError] = useState('')
  const stored = tool.read_class
  // A ToolGate from before the class stores none; there is nothing true to show or change.
  if (!stored) return null
  async function choose(next: McpReadClass) {
    setPending(next)
    setError('')
    try {
      onStored(await client.setClass(tool, next))
    } catch (cause) {
      setError(readClassMessage(cause))
    } finally {
      setPending(null)
    }
  }
  return (
    <ReferenceSection title="Before each call">
      <RadioGroup value={stored} onValueChange={value => void choose(value as McpReadClass)} aria-label="Before each call" className="gap-2" disabled={!!pending}>
        {CHOICES.map(choice => (
          <Label key={choice.value} className={cn('flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 font-normal', stored === choice.value && 'border-foreground')}>
            <RadioGroupItem value={choice.value} className="mt-1" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{choice.label}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{choice.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          {pending === 'observe' ? 'Saving… Conker asks your password first.' : 'Saving…'}
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={onReload}>
            Reload saved tool
          </Button>
        </div>
      )}
    </ReferenceSection>
  )
}
