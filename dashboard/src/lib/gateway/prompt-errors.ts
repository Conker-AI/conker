import { gatewayError, type PromptErrorCode } from './transport'

/** Plain words for Pi's refusals on the wand and the prompt templates. Every code has words; other failures use the gateway's own message. */
const words: Record<PromptErrorCode, string> = {
  template_not_found: 'That template is gone. Pick another one, or just rewrite the draft.',
  nothing_filled: 'Nothing in your draft fits that template. Add more detail, or pick another template.',
  unusable: 'The model gave back something that could not be used. Your draft is unchanged; try again.',
  revision_conflict: 'This template changed somewhere else, so nothing was saved.',
  too_many: 'You already have 100 templates. Delete one first.',
  helpers_off: 'Helper models are off for this chat, so the wand cannot read the draft.',
  not_configured: 'No model is set up for this yet.',
  unavailable: 'The model is not answering right now. Your draft is unchanged.',
  not_found: 'That chat is no longer available.',
  spending_cap_reached: 'Today’s spending limit is reached, so the wand stopped. Your draft is unchanged.',
  spending_cap_unavailable: 'The spending limit could not be checked, so the wand did not run. Your draft is unchanged.',
}

/** The sentence to show beside a failed wand or template action. */
export function promptMessage(error: unknown): string {
  const failure = gatewayError(error)
  return (failure.code && (words as Partial<Record<string, string>>)[failure.code]) || failure.message
}

/** True when Pi says the template changed since it was read. */
export const isStaleTemplate = (error: unknown): boolean => gatewayError(error).code === 'revision_conflict'
