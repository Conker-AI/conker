import type { Emotion, Face, PortraitTone } from "@/lib/api/client"
export const faces: { value: Face; label: string }[] = [{ value: "sprout", label: "Sprout" }, { value: "round", label: "Round" }, { value: "cat", label: "Cat" }]
export const portraitTones: { value: PortraitTone; label: string }[] = [{ value: "green", label: "Fern" }, { value: "soft", label: "Sage" }, { value: "graphite", label: "Graphite" }]
export const emotions: Emotion[] = ["neutral", "happy", "thinking", "concerned", "celebrating"]

