export type Agent = {
  id: string
  name: string
  role: string
  kind: "companion" | "agent"
  model: string
  grants: number
  cost: string
  status: "active" | "idle"
}

export const agents: Agent[] = [
  {
    id: "conker",
    name: "Conker",
    role: "The daily companion",
    kind: "companion",
    model: "Qwen 2.5 3B",
    grants: 2,
    cost: "$0.00",
    status: "active",
  },
  {
    id: "workshop",
    name: "Workshop",
    role: "A second pair of hands",
    kind: "agent",
    model: "Qwen 2.5 Coder 3B",
    grants: 1,
    cost: "unknown",
    status: "idle",
  },
]
