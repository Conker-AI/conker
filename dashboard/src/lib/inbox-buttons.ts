/**
 * The buttons an Inbox card shows when a tool asks you: one template per tool, picked in Settings,
 * Access (ToolGate keeps the fixed list, so no tool can label "yes" with something else). Change
 * is on every card: your words go back to Conker instead, and nothing on the card runs.
 */
export const cardTemplates = ['do', 'send', 'publish', 'ship', 'run', 'delete', 'pay', 'save'] as const
export type CardTemplate = typeof cardTemplates[number]

export const cardLabels: Record<CardTemplate, { yes: string; no: string }> = {
  do: { yes: 'Do it', no: 'Don’t' },
  send: { yes: 'Send it', no: 'Don’t send' },
  publish: { yes: 'Publish', no: 'Not yet' },
  ship: { yes: 'Ship it', no: 'Not yet' },
  run: { yes: 'Run it', no: 'Don’t run' },
  delete: { yes: 'Delete', no: 'Keep it' },
  pay: { yes: 'Pay', no: 'Don’t pay' },
  save: { yes: 'Save', no: 'Don’t save' },
}

export const isCardTemplate = (value: unknown): value is CardTemplate => typeof value === 'string' && (cardTemplates as readonly string[]).includes(value)
