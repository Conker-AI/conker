import { useConkerStore } from "@/lib/api/store"

/** Keep editor errors beside the action, without repeating the shell banner. */
export function takeMutationError() {
  const error = useConkerStore.getState().error
  useConkerStore.setState({ error: "" })
  return error
}
