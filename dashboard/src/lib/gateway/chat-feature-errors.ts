import { gatewayError, type ChatFeatureErrorCode } from './transport'

/** Plain words for Pi's chat feature refusals. Every code has words; other failures use the gateway’s own message. */
const words: Record<ChatFeatureErrorCode, string> = {
  revision_conflict: 'This changed somewhere else. Reload the chat and try again.',
  request_conflict: 'That request was already sent with different values.',
  session_busy: 'Conker is still answering in this chat. Try again when it finishes.',
  turn_pending: 'Conker is still answering in this chat. Try again when it finishes.',
  session_closed: 'This chat is closed.',
  helpers_off: 'Helper models are switched off in Settings.',
  not_configured: 'No model is set up for this. Choose one in Settings > Models.',
  unavailable: 'The model for this is not available right now.',
  empty: 'There is nothing to work with yet.',
  invalid_title: 'Use 1 to 60 characters for the name.',
  too_few: 'Two or more versions are needed.',
  too_many: 'That is more than this allows.',
  no_sources: 'This answer has nothing to check against.',
  unknown_model: 'That model is not set up.',
  foreign_version: 'That version belongs to another answer.',
  version_unavailable: 'That version is no longer available.',
  version_context_conflict: 'A context rule keeps another version in use.',
  retry_unavailable: 'This answer cannot be answered again.',
  source_unavailable: 'The original message is no longer available.',
  source_closed: 'The original chat is closed.',
  retry_privacy_changed: 'Privacy settings changed since this answer. Start a new message instead.',
  fork_scope: 'This cannot be branched from here.',
  fork_boundary: 'Messages before the summary cannot be branched.',
  pin_after_boundary: 'A pinned message would be folded away. Unpin it first.',
  summary_review: 'Review the summary before continuing.',
  fork_limit: 'This chat has reached its branch limit.',
  foreign_message: 'That message belongs to another chat.',
  inactive_version: 'Switch to that version first.',
  outside_boundary: 'That message is already folded into the summary.',
  boundary_changed: 'The summary changed meanwhile. Reload and try again.',
  retrieval_pending: 'Conker is still gathering context. Try again in a moment.',
  unavailable_pin: 'A pinned message is no longer available.',
  budget_overflow: 'Pinned messages do not fit in the budget.',
  missing_revision: 'Reload the chat and try again.',
  no_settings: 'This chat has no context settings yet.',
  pinned: 'That message is pinned. Unpin it first.',
  retrieve_rule: 'A rule already brings this back.',
  duplicate: 'That is already in the list.',
  not_replaceable: 'That cannot be replaced.',
  invalid_text: 'The text is empty or too long.',
  invalid_replace: 'That replacement is not allowed.',
  owner_item: 'You added this one, so only you can change it.',
  superseded: 'This was replaced by a newer one.',
  invalid_state: 'That change is not allowed from its current state.',
  not_a_version: 'That message is not a version of this answer.',
  not_found: 'This is no longer available.',
}

/** The sentence to show beside a failed chat feature action. */
export function chatFeatureMessage(error: unknown): string {
  const failure = gatewayError(error)
  return (failure.code && (words as Partial<Record<string, string>>)[failure.code]) || failure.message
}
