import { create } from "zustand"
export type Character = {
  name: string
  speakingStyle: string
  personality: string
  renderer: string
  portrait: string
}
export const useCharacter = create<{
  profile: Character
  save: (profile: Character) => void
}>((set) => ({
  profile: {
    name: "Conker",
    speakingStyle:
      "Warm, direct, and concise. A little dry humour when it fits.",
    personality:
      "Curious and steady. Help me make room for school, judo, and building things. Ask before making assumptions. Be honest when you don’t know.",
    renderer: "static",
    portrait: "",
  },
  save: (profile) => set({ profile }),
}))
