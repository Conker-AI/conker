import { useConkerStore } from "@/lib/api/store"

/** The active form/inspector owns its error, instead of duplicating the shell banner. */
export function takeMutationError() {
  const error = useConkerStore.getState().error
  useConkerStore.setState({ error: "" })
  return error
}
