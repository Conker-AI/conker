import { createCharacterStudio } from "./character-defaults"
export { createCharacterStudio } from "./character-defaults"
import { z } from "zod"
import type { Character } from "./client"

export const activityNames = ["idle", "listening", "thinking", "speaking"] as const
export type CharacterActivity = typeof activityNames[number]
export type CharacterMode = "focus" | "character"
const assetIdSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).refine(value => !["main", "neutral"].includes(value), "Choose a unique asset identifier.")
const notes = z.string().max(6000)
const imageSource = z.string().refine(value => value === "/conker.png" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), "Use an embedded PNG, JPEG, or WebP image.")
const mediaSchema = z.discriminatedUnion("kind", [
  z.object({ id: assetIdSchema, name: z.string().max(120), kind: z.literal("image"), src: imageSource }),
  z.object({ id: assetIdSchema, name: z.string().max(120), kind: z.literal("video"), src: z.string().regex(/^data:video\/(mp4|webm);base64,[A-Za-z0-9+/=]+$/) }),
])
const modeSchema = z.object({ text: notes, voice: notes, expressiveness: z.number().min(0).max(100), motion: z.boolean() })
export const characterStudioSchema = z.object({
  soul: notes, backstory: notes, relationship: notes,
  details: z.array(z.object({ id: assetIdSchema, label: z.string().max(80), value: z.string().max(500) })).max(20),
  examples: z.object({ prompt: z.string().max(1000), focus: notes, character: notes }),
  appearance: z.object({
    description: notes, inset: z.number().min(12.5).max(25),
    assets: z.array(mediaSchema).max(16),
    activities: z.object({ idle: z.string().nullable(), listening: z.string().nullable(), thinking: z.string().nullable(), speaking: z.string().nullable() }),
    expressions: z.array(z.object({ id: assetIdSchema, name: z.string().min(1).max(60), instruction: z.string().max(500), assetId: z.string().nullable() })).max(16),
  }),
  voice: z.object({
    source: z.enum(["design", "reference"]), engine: z.literal("qwen3-tts"), description: notes,
    language: z.enum(["English", "Chinese", "Japanese", "Korean", "German", "French", "Russian", "Portuguese", "Spanish", "Italian"]),
    pronunciation: notes, transcript: z.string().max(3000),
    reference: z.object({ name: z.string().max(120), src: z.string().regex(/^data:audio\/(wav|x-wav|mpeg|mp3|ogg|webm|mp4);base64,[A-Za-z0-9+/=]+$/) }).nullable(),
  }),
  modes: z.object({ default: z.enum(["focus", "character"]), focus: modeSchema, character: modeSchema }),
})
export type CharacterStudio = z.infer<typeof characterStudioSchema>
export type CharacterAsset = CharacterStudio["appearance"]["assets"][number]
export type CharacterDraft = Character & { studio: CharacterStudio }

export function characterDraft(profile: Character): CharacterDraft {
  return structuredClone({ ...profile, speakingPreset: "custom", studio: profile.studio ?? createCharacterStudio() })
}
const characterSchema = z.object({
  name: z.string().trim().min(1, "Give your character a name.").max(60), mood: z.string().max(100),
  personality: notes, speakingStyle: notes, speakingPreset: z.enum(["warm", "direct", "curious", "custom"]),
  portrait: z.union([z.literal(""), imageSource]), renderer: z.enum(["static", "live-2d", "live-3d"]),
  face: z.enum(["sprout", "round", "cat"]), tone: z.enum(["green", "soft", "graphite"]),
  emotions: z.object(Object.fromEntries(["neutral", "happy", "thinking", "concerned", "celebrating"].map(key => [key, z.enum(["default", "sprout", "round", "cat", "portrait"])])) as Record<"neutral" | "happy" | "thinking" | "concerned" | "celebrating", z.ZodEnum<{ default: "default"; sprout: "sprout"; round: "round"; cat: "cat"; portrait: "portrait" }>>),
  studio: characterStudioSchema,
})
export function validateCharacter(profile: Character): CharacterDraft {
  if (JSON.stringify(profile).length > 32 * 1024 * 1024) throw new Error("Keep the character package under 32 MB. Remove a large asset and try again.")
  const parsed = characterSchema.safeParse(characterDraft(profile))
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  const { appearance } = parsed.data.studio
  const ids = new Set(appearance.assets.map(asset => asset.id))
  if (ids.size !== appearance.assets.length) throw new Error("Asset IDs must be unique.")
  if (new Set(parsed.data.studio.details.map(item => item.id)).size !== parsed.data.studio.details.length) throw new Error("Profile detail IDs must be unique.")
  if (new Set(appearance.expressions.map(item => item.id)).size !== appearance.expressions.length) throw new Error("Expression IDs must be unique.")
  for (const id of [...Object.values(appearance.activities), ...appearance.expressions.map(item => item.assetId)]) {
    if (id && !ids.has(id)) throw new Error("An appearance assignment refers to a missing asset.")
  }
  return parsed.data
}

/** Structural equality avoids serializing embedded media on each keystroke. */
export function sameCharacterValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false
  const a = Object.entries(left), b = Object.entries(right)
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && sameCharacterValue(value, (right as Record<string, unknown>)[key]))
}
export function removeCharacterAsset(studio: CharacterStudio, assetId: string): CharacterStudio {
  return { ...studio, appearance: { ...studio.appearance,
    assets: studio.appearance.assets.filter(asset => asset.id !== assetId),
    activities: Object.fromEntries(activityNames.map(activity => [activity, studio.appearance.activities[activity] === assetId ? null : studio.appearance.activities[activity]])) as CharacterStudio["appearance"]["activities"],
    expressions: studio.appearance.expressions.map(item => item.assetId === assetId ? { ...item, assetId: null } : item),
  } }
}
export function exportCharacter(profile: Character) {
  return JSON.stringify({ format: "conker-character", version: 1, character: validateCharacter(profile) }, null, 2)
}
export function importCharacter(text: string, current: Character): { profile: CharacterDraft; note: string } {
  if (text.length > 32 * 1024 * 1024) throw new Error("Choose a character JSON file under 32 MB.")
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error("This file is not valid JSON.") }
  const bundle = z.object({ format: z.literal("conker-character"), version: z.literal(1), character: z.unknown() }).safeParse(raw)
  if (bundle.success) return { profile: validateCharacter(bundle.data.character as Character), note: "Character imported into your draft. Review it, then save." }
  const card = z.object({ spec: z.enum(["chara_card_v2", "chara_card_v3"]), data: z.object({ name: z.string().min(1).max(60), description: notes.optional(), personality: notes.optional(), scenario: notes.optional(), mes_example: notes.optional(), first_mes: notes.optional() }) }).safeParse(raw)
  if (!card.success) throw new Error("Choose a Conker character package or Character Card V2/V3 JSON.")
  const next = characterDraft(current)
  next.name = card.data.data.name
  next.personality = card.data.data.personality ?? ""
  next.studio.backstory = card.data.data.description ?? ""
  next.studio.relationship = card.data.data.scenario ?? ""
  next.speakingStyle = card.data.data.mes_example ?? ""
  next.studio.examples.character = card.data.data.first_mes ?? ""
  return { profile: validateCharacter(next), note: "Imported character text. Current artwork and voice are kept. Embedded PNG/CHARX packs and card instructions are not imported yet." }
}

/** A presentation example, not model inference. Never sends prompts or runs tools. */
export function previewCharacter(profile: Character, mode: CharacterMode) {
  const draft = validateCharacter(profile)
  return { kind: "authored-example" as const, prompt: draft.studio.examples.prompt, text: draft.studio.examples[mode], delivery: draft.studio.modes[mode].voice, mode }
}
