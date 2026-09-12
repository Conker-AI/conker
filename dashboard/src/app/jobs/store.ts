import { create } from "zustand"
import { jobs } from "./data"
export const useJobs = create<{ jobs: typeof jobs; notice: string; toggle: (id: string) => void; run: (id: string) => void }>((set) => ({
  jobs, notice: "",
  toggle: (id) => set((state) => ({ jobs: state.jobs.map((job) => job.id === id ? { ...job, status: job.status === "Paused" ? "Scheduled" : "Paused" } : job), notice: "Schedule changed in the fixture only. No scheduler is connected." })),
  run: (id) => set((state) => ({ jobs: state.jobs.map((job) => job.id === id ? { ...job, runs: job.runs + 1, lastRun: "Just now · simulated receipt #" + (job.runs + 1) } : job), notice: "Simulated run recorded. No backup, calendar change, or index rebuild was performed." })),
}))

