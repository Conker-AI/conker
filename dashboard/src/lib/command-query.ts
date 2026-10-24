/** Base UI's command input also reports item picks and list navigation; only typing edits a query. */
export function isQueryEdit(reason: string) {
  return reason === 'input-change' || reason === 'input-clear' || reason === 'clear-press'
}
