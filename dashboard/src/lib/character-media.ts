import type { CharacterDraft } from "./api/character"

/** Animated images cannot be paused reliably. Use a video loop instead. */
function requireStillImage(bytes: Uint8Array, mime: string) {
  const label = (at: number, count: number) => String.fromCharCode(...bytes.slice(at, at + count))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const png = bytes.length >= 8 && label(0, 8) === "\x89PNG\r\n\x1a\n"
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.length >= 12 && label(0, 4) === "RIFF" && label(8, 4) === "WEBP"
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp)) throw new Error("This image's contents do not match its format. Choose a still PNG, JPEG, or WebP.")
  if (label(1, 3) === "PNG") {
    for (let at = 8; at + 8 <= bytes.length;) {
      const length = view.getUint32(at)
      if (label(at + 4, 4) === "acTL") throw new Error("Use a still PNG for portraits. Upload an MP4/WebM loop for animation so motion can be paused.")
      at += length + 12
    }
  }
  if (label(0, 4) === "RIFF" && label(8, 4) === "WEBP") {
    for (let at = 12; at + 8 <= bytes.length;) {
      const length = view.getUint32(at + 4, true)
      if (["ANIM", "ANMF"].includes(label(at, 4))) throw new Error("Use a still WebP for portraits. Upload an MP4/WebM loop for animation so motion can be paused.")
      at += 8 + length + length % 2
    }
  }
}

async function checkMedia(src: string, kind: "image" | "video" | "audio") {
  if (kind === "image") {
    if (src.startsWith("data:")) {
      if (src.length > 2 * 1024 * 1024 * 4 / 3 + 100) throw new Error("Keep each image under 2 MB.")
      requireStillImage(Uint8Array.from(atob(src.split(",")[1]), char => char.charCodeAt(0)), src.slice(5, src.indexOf(";")))
    }
    const image = new Image(); image.src = src
    try { await image.decode() } catch { throw new Error("This image cannot be displayed. Choose another file.") }
    return
  }
  if (src.length > 8 * 1024 * 1024 * 4 / 3 + 100) throw new Error("Keep each recording or video under 8 MB.")
  await new Promise<void>((resolve, reject) => {
    const media = document.createElement(kind)
    const timer = window.setTimeout(() => finish(new Error("This media could not be opened. Choose another file.")), 6000)
    const finish = (error?: Error) => { clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute("src"); media.load(); if (error) reject(error); else resolve() }
    media.onloadedmetadata = () => finish()
    media.onerror = () => finish(new Error("Your browser cannot play this file. Choose another format."))
    media.preload = "metadata"; media.src = src
  })
}
export async function validateImportedMedia(profile: CharacterDraft) {
  if (profile.portrait) await checkMedia(profile.portrait, "image")
  for (const asset of profile.studio.appearance.assets) await checkMedia(asset.src, asset.kind)
  if (profile.studio.voice.reference) await checkMedia(profile.studio.voice.reference.src, "audio")
}

export async function readCharacterFile(file: File, kind: "image" | "asset" | "audio") {
  const accepted = kind === "audio" ? ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm", "audio/mp4"] : kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]
  const limit = kind === "image" || file.type.startsWith("image/") ? 2 : 8
  if (!accepted.includes(file.type) || file.size > limit * 1024 * 1024) throw new Error(kind === "audio" ? "Choose WAV, MP3, OGG, WebM, or M4A audio under 8 MB." : "Choose a PNG, JPEG, or WebP under 2 MB, or an MP4/WebM under 8 MB.")
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read this file. Try again."))
    reader.readAsDataURL(file)
  })
  await checkMedia(src, file.type.startsWith("image/") ? "image" : kind === "audio" ? "audio" : "video")
  return src
}
