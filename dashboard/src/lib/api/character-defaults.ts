import type { CharacterStudio } from "./character"

export function createCharacterStudio(): CharacterStudio {
  return {
    soul: "", backstory: "", relationship: "", details: [],
    examples: { prompt: "Help me get started on a difficult task.", focus: "Choose the smallest useful step. Work on it for ten minutes, then reassess.", character: "Let's make the first step small enough to start. Give it ten minutes; we can figure out the rest from there." },
    appearance: { description: "", inset: 12.5, assets: [], activities: { idle: null, listening: null, thinking: null, speaking: null }, expressions: [] },
    voice: { source: "design", engine: "qwen3-tts", description: "", language: "English", pronunciation: "", transcript: "", reference: null },
    modes: {
      default: "character",
      focus: { text: "Lead with the answer. Keep necessary context and omit character flourishes.", voice: "Use the same voice identity with clear, restrained, natural delivery.", expressiveness: 15, motion: false },
      character: { text: "Use my personality and speaking instructions while keeping the answer accurate and useful.", voice: "Match the meaning and emotion of the words. Keep the voice identity consistent.", expressiveness: 65, motion: true },
    },
  }
}
