import { create } from "zustand"
import { tickets, type TicketStatus } from "./data"

// Deliberately memory-only: reloading resets the fixture, never executes an action.
export const useInbox = create<{
  tickets: typeof tickets
  decide: (id: string, status: TicketStatus) => void
}>((set) => ({
  tickets,
  decide: (id, status) => set((state) => ({
    tickets: state.tickets.map((ticket) => ticket.id === id && ticket.status === "Needs you" ? { ...ticket, status } : ticket),
  })),
}))
