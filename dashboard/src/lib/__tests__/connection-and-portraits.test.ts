import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connectionStore, GATEWAY_REACHABILITY_EVENT, reportGatewayReachable, watchConnection } from '../connection-store'
import { readCharacterFile, requireStillImage } from '../character-media'

describe('gateway reachability', () => {
  beforeEach(() => connectionStore.setState({ online: true, gateway: 'unknown', recoveries: 0 }))

  it('moves from unknown to reachable without counting a recovery', () => {
    reportGatewayReachable(true)
    expect(connectionStore.getState()).toMatchObject({ gateway: 'reachable', recoveries: 0 })
  })
  it('stays put when the same answer repeats', () => {
    reportGatewayReachable(true)
    const before = connectionStore.getState()
    reportGatewayReachable(true)
    expect(connectionStore.getState()).toBe(before)
    reportGatewayReachable(false)
    const down = connectionStore.getState()
    reportGatewayReachable(false)
    expect(connectionStore.getState()).toBe(down)
    expect(down.gateway).toBe('unreachable')
  })
  it('counts a recovery each time the server comes back after being unreachable', () => {
    reportGatewayReachable(false)
    reportGatewayReachable(true)
    expect(connectionStore.getState()).toMatchObject({ gateway: 'reachable', recoveries: 1 })
    reportGatewayReachable(false)
    reportGatewayReachable(true)
    expect(connectionStore.getState().recoveries).toBe(2)
  })
  it('can go from unknown straight to unreachable', () => {
    reportGatewayReachable(false)
    expect(connectionStore.getState().gateway).toBe('unreachable')
  })
})

describe('watching the connection', () => {
  const target = new EventTarget()
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  })
  beforeEach(() => connectionStore.setState({ online: true, gateway: 'unknown', recoveries: 0 }))

  it('follows online and offline events and the transport reports, and only subscribes once', () => {
    watchConnection()
    watchConnection()
    target.dispatchEvent(new Event('offline'))
    expect(connectionStore.getState().online).toBe(false)
    target.dispatchEvent(new Event('online'))
    expect(connectionStore.getState().online).toBe(true)

    target.dispatchEvent(new CustomEvent(GATEWAY_REACHABILITY_EVENT, { detail: false }))
    expect(connectionStore.getState().gateway).toBe('unreachable')
    target.dispatchEvent(new CustomEvent(GATEWAY_REACHABILITY_EVENT, { detail: true }))
    expect(connectionStore.getState()).toMatchObject({ gateway: 'reachable', recoveries: 1 })
  })
  it('ignores reports that are not a plain true or false', () => {
    watchConnection()
    target.dispatchEvent(new CustomEvent(GATEWAY_REACHABILITY_EVENT, { detail: 'yes' }))
    target.dispatchEvent(new Event(GATEWAY_REACHABILITY_EVENT))
    expect(connectionStore.getState().gateway).toBe('unknown')
  })
})

const ascii = (text: string) => [...text].map(character => character.charCodeAt(0))
const u32 = (value: number, little = false) => (little ? [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255] : [(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255])
const pngChunk = (type: string, length: number) => [...u32(length), ...ascii(type), ...Array<number>(length).fill(0), 0, 0, 0, 0]
const png = (...chunks: string[]) => new Uint8Array([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...pngChunk('IHDR', 13), ...chunks.flatMap(type => pngChunk(type, 8)), ...pngChunk('IEND', 0)])
const webp = (...chunks: string[]) => {
  const body = chunks.flatMap(type => [...ascii(type), ...u32(4, true), 0, 0, 0, 0])
  return new Uint8Array([...ascii('RIFF'), ...u32(4 + body.length, true), ...ascii('WEBP'), ...body])
}
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const mismatch = "This image's contents do not match its format. Choose a still PNG, JPEG, or WebP."

describe('portrait images', () => {
  it('accepts a still PNG, JPEG and WebP whose bytes match the declared type', () => {
    expect(() => requireStillImage(png('IDAT'), 'image/png')).not.toThrow()
    expect(() => requireStillImage(jpeg, 'image/jpeg')).not.toThrow()
    expect(() => requireStillImage(webp('VP8 '), 'image/webp')).not.toThrow()
  })
  it('refuses bytes that do not match the declared type, and too-short input', () => {
    expect(() => requireStillImage(jpeg, 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(png('IDAT'), 'image/webp')).toThrow(mismatch)
    expect(() => requireStillImage(png('IDAT'), 'image/gif')).toThrow(mismatch)
    expect(() => requireStillImage(new Uint8Array([0xff, 0xd8]), 'image/jpeg')).toThrow(mismatch)
    expect(() => requireStillImage(new Uint8Array(), 'image/png')).toThrow(mismatch)
  })
  it('refuses an animated PNG and an animated WebP, pointing to a video loop', () => {
    expect(() => requireStillImage(png('acTL', 'IDAT'), 'image/png')).toThrow('Use a still PNG for portraits. Upload an MP4/WebM loop for animation so motion can be paused.')
    expect(() => requireStillImage(webp('VP8X', 'ANIM'), 'image/webp')).toThrow('Use a still WebP for portraits. Upload an MP4/WebM loop for animation so motion can be paused.')
    expect(() => requireStillImage(webp('ANMF'), 'image/webp')).toThrow('Use a still WebP for portraits.')
  })
})

describe('character files', () => {
  const file = (type: string, bytes = 1) => new File([new Uint8Array(bytes)], 'f', { type })
  const imageRefusal = 'Choose a PNG, JPEG, or WebP under 2 MB, or an MP4/WebM under 8 MB.'
  const audioRefusal = 'Choose WAV, MP3, OGG, WebM, or M4A audio under 8 MB.'

  it('refuses a type that does not belong to the slot, before reading anything', async () => {
    await expect(readCharacterFile(file('text/plain'), 'image')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('video/mp4'), 'image')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('image/gif'), 'asset')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('image/png'), 'audio')).rejects.toThrow(audioRefusal)
  })
  it('refuses an image over 2 MB and a video or recording over 8 MB', async () => {
    await expect(readCharacterFile(file('image/png', 2 * 1024 * 1024 + 1), 'image')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('image/webp', 2 * 1024 * 1024 + 1), 'asset')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('video/mp4', 8 * 1024 * 1024 + 1), 'asset')).rejects.toThrow(imageRefusal)
    await expect(readCharacterFile(file('audio/wav', 8 * 1024 * 1024 + 1), 'audio')).rejects.toThrow(audioRefusal)
  })
})
