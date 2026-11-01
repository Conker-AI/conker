const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const sourcePath = process.env.TURN_OUTCOMES_SOURCE || path.join(root, 'src/lib/chat/turn-outcomes.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Turn outcomes must have no runtime dependencies') }, loaded, loaded.exports)
const { parkedTurn, visibleTurnOutcomes, turnOutcomeCopy, sameTurnOutcome, turnCheckCopy } = loaded.exports

const turn = (extra = {}) => ({ id: 'trn_1', sessionId: 'ses_1', status: 'complete', acted: false, startedAt: '2026-10-17T10:00:00Z', endedAt: '2026-10-17T10:00:08Z', provider: null, model: null, inputTokens: null, outputTokens: null, costUsd: null, detail: null, action: null, memory: {}, ...extra })

// 1. parkedTurn tests
assert.ok(parkedTurn('awaiting_approval'), 'awaiting_approval is parked')
assert.ok(parkedTurn('awaiting_budget'), 'awaiting_budget is parked')
assert.ok(parkedTurn('acted_no_reply'), 'acted_no_reply is parked')
assert.ok(parkedTurn('action_in_progress'), 'action_in_progress is parked')
assert.ok(parkedTurn('outcome_unknown'), 'outcome_unknown is parked')
assert.ok(!parkedTurn('complete'), 'complete is not parked')
assert.ok(!parkedTurn('failed'), 'failed is not parked')
assert.ok(!parkedTurn('interrupted'), 'interrupted is not parked')
assert.ok(!parkedTurn('cancelled'), 'cancelled is not parked')

// 2. visibleTurnOutcomes tests
// Parked turns are always visible, so the order is observable; t2b ties t2 on startedAt.
const t1 = turn({ id: 'trn_1', startedAt: '2026-10-17T10:00:00Z', status: 'awaiting_budget' })
const t2 = turn({ id: 'trn_2', startedAt: '2026-10-17T10:01:00Z', status: 'awaiting_approval' })
const t2b = turn({ id: 'trn_2b', startedAt: '2026-10-17T10:01:00Z', status: 'outcome_unknown' })
const t3 = turn({ id: 'trn_3', startedAt: '2026-10-17T10:02:00Z', status: 'action_in_progress' })

// Test sorting and non-mutation
const input = [t3, t2b, t1, t2]
const result = visibleTurnOutcomes(input)
assert.deepEqual(result, [t1, t2, t2b, t3], 'Input in reverse time order comes back sorted by startedAt, ties by id')
assert.deepEqual(input, [t3, t2b, t1, t2], 'Input array is not mutated')
// A complete turn that is not the latest is hidden.
const older = turn({ id: 'trn_0', startedAt: '2026-10-17T09:00:00Z', status: 'complete' })
assert.deepEqual(visibleTurnOutcomes([t2, older]), [t2], 'An older complete turn is hidden')

// Test parked visibility even when older
const olderParked = turn({ id: 'trn_4', startedAt: '2026-10-17T09:00:00Z', status: 'action_in_progress' })
const newer = turn({ id: 'trn_5', startedAt: '2026-10-17T11:00:00Z', status: 'complete' })
const parkedResult = visibleTurnOutcomes([newer, olderParked], true)
assert.ok(parkedResult.includes(olderParked), 'A turn in a parked status is visible even when older and when answering is true')

// Test complete with uncertain action states
const completeWithDispatching = turn({ status: 'complete', action: { state: 'dispatching' } })
const completeWithInProgress = turn({ status: 'complete', action: { state: 'in_progress' } })
const completeWithOutcomeUnknown = turn({ status: 'complete', action: { state: 'outcome_unknown' } })
const completeWithUnknown = turn({ status: 'complete', action: { state: 'unknown' } })
assert.ok(visibleTurnOutcomes([completeWithDispatching]).includes(completeWithDispatching), 'complete with dispatching is visible')
assert.ok(visibleTurnOutcomes([completeWithInProgress]).includes(completeWithInProgress), 'complete with in_progress is visible')
assert.ok(visibleTurnOutcomes([completeWithOutcomeUnknown]).includes(completeWithOutcomeUnknown), 'complete with outcome_unknown is visible')
assert.ok(visibleTurnOutcomes([completeWithUnknown]).includes(completeWithUnknown), 'complete with unknown is visible')

// Test interrupted with acted
const interruptedActed = turn({ id: 'trn_6', startedAt: '2026-10-17T09:00:00Z', status: 'interrupted', acted: true })
const interruptedNotActed = turn({ id: 'trn_7', startedAt: '2026-10-17T09:00:00Z', status: 'interrupted', acted: false })
const newerCompleteForInterrupted = turn({ id: 'trn_8', startedAt: '2026-10-17T10:00:00Z', status: 'complete' })
assert.ok(visibleTurnOutcomes([newerCompleteForInterrupted, interruptedActed]).includes(interruptedActed), 'Older interrupted with acted: true is visible')
assert.ok(!visibleTurnOutcomes([newerCompleteForInterrupted, interruptedNotActed]).includes(interruptedNotActed), 'Older interrupted with acted: false is not visible')

// Test failed turn visibility
const latestFailed = turn({ id: 'trn_9', startedAt: '2026-10-17T10:00:00Z', status: 'failed' })
const olderFailed = turn({ id: 'trn_10', startedAt: '2026-10-17T09:00:00Z', status: 'failed' })
const newerComplete = turn({ id: 'trn_11', startedAt: '2026-10-17T11:00:00Z', status: 'complete' })
assert.ok(visibleTurnOutcomes([latestFailed]).includes(latestFailed), 'Latest failed turn is visible when answering is false')
assert.ok(!visibleTurnOutcomes([latestFailed], true).includes(latestFailed), 'Latest failed turn is hidden when answering is true')
assert.ok(!visibleTurnOutcomes([newerComplete, olderFailed]).includes(olderFailed), 'Older failed turn followed by a complete one is hidden')

// Test lone latest complete and empty list
const loneComplete = turn({ status: 'complete' })
assert.ok(!visibleTurnOutcomes([loneComplete]).includes(loneComplete), 'A lone latest complete turn is hidden')
assert.deepEqual(visibleTurnOutcomes([]), [], 'Empty list gives []')

// 3. turnOutcomeCopy tests
// Test consequence for various statuses
const outcomeUnknownTurn = turn({ status: 'outcome_unknown' })
const actionInProgressTurn = turn({ status: 'action_in_progress' })
const failedWithDispatching = turn({ status: 'failed', action: { state: 'dispatching' } })
assert.strictEqual(turnOutcomeCopy(outcomeUnknownTurn).consequence, 'The tool outcome is not confirmed. Sending the request again could repeat work.', 'outcome_unknown consequence')
assert.strictEqual(turnOutcomeCopy(actionInProgressTurn).consequence, 'The tool outcome is not confirmed. Sending the request again could repeat work.', 'action_in_progress consequence')
assert.strictEqual(turnOutcomeCopy(failedWithDispatching).consequence, 'The tool outcome is not confirmed. Sending the request again could repeat work.', 'failed with dispatching consequence')

// Test acted scenarios
const actedNoReply = turn({ status: 'acted_no_reply', acted: true })
const actedFailed = turn({ status: 'failed', acted: true })
assert.strictEqual(turnOutcomeCopy(actedNoReply).consequence, 'A tool action was recorded. Asking only for the reply will not repeat it.', 'acted: true + acted_no_reply consequence')
assert.strictEqual(turnOutcomeCopy(actedFailed).consequence, 'A tool action was recorded. Review its outcome before sending this request again.', 'acted: true + failed consequence')

// Test acted: false with action
const actedFalseWithAction = turn({ acted: false, status: 'failed', action: { state: 'completed' } })
assert.strictEqual(turnOutcomeCopy(actedFalseWithAction).consequence, 'An action record exists. Review its saved status before repeating the request.', 'acted: false with completed action consequence')

// Test no action
const noActionTurn = turn({ acted: false, action: null })
assert.strictEqual(turnOutcomeCopy(noActionTurn).consequence, 'No tool action is recorded for this turn. Your message is kept in this chat.', 'acted: false, no action consequence')

// Test titles
const failedTitle = turnOutcomeCopy(turn({ status: 'failed' })).title
assert.strictEqual(failedTitle, 'Conker couldn’t finish the reply', 'failed title')
assert.strictEqual(turnOutcomeCopy(turn({ status: 'awaiting_approval' })).title, 'Waiting for your approval', 'awaiting_approval title')
assert.strictEqual(turnOutcomeCopy(turn({ status: 'cancelled' })).title, 'Response stopped', 'cancelled title')
assert.strictEqual(turnOutcomeCopy(turn({ status: 'canceled' })).title, 'Response stopped', 'canceled title')
assert.strictEqual(turnOutcomeCopy(turn({ status: 'outcome_unknown' })).title, 'Action outcome is unconfirmed', 'outcome_unknown title')

// Test modelUnavailable
const modelUnavailableTurn = turn({ status: 'failed', detail: 'No configured eligible model could answer; no unapproved substitute was used.' })
assert.strictEqual(turnOutcomeCopy(modelUnavailableTurn).modelUnavailable, true, 'modelUnavailable is true for specific failed detail')
assert.ok(turnOutcomeCopy(modelUnavailableTurn).description.startsWith('The configured model could not answer.'), 'modelUnavailable description starts correctly')

const interruptedWithSameDetail = turn({ status: 'interrupted', detail: 'No configured eligible model could answer; no unapproved substitute was used.' })
assert.strictEqual(turnOutcomeCopy(interruptedWithSameDetail).modelUnavailable, false, 'modelUnavailable is false for interrupted with same detail')

// Test toolUnavailable
const toolUnavailableTurn1 = turn({ status: 'failed', detail: 'model requested unavailable tool' })
const toolUnavailableTurn2 = turn({ status: 'failed', detail: 'The model requested an unavailable tool. This request was not executed.' })
assert.strictEqual(turnOutcomeCopy(toolUnavailableTurn1).toolUnavailable, true, 'toolUnavailable is true for model requested unavailable tool')
assert.strictEqual(turnOutcomeCopy(toolUnavailableTurn2).toolUnavailable, true, 'toolUnavailable is true for full tool unavailable message')

// Test generic failed description
const genericFailed = turn({ status: 'failed', detail: 'some other error' })
assert.strictEqual(turnOutcomeCopy(genericFailed).description, 'Conker stopped before completing a reply. Check the saved outcome before sending a new request.', 'generic failed description')

// Safety test - no provider text leaks
const secretTurn = turn({ status: 'failed', detail: 'Provider said: sk-secret-123 boom' })
const secretCopy = turnOutcomeCopy(secretTurn)
assert.ok(!secretCopy.title.includes('sk-secret'), 'title does not contain secret')
assert.ok(!secretCopy.title.includes('boom'), 'title does not contain boom')
assert.ok(!secretCopy.description.includes('sk-secret'), 'description does not contain secret')
assert.ok(!secretCopy.description.includes('boom'), 'description does not contain boom')
assert.ok(!secretCopy.consequence.includes('sk-secret'), 'consequence does not contain secret')
assert.ok(!secretCopy.consequence.includes('boom'), 'consequence does not contain boom')

// 4. sameTurnOutcome tests
const baseTurn = turn({ id: 'trn_same', status: 'complete', acted: true, endedAt: '2026-10-17T10:00:08Z', approvalRequestId: 'apr_1', action: { id: 'act_1', state: 'completed' } })
assert.ok(sameTurnOutcome(baseTurn, baseTurn), 'same turn returns true')

// Test differences that should be ignored
const turnWithDifferentDetail = { ...baseTurn, detail: 'different' }
const turnWithDifferentModel = { ...baseTurn, model: 'different' }
const turnWithDifferentInputTokens = { ...baseTurn, inputTokens: 100 }
assert.ok(sameTurnOutcome(baseTurn, turnWithDifferentDetail), 'detail difference is ignored')
assert.ok(sameTurnOutcome(baseTurn, turnWithDifferentModel), 'model difference is ignored')
assert.ok(sameTurnOutcome(baseTurn, turnWithDifferentInputTokens), 'inputTokens difference is ignored')

// Test differences that should return false
const turnWithDifferentId = { ...baseTurn, id: 'different' }
const turnWithDifferentStatus = { ...baseTurn, status: 'failed' }
const turnWithDifferentActed = { ...baseTurn, acted: false }
const turnWithDifferentEndedAt = { ...baseTurn, endedAt: '2026-10-17T10:00:09Z' }
const turnWithDifferentApprovalRequestId = { ...baseTurn, approvalRequestId: 'different' }
const turnWithDifferentActionId = { ...baseTurn, action: { ...baseTurn.action, id: 'different' } }
const turnWithDifferentActionState = { ...baseTurn, action: { ...baseTurn.action, state: 'failed' } }
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentId), 'id difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentStatus), 'status difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentActed), 'acted difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentEndedAt), 'endedAt difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentApprovalRequestId), 'approvalRequestId difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentActionId), 'action.id difference returns false')
assert.ok(!sameTurnOutcome(baseTurn, turnWithDifferentActionState), 'action.state difference returns false')

// 5. turnCheckCopy tests
// Test checking phase
const checkingCheck = { turnId: 't', phase: 'checking' }
const checkingResult = turnCheckCopy(checkingCheck)
assert.strictEqual(checkingResult.title, 'Checking what happened', 'checking title')
assert.strictEqual(checkingResult.status, 'Checking with your tools… The action is not sent again.', 'checking status')
assert.ok(checkingResult.description.includes('is asking'), 'checking description contains "is asking"')

// Test failed phase
const failedCheck = { phase: 'failed', reason: 'The gateway is not reachable.' }
const failedResult = turnCheckCopy(failedCheck)
assert.strictEqual(failedResult.title, 'Couldn’t check what happened', 'failed title')
assert.strictEqual(failedResult.status, 'The gateway is not reachable. The action was not sent again.', 'failed status')

// Test checked phase with various statuses
const checkedComplete = turnCheckCopy({ phase: 'checked', status: 'complete' })
assert.strictEqual(checkedComplete.title, 'Checked what happened', 'checked title')
assert.ok(checkedComplete.description.includes('asked'), 'checked description contains "asked"')
assert.ok(checkedComplete.status.startsWith('Done. Your tools had the result'), 'complete status starts correctly')

const checkedActedNoReply = turnCheckCopy({ phase: 'checked', status: 'acted_no_reply' })
assert.ok(checkedActedNoReply.status.startsWith('Done, but the reply is missing'), 'acted_no_reply status starts correctly')

const checkedOutcomeUnknown = turnCheckCopy({ phase: 'checked', status: 'outcome_unknown' })
assert.ok(checkedOutcomeUnknown.status.startsWith('Still unknown'), 'outcome_unknown status starts correctly')

const checkedActionInProgress = turnCheckCopy({ phase: 'checked', status: 'action_in_progress' })
assert.ok(checkedActionInProgress.status.startsWith('Still running'), 'action_in_progress status starts correctly')

const checkedAwaitingApproval = turnCheckCopy({ phase: 'checked', status: 'awaiting_approval' })
assert.ok(checkedAwaitingApproval.status.startsWith('Checked. This action needs your approval again'), 'awaiting_approval status starts correctly')

// Test weird and null status
const checkedWeird = turnCheckCopy({ phase: 'checked', status: 'weird_state' })
assert.strictEqual(checkedWeird.status, 'Checked. This turn is now weird state.', 'weird_state status')

const checkedNull = turnCheckCopy({ phase: 'checked', status: null })
assert.strictEqual(checkedNull.status, 'Checked. This turn is now saved.', 'null status')

console.log('Turn outcomes: visibility, fixed wording and the never-repeat promises hold.')