type Shown = { role: string; content: { kind: string; text?: string } }
export type ToolRequest = { tool: string; args: Record<string, unknown> }

/** The text as a tool request, or null. Exported for the check. */
export function readToolRequest(text: string): ToolRequest | null {
  const trimmed = text.trim()

  // Check if it's a fenced block
  let inner = trimmed
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const lines = trimmed.split('\n')
    if (lines.length >= 2) {
      // Remove first line (``` or ```json) and last line (```)
      inner = lines.slice(1, -1).join('\n').trim()
    }
  }

  try {
    let parsed = JSON.parse(inner)

    // Handle double-encoded JSON string
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }

    // Validate it's a proper tool request
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 2 &&
      'tool' in parsed &&
      'args' in parsed &&
      typeof parsed.tool === 'string' &&
      parsed.tool.length > 0 &&
      typeof parsed.args === 'object' &&
      parsed.args !== null &&
      !Array.isArray(parsed.args)
    ) {
      return parsed as ToolRequest
    }

    return null
  } catch {
    return null
  }
}

/** The messages to show, each with the request that started it when it is a tool record. */
export function foldToolRequests<M extends Shown>(messages: readonly M[]): { message: M; request: ToolRequest | null }[] {
  const result: { message: M; request: ToolRequest | null }[] = []

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const nextMessage = i + 1 < messages.length ? messages[i + 1] : null

    // Check if this is an assistant message with a tool request
    if (
      message.role === 'assistant' &&
      message.content.kind === 'text' &&
      message.content.text
    ) {
      const request = readToolRequest(message.content.text)

      // Check if the next message is a tool record for the same tool
      if (
        request &&
        nextMessage &&
        nextMessage.role === 'tool' &&
        nextMessage.content.kind === 'text' &&
        nextMessage.content.text
      ) {
        try {
          let toolRecord = JSON.parse(nextMessage.content.text.trim())

          // Handle double-encoded JSON string
          if (typeof toolRecord === 'string') {
            toolRecord = JSON.parse(toolRecord)
          }

          // Check if it's an object with a matching tool name
          if (
            typeof toolRecord === 'object' &&
            toolRecord !== null &&
            !Array.isArray(toolRecord) &&
            'tool' in toolRecord &&
            typeof toolRecord.tool === 'string' &&
            toolRecord.tool === request.tool
          ) {
            // Fold: add the tool record with the request and skip the assistant message
            result.push({ message: nextMessage, request })
            i++ // Skip the next message since we've processed it
            continue
          }
        } catch {
          // If parsing fails, don't fold
        }
      }
    }

    // Keep the message with no request
    result.push({ message, request: null })
  }

  return result
}