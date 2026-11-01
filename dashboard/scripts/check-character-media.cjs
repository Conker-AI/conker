const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/character-media.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Character media must have no runtime dependencies') }, loaded, loaded.exports)
const { requireStillImage } = loaded.exports

// Helper functions to build test fixtures
function pngChunk(type, data) {
  const length = data.length
  const result = new Uint8Array(12 + length) // 4 length + 4 type + data + 4 CRC
  const view = new DataView(result.buffer)
  view.setUint32(0, length) // Big-endian length
  for (let i = 0; i < 4; i++) result[4 + i] = type.charCodeAt(i)
  for (let i = 0; i < length; i++) result[8 + i] = data[i]
  // CRC is 4 zero bytes (not verified by the check)
  return result
}

function png(...chunks) {
  const signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const totalLength = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(signature, offset)
  offset += signature.length
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function riffWebp(...chunks) {
  const header = new Uint8Array(12)
  const view = new DataView(header.buffer)
  // RIFF
  header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46
  // Total file size - 8 (little-endian)
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + 4
  view.setUint32(4, totalSize, true)
  // WEBP
  header[8] = 0x57; header[9] = 0x45; header[10] = 0x42; header[11] = 0x50
  
  const totalLength = header.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(header, offset)
  offset += header.length
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function webpChunk(type, data) {
  const length = data.length
  const totalLength = 8 + length + (length % 2) // Pad byte if odd length
  const result = new Uint8Array(totalLength)
  const view = new DataView(result.buffer)
  for (let i = 0; i < 4; i++) result[i] = type.charCodeAt(i)
  view.setUint32(4, length, true) // Little-endian length
  for (let i = 0; i < length; i++) result[8 + i] = data[i]
  // Pad byte if odd length
  if (length % 2 === 1) result[8 + length] = 0
  return result
}

// Test: Valid PNG with IHDR + IDAT + IEND passes
const validPng = png(
  pngChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
  pngChunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05])),
  pngChunk('IEND', new Uint8Array([]))
)
assert.doesNotThrow(() => requireStillImage(validPng, 'image/png'))

// Test: PNG with acTL chunk throws
const animatedPng = png(
  pngChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
  pngChunk('acTL', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0])),
  pngChunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05])),
  pngChunk('IEND', new Uint8Array([]))
)
assert.throws(() => requireStillImage(animatedPng, 'image/png'), /still PNG/)

// Test: Valid JPEG passes
const validJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
assert.doesNotThrow(() => requireStillImage(validJpeg, 'image/jpeg'))

// Test: WebP with VP8 chunk passes
const validWebp = riffWebp(webpChunk('VP8 ', new Uint8Array([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a])))
assert.doesNotThrow(() => requireStillImage(validWebp, 'image/webp'))

// Test: WebP with VP8X + ANIM throws
const animatedWebp1 = riffWebp(
  webpChunk('VP8X', new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x00, 0x00])),
  webpChunk('ANIM', new Uint8Array([0x00, 0x00, 0x00, 0x00]))
)
assert.throws(() => requireStillImage(animatedWebp1, 'image/webp'), /still WebP/)

// Test: WebP with ANMF chunk throws
const animatedWebp2 = riffWebp(webpChunk('ANMF', new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])))
assert.throws(() => requireStillImage(animatedWebp2, 'image/webp'), /still WebP/)

// Test: WebP with odd-length chunk before ANIM still throws
const animatedWebp3 = riffWebp(
  webpChunk('ABCD', new Uint8Array([0x01])), // Odd-length chunk with padding
  webpChunk('ANIM', new Uint8Array([0x00, 0x00, 0x00, 0x00]))
)
assert.throws(() => requireStillImage(animatedWebp3, 'image/webp'), /still WebP/)

// Test: Mismatched content throws
assert.throws(() => requireStillImage(validPng, 'image/jpeg'), /contents do not match/)
assert.throws(() => requireStillImage(validJpeg, 'image/png'), /contents do not match/)
assert.throws(() => requireStillImage(validWebp, 'image/png'), /contents do not match/)
assert.throws(() => requireStillImage(validPng, 'image/gif'), /contents do not match/)
assert.throws(() => requireStillImage(new Uint8Array([]), 'image/png'), /contents do not match/)

// Test: Truncated PNG (signature + half a chunk header) doesn't throw
const truncatedPng = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00])
assert.doesNotThrow(() => requireStillImage(truncatedPng, 'image/png'))

assert.deepEqual(source.split('\n').filter(line => line.startsWith('import ') && !line.startsWith('import type ')), [], 'Character media imports types only')
console.log('Character media: only still PNG, JPEG and WebP portraits pass.')