import { useConkerStore } from "@/lib/api/store"
export function takeMutationError() {
  const error = useConkerStore.getState().error
  useConkerStore.setState({ error: "" })
  return error
}
